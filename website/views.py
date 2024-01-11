# -*- coding: utf-8 -*-
from __future__ import unicode_literals
import itertools
from rest_framework import status as http_status
import logging
import math
import os
import requests
from future.moves.urllib.parse import unquote

from django.apps import apps
from flask import request, send_from_directory, Response, stream_with_context

from framework import sentry
from framework.auth import Auth
from framework.auth.decorators import must_be_logged_in
from framework.auth.decorators import email_required
from framework.auth.forms import SignInForm, ForgotPasswordForm
from framework.exceptions import HTTPError
from framework.flask import redirect  # VOL-aware redirect
from framework.forms import utils as form_utils
from framework.routing import proxy_url
from website import settings
from website.institutions.views import serialize_institution
from website.util.timestamp import userkey_generation_check, userkey_generation

from osf import features
from osf.models import BaseFileNode, Guid, Institution, Preprint, AbstractNode, Node, DraftNode, Registration
from addons.osfstorage.models import Region

from website.settings import EXTERNAL_EMBER_APPS, PROXY_EMBER_APPS, EXTERNAL_EMBER_SERVER_TIMEOUT, DOMAIN
from website.ember_osf_web.decorators import ember_flag_is_active
from website.ember_osf_web.views import use_ember_app
from website.project.model import has_anonymous_link
from osf.utils import permissions

from api.waffle.utils import flag_is_active, storage_i18n_flag_active

from django.shortcuts import render
from django.conf import settings
from django.http import JsonResponse
import json
import re
import h5py
import chardet
import pandas as pd
import numpy as np
import pathlib
from PIL import Image
from io import BytesIO
from requests.auth import HTTPBasicAuth

from framework.celery_tasks import app as celery_app
from datetime import datetime
import time

logger = logging.getLogger(__name__)
preprints_dir = os.path.abspath(os.path.join(os.getcwd(), EXTERNAL_EMBER_APPS['preprints']['path']))
ember_osf_web_dir = os.path.abspath(os.path.join(os.getcwd(), EXTERNAL_EMBER_APPS['ember_osf_web']['path']))


def serialize_contributors_for_summary(node, max_count=3):
    # # TODO: Use .filter(visible=True) when chaining is fixed in django-include
    users = [contrib.user for contrib in node.contributor_set.all() if contrib.visible]
    contributors = []
    n_contributors = len(users)
    others_count = ''

    for index, user in enumerate(users[:max_count]):

        if index == max_count - 1 and len(users) > max_count:
            separator = ' &'
            others_count = str(n_contributors - 3)
        elif index == len(users) - 1:
            separator = ''
        elif index == len(users) - 2:
            separator = ' &'
        else:
            separator = ','
        contributor = user.get_summary(formatter='surname')
        contributor['user_id'] = user._primary_key
        contributor['separator'] = separator

        contributors.append(contributor)

    return {
        'contributors': contributors,
        'others_count': others_count,
    }

def serialize_groups_for_summary(node):
    groups = node.osf_groups
    n_groups = len(groups)
    group_string = ''
    for index, group in enumerate(groups):
        if index == n_groups - 1:
            separator = ''
        elif index == n_groups - 2:
            separator = ' & '
        else:
            separator = ', '

        group_string = group_string + group.name + separator

    return group_string


def serialize_node_summary(node, auth, primary=True, show_path=False):
    is_registration = node.is_registration
    summary = {
        'id': node._id,
        'primary': primary,
        'is_registration': node.is_registration,
        'is_fork': node.is_fork,
        'is_pending_registration': node.is_pending_registration if is_registration else False,
        'is_retracted': node.is_retracted if is_registration else False,
        'is_pending_retraction': node.is_pending_retraction if is_registration else False,
        'embargo_end_date': node.embargo_end_date.strftime('%A, %b. %d, %Y') if is_registration and node.embargo_end_date else False,
        'is_pending_embargo': node.is_pending_embargo if is_registration else False,
        'is_embargoed': node.is_embargoed if is_registration else False,
        'archiving': node.archiving if is_registration else False,
    }

    parent_node = node.parent_node
    user = auth.user
    if node.can_view(auth):
        # Re-query node with contributor guids included to prevent N contributor queries
        node = AbstractNode.objects.filter(pk=node.pk).include('contributor__user__guids').get()
        contributor_data = serialize_contributors_for_summary(node)
        summary.update({
            'can_view': True,
            'can_edit': node.can_edit(auth),
            'primary_id': node._id,
            'url': node.url,
            'primary': primary,
            'api_url': node.api_url,
            'title': node.title,
            'category': node.category,
            'is_supplemental_project': node.has_linked_published_preprints,
            'childExists': Node.objects.get_children(node, active=True).exists(),
            'is_admin': node.has_permission(user, permissions.ADMIN),
            'is_contributor': node.is_contributor(user),
            'is_contributor_or_group_member': node.is_contributor_or_group_member(user),
            'logged_in': auth.logged_in,
            'node_type': node.project_or_component,
            'is_fork': node.is_fork,
            'is_registration': is_registration,
            'anonymous': has_anonymous_link(node, auth),
            'registered_date': node.registered_date.strftime('%Y-%m-%d %H:%M UTC')
            if node.is_registration
            else None,
            'forked_date': node.forked_date.strftime('%Y-%m-%d %H:%M UTC')
            if node.is_fork
            else None,
            'ua_count': None,
            'ua': None,
            'non_ua': None,
            'is_public': node.is_public,
            'parent_title': parent_node.title if parent_node else None,
            'parent_is_public': parent_node.is_public if parent_node else False,
            'show_path': show_path,
            'contributors': contributor_data['contributors'],
            'others_count': contributor_data['others_count'],
            'groups': serialize_groups_for_summary(node),
            'description': node.description if len(node.description) <= 150 else node.description[0:150] + '...',
        })
    else:
        summary['can_view'] = False

    return summary


@email_required
def index():
    # Check if we're on an institution landing page
    institution = Institution.objects.filter(domains__icontains=request.host, is_deleted=False)
    if institution.exists() and request.host_url != DOMAIN:
        institution = institution.get()
        inst_dict = serialize_institution(institution)
        inst_dict.update({
            'redirect_url': '{}institutions/{}/'.format(DOMAIN, institution._id),
        })
        return inst_dict
    else:
        from framework.auth.core import get_current_user_id

        user_id = get_current_user_id()
        if user_id:
            # generation key check
            key_exists_check = userkey_generation_check(user_id)

            if not key_exists_check:
                userkey_generation(user_id)

        return use_ember_app()

def find_bookmark_collection(user):
    Collection = apps.get_model('osf.Collection')
    try:
        return Collection.objects.get(creator=user, deleted__isnull=True, is_bookmark_collection=True)
    except Exception:
        return None

@must_be_logged_in
def dashboard(auth):
    return use_ember_app()


@must_be_logged_in
@ember_flag_is_active(features.EMBER_MY_PROJECTS)
def my_projects(auth):
    user = auth.user

    region_list = get_storage_region_list(user)

    bookmark_collection = find_bookmark_collection(user)
    my_projects_id = bookmark_collection._id
    return {'addons_enabled': user.get_addon_names(),
            'dashboard_id': my_projects_id,
            'storage_regions': region_list,
            'storage_flag_is_active': storage_i18n_flag_active(),
            }


def validate_page_num(page, pages):
    if page < 0 or (pages and page >= pages):
        raise HTTPError(http_status.HTTP_400_BAD_REQUEST, data=dict(
            message_long='Invalid value for "page".'
        ))


def paginate(items, total, page, size):
    pages = math.ceil(total / float(size))
    validate_page_num(page, pages)

    start = page * size
    paginated_items = itertools.islice(items, start, start + size)

    return paginated_items, pages


def reproducibility():
    return redirect('/ezcuj/wiki')

# def hdf5_create():        
#     try:

#         _path = os.path.join(os.path.dirname(__file__), 'log/log.txt')  
#         size_in_gb = 51
#         file_path = os.path.join(os.path.dirname(__file__), 'log/10GB_Image.jpg')   
#         writeLog(_path, file_path + '-->' + str(datetime.now().time())+'\n') 
#         # size_in_bytes = size_in_gb * 1024 * 1024 
#         # writeLog(_path, str(size_in_bytes) + '-->' + str(datetime.now().time())+'\n')
#         # image_data = np.zeros(size_in_bytes, dtype=np.uint8)
#         # with open(file_path, 'wb') as file:
#         #     file.write(image_data)
#         image_size_bytes = 10000 * 1024 * 1024 * 1024 
#         num_pixels = image_size_bytes / 3
#         side_length = int(math.sqrt(num_pixels))
#         image_size = (side_length, side_length)
#         # image_size = (1920, 1920)
#         image = Image.new("RGB", image_size, "red")    
#         image.save(file_path)

#         #     writeLog(_path, 'file write-->' + str(datetime.now().time())+'\n')
#         # writeLog(_path, 'file write finished-->' + str(datetime.now().time())+'\n')
#         returnText = 'kwt testing --> :'+file_path
#     except Exception as e:
#         returnText = str(e)
#     return {'data':returnText}  

# def hdf5_create(): 
    
#     return {'data':returnText} 

# def generate_data(num_rows):
#     yield ['Column1', 'Column2', 'Column3']
#     for i in range(num_rows):
#         yield[f'Value1_{i}', f'Value2_{i}', f'Value3_{i}']

# def write_csv(file_path, data_generator):
#     import csv
#     with open(file_path, mode='w', newline='', encoding='utf-8') as file:
#         # writer = csv.writer(file, delimiter='\t')
#         writer = csv.writer(file)
#         for row in data_generator:
#             writer.writerow(row)

# def generate_data1(num_rows,  chunk_size=1000000):
#     for i in range(0, num_rows, chunk_size):
#         data = {
#             'Column1': [f'Value1_{i + j}' for j in range(chunk_size)],
#             'Column2': [f'Value2_{i + j}' for j in range(chunk_size)],
#             'Column3': [f'Value3_{i + j}' for j in range(chunk_size)]
#         }
#         df = pd.DataFrame(data)
#         yield df

# def write_excel(file_path, data_generator):
#     chunk_size = 1000000
#     with pd.ExcelWriter(file_path, engine='xlsxwriter') as writer:
#         for data_chunk in generate_data_chunk(num_rows, chunk_size):
#             data_chunk.to_excel(writer, sheet_name='Sheet1', index=False)
#     writer.save()

# def hdf5_create1():        
#     try:
#         _path = os.path.join(os.path.dirname(__file__), 'log/log.txt')  
#         # num_rows = 25000000 #10GB
#         # num_rows = 102072000 #5GB
#         # num_rows = 2500000 #100MB
#         num_rows = 5000000 #200MB
#         # num_rows = 3450000 #150MB
#         # num_rows = 1 #500MB
#         # num_rows = 25000000 #1GB
#         file_path = os.path.join(os.path.dirname(__file__), 'log/1GB_CSV.csv')         
#         # writeLog(_path, file_path + 'start 200MB TSV file --> ' + str(datetime.now().time())+'\n') 
#         # data_gen = generate_data(num_rows)
#         # write_csv(file_path, data_gen)
#         # image_size = (358609767, 358609767)
    
#         # image_size = (1024, 1024)
#         # image = Image.new("RGB", image_size, "red")
#         # image.save(file_path)
#         data_gen = generate_data1(num_rows)        
#         write_excel(file_path, data_gen)
#         writeLog(_path, file_path + '-->' + str(datetime.now().time())+'\n') 
    
#         #     writeLog(_path, 'file write-->' + str(datetime.now().time())+'\n')
#         # writeLog(_path, 'file write finished-->' + str(datetime.now().time())+'\n')
#         returnText = 'kwt testing finished --> :'+file_path
#     except Exception as e:
#         returnText = str(e)
#     return {'data':returnText}  

def read_json_file():
    import requests
    output = ''
    try:   
        data = request.args
        jstr = json.dumps(data, ensure_ascii=False)##jsonに変換
        jstr = json.loads(jstr)       ##pythonで使えるように変換（デコード    
        ##output = str(jstr)
        downloadUrl = ""
        for key in jstr:
            if not downloadUrl:
                downloadUrl = key
            
        url = downloadUrl.replace('localhost', '192.168.168.167')
        from website import settings        
        cookie = request.cookies.get(settings.COOKIE_NAME)    
        cookies={settings.COOKIE_NAME: cookie}               
        response = requests.get(url, cookies=cookies)
        output = response.json()
   
    except Exception as e:
        output = str(e)

    return {'ok': output}

def read_file():
    import requests
    import base64
    output = ''
    try:   
        data = request.args
        jstr = json.dumps(data, ensure_ascii=False)##jsonに変換
        jstr = json.loads(jstr)       ##pythonで使えるように変換（デコード    
        ##output = str(jstr)
        downloadUrl = ""
        for key in jstr:
            downloadUrl = jstr['url']
        #     if not downloadUrl:
        #         downloadUrl = key
        
        url = downloadUrl.replace('localhost', '192.168.168.167')
        from website import settings        
        cookie = request.cookies.get(settings.COOKIE_NAME)    
        cookies={settings.COOKIE_NAME: cookie}               
        response = requests.get(url, cookies=cookies)  
           
        for key in jstr:            
            if jstr['type'] == 'arrayBuffer':            
                output = [int(i) for i in response.content]
            else:
                output = str(response.text)                                                      
        # arrayBuffer
        # output = [int(i) for i in response.content]
        
        # output = str(response.text)
        # output = base64.b64encode(binary_data).decode('utf-8')
        # output = jstr
    except Exception as e:
        output = str(e)

    return {'ok': output}

@celery_app.task(name='website.views')
def hdf5_create():

    uploadUrl = ""
    ##filepath = self.file_path ##これが元ファイル
    ##metadata_download_url = str(self.metadata.download_url)##最初のはてなでぶった切り->そのまま行けそう               
    errorString = ""
    output = ""
    
    ##urlを取得する
    reqData = request.args
    ##output = reqData
    jstr = json.dumps(reqData, ensure_ascii=False)##jsonに変換
    jstr = json.loads(jstr)       ##pythonで使えるように変換（デコード    
    ##output = str(jstr)
    uploadUrl = ""
    for key in jstr:
        if not uploadUrl:
            uploadUrl = key

    ##node取得する
    node = uploadUrl.split("/")[5]
      
    ##パス生成          
    path1 = 'temp/' + node                
    path2 = 'temp2/' + node                
    progressPath = os.path.join(os.path.dirname(__file__), path1 + '/progress.txt')   
    logPath = os.path.join(os.path.dirname(__file__), path2 + '/log.txt')   
    dirPath1 = os.path.join(os.path.dirname(__file__), path1)   
    dirPath2 = os.path.join(os.path.dirname(__file__), path2)   
    os.makedirs(dirPath1, exist_ok=True)
    os.makedirs(dirPath2, exist_ok=True)    

    ##ログ削除    
    removePath2 = os.path.join(os.path.dirname(__file__), path2)     
    check_dir = pathlib.Path(removePath2)
    for file in check_dir.iterdir():
        if file.is_file():
            file.unlink()   

    timestampLogPath = os.path.join(os.path.dirname(__file__), 'log/log.txt')  
    
    # progressPath = os.path.join(os.path.dirname(__file__), 'temp/progress.txt')   
    # logPath = os.path.join(os.path.dirname(__file__), 'temp2/log.txt')   
    writeHdf5Progress(progressPath, 0)
    ##writeProcLog(logPath, '\r\n'+'node:'+node+'\r\n')        

    ##cookie情報取得 00
    from website import settings
    output = output + str(settings.COOKIE_NAME) + '<br>'
    cookie = request.cookies.get(settings.COOKIE_NAME)
    output = output + str(cookie) + '<br>'
    cookies={settings.COOKIE_NAME: cookie}
    ##writeProcLog(logPath, '\r\n'+'cookie'+str(settings.COOKIE_NAME)+'\r\n')

    header= {"content-type": "application/json; charset=utf-8"}  

    ##createHDF5_Pyから受信部 10
    writeHdf5Progress(progressPath, 10)
    writeProcLog(logPath, '\r\n'+'10')        
    # reqData = request.args
    # ##output = reqData
    # jstr = json.dumps(reqData, ensure_ascii=False)##jsonに変換
    # jstr = json.loads(jstr)       ##pythonで使えるように変換（デコード    
    # ##output = str(jstr)
    # uploadUrl = ""
    # for key in jstr:
    #     if not uploadUrl:
    #         uploadUrl = key
    
    ##hdf5作成のjsonのurlを加工 20
    writeHdf5Progress(progressPath, 20)
    writeProcLog(logPath, '\r\n'+'20')        
    uploadUrl = uploadUrl + '=file'##欠落箇所を保管    
    
    replacePath1 = 'http://localhost:7777/'
    replacePath2 = 'http://192.168.168.167:7777/'
    uploadUrl = uploadUrl.replace(replacePath1,replacePath2)
    uploadUrl = uploadUrl.replace('\"','')
    output = output + uploadUrl + '<br>'   
    ##downloadFileName = os.path.join(os.path.dirname(__file__), 'temp/base.json')     
    ##urlData = requests.get(uploadUrl, auth=auth)
    ##urlData = requests.get(uploadUrl, auth=auth, cookies=cookies)
    
    ##hdf5作成のjsonのurlをダウンロードしてリストに分解 30   
    writeHdf5Progress(progressPath, 30)    
    writeProcLog(logPath, '\r\n'+'30')        
    urlData = requests.get(uploadUrl, cookies=cookies)
    j = urlData.json()
    output = output + '<br>' + str(j)     
    dirs = dir_list_of(j, 'root')
    for item in dirs:
        output = output + '~' + item     

    ##output = jstr['data1']
    ##output = jstr
    # ##createHDF5_Pyの受信部 <--

    # ##createHDF5_Py2の受信部 -->     
    ##reqData2 = json.loads(request.json(headers=header))   
    ##reqData2 = request.args
    #reqData2 = request.json()
    ##jstr = reqData2            
    #jstr = json.dumps(reqData2)##jsonに変換
    ##jstr = json.loads(jstr)       ##pythonで使えるように変換（デコード
    # if len(jstr) == 0:
    #     tp = tp + ' empty'
    # ##createHDF5_Py2の受信部 <--    
    
    # if (isinstance(reqData2, dict)):
    #     tp = "dict"

    ##reqData2 = request.args
    ##header= {"content-type": "application/json"}
    ##reqData2 = json.loads(request.json(headers=header))
    #for key, val in request.form.items():
    #     tp = tp + ' key:' + str(key)
    #     tp = tp + ' val:' + str(val)
    ##tp = reqData2.getlist('text')

    # jstr2 = ""
    # jstr = reqData2        
    # if len(jstr) == 0:
    #     tp = tp + ' empty'
    
    ##jstr = reqData2.to_dict()
    # jstr = json.dumps(reqData2, ensure_ascii=False)##jsonに変換
    # jstr = json.loads(jstr)       ##pythonで使えるように変換（デコード
    
    # if (isinstance(jstr, dict)):
    #     tp = tp + ' dict:'
    #     if len(jstr) == 0:
    #         tp = tp + ' empty'
    #     jstr2 = json.dumps(jstr)
    #     tp = tp + jstr2
    #     # for key, val in jstr.items():
    #     #     tempVal = str(val)
    #     #     tp = tp + ' key:' + str(key)
    #     #     tp = tp + ' val:' + str(val)
    # elif (isinstance(jstr, list)):
    #     tp = tp + ' list'

    #tp = str(jstr)    
    
    # tp = tp + "ListingTest--->"    
    # pattern = "https?://[\w/:%#\$&\?\(\)~\.=\+\-]+"        

    # if (isinstance(jstr, dict)):
    #     for key, val in jstr.items():
    #         tempVal = str(val)
    #         tp = tp + ' key:' + str(key)
    #         tp = tp + ' val:' + str(val)
    #         if re.match(pattern, tempVal):
    #             tp = tp + '/' + key + ':' + str(val)
    #         else:
    #             tp = tp + '/' + key                                   
    # #         dirs += dir_list_of(jsondata[key], cur_dir)                    

    ##output = output + tp     
        
    # ##jstr = jstr.replace('\\','')
    # ##jstr = "{'text':{'csv':{'report.csv':'http://localhost:7777/v1/resources/hq5tn/providers/osfstorage/64e054b84467dc0009c5446c?kind=file','test.csv':'http://localhost:7777/v1/resources/hq5tn/providers/osfstorage/64d8d1604411ea00098a6db5?kind=file'},'readme.txt':'http://localhost:7777/v1/resources/hq5tn/providers/osfstorage/64d36a4e2e2d160009ee5e06?kind=file','tsv':{'test.tsv':'http://localhost:7777/v1/resources/hq5tn/providers/osfstorage/64ddc2a040883201be63dc7c?kind=file'}}}"
    # dirs = dir_list_of(jstr, 'root')
    # for item in dirs:
    #     output = output + '~' + item     
                                
    ##テストコード -->               
    # dirs = []                 
    # item1 = "root"
    # dirs.append(item1)
    # item1 = "root/csv"
    # dirs.append(item1)
    # item1 = "root/csv/text1.csv:http://localhost:7777/v1/resources/hq5tn/providers/osfstorage/65264f304ff62a07ae0c854a?kind=file"
    # dirs.append(item1)
    # item1 = "root/csv/text2.csv:http://localhost:7777/v1/resources/hq5tn/providers/osfstorage/65264f3e4ff62a07ae0c8560?kind=file"
    # dirs.append(item1)
    # item1 = "root/readme.txt:http://localhost:7777/v1/resources/hq5tn/providers/osfstorage/64d36a4e2e2d160009ee5e06?kind=file"
    # dirs.append(item1)
    # item1 = "root/tsv"
    # dirs.append(item1)
    # item1 = "root/tsv/text1.tsv:http://localhost:7777/v1/resources/hq5tn/providers/osfstorage/65264f384ff62a07ae0c8555?kind=file"
    # dirs.append(item1)
    ##テストコード <--                              
                                            
    ##作成するhdf5ファイルのパス 40
    writeHdf5Progress(progressPath, 40)        
    writeProcLog(logPath, '\r\n'+'40')        
    h5_path = os.path.join(os.path.dirname(__file__), path1+'/temp.h5')   
    ##h5_path = os.path.join(os.path.dirname(__file__), 'temp/temp.h5')   
    output = output + '--->' + h5_path
    writeProcLog(logPath, '\r\n'+h5_path)

    try :
        with h5py.File(h5_path, "w") as group1:                         

            #ディレクトリlistのループ 49-79
            rootPath = ""
            dirCnt = len(dirs)
            ##output = output + '<br>dirCnt:' + str(dirCnt)
            procCnt = 40
            addCnt = 30 // dirCnt
            ##output = output + '<br>addCnt:' + str(addCnt)
            for item in dirs:
                procCnt = procCnt + addCnt
                ##output = output + '<br>procCnt:' + str(procCnt)
                writeHdf5Progress(progressPath, procCnt)                        
                writeProcLog(logPath, '\r\n'+str(procCnt))
                arr = item.split(":", 1);
                h5ItemPath = arr[0];
                
                if rootPath:
                    h5ItemPath = h5ItemPath.replace(rootPath,'')
                else:
                    rootPath = h5ItemPath + '/'
                                            
                output = output + '<br>ItemPath:' + h5ItemPath
                writeProcLog(logPath, '\r\n'+'ItemPath:' + h5ItemPath)    

                writeLog(timestampLogPath, '\n-------------------------------------------------------') 
                writeLog(timestampLogPath, '\nloop start -->'+ str(datetime.now().time())+'\n')
                #urlが存在する場合
                if (len(arr) >1):
                    h5ItemUrl = arr[1];
                    replacePath1 = 'http://localhost:7777/'
                    replacePath2 = 'http://192.168.168.167:7777/'
                    h5ItemUrl = h5ItemUrl.replace(replacePath1,replacePath2)
                    output = output + '<br>ItemUrl:' + h5ItemUrl                        
                    writeProcLog(logPath, '\r\n'+'ItemUrl:' + h5ItemUrl)    


                    ##拡張子を取得する                        
                    file_name, file_extension = os.path.splitext(h5ItemPath)
                    output = output + '<br>file_extension:' + file_extension
                    writeProcLog(logPath, '\r\n'+'file_extension:' + file_extension)    

                    ##拡張子リスト定義                
                    textExtensions = ['.txt']
                    csvtsvExtensions = ['.csv','.tsv']
                    xlsxExtensions = ['.xlsx', '.xls']
                    imageExtensions = ['.jpg', '.jpeg', '.bmp', '.gif']
                    
                    if file_extension in textExtensions:
                        output = output + '<br>textFile_extension:' + file_extension
                        writeProcLog(logPath, '\r\n'+'textFile_extension:' + file_extension)    
                        returnOutput = _procTextFile(group1, h5ItemPath, cookies, h5ItemUrl, path1, path2)
                        ##returnOutput = _procTextFile(group1, h5ItemPath, auth, h5ItemUrl)
                        output = output + '<br>' + returnOutput
                        writeProcLog(logPath, '\r\n' + returnOutput)    

                    elif file_extension in csvtsvExtensions:
                        output = output + '<br>csvtsvFile_extension:' + file_extension
                        writeProcLog(logPath, '\r\n'+'csvtsvFile_extension:' + file_extension)    
                        returnOutput = _procCsvTsvFile(group1, h5ItemPath, cookies, h5ItemUrl, file_extension, path1, path2, timestampLogPath)
                        ##returnOutput = _procCsvTsvFile(group1, h5ItemPath, auth, h5ItemUrl, file_extension)
                        writeLog(timestampLogPath, 'hdf5 finished -->'+ str(datetime.now().time())+'\n')
                        output = output + '<br>' + returnOutput
                        writeProcLog(logPath, '\r\n' + returnOutput)    
                    
                    elif file_extension in xlsxExtensions:
                        output = output + '<br>xlsxFile_extension:' + file_extension
                        writeProcLog(logPath, '\r\n'+'xlsxFile_extension:' + file_extension)    
                        returnOutput = _procExcelFile(group1, h5ItemPath, cookies, h5ItemUrl, path1, path2, timestampLogPath)
                        writeLog(timestampLogPath, 'hdf5 finished -->'+ str(datetime.now().time())+'\n')
                        ##returnOutput = _procExcelFile(group1, h5ItemPath, auth, h5ItemUrl)
                        output = output + '<br>' + returnOutput
                        writeProcLog(logPath, '\r\n' + returnOutput)    
                    
                    elif file_extension in imageExtensions:
                        output = output + '<br>imageFile_extension:' + file_extension
                        writeProcLog(logPath, '\r\n'+'imageFile_extension:' + file_extension)    
                        returnOutput = _procImageFile(group1, h5ItemPath, cookies, h5ItemUrl, path1, path2, timestampLogPath)
                        writeLog(timestampLogPath, 'hdf5 finished -->'+ str(datetime.now().time())+'\n')
                        ##returnOutput = _procImageFile(group1, h5ItemPath, auth, h5ItemUrl)
                        output = output + '<br>' + returnOutput                
                        writeProcLog(logPath, '\r\n' + returnOutput)    
                        
            output = output + '<br>' + "hdf5_write"
            writeProcLog(logPath, '\r\n' + "hdf5_write")    

                            
    except Exception as e:
        errorString = errorString + ' errorpos1--->' + str(e) 
        writeProcLog(logPath, '\r\n'+'errorpos1--->' + str(e))    
        

    ##uploadUrl = "http://192.168.168.167:7777/v1/resources/hq5tn/providers/osfstorage/652612d14ff62a0008ccf706?kind=file"
    headers = {'Content-type': 'application/octet-stream'}     

    ##出来上がったhdf5をオープンする 
    try:
        with open(h5_path, 'rb') as file:

            #hdf5をアップロードする 80
            writeHdf5Progress(progressPath, 80)          
            writeProcLog(logPath, '80')                          
            output = output + '<br>' + "hdf5_open"
            writeProcLog(logPath, '\r\n' + "hdf5_open")    
            
            r = requests.put(uploadUrl, data=file, headers=headers, cookies=cookies)
            ##r = requests.put(uploadUrl, data=file, headers=headers, auth=auth)
            output = output + "<br>put hdf5 ok " + "<br>" + str(r.request.headers) + "<br>"+uploadUrl+"<bt>"+str(r.status_code)        
            writeProcLog(logPath, "\r\n"+"put hdf5 ok " + "<br>" + str(r.request.headers) + "<br>"+uploadUrl+"<bt>"+str(r.status_code))    

            #一時ファイルを削除する 90
            writeHdf5Progress(progressPath, 90)        
            writeProcLog(logPath, '90')                            
            removePath = os.path.join(os.path.dirname(__file__), path1)     
            ##removePath = os.path.join(os.path.dirname(__file__), 'temp')     
            check_dir = pathlib.Path(removePath)
            for file in check_dir.iterdir():
                if file.is_file():
                    file.unlink()                    
        
    except Exception as e:
        errorString = errorString + ' errorpos2--->' + str(e) 
        writeProcLog(logPath, '\r\n'+' errorpos2--->' + str(e) )    

    # file = open(h5_path,'rb')
    # headers = {'Content-type': 'application/octet-stream'}     

    # ##r = requests.put(uploadUrl, data=file, headers=headers, auth=auth)
    # ##output = output + "<br>put hdf5 ok " + "<br>" + str(r.request.headers) + "<br>"+uploadUrl+"<bt>"+str(r.status_code)        

    # #一時ファイルを削除する
    # removePath = os.path.join(os.path.dirname(__file__), 'temp')     
    # check_dir = pathlib.Path(removePath)
    # for file in check_dir.iterdir():
    #     if file.is_file():
    #         file.unlink()        
                        
    # output = output + '<br>' +'Successfully created HDF5, please return to the file function.'
    # output = output + '<br>' + errorString
    if len(errorString) > 0:
        output = output + '<br>' + errorString
        writeProcLog(logPath, '\r\n' + errorString)            
    else:
        output = output + '<br>' +'Successfully created HDF5, please return to the file function.'
        writeProcLog(logPath, '\r\n' +'Successfully created HDF5, please return to the file function.')            
        ##output = '<br>' +'Successfully created HDF5, please return to the file function.'

    #完了 100            
    writeHdf5Progress(progressPath, 100)                        
    return {'data':output}                                                    

    ##jstr = jstr.replace('\\','')
    ##reqData2 = request.json
    ##reqData2 = reqData2.replace('\"','\'')
    ##jstr = json.loads(reqData2)       
    ##jstr = json.dumps(dict(reqData2), ensure_ascii=False)
    ##jstr = json.dumps(dict(reqData2))
    ##reqData2 = request.body
    ##reqData2 = request.args.body
    ##strreqData2 = reqData2.decode('utf-8')
    ##jstr = json.loads(reqData2)
    ##jstr = json.dumps(reqData2)
    ##jdic = json.loads(jstr)
    ##test = reqData2.getvalu('')
    ##dirs = dir_list_of(jdic, 'root')
    ##for item in dirs:
    ##    output = output + '~' + item                                                 
    
    ##editData = len(dirs)
    ##reqData2 = request.args.get('data1')##これが正解
    ##reqData2 = request.args.get(['data1'])
    ##reqData2 = request.args.GET.get(['data1'])
    ##editData = reqData2 + 'testetet'
    ##return {'data': jdic }
    ##return {'data':jstr}
    ##return {'data':'testtest'}
    
def readHdf5Progress(_filePath):
    
    with open(_filePath, 'r') as f:
        retVal = f.read()    
        
    return retVal
    
def writeHdf5Progress(_filePath, _progress):
    
    with open(_filePath, 'w') as f:
        f.write(str(_progress))
    
def writeProcLog(_filePath, _log):
    
    with open(_filePath, 'a') as f:
        f.write(str(_log))

def writeLog(_filePath, _log):
    
    with open(_filePath, 'a') as f:
        f.write(str(_log))
    
def checkHdf5Progress():    
    
    ##urlを取得する
    reqData = request.args
    ##output = reqData
    jstr = json.dumps(reqData, ensure_ascii=False)##jsonに変換
    jstr = json.loads(jstr)       ##pythonで使えるように変換（デコード    
    ##output = str(jstr)
    uploadUrl = ""
    for key in jstr:
        if not uploadUrl:
            uploadUrl = key

    ##node取得する
    node = uploadUrl.split("/")[5]
    
    progressPath = os.path.join(os.path.dirname(__file__), 'temp/'+node+'/progress.txt')   
    val = readHdf5Progress(progressPath)
    
    return {'data':val}  

## textファイルをダウンロードしてHDF5を作成
##  2023-09-10　R＆D honda
##    
def _procTextFile(_group, _fileName, _cookies, _downloadUrl, path1, path2):
    
    returnText = ""
    logPath = os.path.join(os.path.dirname(__file__), path2 + '/log.txt')   
    ##logPath = os.path.join(os.path.dirname(__file__), 'temp2/log.txt')   
    
    try:            
        ##downloadUrl = "http://192.168.168.167:7777/v1/resources/hq5tn/providers/osfstorage/64f8570780aeeb02097a8dc9?kind=file"
        downloadFileName = os.path.join(os.path.dirname(__file__), path1 + '/text.txt')     
        ##downloadFileName = os.path.join(os.path.dirname(__file__), 'temp/text.txt')     
        urlData = requests.get(_downloadUrl, cookies=_cookies)
        
        retChardet  = chardet.detect(urlData.content).get('encoding')

        returnText = returnText +'<br>'+ "text_get_ok"
        writeProcLog(logPath, '\r\n'+"text_get_ok")                            
        with open(downloadFileName, mode='wt', encoding="utf-8") as file1w: # wb でバイト型を書き込める
            file1w.write(urlData.text)
            
        returnText = returnText +'<br>'+ "text_write_ok"            
        ##returnText = returnText + '<br>' + retChardet
        writeProcLog(logPath, '\r\n'+ "text_write_ok")                            
        

        retChardet = 'utf-8'
        with open(downloadFileName, encoding=retChardet, mode='r') as file1:            
        ##with open(downloadFileName, encoding='UTF-8', mode='r') as file1:
            returnText = returnText +"<br>text_file_open "
            writeProcLog(logPath, "\r\n"+"text_file_open ")                            
            _createHDF5TextFile(_group, file1, _fileName)
            ##self._createHDF5TextFile(group1, file1, 'temp/test.txt')この表記でディレクトリもつくられるのでgroupいらんくね？
            returnText = returnText + "<br>text_Create_Success "
            writeProcLog(logPath, "\r\n"+"text_Create_Success ")                            

    except Exception as e:
        returnText = returnText + '<br>errorProcText:' + str(e)  
        writeProcLog(logPath, '\r\n'+'errorProcText:' + str(e)  )                            

    return returnText

## tsv_csvファイルをダウンロードしてHDF5を作成
##  2023-09-10　R＆D honda
##        
def _procCsvTsvFile(_group, _fileName, _cookies, _downloadUrl, _extension, path1, path2, _path):

    returnText = ""
    logPath = os.path.join(os.path.dirname(__file__), path2 + '/log.txt')   
    ##logPath = os.path.join(os.path.dirname(__file__), 'temp2/log.txt')   
    
    try:   
        writeLog(_path, 'hdf5 start -->'+ str(datetime.now().time())+'\n')           
        downloadFileName = os.path.join(os.path.dirname(__file__), path1 + '/TsvCsv.txt')                         
        ##downloadFileName = os.path.join(os.path.dirname(__file__), 'temp/TsvCsv.txt')                         
        # urlData = requests.get(_downloadUrl, cookies=_cookies)

        # retChardet  = chardet.detect(urlData.content).get('encoding')
        # returnText = returnText + '<br>' + retChardet
        # writeProcLog(logPath, '\r\n'+ retChardet)                            
        
        # if (retChardet == 'windows-1252'):
        #     retChardet = 'utf-8'
        with requests.get(_downloadUrl, cookies=_cookies, stream=True) as r:            
            retChardet = chardet.detect(r.content).get('encoding')
            returnText = returnText + '<br>' + retChardet
            if (retChardet == 'windows-1252'):
                retChardet = 'utf-8'
            writeLog(_path, 'encoding -->'+ str(retChardet) + ' -- ' + str(datetime.now().time())+'\n')
                            
            returnText = returnText +'<br>'+ "csvtsv_get_ok"

            with open(downloadFileName, mode='w', encoding=retChardet) as f:                
                writeLog(_path, 'temp downloadFileName opening -->'+ str(datetime.now().time())+'\n') 
                for chunk in r.iter_content(chunk_size=1024*1024):                    
                    writeLog(_path, 'temp chunk processing -->'+ str(datetime.now().time())+'\n')
                    chunk_str = chunk.decode(encoding=retChardet, errors='ignore')
                    f.write(chunk_str)
            writeProcLog(logPath, '\r\n'+ "csvtsv_get_ok")
            writeLog(_path, 'temp finished -->'+ str(datetime.now().time())+'\n')                            
        
            # with open(downloadFileName, mode='wt', encoding=retChardet) as file1w: # wb でバイト型を書き込める
            # ##with open(downloadFileName, mode='wt', encoding="utf-8") as file1w: # wb でバイト型を書き込める
            #     file1w.write(urlData.text)
            returnText = returnText +'<br>'+ "csvtsv_write_ok"
            writeProcLog(logPath, '\r\n'+ "csvtsv_write_ok")                            
            
            #if (retChardet == 'windows-1252'):
            #retChardet = 'utf-8'
            
            if (_extension == '.tsv'):
                #df = pd.read_csv(downloadFileName, encoding=retChardet, sep='\t')            
                df = pd.read_csv(downloadFileName, sep='\t')            
            else:
                #df = pd.read_csv(downloadFileName, encoding=retChardet)
                df = pd.read_csv(downloadFileName)

            returnText = returnText + "<br>csvtsv_file_open"   
            writeProcLog(logPath, "\r\n"+"csvtsv_file_open")                            
        
        # with open(downloadFileName, mode='r') as file:                         
        # excel_dataset = _group.create_dataset(
        #     name =_fileName, data=df.values, dtype=h5py.special_dtype(vlen=str))
            # excel_dataset[0] = file.read()
            
        # with open(downloadFileName, mode='r') as file:  
        #     excel_dataset = _group.create_dataset(
        #         name=_fileName, shape=(1,), dtype=h5py.special_dtype(vlen=str)
        #     )
        #     excel_dataset[0] = file.read()
        writeLog(_path, 'hdf5 downloadFileName start -->'+ str(datetime.now().time())+'\n') 
        with open(downloadFileName, mode='r') as file:        
            writeLog(_path, 'hdf5 downloadFileName opening -->'+ str(datetime.now().time())+'\n')                  
            writeLog(_path, 'hdf5 chunk processing -->'+ str(datetime.now().time())+'\n')                
            excel_dataset = _group.create_dataset(
                name=_fileName, shape=(1,), chunks=True, compression='gzip', compression_opts=9 ,dtype=h5py.special_dtype(vlen=str)
            )
            excel_dataset[0] = file.read()
            writeLog(_path, 'hdf5 dataset processing -->'+ str(datetime.now().time())+'\n') 

        returnText = returnText + '<br>' +"csvtsv_Create_Success "
        writeProcLog(logPath, '\r\n' +"csvtsv_Create_Success ")                            

    except Exception as e:
        returnText = returnText + '<br>errorProcCsvTsv:' + str(e)  
        writeProcLog(logPath, '\r\n'+'errorProcCsvTsv:' + str(e)  )                            

    return returnText        

def _procExcelFile(_group, _fileName, _cookies, _downloadUrl, path1, path2, _path):

    returnText = ""
    logPath = os.path.join(os.path.dirname(__file__), path2+'/log.txt')   
    ##logPath = os.path.join(os.path.dirname(__file__), 'temp2/log.txt')   
    
    try:        
        writeLog(_path, 'hdf5 start -->'+ str(datetime.now().time())+'\n')     
        downloadFileName = os.path.join(os.path.dirname(__file__), path1+'/Excel.xlsx')                         
        ##downloadFileName = os.path.join(os.path.dirname(__file__), 'temp/Excel.xlsx')                         
        # urlData = requests.get(_downloadUrl, cookies=_cookies).content
        with requests.get(_downloadUrl, cookies=_cookies, stream=True) as r:           
            returnText = returnText + "excel_get_ok"
            writeProcLog(logPath, "\r\n"+"excel_get_ok")  
            writeLog(_path, 'temp downloadFileName opening -->'+ str(datetime.now().time())+'\n')     
            with open(downloadFileName, mode='wb') as f:
                for chunk in r.iter_content(chunk_size=1024*1024):
                    writeLog(_path, 'temp chunk processing -->'+ str(datetime.now().time())+'\n') 
                    f.write(chunk)
                returnText = returnText + "<br>excel_write_ok "
                writeProcLog(logPath, "\r\n"+"excel_write_ok ")   
            writeLog(_path, 'temp finished -->'+ str(datetime.now().time())+'\n')                      

        # with open(downloadFileName ,mode='wb') as file3w: # wb でバイト型を書き込める
        #     file3w.write(urlData)
                         

        # TYPE_OF_BINARY = h5py.special_dtype(vlen=np.dtype('uint8'))    
        # ##with pd.read_excel(downloadFileName) as df:                            
        # df = pd.read_excel(downloadFileName)
        # returnText = returnText +"<br>text_file_open"                            
        # excel_dataset = _group.create_dataset(
        #     name =_fileName, data=df.values)   
            writeLog(_path, 'hdf5 downloadFileName start -->'+ str(datetime.now().time())+'\n') 
            with open(downloadFileName, "rb") as file:
                writeLog(_path, 'hdf5 downloadFileName opening -->'+ str(datetime.now().time())+'\n') 
                excel_binary = file.read()                
                excel_data = np.frombuffer(excel_binary, dtype='uint8')           
                writeLog(_path, 'hdf5 chunk processing -->'+ str(datetime.now().time())+'\n') 
                dataset = _group.create_dataset(
                    name=_fileName, shape=excel_data.shape, chunks=True, dtype=h5py.special_dtype(vlen=np.dtype('uint8')), compression='gzip', compression_opts = 9
                )
                dataset[0] = excel_data
                writeLog(_path, 'hdf5 dataset processing -->'+ str(datetime.now().time())+'\n') 

        # with open(downloadFileName, "rb") as excelf1:
        #     excel_binary = excelf1.read()
        #     returnText = returnText +"<br>text_file_open"  
        #     excel_data = np.frombuffer(excel_binary, dtype='uint8')
        #     dataset = _group.create_dataset(
        #         name =_fileName, shape=excel_data.shape, dtype=h5py.special_dtype(vlen=np.dtype('uint8')), compression='gzip'
        #     )
        #     dataset[0]=excel_data
        #     returnText = returnText +"<br>create_dataset"  
            
        returnText = returnText + '<br>' +"excel_Create_Success"
        writeProcLog(logPath, '\r\n' + "excel_Create_Success")                            

    except Exception as e:
        returnText = returnText + '<br>errorProcExcel:' + str(e)  
        writeProcLog(logPath, '\r\n'+'errorProcExcel:' + str(e))                            

    return returnText

## imageファイルをダウンロードしてHDF5を作成
##  2023-09-10　R＆D honda
##        
def _procImageFile(_group, _fileName, _cookies, _downloadUrl, path1, path2, _path):

    # returnText = ""
    returnText = []
    logPath = os.path.join(os.path.dirname(__file__), path2+'/log.txt')   
    ##logPath = os.path.join(os.path.dirname(__file__), 'temp2/log.txt')   
    
    try:            
        writeLog(_path, 'hdf5 start -->'+ str(datetime.now().time())+'\n')  
        ##downloadUrl = "http://192.168.168.167:7777/v1/resources/hq5tn/providers/osfstorage/64f0955877192d0009c0da1f?kind=file"
        downloadFileName = os.path.join(os.path.dirname(__file__), path1+'/Image.jpg')                         
        ##downloadFileName = os.path.join(os.path.dirname(__file__), 'temp/Image.jpg')                         
        # urlData = requests.get(_downloadUrl, cookies=_cookies).content
        # returnText = returnText + "image_get_ok "
        returnText.append("image_get_ok ")
        writeProcLog(logPath, "\r\n"+"image_get_ok ")                            

        # with BytesIO(urlData) as buf:
        #     file2w = Image.open(buf)
        #     file2w.save(downloadFileName)
        with requests.get(_downloadUrl, cookies=_cookies, stream=True) as r:
            with open(downloadFileName, 'wb') as file:
                writeLog(_path, 'temp downloadFileName opening -->'+ str(datetime.now().time())+'\n')      
                for chunk in r.iter_content(chunk_size=1024*1024):
                    writeLog(_path, 'temp chunk processing -->'+ str(datetime.now().time())+'\n')
                    if chunk:
                        file.write(chunk)
        
                # returnText = returnText + "<br>image_write_ok "
                returnText.append("<br>image_write_ok ")
                writeProcLog(logPath, "\r\n"+"image_write_ok ")   
            writeLog(_path, 'temp finished -->'+ str(datetime.now().time())+'\n') 
            
            writeLog(_path, 'hdf5 downloadFileName start -->'+ str(datetime.now().time())+'\n')       
            with open(downloadFileName, mode='rb') as file2:
                writeLog(_path, 'hdf5 downloadFileName opening -->'+ str(datetime.now().time())+'\n')
                # returnText = returnText +"<br>image_file_open "
                returnText.append("<br>image_file_open ")
                writeProcLog(logPath, "\r\n"+"image_file_open ")                            
                
                _createHDF5ImageFile_nparray(_group, file2, _fileName, _path)  
                # self._createHDF5ImageFile_frombuffer(_group, file2, _fileName)                      
                
                # returnText = returnText + "<br>image_Create_Success "
                returnText.append("<br>image_Create_Success ")
                writeProcLog(logPath, "\r\n"+"image_Create_Success ")                            
        

    except Exception as e:
        # returnText = returnText + '<br>errorProcImage:' + str(e)  
        returnText.append('<br>errorProcImage:' + str(e))
        writeProcLog(logPath, '\r\n'+'errorProcImage:' + str(e))                            

    # return returnText
    return " ".join(returnText) 

## HDF5のフォルダを作成
##  2023-08-31　R＆D honda
##
def _createHDF5Folder(_h5, _folderName):
    
    ##folderName = "dir1"
    _group = _h5.create_group(_folderName)
    
    return _group

## HDF5の子フォルダを作成
##  2023-08-31　R＆D honda
##
def _createHDF5ChildrenFolder(_group, _folderName):
    
    ##_folderName = "dir1_1"
    _groupChild = _group.create_group(_folderName)
    
    return _groupChild    

## textファイルをhdf5化
##  2023-08-31　R＆D honda
##
def _createHDF5TextFile(_group, _file, _fileName):
    
    _file_dataset = _group.create_dataset(
        name =_fileName, shape=(1,), dtype=h5py.special_dtype(vlen=str), compression="gzip"
    )
    ##_file_dataset.attrs['testinfo'] = 'hogehoge'
    _file_dataset[0] = _file.read()

## excelファイルをhdf5化
##  2023-08-31　R＆D honda
##
def _createHDF5ExcelFile(_group, _excelfile, _fileName):
    
    excel_binary = _excelfile.read()
    
    excel_data = np.frombuffer(excel_binary, dtype='uint8') 
    TYPE_OF_BINARY = h5py.special_dtype(vlen=np.dtype('uint8'))
    # excel_dataset = _group.create_dataset(_fileName,(7,3), dtype=TYPE_OF_BINARY)                        
    excel_dataset = _group.create_dataset(
        name =_fileName, shape=excel_data.shape, dtype=TYPE_OF_BINARY
    )
    # excel_dataset = _group.create_dataset(
    #     name =_fileName, shape=excel_data.shape, dtype=h5py.special_dtype(vlen=np.dtype('uint8')),
    # )
    excel_dataset[0] = excel_data         

def _createHDF5ImageFile_nparray(_group, _imagefile, _fileName, _path):
    
    image_binary = _imagefile.read()
    
    # image_data = np.frombuffer(image_binary, dtype='uint8')
    image_data = np.array(list(image_binary), dtype='uint8')
    TYPE_OF_BINARY = h5py.special_dtype(vlen=np.dtype('uint8'))
    ds_img = _group.create_dataset(
        _fileName, shape=image_data.shape, dtype=TYPE_OF_BINARY)     
    ds_img[0] = image_data    
    # for chunk in iter(lambda: _imagefile.read(1024*1024), b''):  
    #     writeLog(_path, 'hdf5 chunk processing -->'+ str(datetime.now().time())+'\n')   
    #     # image_data = np.frombuffer(image_binary, dtype='uint8')
    #     image_data = np.array(list(chunk), dtype='uint8')
    #     TYPE_OF_BINARY = h5py.special_dtype(vlen=np.dtype('uint8'))
    #     ds_img = _group.create_dataset(_fileName, shape=image_data.shape, dtype=TYPE_OF_BINARY)     
    #     ds_img[0] = image_data    
    #     writeLog(_path, 'hdf5 dataset processing -->'+ str(datetime.now().time())+'\n')
    # ds_img.close()

## url（upload）からファイルをダウンロード
##  2023-08-31　R＆D honda
##     
def urlFileDownload(_downloadUrl, _downloadFileName, _encoding, _mode):

    headers_dic = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.97 Safari/537.36"}
    urlData = requests.get(_downloadUrl).content
    ##urlData = requests.get(_downloadUrl, headers=headers_dic).content

    with open(_downloadFileName, encoding=_encoding, mode=_mode) as f: # wb でバイト型を書き込める
        f.write(urlData)

        return f            

## jsonのディレクトリ構造をlist化
##  2023-08-31　R＆D honda
##
def dir_list_of(jsondata, current_dir='')->list:
    dirs = []
    pattern = "https?://[\w/:%#\$&\?\(\)~\.=\+\-]+"
    
    if isinstance(jsondata, int) or isinstance(jsondata, str):
        return dirs
    elif isinstance(jsondata, list):
        for i in range(len(jsondata)):
            cur_dir = current_dir + '/' + str(i)
            dirs.append(cur_dir)
            dirs += dir_list_of(jsondata[i], cur_dir)
            ##dirs += self.dir_list_of(jsondata[i], cur_dir)
    elif isinstance(jsondata, dict):
        for key, val in jsondata.items():
            tempVal = str(val)
            if re.match(pattern, tempVal):
                cur_dir = current_dir + '/' + key + ':' + str(val)
            else:
                cur_dir = current_dir + '/' + key
                                    
            dirs.append(cur_dir)
            dirs += dir_list_of(jsondata[key], cur_dir)                    
            ##dirs += self.dir_list_of(jsondata[key], cur_dir)                    

    return dirs


def signin_form():
    return form_utils.jsonify(SignInForm())


def forgot_password_form():
    return form_utils.jsonify(ForgotPasswordForm(prefix='forgot_password'))


# GUID ###

def _build_guid_url(base, suffix=None):
    if not isinstance(base, str):
        base = str(base)
    url = '/'.join([
        each.strip('/') for each in [base, suffix]
        if each
    ])
    if not isinstance(url, str):
        url = url.decode('utf-8')
    return u'/{0}/'.format(url)


def resolve_guid_download(guid, suffix=None, provider=None):
    return resolve_guid(guid, suffix='download')


def resolve_guid(guid, suffix=None):
    """Load GUID by primary key, look up the corresponding view function in the
    routing table, and return the return value of the view function without
    changing the URL.

    :param str guid: GUID primary key
    :param str suffix: Remainder of URL after the GUID
    :return: Return value of proxied view function
    """
    try:
        # Look up
        guid_object = Guid.load(guid)
    except KeyError as e:
        if e.message == 'osfstorageguidfile':  # Used when an old detached OsfStorageGuidFile object is accessed
            raise HTTPError(http_status.HTTP_404_NOT_FOUND)
        else:
            raise e
    if guid_object:
        # verify that the object implements a GuidStoredObject-like interface. If a model
        #   was once GuidStoredObject-like but that relationship has changed, it's
        #   possible to have referents that are instances of classes that don't
        #   have a deep_url attribute or otherwise don't behave as
        #   expected.
        if not hasattr(guid_object.referent, 'deep_url'):
            sentry.log_message(
                'Guid resolved to an object with no deep_url', dict(guid=guid)
            )
            raise HTTPError(http_status.HTTP_404_NOT_FOUND)
        referent = guid_object.referent
        if referent is None:
            logger.error('Referent of GUID {0} not found'.format(guid))
            raise HTTPError(http_status.HTTP_404_NOT_FOUND)
        if not referent.deep_url:
            raise HTTPError(http_status.HTTP_404_NOT_FOUND)

        # Handle file `/download` shortcut with supported types.
        if suffix and suffix.rstrip('/').lower() == 'download':
            file_referent = None
            if isinstance(referent, Preprint) and referent.primary_file:
                file_referent = referent.primary_file
            elif isinstance(referent, BaseFileNode) and referent.is_file:
                file_referent = referent

            if file_referent:
                if isinstance(file_referent.target, Preprint) and not file_referent.target.is_published:
                    # TODO: Ideally, permissions wouldn't be checked here.
                    # This is necessary to prevent a logical inconsistency with
                    # the routing scheme - if a preprint is not published, only
                    # admins and moderators should be able to know it exists.
                    auth = Auth.from_kwargs(request.args.to_dict(), {})
                    # Check if user isn't a nonetype or that the user has admin/moderator/superuser permissions
                    if auth.user is None or not (auth.user.has_perm('view_submissions', file_referent.target.provider) or
                            file_referent.target.has_permission(auth.user, permissions.ADMIN)):
                        raise HTTPError(http_status.HTTP_404_NOT_FOUND)

                # Extend `request.args` adding `action=download`.
                request.args = request.args.copy()
                request.args.update({'action': 'download'})
                # Do not include the `download` suffix in the url rebuild.
                url = _build_guid_url(unquote(file_referent.deep_url))
                return proxy_url(url)

        if suffix and suffix.rstrip('/').lower() == 'addtimestamp':
            file_referent = None
            if isinstance(referent, Preprint) and referent.primary_file:
                if not referent.is_published:
                    # TODO: Ideally, permissions wouldn't be checked here.
                    # This is necessary to prevent a logical inconsistency with
                    # the routing scheme - if a preprint is not published, only
                    # admins should be able to know it exists.
                    auth = Auth.from_kwargs(request.args.to_dict(), {})
                    if not referent.node.has_permission(auth.user, permissions.ADMIN):
                        raise HTTPError(http_status.HTTP_404_NOT_FOUND)
                file_referent = referent.primary_file
            elif isinstance(referent, BaseFileNode) and referent.is_file:
                file_referent = referent

            if file_referent:
                # Extend `request.args` adding `action=addtimestamp`.
                request.args = request.args.copy()
                request.args.update({'action': 'addtimestamp'})
                # Do not include the `addtimestamp` suffix in the url rebuild.
                # Do not include the `addtimestamp` suffix in the url rebuild.
                url = _build_guid_url(unquote(file_referent.deep_url))
                return proxy_url(url)
        elif suffix and suffix.rstrip('/').split('/')[-1].lower() == 'addtimestamp':
            # Extend `request.args` adding `action=addtimestamp`.
            request.args = request.args.copy()
            request.args.update({'action': 'addtimestamp'})
            # Do not include the `addtimestamp` suffix in the url rebuild.
            # Do not include the `addtimestamp` suffix in the url rebuild.
            url = _build_guid_url(unquote(referent.deep_url), suffix.split('/')[0])
            return proxy_url(url)

        # Handle Ember Applications
        if isinstance(referent, Preprint):
            if referent.provider.domain_redirect_enabled:
                # This route should always be intercepted by nginx for the branded domain,
                # w/ the exception of `<guid>/download` handled above.
                return redirect(referent.absolute_url, http_status.HTTP_301_MOVED_PERMANENTLY)

            if PROXY_EMBER_APPS:
                resp = requests.get(EXTERNAL_EMBER_APPS['preprints']['server'], stream=True, timeout=EXTERNAL_EMBER_SERVER_TIMEOUT)
                return Response(stream_with_context(resp.iter_content()), resp.status_code)

            return send_from_directory(preprints_dir, 'index.html')

        # Handle DraftNodes - these should never be accessed directly
        if isinstance(referent, DraftNode):
            raise HTTPError(http_status.HTTP_404_NOT_FOUND)

        if isinstance(referent, BaseFileNode) and referent.is_file and (getattr(referent.target, 'is_quickfiles', False)):
            if referent.is_deleted:
                raise HTTPError(http_status.HTTP_410_GONE)
            if PROXY_EMBER_APPS:
                resp = requests.get(EXTERNAL_EMBER_APPS['ember_osf_web']['server'], stream=True, timeout=EXTERNAL_EMBER_SERVER_TIMEOUT)
                return Response(stream_with_context(resp.iter_content()), resp.status_code)

            return send_from_directory(ember_osf_web_dir, 'index.html')

        if isinstance(referent, Registration) and (
                not suffix or suffix.rstrip('/').lower() in ('comments', 'links', 'components')
        ):
            if flag_is_active(request, features.EMBER_REGISTRIES_DETAIL_PAGE):
                # Route only the base detail view to ember
                if PROXY_EMBER_APPS:
                    resp = requests.get(EXTERNAL_EMBER_APPS['ember_osf_web']['server'], stream=True, timeout=EXTERNAL_EMBER_SERVER_TIMEOUT)
                    return Response(stream_with_context(resp.iter_content()), resp.status_code)

                return send_from_directory(ember_osf_web_dir, 'index.html')

        url = _build_guid_url(unquote(referent.deep_url), suffix)
        return proxy_url(url)

    # GUID not found; try lower-cased and redirect if exists
    guid_object_lower = Guid.load(guid.lower())
    if guid_object_lower:
        return redirect(
            _build_guid_url(guid.lower(), suffix)
        )

    # GUID not found
    raise HTTPError(http_status.HTTP_404_NOT_FOUND)


# Redirects #

# redirect osf.io/about/ to OSF wiki page osf.io/4znzp/wiki/home/
def redirect_about(**kwargs):
    return redirect('https://rdm.nii.ac.jp/4znzp/wiki/home/')

def redirect_help(**kwargs):
    return redirect('/faq/')

def redirect_faq(**kwargs):
    return redirect('https://help.osf.io/hc/en-us/articles/360019737894-FAQs')

# redirect osf.io/howosfworks to osf.io/getting-started/
def redirect_howosfworks(**kwargs):
    return redirect('/getting-started/')


# redirect osf.io/getting-started to https://openscience.zendesk.com/hc/en-us
def redirect_getting_started(**kwargs):
    return redirect('https://openscience.zendesk.com/hc/en-us')


# Redirect to home page
def redirect_to_home():
    return redirect('/')


def redirect_to_cos_news(**kwargs):
    # Redirect to COS News page
    return redirect('https://nii.ac.jp/news/')


# Return error for legacy SHARE v1 search route
def legacy_share_v1_search(**kwargs):
    return HTTPError(
        http_status.HTTP_400_BAD_REQUEST,
        data=dict(
            message_long='Please use v2 of the SHARE search API available at {}api/v2/share/search/creativeworks/_search.'.format(settings.SHARE_URL)
        )
    )


def get_storage_region_list(user, node=False):
    if not user:  # Preserves legacy frontend test behavior
        return []

    if node:
        default_region = node.osfstorage_region
    else:
        user_settings = user.get_addon('osfstorage')
        if user_settings is None:
            user_settings = user.add_addon('osfstorage')
        default_region = user_settings.default_region

    available_regions = [{'name': default_region.name, '_id': default_region._id}]
    institution = user.affiliated_institutions.first()
    if institution is not None:
        region_queryset = Region.objects.filter(_id=institution._id).order_by('name').values('_id', 'name')
        if region_queryset.count() > 0:
            available_regions = list(region_queryset)
    return available_regions
