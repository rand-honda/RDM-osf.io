# -*- coding: utf-8 -*-

from nose.tools import *  # PEP8 asserts

from tests.factories import ProjectFactory, NodeFactory, AuthUserFactory
from tests.base import OsfTestCase, fake

from framework.auth.decorators import Auth


class TestContributorViews(OsfTestCase):

    def setUp(self):
        super(TestContributorViews, self).setUp()
        self.user = AuthUserFactory()
        self.auth = Auth(user=self.user)
        self.project = ProjectFactory(creator=self.user)

    def test_get_contributors_no_limit(self):
        self.project.add_contributor(
            AuthUserFactory(),
            auth=self.auth,
            visible=True,
        )
        self.project.add_contributor(
            AuthUserFactory(),
            auth=self.auth,
            visible=False,
        )
        self.project.save()
        url = self.project.api_url_for('get_contributors')
        res = self.app.get(url, auth=self.user.auth)
        # Should be two visible contributors on the project
        assert_equal(
            len(res.json['contributors']),
            2,
        )

    def test_get_contributors_with_limit(self):
        # Add five contributors
        self.project.add_contributor(
            AuthUserFactory(),
            auth=self.auth,
            visible=True,
        )
        self.project.add_contributor(
            AuthUserFactory(),
            auth=self.auth,
            visible=True,
        )
        self.project.add_contributor(
            AuthUserFactory(),
            auth=self.auth,
            visible=True,
        )
        self.project.add_contributor(
            AuthUserFactory(),
            auth=self.auth,
            visible=True,
        )
        self.project.add_contributor(
            AuthUserFactory(),
            auth=self.auth,
            visible=False,
        )
        self.project.save()
        # Set limit to three contributors
        url = self.project.api_url_for('get_contributors') + '?limit=3'
        res = self.app.get(url, auth=self.user.auth)
        # Should be two visible contributors on the project
        assert_equal(
            len(res.json['contributors']),
            # Only three contributors should show
            3,
        )
        assert_equal(
            (res.json['more']),
            # There should be two 'more' contributors not shown
            2,
        )

    def test_get_contributors_from_parent(self):
        self.project.add_contributor(
            AuthUserFactory(),
            auth=self.auth,
            visible=True,
        )
        self.project.add_contributor(
            AuthUserFactory(),
            auth=self.auth,
            visible=False,
        )
        self.project.save()
        component = NodeFactory(parent=self.project, creator=self.user)
        url = component.api_url_for('get_contributors_from_parent')
        res = self.app.get(url, auth=self.user.auth)
        # Should be one contributor to the parent who is both visible and
        # not a contributor on the component
        assert_equal(
            len(res.json['contributors']),
            1,
        )

    def test_get_recently_added_contributors(self):
        project = ProjectFactory(creator=self.user)
        project.add_contributor(AuthUserFactory(), auth=self.auth)
        project.add_contributor(AuthUserFactory(), auth=self.auth)
        # has one unregistered contributor
        project.add_unregistered_contributor(
            fullname=fake.name(),
            email=fake.email(),
            auth=self.auth,
        )
        project.save()
        url = self.project.api_url_for('get_recently_added_contributors')
        res = self.app.get(url, auth=self.user.auth)
        project.reload()
        recent = [c for c in self.user.recently_added if c.is_active()]
        assert_equal(len(res.json['contributors']), len(recent))
