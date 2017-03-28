from django.conf.urls import url
from . import views


urlpatterns = [
    url(r'^$', views.InstitutionList.as_view(), name='list'),
    url(r'^create/$', views.CreateInstitution.as_view(), name='create'),
    url(r'^import/$', views.ImportInstitution.as_view(), name='import'),
    url(r'^(?P<institution_id>[0-9]+)/$', views.InstitutionDetail.as_view(), name='detail'),
    url(r'^(?P<institution_id>[0-9]+)/export/$', views.InstitutionExport.as_view(), name='export'),
    url(r'^(?P<institution_id>[0-9]+)/nodes/$', views.InstitutionNodeList.as_view(), name='nodes'),
]
