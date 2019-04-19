# -*- coding: utf-8 -*-

import time
import httplib
import functools

from flask import request

from framework.auth import cas
from framework.auth import signing
from framework.flask import redirect
from framework.exceptions import HTTPError
from .core import Auth
from website import settings
from website.util import web_url_for

# TODO [CAS-10][OSF-7566]: implement long-term fix for URL preview/prefetch
def block_bing_preview(func):
    """
    This decorator is a temporary fix to prevent BingPreview from pre-fetching confirmation links.
    """

    @functools.wraps(func)
    def wrapped(*args, **kwargs):
        user_agent = request.headers.get('User-Agent')
        if user_agent and ('BingPreview' in user_agent or 'MSIE 9.0' in user_agent):
            return HTTPError(
                httplib.FORBIDDEN,
                data={'message_long': 'Internet Explorer 9 and BingPreview cannot be used to access this page for security reasons. Please use another browser. If this should not have occurred and the issue persists, please report it to <a href="mailto: ' + settings.OSF_SUPPORT_EMAIL + '">' + settings.OSF_SUPPORT_EMAIL + '</a>.'}
            )
        return func(*args, **kwargs)

    return wrapped


def collect_auth(func):

    @functools.wraps(func)
    def wrapped(*args, **kwargs):
        kwargs['auth'] = Auth.from_kwargs(request.args.to_dict(), kwargs)
        return func(*args, **kwargs)

    return wrapped


def must_be_confirmed(func):

    @functools.wraps(func)
    def wrapped(*args, **kwargs):
        from osf.models import OSFUser

        user = OSFUser.load(kwargs['uid'])
        if user is not None:
            if user.is_confirmed:
                return func(*args, **kwargs)
            else:
                raise HTTPError(httplib.BAD_REQUEST, data={
                    'message_short': 'Account not yet confirmed',
                    'message_long': 'The profile page could not be displayed as the user has not confirmed the account.'
                })
        else:
            raise HTTPError(httplib.NOT_FOUND)

    return wrapped


def _must_be_logged_in_factory(login=True, email=True, mapcore_token=True):
    def wrapper(func):
        @functools.wraps(func)
        def wrapped(*args, **kwargs):
            from nii.mapcore_api import MAPCoreTokenExpired, MAPCoreException
            from nii.mapcore import (mapcore_is_enabled,
                                     mapcore_api_is_available,
                                     mapcore_request_authcode,
                                     mapcore_log_error,
                                     mapcore_url_is_sync_target,
                                     mapcore_sync_rdm_user_projects)

            auth = Auth.from_kwargs(request.args.to_dict(), kwargs)
            if login:  # require auth
                kwargs['auth'] = auth
            if auth.logged_in:
                auth.user.update_date_last_access()

                # for GakuNin mAP Core (API v2)
                def mapcore_check_token(*args, **kwargs):
                    if mapcore_token and mapcore_is_enabled():
                        # require available token
                        try:
                            try:
                                if mapcore_url_is_sync_target(request.url):
                                    mapcore_sync_rdm_user_projects(auth.user)
                                else:
                                    mapcore_api_is_available(auth.user)
                            except MAPCoreTokenExpired as e:
                                if e.caller is None or e.caller != auth.user:
                                    raise e
                                return redirect(mapcore_request_authcode(
                                    next_url=request.url))
                        except MAPCoreException as e:
                            if settings.DEBUG_MODE:
                                import traceback
                                emsg = '<pre>{}</pre>'.format(
                                    traceback.format_exc())
                            else:
                                emsg = str(e)
                            mapcore_log_error('{}: {}'.format(
                                e.__class__.__name__, emsg))
                            raise HTTPError(httplib.SERVICE_UNAVAILABLE, data={
                                'message_short': 'mAP Core API Error',
                                'message_long': emsg
                            })
                    return func(*args, **kwargs)

                if email:  # require have_email=True
                    if auth.user.have_email:
                        # for GakuNin CloudGateway (mAP API v1)
                        setup_cggroups(auth)
                        return mapcore_check_token(*args, **kwargs)
                    else:
                        return redirect(web_url_for('user_account_email'))
                else:
                    return mapcore_check_token(*args, **kwargs)
            elif login:  # require logged_in=True
                return redirect(cas.get_login_url(request.url))
            else:
                return func(*args, **kwargs)

        return wrapped

    return wrapper

# Require that user has email.
email_required = _must_be_logged_in_factory(
    login=False, email=True, mapcore_token=True)

# Require that user be logged in. Modifies kwargs to include the
# current user.
must_be_logged_in = _must_be_logged_in_factory(
    login=True, email=True, mapcore_token=True)

# Require that user be logged in. Modifies kwargs to include the
# current user without checking email existence.
must_be_logged_in_without_checking_email = _must_be_logged_in_factory(
    login=True, email=False, mapcore_token=False)

# Require that user be logged in. Modifies kwargs to include the
# current user without checking availability of user's mAP Core access token.
must_be_logged_in_without_checking_mapcore_token = _must_be_logged_in_factory(
    login=True, email=True, mapcore_token=False)


# for GakuNin CloudGateway (mAP API v1)
def setup_cggroups(auth):
    user = auth.user
    if user.cggroups_initialized:
        return
    create_or_join_cggroup_projects(user)
    leave_cggroup_projects(auth)
    user.cggroups_initialized = True
    user.save()


def get_cggroup_node(groupname):
    from osf.models.node import Node
    try:
        node = Node.objects.filter(group__name=groupname).get()
        return node
    except Exception:
        return None


def is_cggroup_admin(user, groupname):
    if user.cggroups_admin.filter(name=groupname).exists():
        return True
    else:
        return False


def is_node_admin(node, user):
    return node.has_permission(user, 'admin', check_parent=False)


def create_cggroup_project(user, groupname):
    from osf.models.node import Node
    from osf.models.user import CGGroup

    node = Node(title=groupname,
                category='project',
                description=groupname,
                creator=user)
    group, created = CGGroup.objects.get_or_create(name=groupname)
    node.group = group
    node.save()

def create_or_join_cggroup_projects(user):
    from osf.utils.permissions import CREATOR_PERMISSIONS, DEFAULT_CONTRIBUTOR_PERMISSIONS
    for group in user.cggroups.all():
        groupname = group.name
        group_admin = is_cggroup_admin(user, groupname)
        node = get_cggroup_node(groupname)
        if node is not None:  # exists
            if node.is_deleted is True and group_admin:
                node.is_deleted = False   # re-enabled
                node.save()
            if node.is_contributor(user):
                node_admin = is_node_admin(node, user)
                if node_admin:
                    if not group_admin:
                        node.set_permissions(user,
                                             DEFAULT_CONTRIBUTOR_PERMISSIONS,
                                             save=True)
                else:
                    if group_admin:
                        node.set_permissions(user, CREATOR_PERMISSIONS,
                                             save=True)
            elif group_admin:
                node.add_contributor(user, log=True, save=True,
                                     permissions=CREATOR_PERMISSIONS)
            else:  # not admin
                node.add_contributor(user, log=True, save=True)
        elif group_admin:  # not exist && is admin
            create_cggroup_project(user, groupname)


def leave_cggroup_projects(auth):
    user = auth.user
    nodes = user.nodes.filter()
    for node in nodes:
        if node.group is None:
            continue  # skip
        if user.cggroups is None:
            continue  # skip
        if user.cggroups.filter(id=node.group.id).exists():
            continue  # skip
        if not node.contributors.filter(id=user.id).exists():
            continue  # skip
        if not is_node_admin(node, user):
            node.remove_contributor(user, auth=auth, log=True)
            ### node.remove_contributor() includes node.save()
            continue  # next
        admins = list(node.get_admin_contributors(node.contributors))
        len_admins = len(admins)
        if len_admins > 1:
            node.remove_contributor(user, auth=auth, log=True)
            ### node.remove_contributor() includes node.save()
            continue  # next
        ### len == 1: The user is last admin.
        ### len(node.contributors) may not be 1.
        node.remove_node(auth)  # node.is_deleted = True
        ### node.remove_node() includes save()


# TODO Can remove after Waterbutler is sending requests to V2 endpoints.
# This decorator has been adapted for use in an APIv2 parser - HMACSignedParser
def must_be_signed(func):
    @functools.wraps(func)
    def wrapped(*args, **kwargs):
        if request.method in ('GET', 'DELETE'):
            data = request.args
        else:
            data = request.get_json()

        try:
            sig = data['signature']
            payload = signing.unserialize_payload(data['payload'])
            exp_time = payload['time']
        except (KeyError, ValueError):
            raise HTTPError(httplib.BAD_REQUEST, data={
                'message_short': 'Invalid payload',
                'message_long': 'The request payload could not be deserialized.'
            })

        if not signing.default_signer.verify_payload(sig, payload):
            raise HTTPError(httplib.UNAUTHORIZED)

        if time.time() > exp_time:
            raise HTTPError(httplib.BAD_REQUEST, data={
                'message_short': 'Expired',
                'message_long': 'Signature has expired.'
            })

        kwargs['payload'] = payload
        return func(*args, **kwargs)
    return wrapped
