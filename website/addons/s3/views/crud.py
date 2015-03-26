# -*- coding: utf-8 -*-

import httplib as http

from flask import request
from boto.exception import S3ResponseError, BotoClientError

from website.addons.s3.api import create_bucket
from website.project.decorators import must_have_addon
from website.addons.s3.utils import validate_bucket_name
from website.project.decorators import must_be_contributor_or_public


@must_be_contributor_or_public
@must_have_addon('s3', 'node')
def create_new_bucket(node_addon, **kwargs):
    user = kwargs['auth'].user
    user_settings = user.get_addon('s3')
    bucket_name = request.json.get('bucket_name')

    if not validate_bucket_name(bucket_name):
        return {
            'message': 'That bucket name is not valid.',
            'title': 'Invalid bucket name',
        }, http.NOT_ACCEPTABLE
    try:
        create_bucket(user_settings, request.json.get('bucket_name'))
        return node_addon.to_json(user)
    except S3ResponseError as e:
        return {
            'message': e.message,
            'title': 'Problem connecting to S3',
        }, http.NOT_ACCEPTABLE
    except S3CreateError as e:
        return {
            'message': e.message,
            'title': "Problem creating bucket '{0}'".format(bucket_name),
        }, http.NOT_ACCEPTABLE
    except BotoClientError as e:  # Base class catchall
        return {
            'message': e.message,
            'title': 'Error connecting to S3',
        }, http.NOT_ACCEPTABLE
