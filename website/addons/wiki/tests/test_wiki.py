# -*- coding: utf-8 -*-
from nose.tools import *  # PEP8 asserts

import framework
from website.app import init_app
from webtest_plus import TestApp
from tests.base import DbTestCase
from tests.factories import NodeFactory, PointerFactory, ProjectFactory

from website.addons.wiki.views import get_wiki_url

app = init_app(routes=True)


class TestWiki(DbTestCase):

    def setUp(self):
        self.app = TestApp(app)
        self.project = ProjectFactory(is_public=True)

    def test_get_wiki_url(self):
        with app.test_request_context():
            node = NodeFactory()
            expected = framework.url_for(
                'OsfWebRenderer__project_wiki_page',
                pid=node._primary_key,
                wid='home')
            assert_equal(get_wiki_url(node), expected)

    def test_wiki_url_get_returns_200(self):
        with app.test_request_context():
            url = get_wiki_url(self.project)
            res = self.app.get(url)
            assert_equal(res.status_code, 200)

    def test_wiki_url_for_pointer_returns_200(self):
        with app.test_request_context():
            pointer = PointerFactory(node=self.project)
            url = get_wiki_url(pointer)
            res = self.app.get(url)
            assert_equal(res.status_code, 200)
