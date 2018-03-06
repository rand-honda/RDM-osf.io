# -*- coding: utf-8 -*-
# Generated by Django 1.11.9 on 2018-03-07 21:32
from __future__ import unicode_literals

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django_extensions.db.fields
import osf.models.base
import osf.utils.datetime_aware_jsonfield

from website import settings as website_settings


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('addons_osfstorage', '0003_auto_20170713_1125'),
    ]

    operations = [
        migrations.CreateModel(
            name='Region',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(db_index=True, max_length=200)),
                ('storage_credentials', osf.utils.datetime_aware_jsonfield.DateTimeAwareJSONField(default=dict, encoder=osf.utils.datetime_aware_jsonfield.DateTimeAwareJSONEncoder)),
                ('storage_settings', osf.utils.datetime_aware_jsonfield.DateTimeAwareJSONField(default=dict, encoder=osf.utils.datetime_aware_jsonfield.DateTimeAwareJSONEncoder)),
            ],
        ),
        migrations.CreateModel(
            name='UserSettings',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created', django_extensions.db.fields.CreationDateTimeField(auto_now_add=True, verbose_name='created')),
                ('modified', django_extensions.db.fields.ModificationDateTimeField(auto_now=True, verbose_name='modified')),
                ('_id', models.CharField(db_index=True, default=osf.models.base.generate_object_id, max_length=24, unique=True)),
                ('deleted', models.BooleanField(default=False)),
                ('default_waterbutler_url', models.URLField(default=website_settings.WATERBUTLER_URL)),
                ('default_storage_region', models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, to='addons_osfstorage.Region')),
                ('owner', models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='addons_osfstorage_user_settings', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.AddField(
            model_name='nodesettings',
            name='waterbutler_url',
            field=models.URLField(default=website_settings.WATERBUTLER_URL),
        ),
        migrations.AddField(
            model_name='nodesettings',
            name='storage_region',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, to='addons_osfstorage.Region'),
        ),
        migrations.AddField(
            model_name='nodesettings',
            name='user_settings',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, to='addons_osfstorage.UserSettings'),
        ),
    ]
