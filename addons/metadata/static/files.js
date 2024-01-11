'use strict';

const $ = require('jquery');
const m = require('mithril');
const Fangorn = require('js/fangorn').Fangorn;
const Raven = require('raven-js');
const $osf = require('js/osfHelpers');
const async = require('async');

// 2023-08-22 追加 R&D honda -->
//const XlsxPopulate = require("xlsx-populate");
//const ExcelJS = require('exceljs');
//const XLSX = require('sheetjs');
const XLSX = require('xlsx');
const exif = require('exif-js');
const jschardet = require('jschardet');
// 2023-08-22 追加 R&D honda <--

const logPrefix = '[metadata] ';
const rdmGettext = require('js/rdmGettext');

require('./css/bootstrap-treeview.min.css');
require('./js/bootstrap-treeview.min.js');

const _ = rdmGettext._;

const metadataFields = require('./metadata-fields.js');
const WaterButlerCache = require('./wbcache.js').WaterButlerCache;
const registrations = require('./registration.js');

const RegistrationSchemas = registrations.RegistrationSchemas;
const DraftRegistrations = registrations.DraftRegistrations;


var active_page_number = 2;
var tb1 = null;
var item1 = null;
var mode1 = null;

const osfBlock = {
  originBaseZ: $.blockUI.defaults.baseZ,
  // modal z-index is 1050
  baseZ: 1100,
  block: function () {
    $.blockUI.defaults.baseZ = this.baseZ;
    $osf.block();
  },
  unblock: function () {
    $osf.unblock();
    $.blockUI.defaults.baseZ = this.originBaseZ;
  }
};

const METADATA_CACHE_EXPIRATION_MSEC = 1000 * 60 * 5;


function ERad() {
  var self = this;

  self.candidates = null;

  self.load = function (baseUrl, callback) {
    var url = baseUrl + 'erad/candidates';
    console.log(logPrefix, 'loading: ', url);

    return $.ajax({
      url: url,
      type: 'GET',
      dataType: 'json'
    }).done(function (data) {
      console.log(logPrefix, 'loaded: ', data);
      self.candidates = ((data.data || {}).attributes || {}).records;
      callback();
    }).fail(function (xhr, status, error) {
      Raven.captureMessage('Error while retrieving addon info', {
        extra: {
          url: url,
          status: status,
          error: error
        }
      });
      callback();
    });
  };
}

function _uploadEvent(event, item, col) {
  var self = this;  // jshint ignore:line
  try {
    event.stopPropagation();
  } catch (e) {
    window.event.cancelBubble = true;
  }
  self.dropzone.hiddenFileInput.removeAttribute('webkitdirectory');
  self.dropzoneItemCache = item;
  self.dropzone.hiddenFileInput.setAttribute('accept', 'application/json');
  $(self.dropzone.hiddenFileInput).on('change', function () {
    var selectedFile = this.files[0];
    console.log('Selected file name:' + selectedFile.name);
    console.log('Selected file type:' + selectedFile.type);

    var reader = new FileReader();
    reader.onload = function (event) {
      var fileContent = event.target.result;
      console.log('File content:' + fileContent);
    };
    reader.readAsText(selectedFile);

    if (!item.open) {
      self.updateFolder(null, item);
    }

    $(this).off('change');
  });
  self.dropzone.hiddenFileInput.click();

}

function _uploadFolderEvent(event, item, mode, col) {
  var tb = this;  // jshint ignore:line

  // clear cache of input before upload new folder
  if (tb.dropzone.hiddenFileInput) {
    document.body.removeChild(tb.dropzone.hiddenFileInput);
  }

  tb.dropzone.hiddenFileInput = document.createElement('input');
  tb.dropzone.hiddenFileInput.setAttribute('type', 'file');
  if (tb.dropzone.options.maxFiles == null || tb.dropzone.options.maxFiles > 1) {
    tb.dropzone.hiddenFileInput.setAttribute('multiple', 'multiple');
  }
  if (tb.dropzone.options.acceptedFiles != null) {
    tb.dropzone.hiddenFileInput.setAttribute('accept', tb.dropzone.options.acceptedFiles);
  }
  tb.dropzone.hiddenFileInput.style.visibility = 'hidden';
  tb.dropzone.hiddenFileInput.style.position = 'absolute';
  tb.dropzone.hiddenFileInput.style.top = '0';
  tb.dropzone.hiddenFileInput.style.left = '0';
  tb.dropzone.hiddenFileInput.style.height = '0';
  tb.dropzone.hiddenFileInput.style.width = '0';
  document.body.appendChild(tb.dropzone.hiddenFileInput);

  try {
    event.stopPropagation();
  } catch (e) {
    window.event.cancelBubble = true;
  }

  // set for select folder
  tb.dropzone.hiddenFileInput.setAttribute('webkitdirectory', 'true');
  tb.dropzone.hiddenFileInput.click();
  if (!item.open) {
    tb.updateFolder(null, item);
  }
  tb.dropzone.hiddenFileInput.addEventListener('change', _onchange);

  function _onchange() {
    var node_parent = tb.multiselected()[0];
    var root_parent = tb.multiselected()[0];
    var files = [];
    var total_files_size = 0;

    // get all files in folder
    files = tb.dropzone.hiddenFileInput.files;
    total_files_size = 0;

    // check folder is empty
    if (files.length === 0) {
      $osf.growl('Error', gettext('The folder that wants to upload is empty.'), 'danger', 5000);
      return;
    }

    // calculate total files size in folder
    for (var i = 0; i < files.length; i++) {
      total_files_size += files[i].size;
    }

    node_parent.open = true;
    total_files_size = parseFloat(total_files_size).toFixed(2);
    var quota = null;

    if (!item.data.provider) {
      return;
    }

    // call api get used quota and max quota
    quota = $.ajax({
      async: false,
      method: 'GET',
      url: item.data.nodeApiUrl + 'get_creator_quota/',
    });

    if (!quota.responseJSON) {
      return;
    }

    quota = quota.responseJSON;

    // check upload quota for upload folder
    if (parseFloat(quota.used) + parseFloat(total_files_size) > quota.max) {
      $osf.growl('Error', sprintf(gettext('Not enough quota to upload. The total size of the folder %1$s.'),
        formatProperUnit(total_files_size)),
        'danger', 5000);
      return;
    }

    var created_folders = [];
    var created_path = [];

    // Start
    node_parent = _pushObject(node_parent, 0, files, files[0], 0, _pushObject);

    function _pushObject(node_parent, index, list_paths, file, file_index, next) {
      var _obj, folder_name;
      // Stop
      if (!file) {
        // console.log('Stop');
        return node_parent;
      }
      // get item object
      if (index >= 0 && index < list_paths.length) {
        _obj = list_paths[index];
      }
      // check type of File
      if (typeof _obj === typeof file) {
        // console.log(file);
        if (file.webkitRelativePath.length === 0) {
          tb.dropzoneItemCache = tb.multiselected()[0];
          tb.dropzone.addFile(file);
          // next file
          var next_file_index = ++file_index;
          return _pushObject(node_parent, 0, files, files[next_file_index], next_file_index, _pushObject);
        }

        // change list_paths of File obj
        var new_list_paths = file.webkitRelativePath.split('/');
        return _pushObject(node_parent, 0, new_list_paths, file, file_index, _pushObject);
      }

      // else, it is folder and file
      folder_name = _obj;
      if (file.name === folder_name) {
        // next file
        // console.log(folder_name, parent && parent.data.name);
        return _pushFile(node_parent, file, file_index);
      }
      // Create each folder detected from file path
      // console.log(folder_name, parent && parent.data.name);
      return _pushFolder(node_parent, index, list_paths, file, file_index, next);
    }

    function _pushFile(node_parent, file, file_index) {
      node_parent.open = true;
      tb.dropzoneItemCache = node_parent;
      tb.dropzone.addFile(file);
      // console.log('Pushed');
      // next file
      var next_file_index = ++file_index;
      return _pushObject(root_parent, 0, files, files[next_file_index], next_file_index, _pushObject);
    }

    function _pushFolder(node_parent, index, list_paths, file, file_index, next) {
      var folder_name;
      if (index >= 0 && index < list_paths.length) {
        folder_name = list_paths[index];
      }
      // var currentFolder = created_folders.find(x => x.name === folder_name);
      var currentFolder = null;
      for (var i = 0; i < created_folders.length; i++) {
        if (created_folders[i].name === folder_name) {
          currentFolder = created_folders[i];
          break;
        }
      }
      var currentFolderPath = '/' + folder_name + '/';

      node_parent.open = true;

      if (node_parent.data.materialized) {
        currentFolderPath = node_parent.data.materialized + folder_name + '/';
      }

      // check folder is created
      // var child = node_parent.children.find((e) => {
      //     return e.data.materialized === currentFolderPath;
      // });
      var child = null;
      for (var j = 0; j < node_parent.children.length; j++) {
        if (encodeURI(node_parent.children[j].data.materialized) === encodeURI(currentFolderPath)) {
          child = node_parent.children[j];
          break;
        }
      }
      if (!!child) {
        // console.log('child', child);
        var next_folder_index = ++index;
        return next(child, next_folder_index, list_paths, file, file_index, next);
      }

      if (currentFolder && created_path.includes(currentFolderPath)) {
        // console.log('currentFolder.parent', currentFolder.parent);
        var new_next_folder_index = ++index;
        return next(currentFolder.node_parent, new_next_folder_index, list_paths, file, file_index, next);
      }

      created_path.push(currentFolderPath);
      // console.log('Creating');

      // prepare data for request new folder
      var extra = {};
      var path = node_parent.data.path || '/';
      var options = { name: folder_name, kind: 'folder', waterbutlerURL: node_parent.data.waterbutlerURL };
      if ((node_parent.data.provider === 'github') || (node_parent.data.provider === 'gitlab')) {
        extra.branch = node_parent.data.branch;
        options.branch = node_parent.data.branch;
      }

      // call api for create folder
      m.request({
        method: 'PUT',
        background: true,
        config: $osf.setXHRAuthorization,
        url: waterbutler.buildCreateFolderUrl(path, node_parent.data.provider, node_parent.data.nodeId, options, extra)
      }).then(function (item) {
        item = tb.options.lazyLoadPreprocess.call(this, item).data;
        inheritFromParent({ data: item }, node_parent, ['branch']);
        item = tb.createItem(item, node_parent.id);
        node_parent = item;
        orderFolder.call(tb, node_parent);

        // store folder is created
        created_folders.push({
          'name': folder_name,
          'node_parent': node_parent,
        });
        // console.log('Created');
        // nest folder
        var next_folder_index = ++index;
        return next(node_parent, next_folder_index, list_paths, file, file_index, next);
      }, function (data) {
        if (data && data.code === 409) {
          $osf.growl(data.message);
          m.redraw();
        } else {
          $osf.growl(gettext('Folder creation failed.'));
        }
        return root_parent;
      });
    }
  }
}

function MetadataButtons() {
  var self = this;
  self.baseUrl = contextVars.node.urls.api + 'metadata/';
  self.loading = null;
  self.contexts = null;
  self.loadingMetadatas = {};
  self.erad = new ERad();
  self.currentItem = null;
  self.registrationSchemas = new RegistrationSchemas();
  self.draftRegistrations = new DraftRegistrations();
  self.registeringFilepath = null;
  self.selectDraftDialog = null;
  self.reservedRows = [];
  self.lastMetadata_hold = null;

  self.loadConfig = function (callback) {
    if (self.loading !== null) {
      return;
    }
    self.loading = true;
    const loadedCallback = function () {
      self.loading = false;
      const path = self.processHash();
      m.redraw();
      if (!callback) {
        return;
      }
      callback(path);
    };
    self.registrationSchemas.load(function () {
      console.log('ajax:'+contextVars.node.urls.api + 'metadata/');
      self.loadMetadata(contextVars.node.id, contextVars.node.urls.api + 'metadata/', function (projectMetadata) {
        if (projectMetadata && projectMetadata.editable) {
          self.erad.load(self.baseUrl, loadedCallback);
          return;
        }
        loadedCallback();
      });
    });
  };

  self.processHash = function () {
    const path = self.getContextPath();
    if (!path) {
      return null;
    }
    if (window.location.hash !== '#edit-metadata') {
      return path;
    }
    const context = self.findContextByNodeId(contextVars.node.id);
    if (!context) {
      return null;
    }
    self.editMetadata(context, path, self.getFileItemFromContext());
    return path;
  }

  self.getContextPath = function () {
    if (contextVars.file && contextVars.file.provider) {
      return contextVars.file.provider + contextVars.file.materializedPath;
    }
    const projectMetadata = self.findProjectMetadataByNodeId(contextVars.node.id);
    if (!projectMetadata) {
      return null;
    }
    const currentMetadata = (projectMetadata.files || []).filter(function (f) {
      return f.urlpath === window.location.pathname;
    })[0];
    if (!currentMetadata) {
      return null;
    }
    return currentMetadata.path;
  }

  self.loadMetadata = function (nodeId, baseUrl, callback) {
    if (self.loadingMetadatas[nodeId]) {
      return;
    }
    self.loadingMetadatas[nodeId] = true;
    const url = baseUrl + 'project';
    console.log(logPrefix, 'loading: ', url);

    return $.ajax({
      url: url,
      type: 'GET',
      dataType: 'json'
    }).done(function (data) {
      self.loadingMetadatas[nodeId] = false;
      console.log(logPrefix, 'loaded: ', data);
      if (!self.contexts) {
        self.contexts = {};
      }
      const metadata = {
        nodeId: nodeId,
        baseUrl: baseUrl,
        projectMetadata: (data.data || {}).attributes,
        wbcache: (self.contexts[nodeId] ? self.contexts[nodeId].wbcache : null) || new WaterButlerCache(),
        validatedFiles: (self.contexts[nodeId] ? self.contexts[nodeId].validatedFiles : null) || {},
        addonAttached: true
      };
      self.contexts[nodeId] = metadata;
      if (!callback) {
        return;
      }
      callback((data.data || {}).attributes);
    }).fail(function (xhr, status, error) {
      self.loadingMetadatas[nodeId] = false;
      if (error === 'BAD REQUEST') {
        if (!self.contexts) {
          self.contexts = {};
        }
        self.contexts[nodeId] = {
          nodeId: nodeId,
          baseUrl: baseUrl,
          projectMetadata: {
            editable: false,
            files: []
          },
          wbcache: (self.contexts[nodeId] ? self.contexts[nodeId].wbcache : null) || new WaterButlerCache(),
          validatedFiles: (self.contexts[nodeId] ? self.contexts[nodeId].validatedFiles : null) || {},
          addonAttached: false
        };
      } else {
        Raven.captureMessage('Error while retrieving addon info', {
          extra: {
            url: url,
            status: status,
            error: error
          }
        });
      }
      if (!callback) {
        return;
      }
      callback(null);
    });
  };

  self.lastMetadata = null;
  self.lastFields = null;
  self.currentSchemaId = null;

  self.createFields = function (schema, item, options, callback) {
    const fields = [];
    const itemData = options.multiple ? {} : item.data || {};
    (schema.pages || []).forEach(function (page) {
      (page.questions || []).forEach(function (question) {
        if (!question.qid || !question.qid.match(/^grdm-file:.+/)) {
          return;
        }
        const value = itemData[question.qid];
        const field = metadataFields.createField(
          self.erad,
          question,
          value,
          options,
          callback
        );
        fields.push({ field: field, question: question });
      });
    });
    return fields;
  };

  self.fieldsChanged = function (event, options) {
    console.log('fieldsChanged--------->' + options);
    if (!self.lastFields) {
      return;
    }
    const fieldSetsAndValues = [];
    self.lastFields.forEach(function (fieldSet) {
      const value = fieldSet.field.getValue(fieldSet.input);
      fieldSetsAndValues.push({ fieldSet: fieldSet, value: value });
    });
    fieldSetsAndValues.forEach(function (fieldSetAndValue) {
      const fieldSet = fieldSetAndValue.fieldSet;
      const value = fieldSetAndValue.value;
      var error = null;
      try {
        metadataFields.validateField(
          self.erad,
          fieldSet.question,
          value,
          fieldSetsAndValues,
          options
        );
      } catch (e) {
        error = e.message;
      }
      if (fieldSet.lastError == error) {
        return;
      }
      fieldSet.lastError = error;
      if (error) {
        fieldSet.errorContainer.text(error).show()
      } else {
        fieldSet.errorContainer.hide().text('')
      }
    });
  }

  self.prepareFields = function (context, container, schema, filepath, fileitem, options) {
    var lastMetadataItem = {};
    if (!options.multiple) {
      lastMetadataItem = (self.lastMetadata.items || []).filter(function (item) {
        const resolved = self.resolveActiveSchemaId(item.schema) || self.currentSchemaId;
        return resolved === schema.id;
      })[0] || {};
    }
    container.empty();
    const fields = self.createFields(
      schema.attributes.schema,
      lastMetadataItem,
      {
        readonly: !((context.projectMetadata || {}).editable),
        multiple: options.multiple,
        context: context,
        filepath: filepath,
        wbcache: context.wbcache,
        fileitem: fileitem
      },
      self.fieldsChanged
    );
    self.lastFields = [];
    fields.forEach(function (fieldSet) {
      const errorContainer = $('<div></div>')
        .css('color', 'red').hide();
      const input = fieldSet.field.addElementTo(container, errorContainer);
      self.lastFields.push({
        field: fieldSet.field,
        question: fieldSet.question,
        input: input,
        lastError: null,
        errorContainer: errorContainer
      });
    });
    self.fieldsChanged(null, options);
  }

  self.findSchemaById = function (schemaId) {
    const targetSchemas = self.registrationSchemas.schemas.filter(function (s) {
      return s.id == schemaId;
    });
    if (targetSchemas.length == 0) {
      return null;
    }
    return targetSchemas[0];
  }

  self.resolveActiveSchemaId = function (schemaId) {
    const targetSchemas = (self.registrationSchemas.schemas || [])
      .filter(function (s) {
        return s.id === schemaId;
      });
    if (targetSchemas.length === 0) {
      console.warn(logPrefix, 'No schemas for ' + schemaId);
      return null;
    }
    const targetSchema = targetSchemas[0];
    if (targetSchema.attributes.active) {
      return targetSchema.id;
    }
    const alternativeSchemas = (self.registrationSchemas.schemas || [])
      .filter(function (s) {
        return s.attributes.name === targetSchema.attributes.name;
      });
    if (alternativeSchemas.length === 0) {
      console.warn(logPrefix, 'No schemas for ' + targetSchema.attributes.name);
      return null;
    }
    return alternativeSchemas[0].id;
  }

  self.createSchemaSelector = function (targetItem) {
    const label = $('<label></label>').text(_('Metadata Schema:'));
    const schema = $('<select></select>');
    const activeSchemas = (self.registrationSchemas.schemas || [])
      .filter(function (s) {
        return s.attributes.active;
      });
    if (activeSchemas.length === 0) {
      throw new Error('No active metadata schemas');
    }
    activeSchemas.forEach(function (s) {
      schema.append($('<option></option>')
        .attr('value', s.id)
        .text(s.attributes.name));
    });
    var currentSchemaId = null;
    const activeSchemaIds = activeSchemas.map(function (s) {
      return s.id;
    });
    if (targetItem.schema && activeSchemaIds.includes(targetItem.schema)) {
      currentSchemaId = targetItem.schema;
      schema.val(currentSchemaId);
      console.log(logPrefix, 'currentSchemaA: ', currentSchemaId);
    } else if (targetItem.schema && self.resolveActiveSchemaId(targetItem.schema)) {
      currentSchemaId = self.resolveActiveSchemaId(targetItem.schema);
      schema.val(currentSchemaId);
      console.log(logPrefix, 'currentSchemaB: ', currentSchemaId);
    } else {
      currentSchemaId = activeSchemas[0].id;
      schema.val(currentSchemaId);
      console.log(logPrefix, 'currentSchemaC: ', currentSchemaId);
    }
    const group = $('<div></div>').addClass('form-group')
      .append(label)
      .append(schema);
    return {
      schema: schema,
      group: group,
      currentSchemaId: currentSchemaId,
    }
  }

  self.findProjectMetadataByNodeId = function (nodeId) {
    const ctx = self.findContextByNodeId(nodeId);
    if (!ctx) {
      return null;
    }
    return ctx.projectMetadata;
  };

  self.findContextByNodeId = function (nodeId) {
    if (!self.contexts) {
      return null;
    }
    return self.contexts[nodeId];
  };

  self.findMetadataByPath = function (nodeId, filepath) {
    const projectMetadata = self.findProjectMetadataByNodeId(nodeId);
    if (!projectMetadata) {
      return null;
    }
    const currentMetadatas = projectMetadata.files.filter(function (f) {
      return f.path === filepath;
    });
    if (currentMetadatas.length === 0) {
      return null;
    }
    return currentMetadatas[0];
  };

  /**
   * Get the file item for input fields.
   */
  self.getFileItemFromContext = function () {
    if (contextVars.directory) {
      const dir = contextVars.directory;
      return {
        kind: 'folder',
        data: {
          materialized: dir.materializedPath,
          path: dir.path,
          provider: dir.provider,
          nodeId: contextVars.node.id
        }
      };
    }
    if (contextVars.file) {
      const file = contextVars.file;
      return {
        kind: 'file',
        data: {
          name: file.name,
          materialized: file.materializedPath,
          path: file.path,
          provider: file.provider,
          nodeId: contextVars.node.id
        }
      };
    }
    return null;
  }

  /**
   * Start HDF5 Template Dialogs.
   */
  self.createHdf5Template1 = function (context, filepath, item) {
    var dialog = null;
    dialog = self.initCreateHdf5TemplateDialog(_('HDF5テンプレートフォルダ作成'), _('確定'));
    dialog.container.empty();
    const fieldContainer = $('<div></div>');
    var div1 = $('<div></div>').addClass('form-group')
      .append($('<div></div>').append($('<label>/<label>').text('HDF5テンプレート作成フォルダ名を入力してください')))
      .append($('<div></div>').css('margin-left', '20px')
        .append($('<label></label>').text('フォルダ名'))
        .append($('<input type="text"></input>').addClass('form-control'))
      );
    tb1.dropzone.hiddenFileInput.setAttribute('id', 'file-input');
    // tb1.dropzone.hiddenFileInput.removeAttribute('webkitdirectory');   
    tb1.dropzoneItemCache = item1[0];
    tb1.dropzone.hiddenFileInput.setAttribute('accept', 'application/json');

    var div2 = $('<div></div>').addClass('form-group')
      .append($('<div></div>').append($('<label>/<label>').text('HDF5テンプレート作成フォルダ構成ファイルをアップロードしてください')))
      .append($('<div></div>').css('margin-left', '20px')
        .append($('<label></label>').text('フォルダ構成ファイル'))
        .append(
          $('<div></div>')
            .append($('<input></input>').attr('type', 'text').attr('id', 'file-name').addClass('form-control').css('width', '71%').css('float', 'left'))
            .append(
              // $('<a class="btn btn-default btn-sm"></a>').text('ファイル選択')
              $('<label></label>')
                .addClass('btn btn-default btn-sm')
                .attr('for', 'file-input')
                .text('ファイル選択')
                .css('margin-left', '11px')
            )
            // .append($('<input></input>')
            //   .attr('type', 'file')
            //   .attr('id', 'file-input')
            //   .attr('accept', 'application/json')
            //   .css('display', 'none')
            //   )
            .append(tb1.dropzone.hiddenFileInput)
        )
      );
    $(tb1.dropzone.hiddenFileInput).on('change', function () {
      var selectedFile = this.files[0];
      div2.find('input[type="text"][id="file-name"]').val(selectedFile.name);
      $(this).off('change');
      // tb1.dropzone.hiddenFileInput.on('click', function(e){
      //   e.stopPropagation();
      // });
    });
    // tb1.dropzone.hiddenFileInput.click();
    //  div2.find('input[type="file"][id="file-input"]').on('change', function(){
    //   var fileInput = this;
    //   var fileName = fileInput.files[0].name;
    //   div2.find('input[type="text"][id="file-name"]').val(fileName);            
    //   var files = fileInput.files;
    //   if(files.length){
    //     for(var i = 0; i < files.length ; i++){
    //       file = files[i];
    //       tb1.dropzone.addFile(file);
    //     }
    //   }

    //  });

    // div2.find('input[type="file"][id="file-input"]').on('click', function(event){
    //   _uploadEvent.call(tb1, event, item1[0], mode1);
    // });


    dialog.container.append(fieldContainer.append(div1).append(div2));
    dialog.dialog.modal('show');
  };

  self.createHdf5Template2 = function (context, filepath, item) {
    var dialog = null;
    dialog = self.initCreateHdf5TemplateDialog(_('HDF5ファイル作成'), _('作成'));
    dialog.container.empty();

    const fieldContainer = $('<div></div>');
    var div1 = $('<div></div>').addClass('form-group')
      .append($('<div></div>').append($('<label>/<label>').text('HDF5ファイルを作成するHDF5テンプレートフォルダを選択してください')))
      .append($('<div></div>').css('margin-left', '20px')
        .append($('<label></label>').text('HDF5テンプレートフォルダ'))
        .append($('<select></select>').addClass('form-control')
          .append($('<option></option>').text(_('HDFReserve')))
        )
      );

    dialog.container.append(fieldContainer.append(div1));
    dialog.dialog.modal('show');
  };

  self.createHdf5Template3 = function (context, filepath, item) {
    var dialog = null;
    dialog = self.initCreateHdf5TemplateDialog(_('HDF5テンプレートフォルダ定義ファイル作成'), _('定義ファイル作成'));

    dialog.container.empty();

    const fieldContainer = $('<div></div>');
    var div1 = $('<div></div>').addClass('form-group')
      .append($('<div></div>').append($('<label>/<label>').text('定義ファイルを作成するHDF5テンプレートフォルダを選択してください')))
      .append($('<div></div>').css('margin-left', '20px')
        .append($('<label></label>').text('HDF5テンプレートフォルダ'))
        .append($('<select></select>').addClass('form-control')
          .append($('<option></option>').text(_('HDFReserve')))
        )
      );

    dialog.container.append(fieldContainer.append(div1));
    dialog.dialog.modal('show');
  };

  /**
   * ユーザー定義メタデータインポート機能
   * 2023-11-29 R&D KyawWintThu
   */
  self.metadataImport = function (context, filepath, item) {
    var storageTemp = [];  
    for (var i = 0; i < item1.length; i++){
      var currentItem = item1[i]; 
      // プロジェクトストレージ利用対象 
      if(currentItem.parentID == 1){
        var isDuplicate = storageTemp.some(function (existingItem) {            
            return existingItem.data.addonFullname === currentItem.data.addonFullname;
        });
        
        if (!isDuplicate) {
            storageTemp.push(currentItem);              
        }                
      }       
    }

    var treeData = []; //ファイルツリー配列

    // ファイルツリーJSON
    function addNode(parent, text, import_path) {
      if (!parent.nodes) {
        parent.nodes = []; 
      }
      var newNode = {
        text: text,
        import_path: import_path,
      };
  
      parent.nodes.push(newNode); 
      return newNode;
    }

    // ストレージからJSON化してファイルツリーを作る
    for (var i = 0; i < storageTemp.length; i++){
      var currentItem = storageTemp[i];   
      var path = (currentItem.data.hasOwnProperty('materialized') ? currentItem.data.provider + currentItem.data.materialized : currentItem.data.provider + '/');
      var node1 = addNode(treeData, currentItem.data.name, path);
      findItem(storageTemp[i].children, node1);
      function findItem(file, node){
        (file || []).forEach(function (child) {
          var path = (child.data.hasOwnProperty('materialized') ? child.data.provider + child.data.materialized : child.data.provider + '/');
          var node2 = addNode(node, child.data.name, path);
          findItem(child.children, node2);
        });
      }     
    }

    var dialog = null;
    dialog = self.initCreateMetadataImportDialog(_("Metadata Json Import"), _("Confirmation"));
    dialog.container.empty();

    const fieldContainer = $('<div></div>');
    // インポートラジオボタン
    var div1 = $('<div></div>').addClass('form-group')
      .append($('<div></div>')
        .append($('<input></input>').attr('type', 'radio').attr('name', 'metadataImport').attr('value', '0').attr('id', 'clientImport').prop('checked',true))
        .append($('<label>/<label>').attr('for', 'clientImport').text(_('Import from client PC')).css('padding-left', '9px'))
      ).append($('<div></div>').css('margin-top', '10px')
        .append($('<input></input>').attr('type', 'radio').attr('name', 'metadataImport').attr('value', '1').attr('id', 'storageImport'))
        .append($('<label>/<label>').attr('for', 'storageImport').text(_('Import from storage')).css('padding-left', '9px'))
      )     

    var jsonData = {};
    
    // 「クライアントPCからインポートする」ラジオボタンクリックイベント
    div1.find('input[type="file"][id="file-input"]').on('change', function(){
      var selectedFile = this.files[0]; // 選択されたファイル
      div1.find('input[type="text"][id="file-name"]').val(selectedFile.name);
      var reader = new FileReader();  // ファイル読み込み
      reader.onload = function(event) {
        var fileContent = event.target.result; // ファイルの中身を取得する
        try{
          jsonData = JSON.parse(fileContent);   //　Json化する
        }catch(error){
          // Json化ない場合、そのままObjectを返す
          jsonData = {};
        } 
      }
      reader.readAsText(selectedFile);
    });
   
    // インポートファイルテキストボックス + ファイル選択ボタン
    var div2 = $('<div></div>').addClass('form-group')    
      .append($('<div></div>').css('margin', '22px 0px 0px 25px').append($('<label></label>').text(_('Json file to import from')).css('padding', '3px 0px'))
      .append(
        $('<div></div>')
            .append($('<input></input>').attr('type', 'text').attr('id', 'file-name').css('pointer-events','none').addClass('form-control').css('width', '71%').css('float', 'left'))
            .append(            
                $('<label></label>')
                    .addClass('btn btn-default btn-sm')
                    .attr('for', 'file-input')
                    .text(_('File selection'))
                    .css('margin-left', '11px')
            )
            .append($('<input></input>')
                .attr('type', 'file')  
                .attr('accept', 'application/json')              
                .attr('id', 'file-input')
                .css('display', 'none')
            )        
      )
    );

    var btn = div2.find('#file-input');  
    var label = div2.find('label');
    var file_name = div2.find('#file-name');
    var treeView = false;    
    var modal_footer =  dialog.dialog.find('.modal-footer');
    
    var treeview_dialog = null;
    treeview_dialog = self.initCreateMetadataImportTreeViewDialog(_('Select'));
    treeview_dialog.container.empty();

    (!file_name.val().length > 0) ?  modal_footer.find('#confirm').attr('disabled', 'disabled').css('pointer-events','none') : '';
    
    div1.find('input[type="radio"]').on('change', function() {      
      // 0 はクライアントPCからインポートする 
      // 1 はストレージからインポートする
      if($(this).val() === "0"){     
        treeview_dialog.dialog.modal('hide');                               
        label = label.attr('for', 'file-input');
        file_name = file_name.attr('id', 'file-name');
        div2.find('input[type="text"][id="file-name"]').val('');     
        btn = btn.attr('id', 'file-input').attr('type', 'file').attr('accept', 'application/json'); 
        btn.on('change', function(){
          selectFileFromClientPC(this);          
        });  
        treeView = false;
      }else if($(this).val() === "1"){
        label = label.attr('for', 'treeview-file-input');
        file_name = file_name.attr('id', 'treeview-file-name');
        div2.find('input[type="text"][id="treeview-file-name"]').val('');
        btn = btn.attr('id', 'treeview-file-input').attr('type', 'text').removeAttr('accept');   
        treeView = true;   
        btn.on('click', function() {
          if(treeView){
            treeview_dialog.container.find('div').remove();
            treeview_dialog.dialog.find('#selection').attr('disabled', 'disabled').css('pointer-events', 'unset');   
            var div = $('<div></div>').css('margin-left', '21px').append($('<label>/<label>').text(_('Please select the Json file to import')))
            .append($('<div></div>').attr('id', 'treeViewDiv').css('height', '300px').css('overflow', 'auto').append($('<div id="treeView"></div>')));            
            // ファイルツリー表示+イベント
            div.find('#treeView').treeview({
              data: treeData['nodes'],
              levels: 20,
              showTags: true,
              expandIcon: 'fa fa-chevron-right',
              collapseIcon: 'fa fa-chevron-down',
              emptyIcon: 'fa fa-file',
              onNodeSelected: function(event, node){                  
                var parts = node.text.split('.');
                var extension = (parts.length > 1) ? parts.pop().toLowerCase() : '';               
                var selection = treeview_dialog.dialog.find('#selection').removeAttr('disabled').css('pointer-events', 'unset');                  
                if(extension === 'json'){
                  context.wbcache.searchFile(node.import_path, function (file) {
                    var download_link = '';
                    if(file.hasOwnProperty('data')){
                      download_link = file.data.links.download;
                    }else{
                      download_link = file.links.download;
                    }                  
                    fetch(download_link, { credentials: 'include', method : 'GET', mode : 'cors'})
                    .then(function(response) {
                      // console.log('response-->' + response.ok);
                      return response.text();
                    })
                    .then(function(data) {
                      
                      try{
                        jsonData = JSON.parse(data);   //　Json化する
                      }catch(error){
                        // Json化ない場合、そのままObjectを返す
                        jsonData = {};
                      }     
                      })
                    .catch(function(error) {
                      // jsonData = {};
                      alert(error);
                    });
                  });  
                }
                                
                // }else{
                //   //  ファイルツリーからのファイル選択
                //   //　メタデータの有/無の判定  
                //   var createMetadata = (!self.findMetadataByPath(item.data.nodeId, node.import_path))? null : self.findMetadataByPath(item.data.nodeId, node.import_path);
                //   // メタデータがない場合、メタデータを空っぽで作る
                //   if(createMetadata == null){
                //     const tempJsonData = {};
                //     const targetItem = {};                  
                //     const selector = self.createSchemaSelector_mib(targetItem);
                //     self.currentSchemaId = selector.currentSchemaId;
                //     var schema = self.findSchemaById(self.currentSchemaId);
                    
                //     (schema.attributes.schema.pages || []).forEach(function (page) {
                //       (page.questions || []).forEach(function (question) {
                //         if (!question.qid || !question.qid.match(/^grdm-file:.+/)) {
                //           return;
                //         }    
                //         tempJsonData[question.qid] = {
                //           "extra":[],"comments":[],"value": ''
                //         };    	
                //       });
                //     });

                //     createMetadata = {
                //       'folder' : true,
                //       'generated': false, 
                //       'items': [],
                //       'path': '',
                //       'urlpath': ''
                //     }
          
                //     createMetadata.items.push({
                //       'active': true,
                //       'data': Object.assign({}, tempJsonData),
                //       'schema': schema.id,            
                //     });
                //   }

                //   // メタデータをJson化する
                //   var currentMetadata = createMetadata.items[0].data;
                //   for(var grdm in currentMetadata){
                //     if(currentMetadata.hasOwnProperty(grdm)){
                //       jsonData[grdm] = currentMetadata[grdm].value;
                //     }
                //   }                              
                // }   
                selection.on('click', function() {
                  if(extension === 'json'){                                     
                      modal_footer.find('#confirm').removeAttr('disabled').css('pointer-events', 'unset');
                      div2.find('#treeview-file-name').val(node.text);
                  }                                 
                  treeview_dialog.dialog.modal('hide');   
                });   

              }
            });
      
            treeview_dialog.container.append(div);  
            treeview_dialog.dialog.modal('show');
          }         
        });
      }
    });

    btn.on('change', function(){
      selectFileFromClientPC(this);      
    });  

    // 「クライアントPCからインポートする」サブ機能
    function selectFileFromClientPC(element) {
      var selectedFile = element.files[0];
      var fileExtension = selectedFile.name.split('.').pop().toLowerCase();
      if(fileExtension != 'json'){
        return;
      }
      modal_footer.find('#confirm').removeAttr('disabled').css('pointer-events', 'unset');
      div2.find('input[type="text"][id="file-name"]').val(selectedFile.name);
      var reader = new FileReader();
      reader.onload = function(event) {
        var fileContent = event.target.result; // ファイルの中身を取得する
        try{
          jsonData = JSON.parse(fileContent);   //　Json化する
        }catch(error){
          // Json化ない場合、そのままObjectを返す
          jsonData = {};
        }  
      }
      reader.readAsText(selectedFile);
    }

    // 「キャンセル」ボタンクリックイベント
    modal_footer.find('#cancel').on('click', function() {
      dialog.dialog.modal('hide');
      dialog.container.find('div').remove();
    });

    // 「確定」ボタンクリックイベント
    modal_footer.find('#confirm').on('click', function() {
      dialog.dialog.modal('hide');
      dialog.container.find('div').remove();
      const confirm_dialog = $('<div class="modal fade" data-backdrop="static"></div>');            
      var ok = $('<a href="#" class="btn btn-success" data-dismiss="modal" id="ok"></a>').text('OK');  
      ok.on('click', function() { 
        self.closeModal;          
        osfBlock.block();
        const projectMetadata = self.findProjectMetadataByNodeId(nodeId);
        const currentMetadatas = projectMetadata.files.filter(function (f) {
          return f.path === filepath;
        });
        
        // 「プロジェクトポータル、ファイル機能」からのファイル
        // メタデータの有/無の判定   
        var createMetadata = (!self.findMetadataByPath(item.data.nodeId, filepath))? null : self.findMetadataByPath(item.data.nodeId, filepath);
        var tempJsonData = {};
        if(createMetadata == null){               
          const targetItem = {};
          const selector = self.createSchemaSelector_mib(targetItem);
          self.currentSchemaId = selector.currentSchemaId;
          var schema = self.findSchemaById(self.currentSchemaId);          
          (schema.attributes.schema.pages || []).forEach(function (page) {
            (page.questions || []).forEach(function (question) {
              if (!question.qid || !question.qid.match(/^grdm-file:.+/)) {
                return;
              }    
              tempJsonData[question.qid] = '';	
            });
          });

          createMetadata = {
            'folder' : true,
            'generated': false, 
            'items': [],
            'path': '',
            'urlpath': ''
          }

          createMetadata.items.push({
            'active': true,
            'data': Object.assign({}, tempJsonData),
            'schema': schema.id,            
          });        
        }
        createMetadata['path'] = filepath;        
        var importedMetadata = createMetadata.items[0].data;

        // メタデータをJson化する
        for(var grdm in jsonData){
          if(jsonData.hasOwnProperty(grdm) && importedMetadata.hasOwnProperty(grdm)){
            console.log(grdm + ' : ' + JSON.stringify(jsonData[grdm]));
              importedMetadata[grdm] = {
                "extra":[],"comments":[],"value": jsonData[grdm]
              };                    
          }
        }
  
        // メタデータ保存処理 -- start
        // メタデータがない場合は、新規作成 , メタデータがまる場合は、上書きする
        return new Promise(function (resolve, reject) {
          context.wbcache.computeHash(item)
            .then(function (hash) {
              const url = context.baseUrl + 'files/' + filepath;
              $.ajax({
                method: 'PATCH',
                url: url,
                contentType: 'application/json',
                data: JSON.stringify(Object.assign({}, createMetadata, {
                  hash: hash,
                })),
              }).done(function (data) {                
                self.currentItem = null;
                self.editingContext = null;
                self.loadMetadata(context.nodeId, context.baseUrl, function () {
                  resolve();
                  if (!filepath) {
                    return;
                  }
                  self.refreshFileViewButtons(filepath);                                 
                });                           
                setTimeout(function(){
                  osfBlock.unblock();
                  // ユーザー定義メタデータ編集ダイアログ
                  self.editMetadata2(context, filepath, item, 2, null); 
                }, 1000); // 1000 ミリ秒の遅延（１秒）
              }).fail(function (xhr, status, error) {
                osfBlock.unblock();                
                $osf.growl('Error', _('Failed to save metadata.'), 'danger', 5000);
                reject(error);
                Raven.captureMessage('Error while retrieving addon info', {
                  extra: {
                    url: url,
                    status: status,
                    error: error
                  }
                });
              });
            })
            .catch(function (error) {
              reject(error);
              // self.currentItem = null;
            });
        });
        // メタデータ保存処理 -- end
      });
      
      var cancel = $('<a href="#" class="btn btn-default" data-dismiss="modal" id="cancel"></a>').css('margin-left','26px').text(_('Cancel'));  
      cancel.on('click', function(){
        self.metadataImport(context, filepath, item);
      });     
      const container = $('<ul></ul>').css('padding', '0 20px');
      confirm_dialog
        .append($('<div class="modal-dialog modal-lg"></div>').css('top', '36%').css('left', '8%')
          .append($('<div class="modal-content"></div>').css('width', '63%')           
            .append($('<form></form>')
              .append($('<div class="modal-body"></div>')
                .append($('<div class="row"></div>')         
                  .append($('<div class="col-sm-12"></div>')                  
                    .css('overflow-y', 'scroll')
                    .css('padding', '19px')
                    .append($('<div></div>').append($('<label></label>').text(_('If metadata already exits, it will be overwritten. Do you want to proceed?'))))
                    .append($('<div></div>').css('text-align','center').css('margin-top','15px').append(ok).append(cancel)))))
              )));

        
        confirm_dialog.appendTo($('#treeGrid'));
        confirm_dialog.modal('show');       
    });

    dialog.container.append(fieldContainer.append(div1).append(div2));
    dialog.dialog.modal('show');
  }

   /**
   * ユーザー定義メタデータエクスポート機能
   * 2023-11-24 R&D KyawWintThu
   */
  self.metadataExport = function (context, filepath, item) {  
    var storageTemp = [];  
    for (var i = 0; i < item1.length; i++){
      var currentItem = item1[i];                                    
      // プロジェクトストレージ利用対象 
      if(currentItem.parentID == 1){
        var isDuplicate = storageTemp.some(function (existingItem) {            
            return existingItem.data.addonFullname === currentItem.data.addonFullname;
        });
        
        if (!isDuplicate) {
            storageTemp.push(currentItem);              
        }                
      }       
    }

    var treeData = [];  //ファイルツリー配列

    // ファイルツリーJSON
    function addNode(parent, text, exportPath, kind) {
      if (!parent.nodes) {
        parent.nodes = []; 
      }

      var newNode = {
        text: text,
        export_path: exportPath,
        kind: kind,
      };
    
      parent.nodes.push(newNode); 
      return newNode;
    }

    // ストレージからJSON化してファイルツリーを作る
    for (var i = 0; i < storageTemp.length; i++){
      var currentItem = storageTemp[i];   
      var node1 = addNode(treeData, currentItem.data.name, currentItem.data.name, 'folder');
      findItem(storageTemp[i].children, node1);
      function findItem(file, node){
        (file || []).forEach(function (child) {
          // if(child.kind == 'file'){
          //   return;
          // }          
          var folderPathRegex = /^(.*\/)[^/]+\/?$/;
          var materialized = child.data.materialized.match(folderPathRegex);
          var folderPath = (child.kind === 'file') ? materialized[1] : materialized[0];          
          var node2 = addNode(node, child.data.name, folderPath, child.kind);
          findItem(child.children, node2);
        });
      }     
    }
    
    var dialog = null;
    dialog = self.initCreateMetadataImportDialog(_('Metadata Json Export'), _('Confirmation'));
    dialog.container.empty();

    const fieldContainer = $('<div></div>');
    var div1 = $('<div></div>').addClass('form-group')
      .append($('<div></div>')
        .append($('<input></input>').attr('type', 'radio').attr('name', 'metadataExport').attr('value', '0').attr('id', 'clientExport').prop('checked',true))
        .append($('<label>/<label>').attr('for', 'clientExport').text(_('Export to client PC')).css('padding-left', '9px'))
    );

    var div2 = $('<div></div>').addClass('form-group')
    .append($('<div></div>')
      .append($('<input></input>').attr('type', 'radio').attr('name', 'metadataExport').attr('value', '1').attr('id', 'storageExport'))
      .append($('<label>/<label>').attr('for', 'storageExport').text(_('Export to storage')).css('padding-left', '9px'))
    )
    .append($('<div></div>').css('margin-left', '21px').append($('<label>/<label>').attr('for', 'storageExport').text(_('Select the destination folder for the Json file')))
    .append($('<div></div>').attr('id','treeViewParent').css('height', '300px').css('overflow', 'auto').css('border','1px solid #d5d5d5').append($('<div id="treeView"></div>').css('display','none')))     
    );
    
    var export_path = '';    
    var isSelectedFromTreeView = false;
    // ファイルツリー表示+イベント
    div2.find('#treeView').treeview({
      data: treeData['nodes'],
      levels: 20,
      showTags: true,
      expandIcon: 'fa fa-chevron-right',
      collapseIcon: 'fa fa-chevron-down',
      emptyIcon: 'fa fa-file',
      onNodeSelected: function(event, node){  
        export_path = node.export_path;      
        if(node.kind === 'file'){
          isSelectedFromTreeView = false;    
          dialog.dialog.find('.modal-footer').find('#confirm').css('pointer-events', 'none').attr('disabled', 'disabled'); 
        } else{
          isSelectedFromTreeView = true;    
          dialog.dialog.find('.modal-footer').find('#confirm').css('pointer-events', 'unset').removeAttr('disabled'); 
        }          
      }
  });  

    dialog.dialog.find('.modal-footer').find('#cancel').on('click', function() {
      dialog.dialog.modal('hide');
      dialog.container.find('div').remove();
    });   

    dialog.dialog.find('.modal-footer').find('#confirm').on('click', function() {          
      var chk_value = dialog.container.find('input[type="radio"][name="metadataExport"]:checked').val();
     
      var projectName = window.projectName + '_';
      var storageName = '';
      // var folder_name = item.data.name;      
      var full_path = '';

      storageTemp.forEach(function (storage){
        if(storage.data.provider === item.data.provider){
          storageName = storage.data.addonFullname + '_';
        }        
      });      

      if(item.data.hasOwnProperty('materialized')){
        full_path = ((item.data.materialized.replace(/^\/|\/$/g, '')).replace(/\//g, '_')).replace(/(\.[^.]+)$/, '$1') + '_';
      }

      var json_file_name = projectName + storageName + full_path + 'metadata.json';
      
      // 0 はクライアントPCにエクスポートする
      // 1 はストレージにエクスポートする
      if(chk_value === "0"){
        var jsonObject = {};        
        var createMetadata = (!self.findMetadataByPath(item.data.nodeId, filepath))? self.findMetadataByPath(item.data.nodeId, 'osfstorage/') : self.findMetadataByPath(item.data.nodeId, filepath);
        var currentMetadata = createMetadata.items[0].data;
        for(var grdm in currentMetadata){
          if(currentMetadata.hasOwnProperty(grdm)){
            jsonObject[grdm] = currentMetadata[grdm].value;
          }
        }
        // var folder_name = item.data.name;
        // var blob = new Blob([JSON.stringify({'metadata':jsonObject}), '', ''], { type: 'application/json' });      
        var blob = new Blob([JSON.stringify(jsonObject), '', ''], { type: 'application/json' });      
        var blobUrl = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = blobUrl;
        link.download = json_file_name;
        // link.download = 'json_file.json';    

        link.click();
        URL.revokeObjectURL(blobUrl);
       
      }else if(chk_value === "1"){
        var tb =  tb1;
        var jsonObject = {};                
        var createMetadata = self.findMetadataByPath(item.data.nodeId, filepath);
        var currentMetadata = createMetadata.items[0].data;
        for(var grdm in currentMetadata){
          if(currentMetadata.hasOwnProperty(grdm)){
            jsonObject[grdm] = currentMetadata[grdm].value;
          }
        }
        var name = item.data.name;        
        var file = new File([JSON.stringify(jsonObject)], json_file_name, 
          {             
            type: 'application/json'           
          }
        );   

        var foundElement = null;   

        for(var i = 0 ; i < storageTemp.length; i++ ){               
          item =  storageTemp[i];                    
          if(export_path === storageTemp[i].data.name){
            foundElement = storageTemp[i];                
          }

          findFile(storageTemp[i]);
            
          function findFile(file){              
            (file.children || []).forEach(function (child) {                  
              if(export_path == child.data.materialized){
                foundElement = child;
                return;
              }
              findFile(child);
            });
          } 
        }

        foundElement.open = true;
        tb.dropzoneItemCache = foundElement;
        tb.dropzone.addFile(file);
      }
      
      dialog.dialog.modal('hide');
      dialog.container.find('div').remove(); 
    });

    dialog.container.append(fieldContainer.append(div1).append(div2));

    dialog.container.find('input[type="radio"][name="metadataExport"]').on('change', function() {
      var chk_value = $(this).val();      
      var treeViewParent = dialog.container.find('#treeViewParent');
      var treeViewDiv = dialog.container.find('#treeView');            
      var confirmBtn = dialog.dialog.find('.modal-footer').find('#confirm');
      // 0 = クライアントPCにエクスポートする
      // 1 = ストレージにエクスポートする
      if(chk_value == '0'){
        // treeViewDiv.css('pointer-events', 'none');
        treeViewParent.css('border', '1px solid #d5d5d5');
        treeViewDiv.css('display', 'none');        
        confirmBtn.css('pointer-events', 'unset').removeAttr('disabled');
      }else if(chk_value == '1'){
        // treeViewDiv.css('pointer-events', 'unset');
        treeViewParent.css('border', 'none');
        treeViewDiv.css('display', 'block');        
        if(!isSelectedFromTreeView){
          confirmBtn.css('pointer-events', 'none').attr('disabled','disabled');
        }
      }
    });

    dialog.dialog.modal('show');
  }

  /**
   * Start editing metadata.
   */
  self.editMetadata = function (context, filepath, item) {
    var dialog = null;
    console.log('editMetadata ---------- ' + filepath);
    if ((context.projectMetadata || {}).editable) {
      // 2023-08-28 修正 R&D honda -->
      self.editMetadataDialog = self.initEditMetadataDialog(true);
      // if (!self.editMetadataDialog) {
      //   self.editMetadataDialog = self.initEditMetadataDialog(true);
      // }
      // 2023-08-28 修正 R&D honda <--
      dialog = self.editMetadataDialog;
    } else {
      // 2023-08-28 修正 R&D honda -->
      self.viewMetadataDialog = self.initEditMetadataDialog(false);
      // if (!self.viewMetadataDialog) {
      //   self.viewMetadataDialog = self.initEditMetadataDialog(false);
      // }
      // 2023-08-28 修正 R&D honda <--
      dialog = self.viewMetadataDialog;
    }
    console.log(logPrefix, 'edit metadata: ', filepath, item);
    self.currentItem = item;
    const currentMetadata = self.findMetadataByPath(context.nodeId, filepath);
    if (!currentMetadata) {
      self.lastMetadata = {
        path: filepath,
        folder: item.kind === 'folder',
        items: [],
      };
    } else {
      self.lastMetadata = Object.assign({}, currentMetadata);
    }
    self.editingContext = context;
    dialog.toolbar.empty();
    dialog.container.empty();
    dialog.copyStatus.text('');
    const fieldContainer = $('<div></div>');
    const activeItems = (self.lastMetadata.items || []).filter(function (item_) {
      return item_.active;
    });
    const targetItem = activeItems[0] || {};
    const selector = self.createSchemaSelector(targetItem);
    self.currentSchemaId = selector.currentSchemaId;
    selector.schema.change(function (event) {
      if (event.target.value == self.currentSchemaId) {
        return;
      }
      self.currentSchemaId = event.target.value;
      self.prepareFields(
        context,
        fieldContainer,
        self.findSchemaById(self.currentSchemaId),
        filepath,
        item,
        {}
      );
    });
    dialog.toolbar.append(selector.group);
    if ((context.projectMetadata || {}).editable) {
      const pasteButton = $('<button></button>')
        .addClass('btn btn-default')
        .css('margin-right', 0)
        .css('margin-left', 'auto')
        .append($('<i></i>').addClass('fa fa-paste'))
        .append(_('Paste from Clipboard'))
        .attr('type', 'button')
        .on('click', self.pasteFromClipboard);
      dialog.toolbar.append($('<div></div>')
        .css('display', 'flex')
        .append(pasteButton));
    }
    self.prepareFields(
      context,
      fieldContainer,
      self.findSchemaById(self.currentSchemaId),
      filepath,
      item,
      {}
    );
    dialog.container.append(fieldContainer);
    dialog.dialog.modal('show');
  };


  /**
   * Start editing multiple metadata.
   */
  self.editMultipleMetadata = function (context, filepaths, items) {
    if (!self.editMultipleMetadataDialog) {
      self.editMultipleMetadataDialog = self.initEditMultipleMetadataDialog();
    }
    const dialog = self.editMultipleMetadataDialog;
    console.log(logPrefix, 'edit multiple metadata: ', filepaths, items);
    self.currentItem = items;
    self.lastMetadata = {
      path: filepaths,
      items: [],
    };
    self.editingContext = context;

    // toolbar
    const currentMetadatas = filepaths.map(function (filepath) {
      return self.findMetadataByPath(context.nodeId, filepath);
    }).filter(Boolean);
    const targetItems = currentMetadatas.map(function (currentMedatata) {
      return (currentMedatata.items || []).filter(function (item) {
        return item.active;
      })[0] || null;
    });
    const targetItem = targetItems.filter(Boolean)[0] || {};
    const selector = self.createSchemaSelector(targetItem);
    self.currentSchemaId = selector.currentSchemaId;
    selector.schema.change(function (event) {
      if (event.target.value === self.currentSchemaId) {
        return;
      }
      self.currentSchemaId = event.target.value;
      self.prepareFields(
        context,
        fieldContainer,
        self.findSchemaById(self.currentSchemaId),
        filepaths,
        items,
        { multiple: true }
      );
    });
    dialog.toolbar.empty();
    dialog.toolbar.append(selector.group);

    // container
    dialog.container.empty();
    const fieldContainer = $('<div></div>');
    self.prepareFields(
      context,
      fieldContainer,
      self.findSchemaById(self.currentSchemaId),
      filepaths,
      items,
      { multiple: true }
    );
    dialog.container.append(fieldContainer);

    dialog.dialog.modal('show');
  };

  self.editMultipleMetadata_Mibyo = function (context, filepaths, items, pageno, predialog) {
    var dialog = null;

    console.log('editMultipleMetadata_Mibyo ----- 1' + pageno);
    if (predialog) {
      predialog.modal('hide');
    }

    console.log(logPrefix, 'edit multiple metadata: ', filepaths, items);
    self.currentItem = items;
    //202308091457戻してみる
    // const currentMetadata = self.findMetadataByPath(context.nodeId, filepaths);
    // if (!currentMetadata) {
    //   self.lastMetadata = {
    //     path: filepaths,
    //     folder: items.kind === 'folder',
    //     items: [],
    //   };
    // } else {
    //   self.lastMetadata = Object.assign({}, currentMetadata);
    // }    
    self.lastMetadata = {
      path: filepaths,
      items: [],
    };

    self.editingContext = context;

    //2005↓に移動
    // //titleMib = getLocalizedText(titleMib, true);
    // self.editMetadataDialog = self.initEditMultipleMetadataDialog_Mibyo(true, context, filepaths, items, pageno);
    // dialog = self.editMetadataDialog;
    //1928コメント
    // if (!self.editMultipleMetadataDialog) {
    //   self.editMultipleMetadataDialog = self.initEditMultipleMetadataDialog_Mibyo(true, context, filepaths, items, pageno);
    // }
    // const dialog = self.editMultipleMetadataDialog;

    //1941コメント　↑に移動
    // console.log(logPrefix, 'edit multiple metadata: ', filepaths, items);
    // self.currentItem = items;
    // self.lastMetadata = {
    //   path: filepaths,
    //   items: [],
    // };
    //
    // self.editingContext = context;

    console.log('editMultipleMetadata_Mibyo ----- 2' + pageno);

    // toolbar
    const currentMetadatas = filepaths.map(function (filepath) {
      return self.findMetadataByPath(context.nodeId, filepath);
    }).filter(Boolean);
    const targetItems = currentMetadatas.map(function (currentMedatata) {
      return (currentMedatata.items || []).filter(function (item) {
        return item.active;
      })[0] || null;
      // return (currentMedatata.items || []).filter(function(item) {
      //   return item.active;
      // })[0] || null;      
    });
    const targetItem = targetItems.filter(Boolean)[0] || {};

    console.log('editMultipleMetadata_Mibyo ----- 3' + pageno);

    const selector = self.createSchemaSelector_mib(targetItem);
    //1946 ↑に修正
    //const selector = self.createSchemaSelector(targetItem);
    self.currentSchemaId = selector.currentSchemaId;
    selector.schema.change(function (event) {
      if (event.target.value === self.currentSchemaId) {
        return;
      }
      self.currentSchemaId = event.target.value;
      console.log(logPrefix, 'mib_event.target.value: ', self.currentSchemaId);
      self.prepareFields2(
        context,
        fieldContainer,
        self.findSchemaById(self.currentSchemaId),
        filepaths,
        items,
        { multiple: true },
        pageno
      );
      //1950 ↑に修正
      // self.prepareFields(
      //   context,
      //   fieldContainer,
      //   self.findSchemaById(self.currentSchemaId),
      //   filepaths,
      //   items,
      //   {multiple: true}
      // );
    });

    console.log('editMultipleMetadata_Mibyo ----- 4' + pageno);

    var schema = self.findSchemaById(self.currentSchemaId);
    var nextbtnFlg = false;
    var returnbtnFlg = false;
    var repossessionbtnFlg = false;
    var nextpage = pageno;
    var prepage = pageno;
    var titleMib = '';
    var maxpage = pageno;
    var strPageno = 'page' + pageno;

    (schema.attributes.schema.pages || []).forEach(function (page) {
      //不正なページ番号チェック
      if (page.id) {
        var tmpPgid = Number(page.id.replace('page', ''))
        if (Number(maxpage) < tmpPgid) {
          console.log('z=================================' + maxpage);
          console.log('z=================================' + page.id.replace('page', ''));
          maxpage = page.id.replace('page', '');
        }
      }
      if (!page.id || !(page.id == strPageno)) {
        return;
      }
      nextbtnFlg = page.nextbtn;
      returnbtnFlg = page.returnbtn;
      repossessionbtnFlg = page.repossessionbtn;
      nextpage = page.nextpage;
      prepage = page.prepage;
      titleMib = page.title;

    });
    //<-- 1954

    console.log('editMultipleMetadata_Mibyo ----- 5' + pageno);

    //不正なページ番号チェック
    if (!nextpage) {
      nextpage = pageno;
    }
    if (!prepage) {
      prepage = pageno;
    }
    if (maxpage < nextpage) {
      nextpage = pageno;
    }
    if (maxpage < prepage) {
      prepage = pageno;
    }
    console.log('nextpage=================================' + nextpage);
    console.log('prepage==================================' + prepage);

    //保持したメタデータから画面メタデータに戻す
    metadata_return();

    console.log('editMultipleMetadata_Mibyo ----- 6' + pageno);

    //2005 ↑から移動
    titleMib = getLocalizedText(titleMib, true, true);
    console.log(logPrefix, 'mib_titleMib: ', titleMib);
    self.editMetadataDialog = self.initEditMultipleMetadataDialog_Mibyo(true, context, filepaths, items, pageno, nextbtnFlg, returnbtnFlg, repossessionbtnFlg, nextpage, prepage, titleMib);
    dialog = self.editMetadataDialog;

    console.log('editMultipleMetadata_Mibyo ----- 7' + pageno);

    dialog.toolbar.empty();
    dialog.toolbar.append(selector.group);

    // container
    dialog.container.empty();
    const fieldContainer = $('<div></div>');
    self.prepareFields2(
      context,
      fieldContainer,
      self.findSchemaById(self.currentSchemaId),
      filepaths,
      items,
      { multiple: true },
      pageno
    );
    //2139 ↑に修正
    // self.prepareFields(
    //   context,
    //   fieldContainer,
    //   self.findSchemaById(self.currentSchemaId),
    //   filepaths,
    //   items,
    //   {multiple: true}
    // );
    dialog.container.append(fieldContainer);
    dialog.dialog.modal('show');

    console.log('editMultipleMetadata_Mibyo ----- end' + pageno);

  };

  /**
   * Convert the field data to JSON and copy it to the clipboard.
   */
  self.copyToClipboard = function (event, copyStatus) {
    event.preventDefault();
    console.log(logPrefix, 'copy to clipboard');
    copyStatus.text('');
    if (!navigator.clipboard) {
      Raven.captureMessage(_('Could not copy text'), {
        extra: {
          error: 'navigator.clipboard API is not supported.',
        },
      });
    }
    var jsonObject = {};
    (self.lastFields || []).forEach(function (fieldSet) {
      jsonObject[fieldSet.question.qid] = fieldSet.field.getValue(fieldSet.input);
    });
    const text = JSON.stringify(jsonObject);
    navigator.clipboard.writeText(text).then(function () {
      copyStatus.text(_('Copied!'));
    }, function (err) {
      Raven.captureMessage(_('Could not copy text'), {
        extra: {
          error: err.toString(),
        },
      });
    });
  };

  self.copyToClipboard_mibyo = function (event, copyStatus) {
    event.preventDefault();
    console.log(logPrefix, 'copy to clipboard mibyo');
    copyStatus.text('');
    if (!navigator.clipboard) {
      Raven.captureMessage(_('Could not copy text'), {
        extra: {
          error: 'navigator.clipboard API is not supported.',
        },
      });
    }

    var getCircularReplacer = function() {
      var seen = new WeakSet();
      return function(key, value) {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
            return;
          }
          seen.add(value);
        }
        return value;
      };
    };
    // const getCircularReplacer = () => {
    //   const seen = new WeakSet();
    //   return (key, value) => {
    //     if (typeof value === "object" && value !== null) {
    //       if (seen.has(value)) {
    //         return;
    //       }
    //       seen.add(value);
    //     }
    //     return value;
    //   };
    // };

    var jsonObject = {};
    (self.lastMetadata_hold || []).forEach(function (fieldSet) {
      //20230803 add honda lastMetadataのデータをlastmetada_holdにセットする
      (self.lastFields || []).forEach(function (fieldSet2) {
        if (fieldSet.question.qid == fieldSet2.question.qid) {
          fieldSet.input = fieldSet2.input;
          //console.log('copyToClipboard_mibyo----->>>'+fieldSet.question.qid+'++++++++++'+JSON.stringify(fieldSet.input));
        }
        //   jsonObject[fieldSet.question.qid] = fieldSet.field.getValue(fieldSet.input);
      });
      console.log('copyToClipboard_mibyo=====fieldset.field=====>>>'+JSON.stringify(fieldSet.field));
      console.log('copyToClipboard_mibyo=====fieldset.input=====>>>'+JSON.stringify(fieldSet.input, getCircularReplacer()));
      jsonObject[fieldSet.question.qid] = fieldSet.field.getValue(fieldSet.input);
    });
    const text = JSON.stringify(jsonObject);
    console.log('copyToClipboard_mibyo=====>>>'+text);
    // (self.lastFields || []).forEach(function(fieldSet) {
    //   jsonObject[fieldSet.question.qid] = fieldSet.field.getValue(fieldSet.input);
    // });
    //const text = JSON.stringify(jsonObject);
    navigator.clipboard.writeText(text).then(function () {
      copyStatus.text(_('Copied!'));
    }, function (err) {
      Raven.captureMessage(_('Could not copy text'), {
        extra: {
          error: err.toString(),
        },
      });
    });
  };

  /**
   * Paste a string from the clipboard and set it in the field.
   */
  self.pasteFromClipboard = function (event) {
    event.preventDefault();
    console.log(logPrefix, 'paste from clipboard');

    if (!navigator.clipboard || !navigator.clipboard.readText) {
      if (!self.pasteMetadataDialog) {
        self.pasteMetadataDialog = self.initPasteMetadataDialog();
      }
      self.pasteMetadataDialog.modal('show');
      return;
    }
    navigator.clipboard.readText().then(function (text) {
      self.setMetadataFromJson(text);
    }, function (err) {
      Raven.captureMessage(_('Could not paste text'), {
        extra: {
          error: err.toString(),
        },
      });
    });
  };

  self.pasteFromClipboard_mibyo = function (event) {
    event.preventDefault();
    console.log(logPrefix, 'paste from clipboard');

    if (!navigator.clipboard || !navigator.clipboard.readText) {
      console.log(logPrefix, 'pasteFromClipboard_mibyo-----1');
      if (!self.pasteMetadataDialog) {
        console.log(logPrefix, 'pasteFromClipboard_mibyo-----2');
        self.pasteMetadataDialog = self.initPasteMetadataDialog_mibyo();
      }
      console.log(logPrefix, 'pasteFromClipboard_mibyo-----3');
      self.pasteMetadataDialog.modal('show');
      return;
    }
    navigator.clipboard.readText().then(function (text) {
      console.log(logPrefix, 'pasteFromClipboard_mibyo-----4' + text);
      self.setMetadataFromJson_mibyo(text);
      //metadata_return();
    }, function (err) {
      Raven.captureMessage(_('Could not paste text'), {
        extra: {
          error: err.toString(),
        },
      });
    });
  };

  self.setMetadataFromJson = function (jsonText) {
    console.log(logPrefix, 'setMetadataFromJson-----1');
    try {
      const jsonObject = JSON.parse(jsonText);
      (self.lastFields || []).forEach(function (fieldSet) {
        console.log(logPrefix, 'setMetadataFromJson-----' + fieldSet.question.qid);
        fieldSet.field.setValue(fieldSet.input, jsonObject[fieldSet.question.qid] || '');
      });
    } catch (err) {
      console.log(logPrefix, 'setMetadataFromJson----err-' + err);
      Raven.captureMessage(_('Could not paste text'), {
        extra: {
          error: err.toString(),
        },
      });
    }
  }

  self.setMetadataFromJson_mibyo = function (jsonText) {
    console.log(logPrefix, 'setMetadataFromJson_mibyo-----1');
    try {
      const jsonObject = JSON.parse(jsonText);
      //全体
      (self.lastMetadata_hold || []).forEach(function (fieldSet) {
        console.log(logPrefix, 'setMetadataFromJson_mibyo-----' + fieldSet.question.qid + '=====' + fieldSet.input);
        fieldSet.field.setValue(fieldSet.input, jsonObject[fieldSet.question.qid] || '');
      });
      //表示中画面
      (self.lastFields || []).forEach(function (fieldSet) {
        console.log(logPrefix, 'setMetadataFromJson-----' + fieldSet.question.qid);
        fieldSet.field.setValue(fieldSet.input, jsonObject[fieldSet.question.qid] || '');
      });
    } catch (err) {
      console.log(logPrefix, 'setMetadataFromJson_mibyo----err-' + err);
      Raven.captureMessage(_('Could not paste text'), {
        extra: {
          error: err.toString(),
        },
      });
    }
  }

  self.registerMetadata = function (context, filepath, item) {
    self.registeringFilepath = filepath;
    self.registeringContext = context;
    const currentMetadata = self.findMetadataByPath(context.nodeId, filepath);
    if (!currentMetadata) {
      return;
    }
    if ((currentMetadata.items || []).length === 0) {
      return;
    }
    self.openDraftModal(currentMetadata);
  }

  self.registerMetadata2 = function (context, filepath, item) {
    self.registeringFilepath = filepath;
    self.registeringContext = context;
    const currentMetadata = self.findMetadataByPath(context.nodeId, filepath);
    if (!currentMetadata) {
      return;
    }
    if ((currentMetadata.items || []).length === 0) {
      return;
    }
    self.openDraftModal2(currentMetadata);
  }

  self.deleteMetadata = function (context, filepath, item) {
    if (!self.deleteConfirmationDialog) {
      self.deleteConfirmationDialog = self.initConfirmDeleteDialog();
    }
    self.deleteConfirmingFilepath = filepath;
    self.deleteConfirmingContext = context;
    self.deleteConfirmationDialog.modal('show');
  }

  /**
   * Resolve missing metadata
   */
  self.resolveMetadataConsistency = function (context, metadata) {
    if (!self.resolveConsistencyDialog) {
      self.resolveConsistencyDialog = self.createResolveConsistencyDialog();
    }
    self.currentContext = context;
    self.currentMetadata = metadata;
    const container = self.resolveConsistencyDialog.container;
    self.resolveConsistencyDialog.copyStatus.text('');
    const activeItems = (metadata.items || []).filter(function (item_) {
      return item_.active;
    });
    const targetItem = activeItems[0] || metadata.items[0];
    const selector = self.createSchemaSelector(targetItem);
    self.currentSchemaId = selector.currentSchemaId;
    const reviewFields = $('<div></div>')
      .css('overflow-y', 'scroll')
      .css('height', '40vh');
    const draftSelection = $('<div></div>').text(_('Loading...'));
    selector.schema.change(function (event) {
      self.currentSchemaId = event.target.value;
      self.prepareReviewFields(
        reviewFields,
        draftSelection,
        self.findSchemaById(self.currentSchemaId),
        targetItem
      );
    });
    container.empty();
    const message = $('<div></div>');
    message.text(_('Select the destination of the file metadata.'));
    container.append(message);
    const targetContainer = $('<div></div>').text(_('Loading...'));
    container.append(targetContainer);
    const metadataMessage = $('<div></div>');
    metadataMessage.text(_('Current Metadata:')).css('margin-top', '1em');
    container.append(metadataMessage);
    container.append(selector.group);
    container.append(reviewFields);
    self.prepareReviewFields(
      reviewFields,
      draftSelection,
      self.findSchemaById(self.currentSchemaId),
      targetItem
    );
    context.wbcache.listFiles(null, true)
      .then(function (files) {
        const tasks = files.map(function (file) {
          const item = file.item;
          return context.wbcache.computeHash({
            data: Object.assign({}, item.attributes, {
              links: item.links,
            }),
            kind: item.attributes.kind
          });
        });
        self.targetFiles = files;
        Promise.all(tasks)
          .then(function (hashes) {
            targetContainer.empty();
            var items = 0;
            files.forEach(function (file, fileIndex) {
              const hash = hashes[fileIndex];
              const kind = metadata.folder ? 'folder' : 'file';
              if (kind !== file.item.attributes.kind) {
                return;
              }
              if (metadata.hash !== hash) {
                return;
              }
              targetContainer.append($('<div></div>')
                .append($('<input></input>')
                  .attr('type', 'radio')
                  .attr('id', 'metadata-target-' + fileIndex)
                  .attr('name', 'metadata-target')
                  .attr('checked', items === 0)
                  .attr('value', file.path))
                .append($('<label></label>')
                  .attr('for', 'metadata-target-' + file.path)
                  .text(file.path)));
              items++;
            })
            targetContainer.append($('<div></div>')
              .append($('<input></input>')
                .attr('type', 'radio')
                .attr('id', 'metadata-target-none')
                .attr('name', 'metadata-target')
                .attr('checked', items === 0)
                .attr('value', ''))
              .append($('<label></label>')
                .attr('for', 'metadata-target-none')
                .text(_('Delete metadata'))));
          })
          .catch(function (err) {
            Raven.captureMessage(_('Could not list hashes'), {
              extra: {
                error: err.toString()
              }
            });
          });
      })
      .catch(function (err) {
        Raven.captureMessage(_('Could not list files'), {
          extra: {
            error: err.toString()
          }
        });
      });
    self.resolveConsistencyDialog.dialog.modal('show');
  }

  self.resolveConsistency = function (path) {
    const newMetadata = Object.assign({}, self.currentMetadata, {
      path: path
    });
    const url = self.currentContext.baseUrl + 'files/' + newMetadata.path;
    return new Promise(function (resolve, reject) {
      $.ajax({
        method: 'PATCH',
        url: url,
        contentType: 'application/json',
        data: JSON.stringify(newMetadata)
      }).done(function (data) {
        console.log(logPrefix, 'saved: ', data);
        return $.ajax({
          url: self.currentContext.baseUrl + 'files/' + self.currentMetadata.path,
          type: 'DELETE',
          dataType: 'json'
        }).done(function (data) {
          resolve();
          console.log(logPrefix, 'deleted: ', data);
          window.location.reload();
        }).fail(function (xhr, status, error) {
          reject(error)
          Raven.captureMessage('Error while retrieving addon info', {
            extra: {
              url: url,
              status: status,
              error: error
            }
          });
        });
      }).fail(function (xhr, status, error) {
        reject(error);
        Raven.captureMessage('Error while retrieving addon info', {
          extra: {
            url: url,
            status: status,
            error: error
          }
        });
      });
    });
  }

  self.deleteConfirmedModal = function () {
    const filepath = self.deleteConfirmingFilepath;
    const context = self.deleteConfirmingContext;
    self.deleteConfirmingFilepath = null;
    self.deleteConfirmingContext = null;
    console.log(logPrefix, 'delete metadata: ', filepath, context.nodeId);
    const url = context.baseUrl + 'files/' + filepath;
    return new Promise(function (resolve, reject) {
      $.ajax({
        url: url,
        type: 'DELETE',
        dataType: 'json'
      }).done(function (data) {
        console.log(logPrefix, 'deleted: ', data, context.nodeId);
        self.loadMetadata(context.nodeId, context.baseUrl, function () {
          resolve();
          if (!self.fileViewPath) {
            return;
          }
          self.refreshFileViewButtons(self.fileViewPath);
        });
      }).fail(function (xhr, status, error) {
        reject(error);
        Raven.captureMessage('Error while retrieving addon info', {
          extra: {
            url: url,
            status: status,
            error: error
          }
        });
      });
    });
  };

  self.extractProjectName = function (metadata) {
    if (!metadata) {
      return _('No name');
    }
    const projectNameJa = metadata['project-name-ja'];
    const projectNameEn = metadata['project-name-en'];
    const projectNameJaValue = projectNameJa ? (projectNameJa.value || null) : null;
    const projectNameEnValue = projectNameEn ? (projectNameEn.value || null) : null;
    if (!projectNameJaValue && !projectNameEnValue) {
      return _('No name');
    }
    if (rdmGettext.getBrowserLang() === 'ja') {
      return projectNameJaValue || projectNameEnValue;
    }
    return projectNameEnValue || projectNameJaValue;
  };

  self.includePathInDraftRegistration = function (context, path, registration) {
    if (!registration.attributes) {
      return false;
    }
    if (!registration.attributes.registration_metadata) {
      return false;
    }
    const files = registration.attributes.registration_metadata['grdm-files'];
    if (!files) {
      return false;
    }
    if (!files.value) {
      return false;
    }
    const fileEntries = JSON.parse(files.value);
    const draftPath = context.nodeId === contextVars.node.id ? path : context.nodeId + '/' + path;
    return fileEntries.filter(function (file) {
      return file.path === draftPath;
    }).length > 0;
  };

  self.createDraftsSelect = function (schema, disabled) {
    const registrations = $('<ul></ul>').css('list-style-type', 'none');
    var empty = true;
    console.log("createDraftsSelect-----start");
    (self.draftRegistrations.registrations || []).forEach(function (r) {
      const registration_schema = r.relationships.registration_schema;
      if (!registration_schema || registration_schema.data.id !== schema.id) {
        return;
      }
      console.log("extractProjectName-----start");
      const projectName = self.extractProjectName(r.attributes.registration_metadata);
      console.log("extractProjectName-----end");
      const text = $('<label></label>')
        .css('margin-right', '0.5em')
        .attr('for', 'draft-' + r.id)
        .text(projectName);
      if (disabled) {
        text.css('color', '#888');
      }
      console.log("includePathInDraftRegistration-----end");
      registrations.append($('<li></li>')
        .append($('<input></input>')
          .css('margin-right', '0.5em')
          .attr('type', 'checkbox')
          .attr('id', 'draft-' + r.id)
          .attr('name', 'draft-' + r.id)
          .attr('disabled', disabled)
          .attr('checked', self.includePathInDraftRegistration(self.registeringContext, self.registeringFilepath, r)))
        .append(text)
        .append($('<span></span>')
          .attr('id', 'draft-' + r.id + '-link')));
      console.log("includePathInDraftRegistration-----start");

      empty = false;
    });
    if (empty) {
      registrations.append($('<li></li>')
        .append($('<span></span>').text(_('There is no draft project metadata compliant with the schema. Create new draft project metadata from the Metadata tab:')))
        .append($('<a></a>')
          .text(_('Open'))
          .attr('href', contextVars.node.urls.web + 'metadata'))
      );
    }
    console.log("createDraftsSelect-----end");
    return registrations;
  }

  self.getFileMetadataPageURL = function (draftId) {
    const registrations = (self.draftRegistrations.registrations || []).filter(function (r) {
      return r.id == draftId;
    });
    if (registrations.length == 0) {
      console.error('No registrations', draftId);
      return null;
    }
    const registration = registrations[0];
    const schemaId = (((registration.relationships || {}).registration_schema || {}).data || {}).id;
    if (!schemaId) {
      console.error('No schemas for registration', draftId);
      return null;
    }
    const schema = self.findSchemaById(schemaId);
    if (!schema) {
      console.error('No schemas', schemaId);
      return null;
    }
    const pages = ((schema.attributes || {}).schema || {}).pages || [];
    const filePages = pages
      .map(function (page, pageIndex) {
        return {
          name: '' + (pageIndex + 1) + '-' + page.title,
          page: page
        };
      })
      .filter(function (page) {
        return (page.page.questions || []).filter(function (q) {
          return q.qid == 'grdm-files';
        }).length > 0;
      });
    if (filePages.length == 0) {
      console.error('No pages have grdm-files');
      return null;
    }
    const pageName = filePages[0].name;
    return '/registries/drafts/' + draftId + '/' + encodeURIComponent(pageName) + '?view_only=';
  };

  self.prepareReviewFields = function (container, draftSelectionContainer, schema, metadataItem) {
    console.log('prepareReviewFields----------start');
    const fields = self.createFields(
      schema.attributes.schema,
      metadataItem,
      {
        readonly: true,
      }
    );
    console.log('prepareReviewFields----------1');
    container.empty();
    var errors = 0;
    self.lastFields = [];
    const fieldSetsAndValues = [];
    console.log('prepareReviewFields----------2');
    fields.forEach(function (fieldSet) {
      console.log('prepareReviewFields----forEach------' + fieldSet.question.qid);
      const errorContainer = $('<div></div>')
        .css('color', 'red').hide();
      console.log('prepareReviewFields----forEach------1');
      const input = fieldSet.field.addElementTo(container, errorContainer);
      console.log('prepareReviewFields----forEach------2');
      const value = fieldSet.field.getValue(input);
      fieldSetsAndValues.push({
        fieldSet: {
          field: fieldSet.field,
          question: fieldSet.question,
          input: input,
          lastError: null,
          errorContainer: errorContainer
        },
        value: value
      });
      console.log('prepareReviewFields----forEach------end');
    });
    console.log('prepareReviewFields----------3');
    fieldSetsAndValues.forEach(function (fieldSetAndValue) {
      const fieldSet = fieldSetAndValue.fieldSet;
      const value = fieldSetAndValue.value;
      var error = null;
      try {
        metadataFields.validateField(
          self.erad,
          fieldSet.question,
          value,
          fieldSetsAndValues
        );
      } catch (e) {
        error = e.message;
      }
      if (error) {
        fieldSet.errorContainer.text(error).show()
        errors++;
      } else {
        fieldSet.errorContainer.hide().text('')
      }
      self.lastFields.push(fieldSet);
    });
    console.log('prepareReviewFields----------4');
    const message = $('<div></div>');
    if (errors) {
      message.text(_('There are errors in some fields.')).css('color', 'red');
    }
    if (self.selectDraftDialog) {
      self.selectDraftDialog.select.attr('disabled', errors > 0);
    }
    console.log('prepareReviewFields----------5');
    draftSelectionContainer.empty();
    draftSelectionContainer.append(message);
    draftSelectionContainer.append(self.createDraftsSelect(schema, errors > 0).css('margin', '1em 0'));
    console.log('prepareReviewFields----------end');
  };

  self.openDraftModal = function (currentMetadata) {
    if (!self.selectDraftDialog) {
      self.selectDraftDialog = self.initSelectDraftDialog();
    }
    const activeItems = (currentMetadata.items || []).filter(function (item_) {
      return item_.active;
    });
    const targetItem = activeItems[0] || currentMetadata.items[0];
    const selector = self.createSchemaSelector(targetItem);
    self.currentSchemaId = selector.currentSchemaId;
    const reviewFields = $('<div></div>')
      .css('overflow-y', 'scroll')
      .css('height', '40vh');
    const draftSelection = $('<div></div>').text(_('Loading...'));
    selector.schema.change(function (event) {
      self.currentSchemaId = event.target.value;
      self.prepareReviewFields(
        reviewFields,
        draftSelection,
        self.findSchemaById(self.currentSchemaId),
        targetItem
      );
    });
    self.selectDraftDialog.select
      .text(_('Select'))
      .attr('disabled', true)
      .attr('data-dismiss', false);
    const message = $('<div></div>');
    message.text(_('Select the destination for the file metadata.'));
    self.selectDraftDialog.container.empty();
    self.selectDraftDialog.container.append(selector.group);
    self.selectDraftDialog.container.append(message);
    self.selectDraftDialog.container.append(draftSelection);
    self.selectDraftDialog.container.append(reviewFields);
    self.selectDraftDialog.dialog.modal('show');
    self.draftRegistrations.load(function () {
      self.prepareReviewFields(
        reviewFields,
        draftSelection,
        self.findSchemaById(self.currentSchemaId),
        targetItem
      );
    });
  };

  self.updateRegistrationAsync = function (context, checked, filepath, draftId, link) {
    return new Promise(function (resolve, perror) {
      console.log(logPrefix, 'register metadata: ', filepath, draftId);
      var url = self.baseUrl + 'draft_registrations/' + draftId + '/files/' + context.nodeId + '/' + filepath;
      link.text(checked ? _('Registering...') : _('Deleting...'));
      osfBlock.block();
      return $.ajax({
        url: url,
        type: checked ? 'PUT' : 'DELETE',
        dataType: 'json'
      }).done(function (data) {
        osfBlock.unblock();
        link.empty();
        link.append($('<a></a>')
          .text(_('Open'))
          .attr('href', self.getFileMetadataPageURL(draftId)));
        resolve(data);
      }).fail(function (xhr, status, error) {
        osfBlock.unblock();
        perror(url, xhr, status, error);
      });
    });
  }

  self.selectDraftModal = function () {
    const filepath = self.registeringFilepath;
    const context = self.registeringContext;
    if (!filepath) {
      return;
    }
    self.registeringFilepath = null;
    self.registeringContext = null;
    const ops = [];
    (self.draftRegistrations.registrations || []).forEach(function (r) {
      const checkbox = self.selectDraftDialog.container.find('#draft-' + r.id);
      const checked = checkbox.is(':checked');
      const oldChecked = self.includePathInDraftRegistration(context, filepath, r);
      if (checked == oldChecked) {
        return;
      }
      const link = self.selectDraftDialog.container.find('#draft-' + r.id + '-link');
      ops.push(self.updateRegistrationAsync(context, checked, filepath, r.id, link));
    });
    Promise.all(ops)
      .then(function (data) {
        console.log(logPrefix, 'updated: ', data);
        self.selectDraftDialog.select
          .text(_('Close'))
          .attr('data-dismiss', 'modal');
        self.draftRegistrations.load();
      })
      .catch(function (url, xhr, status, error) {
        Raven.captureMessage('Error while retrieving addon info', {
          extra: {
            url: url,
            status: status,
            error: error
          }
        });
      });
  };

  self.createFangornButtons = function (filepath, item) {
    return self.createButtonsBase(
      filepath,
      item,
      function (options, label) {
        return m.component(Fangorn.Components.button, options, label);
      }
    );
  }

  self.createButtonsBase = function (filepath, item, createButton) {
    const context = self.findContextByNodeId(item ? item.data.nodeId : contextVars.node.id);
    if (!context) {
      console.warn('Metadata not loaded for project:', item ? item.data.nodeId : null);
      const loadingButton = self.createLoadingButton(createButton);
      return [loadingButton];
    }
    if (!context.addonAttached) {
      return [];
    }
    const projectMetadata = context.projectMetadata;
    const currentMetadatas = projectMetadata.files.filter(function (f) {
      return f.path === filepath;
    });
    const currentMetadata = currentMetadatas[0] || null;
    if (!projectMetadata.editable) {
      // readonly
      const filepath = item.data.provider + (item.data.materialized || '/');
      const metadata = self.findMetadataByPath(context.nodeId, filepath);
      if (!metadata) {
        return [];
      }
      const viewButton = createButton({
        onclick: function (event) {
          self.editMetadata(context, filepath, item);
        },
        icon: 'fa fa-edit',
        className: 'text-primary'
      }, _('View Metadata'));
      return [viewButton];
    }
    const buttons = [];

    // const hdf5TemplateFolderCreateButton = createButton({
    //   onclick: function(event) {
    //     // console.log(tb1);


    //     self.createHdf5Template1(context, filepath, item);
    //     // _uploadEvent.call(tb1, event, item1[0], mode1);
    //   },
    //   icon: 'fa fa-plus',
    //   className : 'text-primary'
    // }, 'HDF5テンプレートフォルダ作成');
    // buttons.push(hdf5TemplateFolderCreateButton);

    // const hdf5FileCreateButton = createButton({
    //   onclick: function(event) {
    //     self.createHdf5Template2(context, filepath, item);
    //   },
    //   icon: 'fa fa-plus',
    //   className : 'text-primary'
    // }, 'HDF5ファイル作成');
    // buttons.push(hdf5FileCreateButton);

    // const hdf5TemplateFolderDefinitionFileCreationButton = createButton({
    //   onclick: function(event) {
    //     self.createHdf5Template3(context, filepath, item);
    //   },
    //   icon: 'fa fa-plus',
    //   className : 'text-primary'
    // }, 'HDF5テンプレートフォルダ定義ファイル作成');
    // buttons.push(hdf5TemplateFolderDefinitionFileCreationButton);

    const editButton = createButton({
      onclick: function (event) {
        self.editMetadata(context, filepath, item);
      },
      icon: 'fa fa-edit',
      className: 'text-primary'
    }, _('Edit Metadata'));
    buttons.push(editButton);

    //20230807 ボタン追加テスト -->
    const editButton2 = createButton({
      onclick: function (event) {
        self.lastMetadata_hold = null;        
        self.editMetadata2(context, filepath, item, 2, null);
      },
      icon: 'fa fa-edit',
      className: 'text-primary'
    }, _('Edit UserDefinedMetaData'));
    buttons.push(editButton2)
    //20230807 ボタン追加テスト <--

    const metadataImportButton = createButton({
      onclick: function (event) {
        self.metadataImport(context, filepath, item);
      },
      icon: 'fa fa-edit',
      className: 'text-primary'
    }, _('User-defined metadata import'));
    buttons.push(metadataImportButton)

    // var isMetadata = (!self.findMetadataByPath(item.data.nodeId, filepath))? false : true;
    if(self.findMetadataByPath(item.data.nodeId, filepath)){
      const metadataExportButton = createButton({
        onclick: function (event) {
          self.metadataExport(context, filepath, item);
        },
        icon: 'fa fa-edit',
        className: 'text-primary'
      }, _('User-defined metadata export'));
      buttons.push(metadataExportButton)
    }

    if (currentMetadata) {
      const registerButton = createButton({
        onclick: function (event) {
          self.registerMetadata(context, filepath, item);
        },
        icon: 'fa fa-external-link',
        className: 'text-success'
      }, _('Register Metadata'));
      buttons.push(registerButton)

      //20230516 ボタン追加テスト -->
      // const editButton2 = createButton({
      //   onclick: function(event) {
      //     self.editMetadata2(context, filepath, item, 2, null);
      //   },
      //   icon: 'fa fa-edit',
      //   className : 'text-primary'
      // }, _('Edit MetadataMIB'));      
      // buttons.push(editButton2)

      const registerButton2 = createButton({
        onclick: function (event) {
          self.registerMetadata2(context, filepath, item);
        },
        icon: 'fa fa-edit',
        className: 'text-success'
      }, _('Register UserDefinedMetaData'));
      buttons.push(registerButton2)
      //20230516 ボタン追加テスト <--
      const deleteButton = createButton({
        onclick: function (event) {
          self.deleteMetadata(context, filepath, item);
        },
        icon: 'fa fa-trash',
        className: 'text-danger'
      }, _('Delete Metadata'));
      buttons.push(deleteButton)   
    }
    return buttons;
  }

  self.createFangornMultipleItemsButtons = function (filepaths, items) {
    return self.createMultipleItemsButtonsBase(
      filepaths,
      items,
      function (options, label) {
        return m.component(Fangorn.Components.button, options, label);
      }
    );
  }

  self.createMultipleItemsButtonsBase = function (filepaths, items, createButton) {
    // assert filepaths.length > 1
    // assert filepaths.length == items.length
    const buttons = [];
    const contexts = items.map(function (item) {
      return self.findContextByNodeId(item ? item.data.nodeId : contextVars.node.id);
    });
    const context = contexts[0];
    if (!context) {
      console.warn('Metadata not loaded for project:', items[0] ? items[0].data.nodeId : null);
      const loadingButton = self.createLoadingButton(createButton);
      return [loadingButton];
    }
    if (!context.addonAttached) {
      return [];
    }
    if (contexts.slice(1).filter(function (context) {
      return context !== contexts[0];
    }).length > 0) {
      // unmatched contexts
      return [];
    }
    const projectMetadata = context.projectMetadata;
    if (!projectMetadata.editable) {
      // readonly
      return [];
    }

    const editButton = createButton({
      onclick: function (event) {
        self.editMultipleMetadata(context, filepaths, items, 2);
      },
      icon: 'fa fa-edit',
      className: 'text-primary'
    }, _('Edit Multiple Metadata'));
    buttons.push(editButton)

    const editButtonMIB = createButton({
      onclick: function (event) {
        self.lastMetadata_hold = null;
        self.editMultipleMetadata_Mibyo(context, filepaths, items, 2, null);
      },
      icon: 'fa fa-edit',
      className: 'text-primary'
    }, _('Edit Multiple UserDefinedMetaData'));
    buttons.push(editButtonMIB)

    return buttons;
    // const editButton = createButton({
    //   onclick: function(event) {
    //     self.editMultipleMetadata(context, filepaths, items);
    //   },
    //   icon: 'fa fa-edit',
    //   className : 'text-primary'
    // }, _('Edit Multiple Metadata')); 
    //return [editButton];
  }

  self.createLoadingButton = function (createButton) {
    const viewButton = createButton({
      onclick: function (event) {
      },
      icon: 'fa fa-spinner fa-pulse',
      className: 'text-default disabled'
    }, _('Loading Metadata'));
    viewButton.disabled = true;
    return viewButton;
  }

  /**
   * Register existence-verified metadata.
   */
  self.setValidatedFile = function (context, filepath, item, metadata) {
    const cache = context.validatedFiles[filepath];
    if (cache && cache.expired > Date.now() && cache.item !== null) {
      return;
    }
    context.validatedFiles[filepath] = {
      expired: Date.now() + METADATA_CACHE_EXPIRATION_MSEC,
      item: item,
      metadata: metadata,
    };
    context.wbcache.computeHash(item)
      .then(function (hash) {
        if (metadata.hash === hash) {
          return;
        }
        // Update the hash
        console.log(logPrefix, 'Updating hash', metadata, hash);
        const url = self.baseUrl + 'hashes/' + metadata.path;
        $.ajax({
          method: 'PATCH',
          url: url,
          contentType: 'application/json',
          data: JSON.stringify({
            hash: hash
          })
        }).done(function (data) {
          console.log(logPrefix, 'saved: ', hash, data);
          context.validatedFiles[filepath] = {
            expired: Date.now() + METADATA_CACHE_EXPIRATION_MSEC,
            item: item,
            metadata: Object.assign({}, metadata, {
              hash: hash
            })
          };
        }).fail(function (xhr, status, error) {
          Raven.captureMessage('Error while saving addon info', {
            extra: {
              url: url,
              status: status,
              error: error
            }
          });
        });
      })
      .catch(function (error) {
      });
  };

  /**
   * Verify the existence of metadata.
   */
  self.validateFile = function (context, filepath, metadata, callback) {
    const cache = context.validatedFiles[filepath];
    if (cache && cache.expired > Date.now()) {
      if (cache.loading) {
        return;
      }
      callback(cache.item);
      return;
    }
    context.validatedFiles[filepath] = {
      expired: Date.now() + METADATA_CACHE_EXPIRATION_MSEC,
      item: null,
      loading: true,
      metadata: metadata
    };
    console.log(logPrefix, 'Checking metadata', filepath, metadata);
    setTimeout(function () {
      context.wbcache.searchFile(filepath, function (file) {
        console.log(logPrefix, 'Search result', filepath, file);
        context.validatedFiles[filepath] = {
          expired: Date.now() + METADATA_CACHE_EXPIRATION_MSEC,
          item: file,
          loading: false,
          metadata: metadata,
        };
        callback(file);
      });
    }, 1000);
  };

  /**
   * Modifies row data.
   */
  self.decorateRows = function (items) {
    if (items.length === 0) {
      return;
    }
    const remains = items.filter(function (item) {
      const text = $('.td-title.tb-td[data-id="' + item.id + '"] .title-text');
      if (text.length === 0) {
        return true;
      }
      const context = self.findContextByNodeId(item.data.nodeId);
      if (!context) {
        self.loadMetadata(item.data.nodeId, item.data.nodeApiUrl + 'metadata/');
        return true;
      }
      if (!item.data.materialized) {
        context.wbcache.setProvider(item);
      }
      var indicator = text.find('.metadata-indicator');
      if (indicator.length === 0) {
        indicator = $('<span></span>')
          .addClass('metadata-indicator')
          .css('margin-left', '1em');
        text.append(indicator);
      }
      const filepath = item.data.provider + (item.data.materialized || '/');
      const metadata = self.findMetadataByPath(context.nodeId, filepath);
      const projectMetadata = context.projectMetadata;
      if (!metadata && filepath.length > 0 && filepath[filepath.length - 1] !== '/') {
        // file with no metadata
        return false;
      }
      const childMetadata = projectMetadata.files.filter(function (f) {
        return f.path.substring(0, filepath.length) === filepath;
      });
      if (!metadata && childMetadata.length === 0) {
        // folder with no metadata
        return false;
      }
      if (metadata) {
        indicator.empty();
        indicator.append($('<span></span>')
          .text('{}')
          .css('font-weight', 'bold')
          .css('margin', '0 8px')
          .attr('title', _('Metadata is defined')));
        self.setValidatedFile(context, filepath, item, metadata);
      } else {
        indicator.empty();
        indicator.append($('<span></span>')
          .text('{}')
          .css('font-weight', 'bold')
          .css('margin', '0 8px')
          .css('color', '#ccc')
          .attr('title', _('Some of the children have metadata.')));
      }
      childMetadata.forEach(function (child) {
        self.validateFile(context, child.path, child, function (item) {
          if (item) {
            return;
          }
          const ic = $('<span></span>')
            .append($('<i></i>')
              .addClass('fa fa-exclamation-circle')
              .attr('title', _('File not found: ') + child.path))
            .on('click', function () {
              if (!((context.projectMetadata || {}).editable)) {
                return;
              }
              self.resolveMetadataConsistency(context, child);
            });
          indicator.append(ic);
        });
      });
      return false;
    });
    if (remains.length === 0) {
      return;
    }
    setTimeout(function () {
      self.decorateRows(remains);
    }, 1000);
  }

  self.initBase = function (callback) {
    self.loadConfig(callback);
  }

  /**
   * Refresh buttons for file view.
   */
  self.refreshFileViewButtons = function (path) {
    if (!self.fileViewButtons) {
      self.fileViewButtons = $('<div></div>')
        .addClass('btn-group m-t-xs')
        .attr('id', 'metadata-toolbar');
    }
    self.fileViewPath = path;
    const buttons = self.fileViewButtons;
    buttons.empty();
    self.createButtonsBase(
      path,
      self.getFileItemFromContext(),
      function (options, label) {
        const btn = $('<button></button>')
          .addClass('btn')
          .addClass('btn-sm');
        if (options.className) {
          btn.addClass(options.className.replace(/^text-/, 'btn-'));
        }
        if (options.icon) {
          btn.append($('<i></i>').addClass(options.icon));
        }
        if (options.onclick) {
          btn.click(options.onclick);
        }
        btn.append($('<span></span>').text(label));
        return btn;
      }
    )
      .forEach(function (button) {
        buttons.append(button);
      });
    $('#toggleBar .btn-toolbar').append(buttons);
  };

  self.initFileView = function () {
    var path = null;
    function refreshIfToolbarExists() {
      const toolbar = $('#toggleBar .btn-toolbar');
      if (toolbar.length > 0) {
        self.refreshFileViewButtons(path);
      }
    }
    const observer = new MutationObserver(refreshIfToolbarExists);
    const toggleBar = $('#toggleBar').get(0);
    observer.observe(toggleBar, { attributes: false, childList: true, subtree: false });
    self.initBase(function (p) {
      path = p;
      refreshIfToolbarExists();
    });
  }

  self.initFileTree = function () {
    self.initBase(function () {
      const items = self.reservedRows;
      console.log('initFileTree' + items);
      setTimeout(function () {
        self.decorateRows(items);
      }, 500);
    });

    Fangorn.config = new Proxy(Fangorn.config, {
      get: function (targetprov, name) {
        var obj = targetprov[name];
        if (obj === undefined) {
          obj = {};
        }
        return new Proxy(obj, {
          get: function (target, propname) {
            if (propname == 'itemButtons') {
              return function (item) {
                var base = Fangorn.Components.defaultItemButtons;
                if (target[propname] !== undefined) {
                  const prop = target[propname];
                  const baseButtons = typeof prop === 'function' ? prop.apply(this, [item]) : prop;
                  if (baseButtons !== undefined) {
                    base = baseButtons;
                  }
                }
                const filepath = item.data.provider + (item.data.materialized || '/');
                const buttons = self.createFangornButtons(filepath, item);
                return {
                  view: function (ctrl, args, children) {
                    const tb = args.treebeard;
                    const mode = tb.toolbarMode;
                    tb1 = args.treebeard;
                    // item1 = args.item;
                    mode1 = tb.toolbarMode;
                    if (tb.options.placement === 'fileview') {
                      return m('span', []);
                    }
                    return m('span', [
                      m.component(base, {
                        treebeard: tb, mode: mode,
                        item: item
                      }),
                    ].concat(buttons));
                  }
                };
              };
            } if (propname == 'multipleItemsButtons') {
              return function (items) {
                var base = [];
                if (target[propname] !== undefined) {
                  const prop = target[propname];
                  const baseButtons = typeof prop === 'function' ? prop.apply(this, [items]) : prop;
                  if (baseButtons !== undefined) {
                    base = baseButtons;
                  }
                }
                const filepaths = items.map(function (item) {
                  return item.data.provider + (item.data.materialized || '/');
                });
                const buttons = self.createFangornMultipleItemsButtons(filepaths, items);
                return base.concat(buttons);
              }
            } else if (propname == 'resolveRows') {
              return function (item) {
                var base = null;
                if (target[propname] !== undefined) {
                  const prop = target[propname];
                  const baseRows = typeof prop === 'function' ? prop.apply(this, [item]) : prop;
                  if (baseRows !== undefined) {
                    base = baseRows;
                  }
                }
                if (self.contexts) {
                  setTimeout(function () {
                    self.decorateRows([item]);
                  }, 500);
                } else {
                  item1 = self.reservedRows;
                  self.reservedRows.push(item);
                }

                return base;
              };
            } else if (propname == 'onMoveComplete') {
              return function (item, from) {
                const context = self.findContextByNodeId(from.data.nodeId);
                if (!context) {
                  return;
                }
                const fromFilepath = from.data.provider + (from.data.materialized || '/');
                const projectMetadata = context.projectMetadata;
                const fromFilepaths = projectMetadata.files
                  .map(function (f) { return f.path; })
                  .filter(function (p) {
                    return p.substring(0, fromFilepath.length) === fromFilepath;
                  });
                if (!fromFilepaths.length) {
                  return;
                }
                const toFilepath = item.data.provider + (item.data.materialized || '/');
                const toFilepaths = fromFilepaths
                  .map(function (p) {
                    return toFilepath + p.replace(fromFilepath, '');
                  });
                // try reload project metadata
                const interval = 250;
                const maxRetry = 10;
                var retry = 0;
                function tryLoadMetadata() {
                  self.loadMetadata(context.nodeId, context.baseUrl, function () {
                    const context2 = self.findContextByNodeId(context.nodeId);
                    const matches = toFilepaths
                      .map(function (p) {
                        return context2.projectMetadata.files.find(function (f) { return f.path === p; });
                      });
                    const unmatchCount = matches.filter(function (m) { return !m; }).length;
                    console.log(logPrefix, 'reloaded metadata: ', {
                      context: context2,
                      unmatchCount: unmatchCount,
                      expectedFilepaths: toFilepaths
                    });
                    if (!unmatchCount) {
                      context2.wbcache.clearCache();
                      m.redraw();
                      return;
                    }
                    retry += 1;
                    if (retry >= maxRetry) {
                      console.log(logPrefix, 'failed retry reloading metadata');
                      return;
                    }
                    console.log(logPrefix, retry + 'th retry reload metadata after ' + interval + 'ms: ');
                    setTimeout(tryLoadMetadata, interval);
                  });
                }
                setTimeout(tryLoadMetadata, interval);
              }
            } else {
              return target[propname];
            }
          }
        });
      }
    });
  };

  /**
   * Save the edited metadata.
   */
  self.saveEditMetadataModal = function () {
    const metadata = Object.assign({}, self.lastMetadata);
    const context = self.editingContext;
    metadata.items = (self.lastMetadata.items || [])
      .filter(function (item) {
        return item.schema != self.currentSchemaId;
      })
      .map(function (item) {
        return Object.assign({}, item, {
          active: false
        });
      });
    if (self.currentSchemaId) {
      const metacontent = {
        schema: self.currentSchemaId,
        active: true,
        data: {},
      };
      self.lastFields.forEach(function (field) {
        metacontent.data[field.field.label] = {
          extra: [],
          comments: [],
          value: field.field.getValue(field.input)
        };
      });
      metadata.items.unshift(metacontent);
    }
    return new Promise(function (resolve, reject) {
      context.wbcache.computeHash(self.currentItem)
        .then(function (hash) {
          const url = context.baseUrl + 'files/' + metadata.path;
          $.ajax({
            method: 'PATCH',
            url: url,
            contentType: 'application/json',
            data: JSON.stringify(Object.assign({}, metadata, {
              hash: hash,
            })),
          }).done(function (data) {
            console.log(logPrefix, 'saved: ', hash, data);
            self.currentItem = null;
            self.editingContext = null;
            self.loadMetadata(context.nodeId, context.baseUrl, function () {
              resolve();
              if (!self.fileViewPath) {
                return;
              }
              self.refreshFileViewButtons(self.fileViewPath);
            });
          }).fail(function (xhr, status, error) {
            reject(error);
            Raven.captureMessage('Error while retrieving addon info', {
              extra: {
                url: url,
                status: status,
                error: error
              }
            });
          });
        })
        .catch(function (error) {
          reject(error);
          self.currentItem = null;
        });
    });
  };

  //20230803 add honda 
  self.saveEditMetadataModal_mibyo = function () {
    const metadata = Object.assign({}, self.lastMetadata);
    const context = self.editingContext;
    metadata.items = (self.lastMetadata.items || [])
      .filter(function (item) {
        return item.schema != self.currentSchemaId;
      })
      .map(function (item) {
        return Object.assign({}, item, {
          active: false
        });
      });
    if (self.currentSchemaId) {
      const metacontent = {
        schema: self.currentSchemaId,
        active: true,
        data: {},
      };

      metadata_hold()
      self.lastMetadata_hold.forEach(function (field) {
        metacontent.data[field.field.label] = {
          extra: [],
          comments: [],
          value: field.field.getValue(field.input)
        };
      });
      // self.lastFields.forEach(function(field) {
      //   metacontent.data[field.field.label] = {
      //     extra: [],
      //     comments: [],
      //     value: field.field.getValue(field.input)
      //   };
      // });
      metadata.items.unshift(metacontent);
    }
    return new Promise(function (resolve, reject) {
      context.wbcache.computeHash(self.currentItem)
        .then(function (hash) {
          const url = context.baseUrl + 'files/' + metadata.path;
          $.ajax({
            method: 'PATCH',
            url: url,
            contentType: 'application/json',
            data: JSON.stringify(Object.assign({}, metadata, {
              hash: hash,
            })),
          }).done(function (data) {
            console.log(logPrefix, 'saved: ', hash, data);
            console.log(logPrefix, 'editMetadata2-----saved: ', hash, data);
            self.currentItem = null;
            self.editingContext = null;
            self.loadMetadata(context.nodeId, context.baseUrl, function () {
              resolve();
              if (!self.fileViewPath) {
                return;
              }
              self.refreshFileViewButtons(self.fileViewPath);
            });
          }).fail(function (xhr, status, error) {
            reject(error);
            Raven.captureMessage('Error while retrieving addon info', {
              extra: {
                url: url,
                status: status,
                error: error
              }
            });
          });
        })
        .catch(function (error) {
          reject(error);
          self.currentItem = null;
        });
    });
  };

  self.saveEditMetadataModal_mibyo_nextpage = function () {
    const metadata = Object.assign({}, self.lastMetadata);
    const context = self.editingContext;
    metadata.items = (self.lastMetadata.items || [])
      .filter(function (item) {
        return item.schema != self.currentSchemaId;
      })
      .map(function (item) {
        return Object.assign({}, item, {
          active: false
        });
      });
    if (self.currentSchemaId) {
      const metacontent = {
        schema: self.currentSchemaId,
        active: true,
        data: {},
      };

      metadata_hold()
      self.lastMetadata_hold.forEach(function (field) {
        metacontent.data[field.field.label] = {
          extra: [],
          comments: [],
          value: field.field.getValue(field.input)
        };
      });
      // self.lastFields.forEach(function(field) {
      //   metacontent.data[field.field.label] = {
      //     extra: [],
      //     comments: [],
      //     value: field.field.getValue(field.input)
      //   };
      // });
      metadata.items.unshift(metacontent);
    }
    return new Promise(function (resolve, reject) {
      context.wbcache.computeHash(self.currentItem)
        .then(function (hash) {
          const url = context.baseUrl + 'files/' + metadata.path;
          $.ajax({
            method: 'PATCH',
            url: url,
            contentType: 'application/json',
            data: JSON.stringify(Object.assign({}, metadata, {
              hash: hash,
            })),
          }).done(function (data) {
            console.log(logPrefix, 'saved: ', hash, data);
            console.log(logPrefix, 'editMetadata2-----saved: ', hash, data);
            self.currentItem = null;
            self.editingContext = null;
            self.loadMetadata(context.nodeId, context.baseUrl, function () {
              resolve();
              if (!self.fileViewPath) {
                return;
              }
              self.refreshFileViewButtons(self.fileViewPath);
            });
          }).fail(function (xhr, status, error) {
            reject(error);
            Raven.captureMessage('Error while retrieving addon info', {
              extra: {
                url: url,
                status: status,
                error: error
              }
            });
          });
        })
        .catch(function (error) {
          reject(error);
          self.currentItem = null;
        });
    });
  };

  /**
   * Save the edited multiple metadata.
   */
  self.saveEditMultipleMetadataModal = function () {
    const context = self.editingContext;
    if (!self.currentSchemaId) {
      return Promise.resolve();
    }
    const metadatas = self.lastMetadata.path
      .map(function (filepath, i) {
        const currentMetadata = self.findMetadataByPath(context.nodeId, filepath);
        const metadata = Object.assign({}, currentMetadata);
        if (!currentMetadata) {
          metadata.path = filepath;
          metadata.folder = self.currentItem[i].kind === 'folder';
        }
        const currentItems = metadata.items || [];
        // inactivate old items
        metadata.items = currentItems
          .filter(function (item) {
            return item.schema !== self.currentSchemaId;
          })
          .map(function (item) {
            return Object.assign({}, item, {
              active: false
            });
          });
        // create new item
        const oldMetacontent = currentItems
          .filter(function (item) {
            return item.schema === self.currentSchemaId;
          })[0] || {};
        const metacontent = {
          schema: self.currentSchemaId,
          active: true,
          data: Object.assign({}, oldMetacontent.data),
        };

        self.lastFields.forEach(function (field) {
          const value = field.field.getValue(field.input);
          const clear = field.field.checkedClear && field.field.checkedClear();
          if (clear) {
            delete metacontent.data[field.field.label];
          } else if (value) {
            metacontent.data[field.field.label] = {
              extra: [],
              comments: [],
              value: value
            };
          }
        });
        metadata.items.unshift(metacontent);
        return metadata;
      });
    return Promise.all(self.currentItem.map(function (fileitem) {
      return context.wbcache.computeHash(fileitem);
    }))
      .catch(function (error) {
        self.currentItem = null;
        return Promise.reject(error);
      })
      .then(function (hashes) {
        return new Promise(function (resolve, reject) {
          function patchTopMetadata() {
            const metadata = metadatas.pop();
            const hash = hashes.pop();
            const url = context.baseUrl + 'files/' + metadata.path;
            $.ajax({
              method: 'PATCH',
              url: url,
              contentType: 'application/json',
              data: JSON.stringify(Object.assign({}, metadata, {
                hash: hash,
              })),
            }).done(function (data) {
              console.log(logPrefix, 'saved: ', hash, data);
              if (metadatas.length) {
                patchTopMetadata();
              } else {
                resolve();
              }
            }).fail(function (xhr, status, error) {
              Raven.captureMessage('Error while retrieving addon info', {
                extra: {
                  url: url,
                  status: status,
                  error: error
                }
              });
              reject(error);
            });
          }
          patchTopMetadata();
        });
      })
      .then(function () {
        self.currentItem = null;
        self.editingContext = null;
        return new Promise(function (resolve) {
          self.loadMetadata(context.nodeId, context.baseUrl, function () {
            if (self.fileViewPath) {
              self.refreshFileViewButtons(self.fileViewPath);
            }
            resolve();
          });
        });
      });
  };

  self.saveEditMultipleMetadataModal_mibyo = function () {
    const context = self.editingContext;
    if (!self.currentSchemaId) {
      return Promise.resolve();
    }
    const metadatas = self.lastMetadata.path
      .map(function (filepath, i) {
        const currentMetadata = self.findMetadataByPath(context.nodeId, filepath);
        const metadata = Object.assign({}, currentMetadata);
        console.log('saveEditMultipleMetadataModal----------2-1');
        if (!currentMetadata) {
          metadata.path = filepath;
          metadata.folder = self.currentItem[i].kind === 'folder';
        }
        console.log('saveEditMultipleMetadataModal----------2-2');
        const currentItems = metadata.items || [];
        // inactivate old items
        metadata.items = currentItems
          .filter(function (item) {
            return item.schema !== self.currentSchemaId;
          })
          .map(function (item) {
            return Object.assign({}, item, {
              active: false
            });
          });
        // create new item
        console.log('saveEditMultipleMetadataModal----------2-3');
        const oldMetacontent = currentItems
          .filter(function (item) {
            return item.schema === self.currentSchemaId;
          })[0] || {};
        console.log('saveEditMultipleMetadataModal----------2-4');
        const metacontent = {
          schema: self.currentSchemaId,
          active: true,
          data: Object.assign({}, oldMetacontent.data),
        };

        //20230812 複数編集は呼び出しはないので
        //ページ遷移時に保存はするが呼び出ししない？？
        // metadata_hold()  
        // self.lastMetadata_hold.forEach(function(field) {
        //   const value = field.field.getValue(field.input);
        //   const clear = field.field.checkedClear && field.field.checkedClear();
        //   if (clear) {
        //     delete metacontent.data[field.field.label];
        //   } else if (value) {
        //     metacontent.data[field.field.label] = {
        //       extra: [],
        //       comments: [],
        //       value: value
        //     };
        //   }
        // });
        self.lastFields.forEach(function (field) {
          const value = field.field.getValue(field.input);
          const clear = field.field.checkedClear && field.field.checkedClear();
          if (clear) {
            delete metacontent.data[field.field.label];
          } else if (value) {
            metacontent.data[field.field.label] = {
              extra: [],
              comments: [],
              value: value
            };
          }
        });
        metadata.items.unshift(metacontent);
        return metadata;
      });
    return Promise.all(self.currentItem.map(function (fileitem) {
      return context.wbcache.computeHash(fileitem);
    }))
      .catch(function (error) {
        self.currentItem = null;
        return Promise.reject(error);
      })
      .then(function (hashes) {
        return new Promise(function (resolve, reject) {
          function patchTopMetadata() {
            const metadata = metadatas.pop();
            const hash = hashes.pop();
            const url = context.baseUrl + 'files/' + metadata.path;
            $.ajax({
              method: 'PATCH',
              url: url,
              contentType: 'application/json',
              data: JSON.stringify(Object.assign({}, metadata, {
                hash: hash,
              })),
            }).done(function (data) {
              console.log(logPrefix, 'saved: ', hash, data);
              if (metadatas.length) {
                patchTopMetadata();
              } else {
                resolve();
              }
            }).fail(function (xhr, status, error) {
              Raven.captureMessage('Error while retrieving addon info', {
                extra: {
                  url: url,
                  status: status,
                  error: error
                }
              });
              reject(error);
            });
          }
          patchTopMetadata();
        });
      })
      .then(function () {
        self.currentItem = null;
        self.editingContext = null;
        return new Promise(function (resolve) {
          self.loadMetadata(context.nodeId, context.baseUrl, function () {
            if (self.fileViewPath) {
              self.refreshFileViewButtons(self.fileViewPath);
            }
            resolve();
          });
        });
      });
  };

  self.closeModal = function () {
    console.log(logPrefix, 'Modal closed');
    self.deleteConfirmingFilepath = null;
    self.deleteConfirmingContext = null;
    self.editingContext = null;
  };

  /**
   * Create the HDF5 Tempate dialog.
   */
  self.initCreateHdf5TemplateDialog = function (header, label) {
    const dialog = $('<div class="modal fade" data-backdrop="static"></div>');
    const close = $('<a href="#" class="btn btn-default" data-dismiss="modal"></a>').text(_('キャンセル'));
    close.click(self.closeModal);
    var save = $('<span></span>');
    // if (editable) {
    save = $('<a href="#" class="btn btn-success confirm"></a>').text(label);    
    const toolbar = $('<div></div>');
    const container = $('<ul></ul>').css('padding', '0 20px');
    var notice = $('<span></span>');
    dialog
      .append($('<div class="modal-dialog modal-lg"></div>').css('top', '18%').css('left', '8%')
        .append($('<div class="modal-content"></div>').css('width', '68%')
          .append($('<div class="modal-header"></div>')
            .append($('<h3></h3>').text(header)))
          .append($('<form></form>')
            .append($('<div class="modal-body"></div>')
              .append($('<div class="row"></div>')
                // .append($('<div class="col-sm-12"></div>')
                // .append(toolbar))
                .append($('<div class="col-sm-12"></div>')
                  .css('overflow-y', 'scroll')
                  .append(container))))
            .append($('<div class="modal-footer"></div>')
              .css('align-items', 'center')
              // .append(copyToClipboard.css('margin-left', 0).css('margin-right', 0))
              // .append(copyStatus.css('margin-left', 0).css('margin-right', 'auto'))
              // .append(notice)
              .append(close)
              .append(save)))));
    dialog.appendTo($('#treeGrid'));
    return {
      dialog: dialog,
      container: container,
    };
  };

  self.initCreateMetadataImportDialog = function (header, label) {
    const dialog = $('<div class="modal fade" data-backdrop="static"></div>');
    const close = $('<a href="#" class="btn btn-default" data-dismiss="modal" id="cancel"></a>').text(_('Cancel'));
    // close.click(self.closeModal);
    var save = $('<span></span>');
    // if (editable) {
    save = $('<a href="#" class="btn btn-success" id="confirm"></a>').text(label);    
    const toolbar = $('<div></div>');
    const container = $('<ul></ul>').css('padding', '0 20px');
    var notice = $('<span></span>');
    dialog
      .append($('<div class="modal-dialog modal-lg"></div>').css('top', '18%').css('left', '8%')
        .append($('<div class="modal-content"></div>').css('width', '68%')
          .append($('<div class="modal-header"></div>')
            .append($('<h3></h3>').text(header)))
          .append($('<form></form>')
            .append($('<div class="modal-body"></div>')
              .append($('<div class="row"></div>')         
                .append($('<div class="col-sm-12"></div>')
                  .css('overflow-y', 'scroll')
                  .append(container))))
            .append($('<div class="modal-footer"></div>')
              .css('align-items', 'center') 
              .append(close)
              .append(save)))));
    dialog.appendTo($('#treeGrid'));
    return {
      dialog: dialog,
      container: container,
    };
  };


  self.initCreateMetadataImportTreeViewDialog = function (label) {
    const dialog = $('<div class="modal fade" data-backdrop="static"></div>');
    const close = $('<a href="#" class="btn btn-default" data-dismiss="modal" id="cancel"></a>').text(_('Cancel'));
    // close.click(self.closeModal);
    close.on('click', function() {
      self.closeModal;
      // this.removeAttr('disabled').removeAttr('pointer-events');
    });
    var selection = $('<span></span>');
    // if (editable) {
    selection = $('<a href="#" class="btn btn-success" id="selection"></a>').text(label).attr('disabled', 'disabled').css('pointer-events','none').css('float','right');    
    const toolbar = $('<div></div>');
    const container = $('<ul></ul>').css('padding', '0 20px');
    var notice = $('<span></span>');
    dialog
      .append($('<div class="modal-dialog modal-lg"></div>').css('top', '18%').css('left', '8%')
        .append($('<div class="modal-content"></div>').css('width', '68%')
          .append($('<div class="modal-header"></div>')
            .append(close).append(selection))
          .append($('<form></form>')
            .append($('<div class="modal-body"></div>')
              .append($('<div class="row"></div>')         
                .append($('<div class="col-sm-12"></div>')
                  .css('overflow-y', 'scroll')
                  .append(container))))
            .append($('<div class="modal-footer"></div>')
              .css('align-items', 'center')))));
    dialog.appendTo($('#treeGrid'));
    return {
      dialog: dialog,
      container: container,
    };
  };

  self.initCreateMetadataExportDialog = function (header, label) {
    const dialog = $('<div class="modal fade" data-backdrop="static"></div>');
    const close = $('<a href="#" class="btn btn-default" data-dismiss="modal"></a>').css('float','right').text("X");    
    close.click(self.closeModal);     
    const container = $('<ul></ul>').css('padding', '0 20px');
    dialog
    .append($('<div class="modal-dialog modal-lg"></div>').css('top', '18%').css('left', '8%')
      .append($('<div class="modal-content"></div>').css('width', '60%')
        .append($('<div class="modal-header"></div>')
          .append($('<label></label>').text(header).css('float','left').css('font-weight','bold'))
          .append(close))
        .append($('<form></form>')
          .append($('<div class="modal-body"></div>')
            .append($('<div class="row"></div>') 
              .append($('<div class="col-sm-12"></div>')
                .css('overflow-y', 'scroll')
                .append(container))))
        )));
    dialog.appendTo($('#treeGrid'));
    return {
      dialog: dialog,
      container: container,
    };
  }
  
  /**
   * 
   * JSON集約   
   */
  self.initCreateJSONCollectingDialog = function (header, label) {
    const dialog = $('<div class="modal fade" data-backdrop="static"></div>');
    const close = $('<a href="#" class="btn btn-default" data-dismiss="modal"></a>').text(('キャンセル'));
    close.click(self.closeModal);
    var save = $('<span></span>');
    // if (editable) {
    save = $('<a href="#" class="btn btn-success"></a>').text(label);    
    const toolbar = $('<div></div>');
    const container = $('<ul></ul>').css('padding', '0 20px');
    var notice = $('<span></span>');
    dialog
      .append($('<div class="modal-dialog modal-lg"></div>').css('top', '18%').css('left', '8%')
        .append($('<div class="modal-content"></div>').css('width', '68%')
          .append($('<div class="modal-header"></div>')
            .append($('<h3></h3>').text(header)))
          .append($('<form></form>')
            .append($('<div class="modal-body"></div>')
              .append($('<div class="row"></div>')             
                .append($('<div class="col-sm-12"></div>')
                  .css('overflow-y', 'scroll')
                  .append(container))))
            .append($('<div class="modal-footer"></div>')
              .css('align-items', 'center')    
              .append(close)
              .append(save)))));
    dialog.appendTo($('#treeGrid'));
    return {
      dialog: dialog,
      container: container,
    };
  };

  /**
   * Create the Edit Metadata dialog.
   */
  self.initEditMetadataDialog = function (editable) {
    console.log('initEditMetadataDialog****************************************');
    const dialog = $('<div class="modal fade" data-backdrop="static"></div>');
    const close = $('<a href="#" class="btn btn-default" data-dismiss="modal"></a>').text(_('Close'));
    close.click(self.closeModal);
    var save = $('<span></span>');
    if (editable) {
      save = $('<a href="#" class="btn btn-success"></a>').text(_('Save'));
      save.click(function () {
        osfBlock.block();
        self.saveEditMetadataModal()
          .finally(function () {
            osfBlock.unblock();
            $(dialog).modal('hide');
          })
      });
    }
    const copyToClipboard = $('<button class="btn btn-default"></button>')
      .append($('<i></i>').addClass('fa fa-copy'))
      .append(_('Copy to clipboard'))
      .attr('type', 'button');
    const copyStatus = $('<div></div>')
      .css('text-align', 'left');
    copyToClipboard.on('click', function (event) {
      self.copyToClipboard(event, copyStatus);
    });
    const toolbar = $('<div></div>');
    const container = $('<ul></ul>').css('padding', '0 20px');
    var notice = $('<span></span>');
    if (editable) {
      notice = $('<div></div>')
        .css('text-align', 'left')
        .css('padding', '0.2em 0.2em 0.2em 1em')
        .css('color', 'red')
        .text(_('Renaming, moving the file/directory, or changing the directory hierarchy can break the association of the metadata you have added.'));
    }
    dialog
      .append($('<div class="modal-dialog modal-lg"></div>')
        .append($('<div class="modal-content"></div>')
          .append($('<div class="modal-header"></div>')
            .append($('<h3></h3>').text(editable ? _('Edit File Metadata') : _('View File Metadata'))))
          .append($('<form></form>')
            .append($('<div class="modal-body"></div>')
              .append($('<div class="row"></div>')
                .append($('<div class="col-sm-12"></div>')
                  .append(toolbar))
                .append($('<div class="col-sm-12"></div>')
                  .css('overflow-y', 'scroll')
                  .css('height', '70vh')
                  .append(container))))
            .append($('<div class="modal-footer"></div>')
              .css('display', 'flex')
              .css('align-items', 'center')
              .append(copyToClipboard.css('margin-left', 0).css('margin-right', 0))
              .append(copyStatus.css('margin-left', 0).css('margin-right', 'auto'))
              .append(notice)
              .append(close)
              .append(save)))));
    $(window).on('beforeunload', function () {
      if ($(dialog).data('bs.modal').isShown) {
        return _('You have unsaved changes.');
      }
    });
    dialog.appendTo($('#treeGrid'));
    return {
      dialog: dialog,
      container: container,
      toolbar: toolbar,
      copyStatus: copyStatus,
    };
  };


  /**
   * Create the Edit Multiple Metadata dialog.
   */
  self.initEditMultipleMetadataDialog = function () {
    const dialog = $('<div class="modal fade" data-backdrop="static"></div>');
    const close = $('<a href="#" class="btn btn-default" data-dismiss="modal"></a>').text(_('Close'));
    close.click(self.closeModal);
    const save = $('<a href="#" class="btn btn-success"></a>').text(_('Save'));
    save.click(function () {
      osfBlock.block();
      self.saveEditMultipleMetadataModal()
        .finally(function () {
          osfBlock.unblock();
          $(dialog).modal('hide');
        });
    });
    const toolbar = $('<div></div>');
    const container = $('<ul></ul>').css('padding', '0 20px');
    dialog
      .append($('<div class="modal-dialog modal-lg"></div>')
        .append($('<div class="modal-content"></div>')
          .append($('<div class="modal-header"></div>')
            .append($('<h3></h3>').text(_('Edit Multiple File Metadata'))))
          .append($('<form></form>')
            .append($('<div class="modal-body"></div>')
              .append($('<div class="row"></div>')
                .append($('<div class="col-sm-12"></div>')
                  .append(toolbar))
                .append($('<div class="col-sm-12"></div>')
                  .css('overflow-y', 'scroll')
                  .css('height', '70vh')
                  .append(container))))
            .append($('<div class="modal-footer"></div>')
              .css('display', 'flex')
              .css('align-items', 'center')
              .append(close.css('margin-left', 'auto'))
              .append(save)))));
    $(window).on('beforeunload', function () {
      if ($(dialog).data('bs.modal').isShown) {
        return _('You have unsaved changes.');
      }
    });
    dialog.appendTo($('#treeGrid'));
    return {
      dialog: dialog,
      container: container,
      toolbar: toolbar,
    };
  };


  self.initEditMultipleMetadataDialog_Mibyo = function (editable, context, filepaths, items, pageno, nextbtnFlg, returnbtnFlg, repossessionbtnFlg, nextpage, prepage, titleMib) {
    // const dialog = $('<div class="modal fade" data-backdrop="static"></div>');
    // const close = $('<a href="#" class="btn btn-default" data-dismiss="modal"></a>').text(_('Close'));
    // close.click(self.closeModal);
    // const save = $('<a href="#" class="btn btn-success"></a>').text(_('Save'));
    // save.click(function() {
    //   osfBlock.block();
    //   self.saveEditMultipleMetadataModal()
    //     .finally(function() {
    //       osfBlock.unblock();
    //       $(dialog).modal('hide');
    //   });
    // });
    // const toolbar = $('<div></div>');
    // const container = $('<ul></ul>').css('padding', '0 20px');
    const dialog = $('<div class="modal fade" data-backdrop="static"></div>');
    const close = $('<a href="#" class="btn btn-default" data-dismiss="modal"></a>').text(_('Close'));
    close.click(self.closeModal);
    var save = $('<span></span>');
    if (editable) {
      save = $('<a href="#" class="btn btn-success"></a>').text(_('Save'));
      save.click(function () {
        osfBlock.block();
        //self.saveEditMetadataModal()
        self.saveEditMultipleMetadataModal_mibyo()
          .finally(function () {
            osfBlock.unblock();
            $(dialog).modal('hide');
          })
      });
    }

    const message = $('<div></div>');
    message.text(_('file metadata registration mibyo'));

    var nextbtn = $('<span></span>');
    nextbtn = $('<a href="#" align="right" class="btn btn-primary"></a>').text(_('NextData'));
    nextbtn.click(function () {
      pageno = nextpage;

      // //画面メタデータを保持メタデータにセット
      // metadata_hold();

      // //画面遷移時に保存する
      // osfBlock.block();
      // self.saveEditMultipleMetadataModal_mibyo()
      //   .finally(function() {
      //     osfBlock.unblock();
      //   })
      // //20230803　追加 <--
      console.log('context---->' + context);
      console.log('filepaths---->' + filepaths);
      console.log('items---->' + items);
      console.log('pageno--->' + pageno);
      console.log('dialog---->' + dialog);
      self.editMultipleMetadata_Mibyo(context, filepaths, items, pageno, dialog)
        .finally(function () {
          osfBlock.unblock();
          $(dialog).modal('hide');
        });

      // pageno = pageno + 1;
      // self.editMetadata2(context, filepaths, items, pageno);
      //// {
      ////   $(dialog).modal('hide');
      //// };
    });

    var returnbtn = $('<span></span>');
    returnbtn = $('<a href="#" align="right" class="btn btn-default"></a>').text(_('ReturnData'));
    returnbtn.click(function () {
      // pageno = pageno - 1;
      pageno = prepage;

      // //20230803　追加 -->
      // //画面メタデータを保持メタデータにセット
      // metadata_hold();

      // //画面遷移時に保存する
      // osfBlock.block();
      // self.saveEditMultipleMetadataModal_mibyo()
      //   .finally(function() {
      //     osfBlock.unblock();
      //   })    
      // //20230803　追加 <--
      console.log('context---->' + context);
      console.log('filepaths---->' + filepaths);
      console.log('items---->' + items);
      console.log('pageno--->' + pageno);
      console.log('dialog---->' + dialog);
      self.editMultipleMetadata_Mibyo(context, filepaths, items, pageno, dialog)
        .finally(function () {
          osfBlock.unblock();
          $(dialog).modal('hide');
        });

      // self.editMetadata2(context, filepaths, items, pageno)
      // .finally(function() {
      //   osfBlock.unblock();
      //   $(dialog).modal('hide');
      // });
    });

    var repossessionbtn = $('<span></span>');
    repossessionbtn = $('<a href="#" align="right" class="btn btn-info"></a>').text(_('RepossessionData'));
    repossessionbtn.click(function () {
      self.registerMetadata2(context, filepaths, items);
    });

    var hedderbtn = $('<div align="right" ></div>')
    if (returnbtnFlg == true) {
      hedderbtn.append(returnbtn);
    }
    if (repossessionbtnFlg == true) {
      hedderbtn.append(repossessionbtn);
    }
    if (nextbtnFlg == true) {
      hedderbtn.append(nextbtn);
    }
    // var hedderbtn = $('<div align="right" ></div>')
    //   .append(nextbtn);

    const copyToClipboard = $('<div></div>');
    const copyStatus = $('<div></div>');
    //2200 コメント
    // const copyToClipboard = $('<button class="btn btn-default"></button>')
    //   .append($('<i></i>').addClass('fa fa-copy'))
    //   .append(_('Copy to clipboard'))
    //   .attr('type', 'button');
    // const copyStatus = $('<div></div>')
    //   .css('text-align', 'left');
    // copyToClipboard.on('click', function(event) {
    //   self.copyToClipboard(event, copyStatus);
    // });
    const toolbar = $('<div></div>');
    const container = $('<ul></ul>').css('padding', '0 20px');
    var notice = $('<span></span>');
    //2159 コメント
    // if (editable) {
    //   notice = $('<div></div>')
    //     .css('text-align', 'left')
    //     .css('padding', '0.2em 0.2em 0.2em 1em')
    //     .css('color', 'red')
    //     .text(_('Renaming, moving the file/directory, or changing the directory hierarchy can break the association of the metadata you have added.'));
    // }
    createDialog(context, filepaths, items, dialog, editable, hedderbtn, toolbar, container, copyToClipboard, copyStatus, notice, close, save, titleMib, pageno, true);
    //2226 コメント
    //createDialog(context, filepaths, items, dialog, editable, hedderbtn, toolbar, container, copyToClipboard, copyStatus, notice, close, save, _('Edit Multiple File Metadata'), null);
    // dialog
    //   .append($('<div class="modal-dialog modal-lg"></div>')
    //   .css('width', '92%')
    //     .append($('<div class="modal-content"></div>')
    //       .append($('<div class="modal-header"></div>')
    //         .append($('<h3></h3>').text(_('Edit Multiple File Metadata'))))
    //       .append($('<form></form>')
    //         .append($('<div class="modal-body"></div>')
    //           .append($('<div class="row"></div>')
    //             .append($('<div class="col-sm-12"></div>')
    //               .append(toolbar))
    //             .append($('<div class="col-sm-12"></div>')
    //               .css('overflow-y', 'scroll')
    //               .css('height', '70vh')
    //               .append(container))))
    //         .append($('<div class="modal-footer"></div>')
    //           .css('display', 'flex')
    //           .css('align-items', 'center')
    //           .append(close.css('margin-left', 'auto'))
    //           .append(save)))));
    $(window).on('beforeunload', function () {
      if ($(dialog).data('bs.modal').isShown) {
        return _('You have unsaved changes.');
      }
    });
    dialog.appendTo($('#treeGrid'));
    return {
      dialog: dialog,
      container: container,
      toolbar: toolbar,
    };
  };

  self.initConfirmDeleteDialog = function () {
    const dialog = $('<div class="modal fade"></div>');
    const close = $('<a href="#" class="btn btn-default" data-dismiss="modal"></a>').text(_('Close'));
    close.click(self.closeModal);
    const del = $('<a href="#" class="btn btn-success"></a>').text(_('Delete'));
    del.click(function () {
      osfBlock.block()
      self.deleteConfirmedModal()
        .finally(function () {
          osfBlock.unblock()
          $(dialog).modal('hide');
        });
    });
    dialog
      .append($('<div class="modal-dialog modal-lg"></div>')
        .append($('<div class="modal-content"></div>')
          .append($('<div class="modal-header"></div>')
            .append($('<h3></h3>').text(_('Delete File Metadata'))))
          .append($('<form></form>')
            .append($('<div class="modal-body"></div>')
              .append($('<div class="row"></div>')
                .append($('<div class="col-sm-12"></div>')
                  .append(_('Do you want to delete metadata? This operation cannot be undone.')))))
            .append($('<div class="modal-footer"></div>')
              .append(close).append(del)))));
    dialog.appendTo($('#treeGrid'));
    return dialog;
  };

  self.initSelectDraftDialog = function () {
    var close = $('<a href="#" class="btn btn-default" data-dismiss="modal"></a>').text(_('Close'));
    close.click(self.closeModal);
    var select = $('<a href="#" class="btn btn-success"></a>').text(_('Select'));
    select.click(self.selectDraftModal);
    var container = $('<ul></ul>').css('padding', '0 20px');
    var dialog = $('<div class="modal fade"></div>')
      .append($('<div class="modal-dialog modal-lg"></div>')
        .append($('<div class="modal-content"></div>')
          .append($('<div class="modal-header"></div>')
            .append($('<h3></h3>').text(_('Select a destination for file metadata registration'))))
          .append($('<form></form>')
            .append($('<div class="modal-body"></div>')
              .append($('<div class="row"></div>')
                .append($('<div class="col-sm-12"></div>')
                  .append(container))))
            .append($('<div class="modal-footer"></div>')
              .append(close).append(select)))));
    dialog.appendTo($('#treeGrid'));
    return { dialog: dialog, container: container, select: select };
  };

  /**
   * Create the Resolve Metadata dialog.
   */
  self.createResolveConsistencyDialog = function () {
    const dialog = $('<div class="modal fade"></div>')
    const close = $('<a href="#" class="btn btn-default" data-dismiss="modal"></a>').text(_('Close'));
    close.on('click', self.closeModal);
    const select = $('<a href="#" class="btn btn-success"></a>').text(_('Select'));
    select.on('click', function () {
      const matchedFiles = self.targetFiles.filter(function (file, fileIndex) {
        return $('#metadata-target-' + fileIndex).is(':checked');
      });
      console.log('matchedFiles', matchedFiles, self.currentMetadata);
      if (matchedFiles.length === 0) {
        $(dialog).modal('hide');
        self.deleteMetadata(self.currentContext, self.currentMetadata.path);
        return;
      }
      osfBlock.block();
      self.resolveConsistency(matchedFiles[0].path)
        .finally(function () {
          osfBlock.unblock();
          $(dialog).modal('hide');
        });
    });
    const copyToClipboard = $('<button class="btn btn-default"></button>')
      .append($('<i></i>').addClass('fa fa-copy'))
      .append(_('Copy to clipboard'));
    const copyStatus = $('<div></div>');
    copyToClipboard.on('click', function (event) {
      self.copyToClipboard(event, copyStatus);
    });
    const container = $('<ul></ul>').css('padding', '0 20px');
    dialog
      .append($('<div class="modal-dialog modal-lg"></div>')
        .append($('<div class="modal-content"></div>')
          .append($('<div class="modal-header"></div>')
            .append($('<h3></h3>').text(_('Fix file metadata'))))
          .append($('<form></form>')
            .append($('<div class="modal-body"></div>')
              .append($('<div class="row"></div>')
                .append($('<div class="col-sm-12"></div>')
                  .append(container))))
            .append($('<div class="modal-footer"></div>')
              .css('display', 'flex')
              .css('align-items', 'center')
              .append(copyToClipboard.css('margin-left', 0).css('margin-right', 0))
              .append(copyStatus.css('margin-left', 0).css('margin-right', 'auto'))
              .append(close)
              .append(select)))));
    dialog.appendTo($('#treeGrid'));
    return {
      dialog: dialog,
      container: container,
      select: select,
      copyStatus: copyStatus,
    };
  };

  self.initPasteMetadataDialog = function () {
    const dialog = $('<div class="modal fade"></div>');
    const close = $('<a href="#" class="btn btn-default" data-dismiss="modal"></a>').text(_('Close'));
    dialog
      .append($('<div class="modal-dialog modal-lg"></div>')
        .append($('<div class="modal-content"></div>')
          .append($('<div class="modal-header"></div>')
            .append($('<h3></h3>').text(_('Paste Metadata'))))
          .append($('<form></form>')
            .append($('<div class="modal-body"></div>')
              .append($('<div class="row"></div>')
                .append($('<div class="col-sm-12"></div>')
                  .append(_('Press Ctrl-V (Command-V) to paste.'))
                  .append($('<br/>'))
                  .append(_('[Why is this needed?] In this browser, retrieving clipboard values with ' +
                    'button operations is prohibited. Therefore, you must explicitly indicate clipboard operations ' +
                    'by using the shortcut key or by pasting in the browser menu.')))))
            .append($('<div class="modal-footer"></div>')
              .append(close)))));
    dialog.appendTo($('#treeGrid'));
    if (!self.pasteMetadataEvent) {
      self.pasteMetadataEvent = function pasteEvent(event) {
        event.preventDefault();
        if (!dialog.hasClass('in')) {
          return;
        }
        const text = (event.clipboardData || window.clipboardData).getData('text');
        self.setMetadataFromJson(text);
        dialog.modal('hide');
      }
      document.addEventListener('paste', self.pasteMetadataEvent);
    }
    return dialog;
  };

  self.initPasteMetadataDialog_mibyo = function () {
    const dialog = $('<div class="modal fade"></div>');
    const close = $('<a href="#" class="btn btn-default" data-dismiss="modal"></a>').text(_('Close'));
    const mibyoMessage = $('<div class="col-sm-12"></div>').css('color', 'red')
      .text(_('Please note that levels other than the currently displayed screen will be overwritten ' +
        'by user-defined metadata on the clipboard.'));

    dialog
      .append($('<div class="modal-dialog modal-lg"></div>')
        .append($('<div class="modal-content"></div>')
          .append($('<div class="modal-header"></div>')
            .append($('<h3></h3>').text(_('Paste Metadata'))))
          .append($('<form></form>')
            .append($('<div class="modal-body"></div>')
              .append($('<div class="row"></div>')
                .append($('<div class="col-sm-12"></div>')
                  .append(_('Press Ctrl-V (Command-V) to paste.'))
                  .append($('<br/>'))
                  .append(_('[Why is this needed?] In this browser, retrieving clipboard values with ' +
                    'button operations is prohibited. Therefore, you must explicitly indicate clipboard operations ' +
                    'by using the shortcut key or by pasting in the browser menu.'))
                  .append(mibyoMessage)
                )))
            .append($('<div class="modal-footer"></div>')
              .append(close)))));
    dialog.appendTo($('#treeGrid'));
    if (!self.pasteMetadataEvent) {
      self.pasteMetadataEvent = function pasteEvent(event) {
        event.preventDefault();
        if (!dialog.hasClass('in')) {
          return;
        }
        const text = (event.clipboardData || window.clipboardData).getData('text');
        self.setMetadataFromJson_mibyo(text);
        dialog.modal('hide');
      }
      document.addEventListener('paste', self.pasteMetadataEvent);
    }
    return dialog;
  };

  ////////////////////////////////////////
  /// 以下テストコード 20230516 
  ////////////////////////////////////////

  self.includePathInDraftRegistration2 = function (context, path, registration) {
    if (!registration.attributes) {
      return false;
    }
    if (!registration.attributes.registration_metadata) {
      return false;
    }
    const files = registration.attributes.registration_metadata['grdm-files'];
    if (!files) {
      return false;
    }
    if (!files.value) {
      return false;
    }
    const fileEntries = JSON.parse(files.value);
    const draftPath = context.nodeId === contextVars.node.id ? path : context.nodeId + '/' + path;
    return fileEntries.filter(function (file) {
      return file.path === draftPath;
    }).length > 0;
  };

  self.openDraftModal2 = function (currentMetadata) {
    console.log("openDraftModal2-----start");
    if (!self.selectDraftDialog) {
      self.selectDraftDialog = self.initSelectDraftDialog2();
    }
    console.log('openDraftModal2----------2');
    const activeItems = (currentMetadata.items || []).filter(function (item_) {
      return item_.active;
    });
    console.log('openDraftModal2----------3');
    var nextdata = $('<a href="#" class="btn btn-primary"></a>').text(_('NextData'));
    nextdata.click(self.selectDraftModal2);
    const targetItem = activeItems[0] || currentMetadata.items[0];
    const selector = self.createSchemaSelector_mib(targetItem);
    console.log('openDraftModal2----------4');
    self.currentSchemaId = selector.currentSchemaId;
    const reviewFields = $('<div></div>')
      .css('overflow-y', 'scroll')
      .css('height', '40vh');
    const draftSelection = $('<div></div>').text(_('Loading...'));
    console.log('openDraftModal2----------5');
    selector.schema.change(function (event) {
      self.currentSchemaId = event.target.value;
      self.prepareReviewFields(
        reviewFields,
        draftSelection,
        self.findSchemaById(self.currentSchemaId),
        targetItem
      );
    });
    console.log('openDraftModal2----------6');
    self.selectDraftDialog.select
      .text(_('Select'))
      .attr('disabled', true)
      .attr('data-dismiss', false);
    const message = $('<div></div>');
    message.text(_('file metadata registration mibyo'));
    console.log('openDraftModal2----------7');
    self.selectDraftDialog.container.append(nextdata);
    self.selectDraftDialog.container.empty();
    self.selectDraftDialog.container.append(selector.group);
    self.selectDraftDialog.container.append(message);
    self.selectDraftDialog.container.append(draftSelection);
    self.selectDraftDialog.container.append(reviewFields);
    self.selectDraftDialog.container.append(message);
    self.selectDraftDialog.container.append(message);
    self.selectDraftDialog.dialog.modal('show');
    console.log('openDraftModal2----------8');
    self.draftRegistrations.load(function () {
      self.prepareReviewFields(
        reviewFields,
        draftSelection,
        self.findSchemaById(self.currentSchemaId),
        targetItem
      );
    });
    console.log("openDraftModal2-----end");
  };

  self.selectDraftModal2 = function () {
    const filepath = self.registeringFilepath;
    const context = self.registeringContext;
    if (!filepath) {
      return;
    }
    self.registeringFilepath = null;
    self.registeringContext = null;
    const ops = [];
    (self.draftRegistrations.registrations || []).forEach(function (r) {
      const checkbox = self.selectDraftDialog.container.find('#draft-' + r.id);
      const checked = checkbox.is(':checked');
      const oldChecked = self.includePathInDraftRegistration2(context, filepath, r);
      if (checked == oldChecked) {
        return;
      }
      const link = self.selectDraftDialog.container.find('#draft-' + r.id + '-link');
      ops.push(self.updateRegistrationAsync(context, checked, filepath, r.id, link));
    });
    Promise.all(ops)
      .then(function (data) {
        console.log(logPrefix, 'updated: ', data);
        self.selectDraftDialog.select
          .text(_('Close'))
          .attr('data-dismiss', 'modal');
        self.draftRegistrations.load();
      })
      .catch(function (url, xhr, status, error) {
        Raven.captureMessage('Error while retrieving addon info', {
          extra: {
            url: url,
            status: status,
            error: error
          }
        });
      });
  };

  self.initSelectDraftDialog2 = function () {
    var close = $('<a href="#" class="btn btn-default" data-dismiss="modal"></a>').text(_('Close'));
    close.click(self.closeModal);
    var select = $('<a href="#" class="btn btn-success"></a>').text(_('Select'));
    select.click(self.selectDraftModal2);
    var container = $('<ul></ul>').css('padding', '0 20px');
    var dialog = $('<div class="modal fade"></div>')
      .append($('<div class="modal-dialog modal-lg"></div>')
        .css('width', '92%')
        .append($('<div class="modal-content"></div>')
          .append($('<div class="modal-header"></div>')
            .append($('<h3></h3>').text(_('Select a destination for file metadata registration mibyo'))))
          .append($('<form></form>')
            .append($('<div class="modal-body"></div>')
              .append($('<div class="row"></div>')
                .append($('<div class="col-sm-12"></div>')
                  .append(container))))
            .append($('<div class="modal-footer"></div>')
              .append(close).append(select)))));
    dialog.appendTo($('#treeGrid'));
    return { dialog: dialog, container: container, select: select };
  };


  /**
   * 未病データベース構築プロトタイプ ダイアログ作成
   */
  self.editMetadata2 = function (context, filepath, item, pageno, predialog) {
    var dialog = null;
    console.log('editMetadata2 ---------- ' + filepath);
    console.log('editMetadata2 ---context.nodeId------- ' + context.nodeId);

    if (predialog) {
      predialog.modal('hide');
    }

    //20230614 ページのボタン設定用にスキーマ情報を取得
    console.log(logPrefix, 'edit metadata: ', filepath, item);
    self.currentItem = item;
    var currentMetadata = self.findMetadataByPath(context.nodeId, filepath);
    //const currentMetadata = self.findMetadataByPath(context.nodeId, filepath);
    if (!currentMetadata) {
      self.lastMetadata = {
        path: filepath,
        folder: item.kind === 'folder',
        items: [],
      };
      console.log('editMetadata2-----currentMetadata_nothong---------- ');
      
      //リトライする
      currentMetadata = self.findMetadataByPath(context.nodeId, filepath);
      if (!currentMetadata) {
        self.lastMetadata = {
          path: filepath,
          folder: item.kind === 'folder',
          items: [],
        };
        console.log('editMetadata2-----currentMetadata_nothong---------- ');
      }  

    } else {
      self.lastMetadata = Object.assign({}, currentMetadata);
      console.log('editMetadata2-----currentMetadata_----------');
    }

    self.editingContext = context;
    //20230614 下に移動 chg honda  -->
    // dialog.toolbar.empty();
    // dialog.container.empty();
    // dialog.copyStatus.text('');
    //20230614 下に移動 chg honda  <--
    const fieldContainer = $('<div></div>');
    const activeItems = (self.lastMetadata.items || []).filter(function (item_) {
      return item_.active;
    });
    const targetItem = activeItems[0] || {};

    const selector = self.createSchemaSelector_mib(targetItem);
    self.currentSchemaId = selector.currentSchemaId;
    console.log('currentSchemaId==========---------- ' + self.currentSchemaId);
    //セレクターのチェンジイベント
    selector.schema.change(function (event) {
      if (event.target.value == self.currentSchemaId) {
        return;
      }
      self.currentSchemaId = event.target.value;
      self.prepareFields2(
        context,
        fieldContainer,
        self.findSchemaById(self.currentSchemaId),
        filepath,
        item,
        {},
        PageTransitionEvent
      );
    })

    var schema = self.findSchemaById(self.currentSchemaId);
    console.log('currentSchemaIdからfindSchemaByIdでschemaを取得==========---------- '+JSON.stringify(schema));
    var nextbtnFlg = false;
    var returnbtnFlg = false;
    var repossessionbtnFlg = false;
    var nextpage = pageno;
    var prepage = pageno;
    var titleMib = '';
    var extension = filepath.substring(filepath.lastIndexOf('.') + 1)
    var maxpage = pageno;
    const strPageno = 'page' + pageno;

    (schema.attributes.schema.pages || []).forEach(function (page) {
      //不正なページ番号チェック
      if (page.id) {
        var tmpPgid = Number(page.id.replace('page', ''))
        if (Number(maxpage) < tmpPgid) {
          // console.log('z================================='+maxpage);
          // console.log('z================================='+page.id.replace('page',''));
          maxpage = page.id.replace('page', '');
        }
      }
      if (!page.id || !(page.id == strPageno)) {
        return;
      }
      nextbtnFlg = page.nextbtn;
      returnbtnFlg = page.returnbtn;
      repossessionbtnFlg = page.repossessionbtn;
      nextpage = page.nextpage;
      prepage = page.prepage;
      titleMib = page.title;

      //次ページがファイル系だった場合
      (page.branchbytype || []).forEach(function (item) {
        if (item.type.includes(extension)) {
          nextpage = item.nextpage;
        }
      });

      //前ページがファイル系だった場合
      (page.branchbytypepre || []).forEach(function (item) {
        if (item.type.includes(extension)) {
          prepage = item.nextpage;
        }
      });

    });

    //不正なページ番号チェック
    if (!nextpage) {
      nextpage = pageno;
    }
    if (!prepage) {
      prepage = pageno;
    }
    if (maxpage < nextpage) {
      nextpage = pageno;
    }
    if (maxpage < prepage) {
      prepage = pageno;
    }
    // console.log('nextpage================================='+nextpage);
    // console.log('prepage=================================='+prepage);

    //20230803　追加 -->
    //保持したメタデータから画面メタデータに戻す
    metadata_return();
    // if (self.lastMetadata_hold)
    // {
    //   (self.lastFields || []).forEach(function(fieldSet2) {
    //     (self.lastMetadata_hold || []).forEach(function(fieldSet) {      
    //       if (fieldSet.question.qid == fieldSet2.question.qid)
    //       {
    //         fieldSet2.input = fieldSet.input;
    //       }  
    //     });
    //   });
    // }  
    //20230803　追加 <--

    // nextbtnFlg = true;
    // returnbtnFlg = true;
    // repossessionbtnFlg = false;      

    //20230614 ↑から移動 chg honda  -->
    if ((context.projectMetadata || {}).editable) {
      titleMib = getLocalizedText(titleMib, true);
      // 20230809 add fieldContainer KWT
      self.editMetadataDialog = self.initEditMetadataDialog2(fieldContainer, true, context, filepath, item, pageno, nextbtnFlg, returnbtnFlg, repossessionbtnFlg, nextpage, prepage, titleMib);
      dialog = self.editMetadataDialog;
    } else {
      if (!self.viewMetadataDialog) {
        titleMib = getLocalizedText(titleMib, false);
        // 20230809 add fieldContainer KWT
        self.viewMetadataDialog = self.initEditMetadataDialog2(fieldContainer, false, context, filepath, item, 2, nextbtnFlg, returnbtnFlg, repossessionbtnFlg, nextpage, prepage, titleMib);
      }
      dialog = self.viewMetadataDialog;
    }
    //20230614 ↑から移動 chg honda  -->

    //20230614 ↑から移動 chg honda  -->
    dialog.toolbar.empty();
    dialog.container.empty();
    dialog.copyStatus.text('');
    //20230614 ↑から移動 chg honda  -->
    dialog.toolbar.append(selector.group);
    if ((context.projectMetadata || {}).editable) {
      const pasteButton = $('<button></button>')
        .addClass('btn btn-default')
        .css('margin-right', 0)
        .css('margin-left', 'auto')
        .append($('<i></i>').addClass('fa fa-paste'))
        .append(_('Paste from Clipboard'))
        .attr('type', 'button')
        .on('click', self.pasteFromClipboard_mibyo);
      dialog.toolbar.append($('<div></div>')
        .css('display', 'flex')
        .append(pasteButton));
    }
    self.prepareFields2(
      context,
      fieldContainer,
      self.findSchemaById(self.currentSchemaId),
      filepath,
      item,
      {},
      pageno
    );

    //20230803　追加 -->
    if (!self.lastMetadata_hold) {
      //20230920 これで全データ酒盗できるか
      var lastMetadataItem = {};
      lastMetadataItem = (self.lastMetadata.items || []).filter(function (item) {
        const resolved = self.resolveActiveSchemaId(item.schema) || self.currentSchemaId;
        return resolved === schema.id;
      })[0] || {};

      self.lastMetadata_hold = [];
      const errorContainer = $('<div></div>').css('color', 'red').hide();
      //const itemData = options.multiple ? {} : item.data || {};
      (schema.attributes.schema.pages || []).forEach(function (page) {
        (page.questions || []).forEach(function (question) {
          if (!question.qid || !question.qid.match(/^grdm-file:.+/)) {
            return;
          }          
          
          const value = (lastMetadataItem.data) ? lastMetadataItem.data[question.qid] : item.data[question.qid];
          //const value = item.data[question.qid];
          const field = metadataFields.createField(
            self.erad,
            question,
            value,
            {
              readonly: !((context.projectMetadata || {}).editable),
              multiple: null,
              context: context,
              filepath: filepath,
              wbcache: context.wvcache,
              fileitem: item
            },
            self.fieldsChanged
          );
          console.log('int_lastmetadata_hold=================================q.id:'+question.qid);
          //console.log('int_lastmetadata_hold================================value:'+JSON.stringify(value));
          console.dir(value);
          //console.log('int_lastmetadata_hold================================field:'+field);

          const input = field.addElementTo(fieldContainer, errorContainer);

          self.lastMetadata_hold.push({
            field: field,
            question: question,
            input: input,
            lastError: null,
            errorContainer: errorContainer
          });
        });
      });
      //metadata_return();//20230920 初期化時にももどす？？
    }
    //20230803　追加 <--

    //20230920 逆にしてみる --> 良さそ-->クリップがだめ
    self.prepareFields2(
      context,
      fieldContainer,
      self.findSchemaById(self.currentSchemaId),
      filepath,
      item,
      {},
      pageno
    );

    // metadata_hold();

    dialog.container.append(fieldContainer);
    dialog.dialog.modal('show');
    //dialog.modal('show');
  };
  /**
   * Create the Edit Metadata dialog.
   */
  self.initEditMetadataDialog2 = function (fieldContainer, editable, context, filepath, item, pageno, nextbtnFlg, returnbtnFlg, repossessionbtnFlg, nextpage, prepage, titleMib, skip_page) {
    console.log('initEditMetadataDialog2****************************************');
    const dialog = $('<div class="modal fade" data-backdrop="static"></div>');
    const close = $('<a href="#" class="btn btn-default" data-dismiss="modal"></a>').text(_('Close'));
    close.click(self.closeModal);
    var save = $('<span></span>');
    if (editable) {
      save = $('<a href="#" class="btn btn-success"></a>').text(_('Save'));
      save.click(function () {
        //画面メタデータを保持メタデータにセット
        metadata_hold();//20230912不要か？20230915復活させてみる

        osfBlock.block();
        self.saveEditMetadataModal_mibyo()
          .finally(function () {
            osfBlock.unblock();
            $(dialog).modal('hide');
          })
      });
    }

    const message = $('<div></div>');
    message.text(_('file metadata registration mibyo'));

    var nextbtn = $('<span></span>');
    nextbtn = $('<a href="#" align="right" class="btn btn-primary"></a>').text(_('NextData'));
    nextbtn.click(function () {
      pageno = nextpage;
      //pageno = pageno + 1;

      //20230803　追加 -->
      //画面メタデータを保持メタデータにセット
      metadata_hold();//20230912不要か？20230915復活させてみる

      //画面遷移時に保存する
      osfBlock.block();
      self.saveEditMetadataModal_mibyo()
        .finally(function () {
          osfBlock.unblock();

        //20230803　追加 <--
        self.editMetadata2(context, filepath, item, pageno, dialog)
          .finally(function () {
            //osfBlock.unblock();
            $(dialog).modal('hide');
          });
        })
      // //20230803　追加 <--
      // self.editMetadata2(context, filepath, item, pageno, dialog)
      //   .finally(function () {
      //     //osfBlock.unblock();
      //     $(dialog).modal('hide');
      //   });
    });

    var returnbtn = $('<span></span>');
    returnbtn = $('<a href="#" align="right" class="btn btn-default"></a>').text(_('ReturnData'));
    returnbtn.click(function () {
      //pageno = pageno - 1;
      pageno = prepage;

      //20230803　追加 -->
      //画面メタデータを保持メタデータにセット
      metadata_hold();//20230912不要か？20230915復活させてみる

      //画面遷移時に保存する
      osfBlock.block();
      self.saveEditMetadataModal_mibyo()
        .finally(function () {
          osfBlock.unblock();
          self.editMetadata2(context, filepath, item, pageno, dialog)
          .finally(function () {
            //osfBlock.unblock();
            $(dialog).modal('hide');
          });  
        })
      //20230803　追加 <--

      // self.editMetadata2(context, filepath, item, pageno, dialog)
      //   .finally(function () {
      //     //osfBlock.unblock();
      //     $(dialog).modal('hide');
      //   });
    });

    var repossessionbtn = $('<span></span>');
    repossessionbtn = $('<a href="#" align="right" class="btn btn-info"></a>').text(_('RepossessionData'));
    repossessionbtn.click(function () {
      // console.log(fieldContainer);  
      //再取得処理
      console.log('repossessionProc----->start' + filepath);
      repossessionProc(fieldContainer, context, filepath, item)

      // console.log(new Date);
      // const ms = 3000;
      // setTimeout(() => {
      //   repossessionProc(fieldContainer, context, filepath, item);
      // }, ms);
      console.log('repossessionProc----->end' + filepath);
    });

    // if (pageno == '2') {
    //   console.log('repossessionProc----->empty' + filepath);
    //   repossessionProc(fieldContainer, context, filepath, item);
    // }

    var hedderbtn = $('<div align="right" ></div>')
    if (returnbtnFlg == true) {
      hedderbtn.append(returnbtn);
    }
    if (repossessionbtnFlg == true) {
      hedderbtn.append(repossessionbtn);
    }
    if (nextbtnFlg == true) {
      hedderbtn.append(nextbtn);
    }

    const copyToClipboard = $('<button class="btn btn-default"></button>')
      .append($('<i></i>').addClass('fa fa-copy'))
      .append(_('Copy to clipboard'))
      .attr('type', 'button');
    const copyStatus = $('<div></div>')
      .css('text-align', 'left');
    copyToClipboard.on('click', function (event) {
      self.copyToClipboard_mibyo(event, copyStatus);
      //self.copyToClipboard(event, copyStatus);
    });
    const toolbar = $('<div></div>');
    const container = $('<ul></ul>').css('padding', '0 20px');
    var notice = $('<span></span>');
    if (editable) {
      notice = $('<div></div>')
        .css('text-align', 'left')
        .css('padding', '0.2em 0.2em 0.2em 1em')
        .css('color', 'red')
        .text(_('Renaming, moving the file/directory, or changing the directory hierarchy can break the association of the metadata you have added.'));
    }
    createDialog(context, filepath, item, dialog, editable, hedderbtn, toolbar, container, copyToClipboard, copyStatus, notice, close, save, titleMib, pageno, false);

    $(window).on('beforeunload', function () {
      if ($(dialog).data('bs.modal').isShown) {
        return _('You have unsaved changes.');
      }
    });

    dialog.appendTo($('#treeGrid'));
    return {
      dialog: dialog,
      container: container,
      toolbar: toolbar,
      copyStatus: copyStatus,
    };
  };

  /**再取得処理メイン
   * 2023-08-23 R&D honda
   */
  function repossessionProc(fieldContainer, context, filepath, item) {
    //データ種別、全サイズ、全フォルダ数、全ファイル数、最大階層数
    var extension = filepath.substring(filepath.lastIndexOf('.') + 1)
    console.log('filepath----->' + filepath);
    context.wbcache.searchFile(filepath, function (file) {
      console.log('file----->' + file);
      console.log('file.date----->' + file.data);
      console.log(file.data.links.upload);
      var fileSize = 0;
      var fileCount = 0;
      var folderCount = 0;
      var maximumNumberOfLayers = 0;
      var root = file.data.materialized;
      var LinksDownload = file.data.links.download;
      var fileSize_Text = 0;

      if (file.children.length > 0) {
        console.log('file.children.length----->' + file.children.length);
        function processFile(file) {
          (file.children || []).forEach(function (child) {
            fileSize += child.data.size;

            if (child.kind != 'folder') {
              fileCount += 1;
            }

            if (child.kind == 'folder') {
              folderCount += 1;
              const segments = child.data.materialized.replace(/^\/|\/$/g, '').split('/');
              if (root) {
                const rootSegments = root.replace(/^\/|\/$/g, '').split('/');
                segments.splice(0, rootSegments.length);
              }
              maximumNumberOfLayers = (segments.length > maximumNumberOfLayers) ? segments.length : maximumNumberOfLayers;
            }

            if (child.kind == 'file') {
              fileSize_Text = file.data.size;
              LinksDownload = file.data.links.download;
              console.log(LinksDownload);

              try {
                $(window).load(LinksDownload, function (data) {
                  console.log(data);
                });
              }
              catch (e) {
                console.log(e);
              }
            }

            processFile(child);
          });
        }

        processFile(file);

      } else {
        fileSize = file.data.size;
      }

      //Data-type-11　データ種別
      fieldContainer.find('input[name="data-type-11"]').val(extension);
      //All-sizes-0　全サイズ
      fieldContainer.find('input[name="all-sizes-0"]').val(formatBytes(fileSize));
      //All-sizes-1　全フォルダ数
      fieldContainer.find('input[name="all-sizes-1"]').val(folderCount);
      //All-sizes-2　全ファイル数
      fieldContainer.find('input[name="all-sizes-2"]').val(fileCount);
      //All-sizes-3　最大改装数
      fieldContainer.find('input[name="all-sizes-3"]').val(maximumNumberOfLayers);

      //Data-size-15  任意-データサイズ
      fieldContainer.find('input[name="data-sizes-15"]').val(fileSize_Text);

      var filePathLinkDownload = LinksDownload;
      var textColumn = 0;
      var textRow = 0;
      var colors;
      var ImageTypeName = "";

      if ((extension == 'txt') || (extension == 'csv') || (extension == 'tsv')) {
        fetch(filePathLinkDownload, { credentials: 'include' })
          .then(function(response) {
              return response.text();
          })
          .then(function(data) {        
        // fetch(filePathLinkDownload, { credentials: 'include' })
        //   .then((response) => response.text())
        //   .then((data) => {
            var splits = getSplit(extension, data);
            var csvArray = [];
            var lines = data.split(/\r\n|\n/);
            for (var i = 0; i < lines.length; ++i) {
              var cells = lines[i].split(splits.str);
              if (cells.length != 1) {
                csvArray.push(cells);
              }
              if (textColumn < cells.length) {
                textColumn = cells.length;
              }
            }
            // console.log(textColumn);            
            // console.log(lines.length);            
            // console.log(csvArray);
            if (lines.length > 0) {
              var minus = 0;
              if (lines[lines.length - 1] < 1) {
                minus = 1;
              }
              textRow = lines.length - minus;
            }

            var sameKindFileCountText = 0;
            //ファイルか？フォルダか？を取得
            var typeStr = getFileOrFolder(context, filepath);
            if (typeStr == 'file') {
              var folderPath = filepath.split("/").reverse().slice(1).reverse().join("/");
              //同一拡張子の数をカウント
              // for (var icnt =1; icnt < 40; icnt++){
                // sameKindFileCountText = getSamekindFile(context, folderPath, extension);
              //   if (sameKindFileCountText > 0) { break;}
              // }    
              sameKindFileCountText = getSamekindFile(context, folderPath, extension, fieldContainer);
              //sameKindFileCountText = getSamekindFile(context, folderPath, extension);
              console.log('sameKindFileCountText----->' + sameKindFileCountText);
            }

            //文字コードを取得する
            var stringCode = jschardet.detect(data).encoding;
            console.log("stringCode---------->>>>>" + stringCode);

            //Number-of-rows-columns-files-jp-6-0 //テキスト-jp-行数
            fieldContainer.find('input[name="number-of-rows-columns-files-jp-6-0"]').val(textRow);
            //Number-of-rows-columns-files-jp-6-1 //テキスト-jp-列数
            fieldContainer.find('input[name="number-of-rows-columns-files-jp-6-1"]').val(textColumn);
            //Number-of-rows-columns-files-jp-6-2 //テキスト-jp-本形式のファイル数
            // fieldContainer.find('input[name="number-of-rows-columns-files-jp-6-2"]').val(sameKindFileCountText);//取得が0になったためgetSamekindFile処理の中へ移動しました
            //Number-of-rows-columns-files-en-6-0 //テキスト-en-行数
            fieldContainer.find('input[name="number-of-rows-columns-files-en-6-0"]').val(textRow);
            //Number-of-rows-columns-files-en-6-1 //テキスト-en-列数
            fieldContainer.find('input[name="number-of-rows-columns-files-en-6-1"]').val(textColumn);
            //Number-of-rows-columns-files-en-6-2 //テキスト-en-本形式のファイル数
            // fieldContainer.find('input[name="number-of-rows-columns-files-en-6-2"]').val(sameKindFileCountText); //取得が0になったためgetSamekindFile処理の中へ移動しました
            //Number-of-rows-columns-files-9 //任意-本形式のファイル数
            // fieldContainer.find('input[name="number-of-rows-columns-files-9 "]').val(sameKindFileCountText);

            //Delimiter　区切り文字
            fieldContainer.find('input[name="delimiter"]').val(splits.nameJp);
            //Character-code　文字コード
            fieldContainer.find('input[name="character-code"]').val(stringCode);
            //Number-of-lines12-0  テキスト-行数
            fieldContainer.find('input[name="number-of-lines12-0"]').val(textRow);
            //Number-of-lines12-1　テキスト-列数 
            fieldContainer.find('input[name="number-of-lines12-1"]').val(textColumn);
            //Number-of-lines12-2  テキスト-同種のファイル数
            // fieldContainer.find('input[name="number-of-lines12-2"]').val(sameKindFileCountText);　//取得が0になったためgetSamekindFile処理の中へ移動しました

            //fieldContainer.find('input[name="number-of-lines6-alias-0"]').val(lines);
            // callback(null, lines); 
          })
          .catch(function(error) {
            // callback(error);
          });
          // .catch(error => {
          //   // callback(error);
          // });

      } else if ((extension == 'xlsx') || (extension == 'xls')) {
        var sameKindFileCountExcel = 0;
        //ファイルか？フォルダか？を取得
        var typeStr = getFileOrFolder(context, filepath);
        console.log('typeStr----->' + typeStr);
        if (typeStr == 'file') {
          console.log('filepath----->' + filepath);
          var folderPath = filepath.split("/").reverse().slice(1).reverse().join("/");
          console.log('folderPath----->' + folderPath);
          //同一拡張子の数をカウント
          // for (var icnt =1; icnt < 10; icnt++){
            // sameKindFileCountExcel = getSamekindFile(context, folderPath, extension);
            // if (sameKindFileCountExcel > 0) { break;}
          // }
          sameKindFileCountExcel = getSamekindFile(context, folderPath, extension, fieldContainer);
          console.log('sameKindFileCountExcel----->' + sameKindFileCountExcel);
        }

        //Number-of-rows-columns-files-jp-7-2 //エクセル-jp-本形式のファイル数
        // fieldContainer.find('input[name="number-of-rows-columns-files-jp-7-2"]').val(sameKindFileCountExcel);
        //Number-of-rows-columns-files-en-7-2 //エクセル-en-本形式のファイル数
        // fieldContainer.find('input[name="number-of-rows-columns-files-en-7-2"]').val(sameKindFileCountExcel);
        //Number-of-lines-13-2  エクセル-同種のファイル数
        // fieldContainer.find('input[name="number-of-lines-13-2"]').val(sameKindFileCountExcel);

        var excelInfo;
        fetch(filePathLinkDownload, { credentials: 'include' })
          .then(function(response) {
            return response.arrayBuffer();
          })
          .then(function(Data) {
        // fetch(filePathLinkDownload, { credentials: 'include' })
        // .then((response) => response.arrayBuffer())
        // .then((Data) => {
            console.log('ExcelData----->' + JSON.stringify(Data));
            console.log('ExcelData----->' + Data);
            excelInfo = getExcelInfomation(Data);
            //Number-of-rows-columns-files-jp-7-0 //エクセル-jp-行数
            fieldContainer.find('input[name="number-of-rows-columns-files-jp-7-0"]').val(excelInfo.rows);
            //Number-of-rows-columns-files-jp-7-1 //エクセル-jp-列数
            fieldContainer.find('input[name="number-of-rows-columns-files-jp-7-1"]').val(excelInfo.cols);

            //Number-of-rows-columns-files-en-7-0 //エクセル-en-行数
            fieldContainer.find('input[name="number-of-rows-columns-files-en-7-0"]').val(excelInfo.rows);
            //Number-of-rows-columns-files-en-7-1 //エクセル-en-列数
            fieldContainer.find('input[name="number-of-rows-columns-files-en-7-1"]').val(excelInfo.cols);

            //Number-of-lines-13-0  エクセル-行数
            fieldContainer.find('input[name="number-of-lines-13-0"]').val(excelInfo.rows);
            //Number-of-lines-13-1　エクセル-列数 
            fieldContainer.find('input[name="number-of-lines-13-1"]').val(excelInfo.cols);
          })
          .catch(function(error) {
            // callback(error);
          });

      } else if ((extension == 'jpg') || (extension == 'jpeg') || (extension == 'tif') || (extension == 'jng') || (extension == 'bmp')) {

        var sameKindFileCountImage = 0;
        //ファイルか？フォルダか？を取得
        var typeStr = getFileOrFolder(context, filepath);
        console.log('typeStr----->' + typeStr);
        if (typeStr == 'file') {
          console.log('filepath----->' + filepath);
          var folderPath = filepath.split("/").reverse().slice(1).reverse().join("/");
          console.log('folderPath----->' + folderPath);
          //同一拡張子の数をカウント
          // for (var icnt =1; icnt < 15; icnt++){
            sameKindFileCountImage = getSamekindFile(context, folderPath, extension, fieldContainer);
          //   if (sameKindFileCountImage > 0) { break;}
          // }    
          //sameKindFileCountImage = getSamekindFile(context, folderPath, extension);
          console.log('sameKindFileCountText----->' + sameKindFileCountImage);
        }

        //Number-of-files-of-the-same-type //画像-本形式のファイル数
        // fieldContainer.find('input[name="number-of-files-of-the-same-type"]').val(sameKindFileCountImage);　//取得が0になったためgetSamekindFile処理の中へ移動しました
        //Number-of-files-of-the-same-type-14 //画像-本形式のファイル数
        // fieldContainer.find('input[name="number-of-files-of-the-same-type-14"]').val(sameKindFileCountImage);　//取得が0になったためgetSamekindFile処理の中へ移動しました

        fetch(filePathLinkDownload, { credentials: 'include' })
          .then(function(response) {
            return response.arrayBuffer();
          })
          .then(function(imageArray) {
        // fetch(filePathLinkDownload, { credentials: 'include' })
        // .then((response) => response.arrayBuffer())
        // .then((imageArray) => {
            ImageTypeName = getImageType(imageArray);
            console.log(ImageTypeName);
            //Image-Type-14 //画像タイプ
            fieldContainer.find('input[name="image-type-14"]').val(ImageTypeName);

          })
          .catch(function(error) {
            // callback(error);
          });

        fetch(filePathLinkDownload, { credentials: 'include' })
          .then(function(response) {
            return response.blob();
          })
          .then(function(imageData) {
        // fetch(filePathLinkDownload, { credentials: 'include' })
        // .then((response) => response.blob())
        // .then((imageData) => {
            //console.log(imageData);              
            colors = getImageInfo(imageData, fieldContainer, false);
            console.log(colors);
            //Color-B&W-14 //画像カラー/モノクロ
            //fieldContainer.find('input[name="color-b&w-14"]').val(ImageTypeName);
          })
          .catch(function(error) {
            // callback(error);
          });

      } else {
        var sameKindFileCountOther = 0;
        //ファイルか？フォルダか？を取得
        var typeStr = getFileOrFolder(context, filepath);
        if (typeStr == 'file') {
          var folderPath = filepath.split("/").reverse().slice(1).reverse().join("/");
          console.log('folderPath---extension--->' + folderPath + ':' + extension);
          //同一拡張子の数をカウント
          // for (var icnt =1; icnt < 20; icnt++){
          //   sameKindFileCountOther = getSamekindFile(context, folderPath, extension);
          //   console.log('sameKindFileCountOther----->' + sameKindFileCountOther);
          //   if (sameKindFileCountOther > 0) { break;}
          // }    
          sameKindFileCountOther = getSamekindFile(context, folderPath, extension, fieldContainer);
          //sameKindFileCountOther = getSamekindFile(context, folderPath, extension);
          console.log('sameKindFileCountOther----->' + sameKindFileCountOther);
        }

        //Number-of-rows-columns-files-9-2 //任意-同種のファイル数  
        // fieldContainer.find('input[name="number-of-rows-columns-files-9-2"]').val(sameKindFileCountOther);
        //Number-of-lines-15-2  任意-同種のファイル数    
        // fieldContainer.find('input[name="number-of-lines-15-2"]').val(sameKindFileCountOther);

        //テキスト系情報の取得
        console.log('sameKindFile-----filePathLinkDownload----->' + JSON.stringify(filePathLinkDownload));        
        fetch(filePathLinkDownload, { credentials: 'include' })
          .then(function(response) {
            return response.text()
          })
          .then(function(data) {
        // fetch(filePathLinkDownload, { credentials: 'include' })
        //   .then((response) => response.text())
        //   .then((data) => {

            console.log('sameKindFile-----data----->' + JSON.stringify(data));

            //文字コードを取得する
            var stringCode = jschardet.detect(data).encoding;
            console.log("stringCode---------->>>>>" + stringCode);

            var splits = getSplit(extension, data);
            console.log('sameKindFile-----splits----->' + JSON.stringify(splits));
            var csvArray = [];
            var lines = data.split(/\r\n|\n/);
            console.log('sameKindFile-----LineLenght----->' + lines.length);
            for (var i = 0; i < lines.length; ++i) {
              var cells = lines[i].split(splits.str);
              if (cells.length != 1) {
                csvArray.push(cells);
              }
              if (textColumn < cells.length) {
                textColumn = cells.length;
              }
            }
            if (lines.length > 0) {   
              var minus = 0;
              if (lines[lines.length - 1] < 1) {
                minus = 1;
              }
              textRow = lines.length - minus;
            }

            //Number-of-rows-columns-files-9-0 //任意-行数
            fieldContainer.find('input[name="number-of-rows-columns-files-9-0"]').val(textRow);
            //Number-of-rows-columns-files-9-1 //任意-列数
            fieldContainer.find('input[name="number-of-rows-columns-files-9-1"]').val(textColumn);
            //Delimiter-15  任意-区切り文字
            fieldContainer.find('input[name="delimiter-15"]').val(splits.nameJp);
            //Character code-15  任意-文字コード          
            console.log("stringCode2---------->>>>>" + stringCode);
            fieldContainer.find('input[name="character-code-15"]').val(stringCode);
            fieldContainer.find('input[name="character code-15"]').val(stringCode);
            //Number-of-lines-15-0  任意-行数
            fieldContainer.find('input[name="number-of-lines-15-0"]').val(textRow);
            //Number-of-lines-15-1  任意-列数
            fieldContainer.find('input[name="number-of-lines-15-1"]').val(textColumn);

            // callback(null, lines); 
          })
          .catch(function(error) {
            console.log("stringCode---------->>>>>" + error);
            // callback(error);
          });        

        //画像タイプの取得
        fetch(filePathLinkDownload, { credentials: 'include' })
          .then(function(response) {
            return response.arrayBuffer();
          })
          .then(function(imageArray) {
        // fetch(filePathLinkDownload, { credentials: 'include' })
        // .then((response) => response.arrayBuffer())
        // .then((imageArray) => {
            ImageTypeName = getImageType(imageArray);
            console.log(ImageTypeName);
            if (ImageTypeName != 'unknown') {
              //Image-Type-15  任意-画像タイプ
              fieldContainer.find('input[name="image-type-15"]').val(ImageTypeName);
            }
          })
          .catch(function(error) {
            // callback(error);
          });

        //画像情報を取得
        fetch(filePathLinkDownload, { credentials: 'include' })
          .then(function(response) {
            return response.blob();
          })
          .then(function(imageData) {
            //画像のカラーモノクロ情報を取得する
            getImageInfo(imageData, fieldContainer, true);
            //画像のEXIF情報を取得する（解像度）
            getExifInfomation(imageData, fieldContainer);
          })
          .catch(function(error) {
            // callback(error);
          });        

        // //Number-of-rows-columns-files-9-2 //任意-同種のファイル数  
        // fieldContainer.find('input[name="number-of-rows-columns-files-9-2"]').val(sameKindFileCountOther);
        // //Number-of-lines-15-2  任意-同種のファイル数    
        // fieldContainer.find('input[name="number-of-lines-15-2"]').val(sameKindFileCountOther);

        //ファイルのバイナリを取得して0を確認してテキストバイナリ判定
        var buffer;
        // fetch(filePathLinkDownload, { credentials: 'include' })
        //   .then(function (response) {
        //     return response.body;
        //   })
        //   .then(function(rb) {
        // // fetch(filePathLinkDownload, { credentials: 'include' })
        // // .then(response => response.body)
        // // .then(rb => {
        //     const reader = rb.getReader();
        //     return new ReadableStream({
        //       start: function(controller) {
        //         function push() {
        //           reader.read().then(function( done, value ) {
        //             if (done) {
        //               controller.close();
        //               return;
        //             }
        //             controller.enqueue(value);
        //             push();
        //           })
        //         }
        //         push();
        //       }
        //     })
        //   })
        //   .then(function(stream) { 
        //     return new Response(stream);
        //   })
        //   .then(function(response) {
        //     return response.arrayBuffer();
        //   })
        //   .then(function(buffer) {
        //     var ba = new Uint8Array(buffer);
        //   // .then(stream => new Response(stream))
        //   // .then(response => response.arrayBuffer())
        //   // .then(buffer => {
        //     //new Uint8Array(buffer));
        //     var binaryFlg = false;
        //     console.log('----------buffer:' + ba);
        //     (ba || []).forEach(function (item) {
        //       if (item == 0) {
        //         binaryFlg = true;
        //       }
        //     });

        //     var strBinaryText = "テキスト";
        //     if (binaryFlg) {

        //       strBinaryText = 'バイナリ';
        //       var stringCode = '';
        //       //Number-of-rows-columns-files-9-0 //任意-行数
        //       fieldContainer.find('input[name="number-of-rows-columns-files-9-0"]').val(stringCode);
        //       //Number-of-rows-columns-files-9-1 //任意-列数
        //       fieldContainer.find('input[name="number-of-rows-columns-files-9-1"]').val(stringCode);
        //       //Delimiter-15  任意-区切り文字
        //       fieldContainer.find('input[name="delimiter-15"]').val(stringCode);
        //       //Character code-15  任意-文字コード          
        //       fieldContainer.find('input[name="character-code-15"]').val(stringCode);
        //       fieldContainer.find('input[name="character code-15"]').val(stringCode);  
        //       //Number-of-lines-15-0  任意-行数
        //       fieldContainer.find('input[name="number-of-lines-15-0"]').val(stringCode);
        //       //Number-of-lines-15-1  任意-列数
        //       fieldContainer.find('input[name="number-of-lines-15-1"]').val(stringCode);

        //     } else {
        //       fetch(filePathLinkDownload, { credentials: 'include' })
        //       .then(function(response) {
        //         return esponse.text();
        //       })
        //       .then(function(data) {
        //       // fetch(filePathLinkDownload, { credentials: 'include' })
        //       // .then((response) => response.text())
        //       // .then((data) => {
    
        //         console.log('sameKindFile-----data----->' + JSON.stringify(data));
    
        //         //文字コードを取得する
        //         var stringCode = jschardet.detect(data).encoding;
        //         console.log("stringCode---------->>>>>" + stringCode);
    
        //         var splits = getSplit(extension, data);
        //         console.log('sameKindFile-----splits----->' + JSON.stringify(splits));
        //         var csvArray = [];
        //         var lines = data.split(/\r\n|\n/);
        //         console.log('sameKindFile-----LineLenght----->' + lines.length);
        //         for (var i = 0; i < lines.length; ++i) {
        //           var cells = lines[i].split(splits.str);
        //           if (cells.length != 1) {
        //             csvArray.push(cells);
        //           }
        //           if (textColumn < cells.length) {
        //             textColumn = cells.length;
        //           }
        //         }
        //         if (lines.length > 0) {   
        //           var minus = 0;
        //           if (lines[lines.length - 1] < 1) {
        //             minus = 1;
        //           }
        //           textRow = lines.length - minus;
        //         }
    
        //         //Number-of-rows-columns-files-9-0 //任意-行数
        //         fieldContainer.find('input[name="number-of-rows-columns-files-9-0"]').val(textRow);
        //         //Number-of-rows-columns-files-9-1 //任意-列数
        //         fieldContainer.find('input[name="number-of-rows-columns-files-9-1"]').val(textColumn);
        //         //Delimiter-15  任意-区切り文字
        //         fieldContainer.find('input[name="delimiter-15"]').val(splits.nameJp);
        //         //Character code-15  任意-文字コード          
        //         console.log("stringCode2---------->>>>>" + stringCode);
        //         fieldContainer.find('input[name="character-code-15"]').val(stringCode);
        //         fieldContainer.find('input[name="character code-15"]').val(stringCode);
        //         //Number-of-lines-15-0  任意-行数
        //         fieldContainer.find('input[name="number-of-lines-15-0"]').val(textRow);
        //         //Number-of-lines-15-1  任意-列数
        //         fieldContainer.find('input[name="number-of-lines-15-1"]').val(textColumn);
    
        //         // callback(null, lines); 
        //       })
        //       .catch(function(error) {
        //         console.log("stringCode---------->>>>>" + error);
        //         // callback(error);
        //       });                      
        //     }

        //     //Text/Binary  任意-テキスト/バイナリ
        //     fieldContainer.find('input[name="text/binary"]').val(strBinaryText);
        //   }).catch(function(error) {
        //     console.log('binaryCheckErroe----->' + error);
        //   });
        fetch(filePathLinkDownload, { credentials: 'include' })
            .then(function (response) {
              return response.body;
            })
            .then(function(rb) {
          // fetch(filePathLinkDownload, { credentials: 'include' })
          // .then(response => response.body)
          // .then(rb => {
            const reader = rb.getReader();
            return new ReadableStream({
              start: function(controller) {////この書き方で動作もes5もokそう --> 20231103 ok 
              ////start(controller) {
                function push() {
                  reader.read().then(function(result) {
                    var done = result.done;
                    var value = result.value;
                    if (done) {
                      controller.close();
                      return;
                    }
                    controller.enqueue(value);
                    push();
                  })
                  // ////reader.read().then(function(done, value) {//こいつをどう変える？？
                  // reader.read().then(function({ done, value }) {                  
                  // //reader.read().then(({ done, value }) => {
                  //   if (done) {
                  //     controller.close();
                  //     return;
                  //   }
                  //   controller.enqueue(value);
                  //   push();
                  // })
                }
                push();
              }
            })
          })
          .then(function(stream) { 
            return new Response(stream);
          })
          .then(function(response) {
            return response.arrayBuffer();
          })
          .then(function(buffer) {
          // .then(stream => new Response(stream))
          // .then(response => response.arrayBuffer())
          // .then(buffer => {
            var ba = new Uint8Array(buffer);
            var binaryFlg = false;
            console.log('----------buffer:' + ba);
            (ba || []).forEach(function (item) {
              if (item == 0) {
                binaryFlg = true;
              }
            });

            var strBinaryText = "テキスト";
            if (binaryFlg) {

              strBinaryText = 'バイナリ';
              var stringCode = '';
              //Number-of-rows-columns-files-9-0 //任意-行数
              fieldContainer.find('input[name="number-of-rows-columns-files-9-0"]').val(stringCode);
              //Number-of-rows-columns-files-9-1 //任意-列数
              fieldContainer.find('input[name="number-of-rows-columns-files-9-1"]').val(stringCode);
              //Delimiter-15  任意-区切り文字
              fieldContainer.find('input[name="delimiter-15"]').val(stringCode);
              //Character code-15  任意-文字コード          
              fieldContainer.find('input[name="character-code-15"]').val(stringCode);
              fieldContainer.find('input[name="character code-15"]').val(stringCode);  
              //Number-of-lines-15-0  任意-行数
              fieldContainer.find('input[name="number-of-lines-15-0"]').val(stringCode);
              //Number-of-lines-15-1  任意-列数
              fieldContainer.find('input[name="number-of-lines-15-1"]').val(stringCode);

            } else {
              fetch(filePathLinkDownload, { credentials: 'include' })
              .then(function(response) { 
                returnresponse.text()
              })
              .then(function(data) {
              // .then((response) => response.text())
              // .then((data) => {
      
                console.log('sameKindFile-----data----->' + JSON.stringify(data));
    
                //文字コードを取得する
                var stringCode = jschardet.detect(data).encoding;
                console.log("stringCode---------->>>>>" + stringCode);
    
                var splits = getSplit(extension, data);
                console.log('sameKindFile-----splits----->' + JSON.stringify(splits));
                var csvArray = [];
                var lines = data.split(/\r\n|\n/);
                console.log('sameKindFile-----LineLenght----->' + lines.length);
                for (var i = 0; i < lines.length; ++i) {
                  var cells = lines[i].split(splits.str);
                  if (cells.length != 1) {
                    csvArray.push(cells);
                  }
                  if (textColumn < cells.length) {
                    textColumn = cells.length;
                  }
                }
                if (lines.length > 0) {   
                  var minus = 0;
                  if (lines[lines.length - 1] < 1) {
                    minus = 1;
                  }
                  textRow = lines.length - minus;
                }
    
                //Number-of-rows-columns-files-9-0 //任意-行数
                fieldContainer.find('input[name="number-of-rows-columns-files-9-0"]').val(textRow);
                //Number-of-rows-columns-files-9-1 //任意-列数
                fieldContainer.find('input[name="number-of-rows-columns-files-9-1"]').val(textColumn);
                //Delimiter-15  任意-区切り文字
                fieldContainer.find('input[name="delimiter-15"]').val(splits.nameJp);
              //Character code-15  任意-文字コード          
                console.log("stringCode2---------->>>>>" + stringCode);
                fieldContainer.find('input[name="character-code-15"]').val(stringCode);
                fieldContainer.find('input[name="character code-15"]').val(stringCode);
              //Number-of-lines-15-0  任意-行数
                fieldContainer.find('input[name="number-of-lines-15-0"]').val(textRow);
              //Number-of-lines-15-1  任意-列数
                fieldContainer.find('input[name="number-of-lines-15-1"]').val(textColumn);

                // callback(null, lines); 
              })
              .catch(function(error) {
                console.log("stringCode---------->>>>>" + error);
                // callback(error);
              });                      
            }

            //Text/Binary  任意-テキスト/バイナリ
            fieldContainer.find('input[name="text/binary"]').val(strBinaryText);
          }).catch(function(error) {
            console.log('binaryCheckErroe----->' + error);
          });

      }
    });
  }

  /**イメージのEXIF情報を取得して項目にセットする（解像度）
   * 2023-08-17 R&D honda
   */
  function getExifInfomation(blob, fieldContainer) {
    const img = new Image();
    console.log('blob----->' + blob + ' ' + JSON.stringify(blob));

    img.src = URL.createObjectURL(blob);
    img.onload = function () {
      //   var imageData = document.getElementById("img");
      //   console.log('imageData----->'+imageData+' '+JSON.stringify(imageData));
      
      exif.getData(img, function () {
        var XResolution = exif.getTag(this, "XResolution");//画像の幅の解像度
        var YResolution = exif.getTag(this, "YResolution");//画像の高さの解像度
        var ResolutionUnit = exif.getTag(this, "ResolutionUnit");//	解像度単位
        var ImageWidth = exif.getTag(this, "ImageWidth");//画像の幅
        var ImageLength = exif.getTag(this, "ImageLength");//画像の高さ
        console.log('XResolution----->' + XResolution);
        console.log('YResolution----->' + YResolution);
        console.log('ResolutionUnit----->' + ResolutionUnit);
        var resolutionString = XResolution;

        //Resolution-15  任意-解像度
        fieldContainer.find('input[name="resolution-15"]').val(resolutionString);

        //Data-size-15  任意-データサイズ
        if (ImageWidth && ImageLength) {
          var dataSize = ImageWidth + "×" + ImageLength + "pixcel";
          fieldContainer.find('input[name="data-size-15"]').val(dataSize);
        }
      });

    };
  }

  function getExcelInfomation(Data) {
    console.log('ExcelData----->' + Data);
    var ba = new Uint8Array(Data);
    var workbook = XLSX.read(ba, { type: "array" });

    var sheet_name_list = workbook.SheetNames;
    var Sheet1 = workbook.Sheets[sheet_name_list[0]];  // シート1をデータを取得します
    console.log('sheet_name_list---------->>>>>' + sheet_name_list[0]);

    var range_a1 = Sheet1['!ref']; // データが入っている領域をa1形式で取得
    console.log('range = ' + range_a1);
    var range = XLSX.utils.decode_range(range_a1); //インデックス形式に変換
    console.log('sheet-range---------->>>>' + range.s.r);
    console.log('sheet-range---------->>>>' + range.s.c);
    console.log('sheet-range---------->>>>' + range.e.r);
    console.log('sheet-range---------->>>>' + range.e.c);

    return {
      rows: range.e.r += 1,
      cols: range.e.c += 1,
    };
  }

  // function getExcelInfomation(Data) {
  //   console.log('ExcelData----->' + Data);
  //   var ba = new Uint8Array(Data);
  //   var workbook = XLSX.read(ba, { type: "array" });

  //   var sheet_name_list = workbook.SheetNames;
  //   var Sheet1 = workbook.Sheets[sheet_name_list[0]];  // シート1をデータを取得します
  //   console.log('sheet_name_list---------->>>>>' + sheet_name_list[0]);

  //   var range_a1 = Sheet1['!ref']; // データが入っている領域をa1形式で取得
  //   console.log('range = ' + range_a1);
  //   var range = XLSX.utils.decode_range(range_a1); //インデックス形式に変換
  //   console.log('sheet-range---------->>>>' + range.s.r);
  //   console.log('sheet-range---------->>>>' + range.s.c);
  //   console.log('sheet-range---------->>>>' + range.e.r);
  //   console.log('sheet-range---------->>>>' + range.e.c);

    //   return {
  //     rows: range.e.r += 1,
  //     cols: range.e.c += 1,
    //   };
    // }
  // function* range(start, end) {
  //   for(let i = start; i <= end; i++) {
  //     yield i;
  //   }
  // }

  // // Whether text or not. Besed on file (1) behavior
  // // (from: https://stackoverflow.com/a/7392391/2885946)
  // function isText(array) {
  //   const textChars = [7, 8, 9, 10, 12, 13, 27].concat(range(0x20, 0xff));
  //   return array.every(e => textChars.includes(e));
  // }

  /**フォルダ内の拡張子のファイルをカウント
   * 2023-08-18 R&D honda
   */
  // function getSamekindFile(context, filePath, extension) {
  //   var sameKindFileCount = 0;

  //   context.wbcache.searchFiles(filePath, function (file) {
  //     //console.log('file----->'+JSON.stringify(file));
  //     console.log('getSamekindFile-----file.length----->' + file.length);

  //     function processFile(file, extension) {
  //       var count = 0;
  //       (file || []).forEach(function (items) {
  //         console.log('getSamekindFile-----items----->'+JSON.stringify(items));
  //         var keyarray = Object.keys(items);
  //         //console.log('keyarray----->'+keyarray);
  //         var valarray = Object.values(items);
  //         //console.log('valarray----->'+valarray);
  //         //keyarray----->id,type,attributes,links

  //         var filesFlg = false;
  //         var extensionFlg = false;
  //         for (var i = 0; i < keyarray.length; i++) {
  //           // console.log('keyarray----->'+keyarray[i]);
  //           // console.log('valarray----->'+valarray[i]);

  //           //子階層のチェック
  //           if (keyarray[i] == "attributes") {
  //             var keyarray2 = Object.keys(valarray[i]);
  //             //console.log('keyarray2----->'+keyarray2);
  //             var valarray2 = Object.values(valarray[i]);
  //             //console.log('valarray2----->'+valarray2);
  //             for (var j = 0; j < keyarray2.length; j++) {
  //               if (keyarray2[j] == "kind") {
  //                 if (valarray2[j] == "file") {
  //                   filesFlg = true;
  //                 }
  //               }
  //               else if (keyarray2[j] == "name") {
  //                 var extension2 = valarray2[j].substring(valarray2[j].lastIndexOf('.') + 1)
  //                 console.log('extension2----->'+extension2);
  //                 console.log('extension----->'+extension);
  //                 if (extension == extension2) {
  //                   count += 1;
  //                   //console.log('count----->'+count);
  //                 }
  //               }
  //             }
  //           }
  //         }

  //       });
  //       return count;
  //     }

  //     sameKindFileCount = processFile(file, extension);
  //   });

  //   console.log('sameKindFileCount----->' + sameKindFileCount);
  //   return sameKindFileCount;
  // }

  function getSamekindFile(context, filePath, extension, fieldContainer) {
    var sameKindFileCount = 0;
    var count = 0;
    context.wbcache.searchFiles(filePath, function (file) {
      (file || []).forEach(function (item){        
        var file_extension = item.attributes.name.split('.').pop();
        if(item.attributes.kind === 'file' && file_extension === extension){
          count ++ ;            
        }        
      });
      //Number-of-rows-columns-files-jp-7-2 //エクセル-jp-本形式のファイル数　(ドメインメタデータ)
      fieldContainer.find('input[name="number-of-rows-columns-files-jp-7-2"]').val(count);
      //Number-of-rows-columns-files-en-7-2 //エクセル-en-本形式のファイル数　(ドメインメタデータ)
      fieldContainer.find('input[name="number-of-rows-columns-files-en-7-2"]').val(count);
      //Number-of-lines-13-2  エクセル-同種のファイル数　(テクニカルメタデータ)
      fieldContainer.find('input[name="number-of-lines-13-2"]').val(count);
      
      //Number-of-rows-columns-files-jp-6-2 //テキスト-jp-本形式のファイル数　(ドメインメタデータ)
      fieldContainer.find('input[name="number-of-rows-columns-files-jp-6-2"]').val(count);
      //Number-of-rows-columns-files-en-6-2 //テキスト-en-本形式のファイル数　(ドメインメタデータ)
      fieldContainer.find('input[name="number-of-rows-columns-files-en-6-2"]').val(count);     

      //Number-of-files-of-the-same-type //画像-本形式のファイル数　(ドメインメタデータ)
      fieldContainer.find('input[name="number-of-files-of-the-same-type"]').val(count);
      //Number-of-files-of-the-same-type-14 //画像-本形式のファイル数　(テクニカルメタデータ)
      fieldContainer.find('input[name="number-of-files-of-the-same-type-14"]').val(count);

      //Number-of-rows-columns-files-9 //任意-本形式のファイル数
      fieldContainer.find('input[name="number-of-rows-columns-files-9"]').val(count);
      //Number-of-rows-columns-files-9-2 //任意-同種のファイル数  (ドメインメタデータ)
      fieldContainer.find('input[name="number-of-rows-columns-files-9-2"]').val(count);
      //Number-of-lines-15-2  任意-同種のファイル数　(テクニカルメタデータ)    
      fieldContainer.find('input[name="number-of-lines-15-2"]').val(count);

      //Number-of-lines12-2  テキスト-同種のファイル数　(テクニカルメタデータ)
      fieldContainer.find('input[name="number-of-lines12-2"]').val(count);
    });
    sameKindFileCount = count;
    console.log('sameKindFileCount----->' + sameKindFileCount);
    return sameKindFileCount;
  }

  /**ファイルかフォルダかを返す
   * 2023-08-18 R&D honda
   */
  function getFileOrFolder(context, filePath) {
    var typeStr;

    context.wbcache.searchFile(filePath, function (file) {
      console.log('file.kind----->' + file.kind);
      //console.log('file----->'+JSON.stringify(file));
      typeStr = file.kind;
    });

    return typeStr;
  }

  /**拡張子からセパレーターを決める
   * 2023-08-17 R&D honda
   */
  function getSplit(extension, strItem) {
    var splitStr;
    var splitnameJp;
    var splitnameEn;
    splitStr = (extension == 'tsv') ? "\t" : splitStr;
    if (extension == 'csv') {
      splitStr = ",";
      splitnameJp = "カンマ";
      splitnameEn = "comma";
    } else if (extension == 'tsv') {
      splitStr = "\t";
      splitnameJp = "タブ";
      splitnameEn = "tab";
    } else {
      var text = strItem;
      var targetStr1 = ",";
      var targetStr2 = "\t";
      var count1 = (text.match(new RegExp(targetStr1, "g")) || []).length;
      var count2 = (text.match(new RegExp(targetStr2, "g")) || []).length;
      if ((count1 > 0) || (count2 > 0)) {
        if (count1 > count2) {
          splitStr = ",";
          splitnameJp = "カンマ";
          splitnameEn = "comma";
        } else {
          splitStr = "\t";
          splitnameJp = "タブ";
          splitnameEn = "tab";
        }
      } else {
        //ヒットしなかったらとりあえずかんまで
        splitStr = ",";
        splitnameJp = "カンマ";
        splitnameEn = "comma";
      }
    }

    return {
      str: splitStr,
      nameJp: splitnameJp,
      nameEn: splitnameEn,
    };
  }

  /**イメージファイルタイプを調べる
   * 2023-08-17 R&D honda
   */
  function getImageType(arrayBuffer) {
    var ba = new Uint8Array(arrayBuffer);
    var headerStr = "";
    var headerHex = "";

    for (var i = 0; i < 10; i++) { // 始めの10個分を読む
      headerHex += ba[i].toString(16); // 16進文字列で読む
      headerStr += String.fromCharCode(ba[i]); // 文字列で読む
    }
    var fileType = "unknown";
    if (headerHex.indexOf("ffd8") != -1) { // JPGはヘッダーに「ffd8」を含む
      fileType = "JPG";
    } else if (headerStr.indexOf("PNG") != -1) { // PNGはヘッダーに「PNG」を含む PNG	89 50 4E 47
      fileType = "PNG";
    } else if (headerStr.indexOf("GIF") != -1) { // GIFはヘッダーに「GIF」を含む GIF	47 49 46 38
      fileType = "GIF";
    } else if (headerStr.indexOf("BM") != -1) { // BMPはヘッダーに「BM」を含む BMP	42 4D
      fileType = "BMP";
    } else if (headerHex.indexOf("4949") != -1) { // TIFFはヘッダーに「49 49」を含む TIFF	49 49 or 4D 4D
      fileType = "TIFF";
    } else if (headerHex.indexOf("4d4d") != -1) { // TIFFはヘッダーに「4D 4D」を含む TIFF	49 49 or 4D 4D
      fileType = "TIFF";
    } else if (headerHex.indexOf("00000100") != -1) { // ICOはヘッダーに「00 00 01 00」を含む
      fileType = "ICO";
    } else if (headerHex.indexOf("0A") != -1) { // PCXはヘッダーに「0A」を含む
      fileType = "PCX";
    } else if (headerHex.indexOf("38425053") != -1) { // PSDはヘッダーに「BM」を含む
      fileType = "PSD";
    }

    console.log("fileType=" + fileType + " headerStr=" + headerStr + " headerHex=" + headerHex);
    return fileType;
  }

  /**イメージの各種情報を取得して項目にセットする（カラー／モノクロ）
   * 2023-08-17 R&D honda
   */
  function getImageInfo(blob, fieldContainer, ninniFlg) {
    const img = new Image();
    var colorTypeJp = "";
    var colorTypeEn = "";
    var imageWidth;
    var imagHeight;

    img.src = URL.createObjectURL(blob);
    img.onload = function () {
      const canvas = document.createElement('canvas');
      canvas.width = this.width;
      canvas.height = this.height;
      imageWidth = this.width;
      imagHeight = this.height;
      console.log('imageWidth:' + imageWidth);
      console.log('imageHeight:' + imagHeight);

      const ctx = canvas.getContext('2d');
      ctx.drawImage(this, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      var isColor = false;
      for (var i = 0; i < data.length; i += 4) {
        if (data[i] !== data[i + 1] || data[i] !== data[i + 2]) {
          isColor = true;
          break;
        }
      }

      if (isColor) {
        console.log('The image is in color.');
        colorTypeJp = "カラー";
        colorTypeEn = "Color";
      } else {
        console.log('The image is in black and white.');
        colorTypeJp = "モノクロ";
        colorTypeEn = "B&W";
      }

      if (!ninniFlg) {
        //Color-B&W-14 //画像カラー/モノクロ
        console.log('colorTypeJp' + colorTypeJp);
        fieldContainer.find('input[name="color-b&w-14"]').val(colorTypeJp);
      }
      else {
        //Color-B&W-15  任意-カラー/モノクロ
        fieldContainer.find('input[name="color-b&w-15"]').val(colorTypeJp);
        //Data-size-15  任意-データサイズ
        var dataSize = imageWidth + "×" + imagHeight + "pixcel";
        fieldContainer.find('input[name="data-size-15"]').val(dataSize);
        //Resolution-15  任意-解像度
        //fieldContainer.find('input[name="color-b&w-15"]').val(colorTypeJp);
      }
    };
  }

  // async function getImageInfoMain(blob, fieldContainer) {
  //   var colorTypeJp = "";
  //   var colorTypeEn = "";
  //   var imageWidth;
  //   var imagHeight;

  //   var img1 = await getImageInfoAsync(blob);

  //   const canvas = document.createElement('canvas');
  //   canvas.width = this.width;
  //   canvas.height = this.height;
  //   imageWidth = this.width;
  //   imagHeight = this.height;
  //   console.log('imageWidth:' + imageWidth);
  //   console.log('imageHeight:' + imagHeight);

  //   const ctx = canvas.getContext('2d');
  //   ctx.drawImage(this, 0, 0);

  //   const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  //   const data = imageData.data;
  //   let isColor = false;
  //   for (let i = 0; i < data.length; i += 4) {
  //     if (data[i] !== data[i + 1] || data[i] !== data[i + 2]) {
  //       isColor = true;
  //       break;
  //     }
  //   }

  //   if (isColor) {
  //     console.log('The image is in color.');
  //     colorTypeJp = "カラー";
  //     colorTypeEn = "Color";
  //   } else {
  //     console.log('The image is in black and white.');
  //     colorTypeJp = "モノクロ";
  //     colorTypeEn = "B&W";
  //   }

  //   //var retImageInfo = img.onload = imgOnload();
  //   console.log('retImageInfo.nameJp' + colorTypeJp);
  //   console.log('retImageInfo.imageWidth' + imageWidth);
  //   return {
  //     nameJp: colorTypeJp,
  //     nameEn: colorTypeEn,
  //     imageWidth: imageWidth,
  //     imagHeight: imagHeight,
  //   };
  // }

  // async function getImageInfoAsync(blob) {
  //   var img = null;
  //   var promise = new Promise(function (resolve) {
  //     img = new Image();
  //     img.onload = function () {
  //       resolve();
  //     }
  //     img.src = URL.createObjectURL(blob);
  //   });

  //   await promise;
  //   return img;
  // }


  // function getFileDimensions(filePath){
  //   const content = fs.readFileSync(filePath, 'utf8');
  //   const lines = content.split('\n');

  //   const numberOfLines = lines.length;

  //   const firstLine = lines[0];
  //   const columns = firstLine.split(',');

  //   const numberOfColumns = columns.length;

  //   return{
  //     lines: numberOfLines,
  //     columns: numberOfColumns
  //   }
  // }

  // function countLines(filePath, callback){
  //   var lineCount = 0;
  //   const readStream = fs.createReadStream(filePath);

  //   readStream.on('data', function (chunk) {
  //     lineCount += chunk.toString().split('\n').length - 1;
  //   });

  //   readStream.on('end', function() {
  //     callback(null, lineCount);
  //   });

  //   readStream.on('error', function(err) {
  //     callback(err);
  //   });
  // }

  // function countLines(filePath, callback) {
  //   fetch(filePath)
  //     .then(response => {
  //       if (!response.ok) {
  //         throw new Error('Network response was not ok');
  //       }
  //       return response.text();
  //     })
  //     .then(data => {
  //       const lines = data.split('\n').length;
  //       callback(null, lines);
  //     })
  //     .catch(error => {
  //       callback(error);
  //     });
  // }

  // function countLines(filePath) {
  //   const fileStream = fs.createReadStream(filePath);
  //   const r1 = readline.createInterface({ input: fileStream, crlfDelay: Infinity});
  //   var lineCount = 0;
  //   r1.on('line', () => lineCount++);
  //   return new Promise(resolve => {
  //     r1.on('close', () => resolve(lineCount));
  //   });
  // }

  // function countColumnCsv

  //20230809 ファイルザイズ計算 add KWT -->
  function formatBytes(bytes) {
    if (bytes < 1024) {
      return bytes + " Bytes";
    } else if (bytes < 1024 * 1024) {
      return (bytes / 1024).toFixed(1) + " KB";
    } else if (bytes < 1024 * 1024 * 1024) {
      return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    } else {
      return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
    }
  }
  //20230809 ファイルザイズ計算 <--

  function createDialog(context, filepath, item, $dialog, editable, hedderbtn, toolbar, container, copyToClipboard, copyStatus, notice, close, save, titleMib, pageno, multiple) {
    console.log('createDialog-----pageno***********************************' + pageno);
    console.log('createDialog-----filepath*********************************' + filepath);
    console.log('createDialog-----context.nodeId***************************' + context.nodeId);

    //20230920　editMetadata2の最初と重複しているのでコメントにしてみる
    // const currentMetadata = self.findMetadataByPath(context.nodeId, filepath);
    // if (!currentMetadata) {
    //   console.log('currentMetadata nsi****************************************');
    //   self.lastMetadata = {
    //     path: filepath,
    //     folder: item.kind === 'folder',
    //     items: [],
    //   };
    // } else {
    //   console.log('currentMetadata ari****************************************');
    //   self.lastMetadata = Object.assign({}, currentMetadata);
    // }

    const activeItems = (self.lastMetadata.items || []).filter(function (item_) {
      return item_.active;
    });

    //202308091556 これは不要では？
    // const targetItem = activeItems[0] || {};
    // const selector = self.createSchemaSelector(targetItem);
    // self.currentSchemaId = selector.currentSchemaId;
    var schema = self.findSchemaById(self.currentSchemaId);
    var extension = "";
    if (!multiple) {
      extension = filepath.substring(filepath.lastIndexOf('.') + 1);
    } else {
      var tmpExtension1 = ''
      for (var iCnt = 0;iCnt < filepath.length;iCnt++) {
        var tmpExtension2 = filepath[iCnt].substring(filepath[iCnt].lastIndexOf('.') + 1);
        if (tmpExtension1) {
          if (tmpExtension1 != tmpExtension2) {
            tmpExtension1 = 'any';
          }
        } else {
          tmpExtension1 = tmpExtension2;
        }
      }
      extension = tmpExtension1;
      //extension = filepath[0].substring(filepath[0].lastIndexOf('.') + 1);
    }
    console.log('extension:' + extension);
    //var extension = filepath.substring(filepath.lastIndexOf('.') + 1);

    console.log('createDialog-----leftside****************************************');
    const leftside = $('<div class="leftside"></div>')
      .css('float', 'left')
      .css('width', '15%')
      .css('background', '#fff');

    var skip_page = [];
    var image = ["jpg", "jpeg", "bmp"]; // list of image extensions
    var excel = ["xlsx", "xls"];
    var text = ["txt"];
    var any = "any";

    // 関係ないページを取得
    (schema.attributes.schema.pages || []).forEach(function (page) {
      var flg = false;

      console.log('createDialog-----page.id---->' + page.id);
      if (multiple) {
        if (!page.multiple) {
          //console.log('catch-page.id---->'+page.id); 
          var page_number = parseInt(page.id.match(/\d+/)[0]);
          skip_page.push(page_number);
        } else {
          //console.log('multiple---->'+page.id); 
          //console.log('multiple---->'+page.multiple); 
          if (page.multiple == false) {
            //console.log('multiple false---->'+page.id); 
            var page_number = parseInt(page.id.match(/\d+/)[0]);
            skip_page.push(page_number);
          }
        }
      }

      (page.branchbytype || []).forEach(function (item) {
        console.log('createDialog-----item.type---->'+item.type); 
        console.log('createDialog-----extension---->'+extension); 
        if (!multiple) {
          console.log('createDialog-----notmultiple---->' + page.multiple);
          if (item.type.includes(extension)) {
            flg = true;
            return;
          } else if ((item.type.includes(any)) && (extension) && (!flg)) {
            return;
          } else {
            skip_page.push(item.nextpage);
          }
        } else {
          //console.log('page.multiple---->'+page.multiple); 
          if ((item.type.includes(extension)) && (page.multiple == true)) {
            //console.log('1-page.id---->'+page.id); 
            flg = true;
            return;
          } else if ((item.type.includes(any)) && (extension) && (!flg) && (page.multiple == true)) {
            //console.log('2-page.id---->'+page.id); 
            return;
          } else {
            //console.log('4-page.id---->'+page.id); 
            skip_page.push(item.nextpage);
          }
        }

      });
    });

    (schema.attributes.schema.pages || []).forEach(function (page) {
      var title = getLocalizedTextNav(page.title);
      var level = getLocalizedTextNav(page.level);

      try {
        var page_number = parseInt(page.id.match(/\d+/)[0]);
      }
      catch (e) {
        return;
      }
      // var active_page_number = (pageno != '') ? pageno : 2;
      // var page_number = parseInt(page.id.match(/\d+/)[0]);    
      console.log('createDialog-----pageno' + pageno);
      console.log('createDialog-----page--->' + JSON.stringify(page.questions));

      var firstPart = null;
      var secondPart = null;
      var pageValidate = true;

      if (title.includes('_')) {
        var _title = title.split('_');
        firstPart = _title[0];
        secondPart = '( ' + _title[1] + ' )';
      } else {
        firstPart = title;
        secondPart = '';
      }

      if (page_number == '1') {
        return;
      }

      console.log('createDialog-----skip_page ' + skip_page);

      if (skip_page.includes(page_number)) {
        console.log('createDialog-----skip_page_number ' + page_number);
        return;
      }

      var div = $('<div class="vertical_line"></div>');

      var link = $('<a></a>').attr('href', '#');
      link.click(function () {
        // console.log('Active page number --> ' + page_number);      
        active_page_number = page_number;
        if (!multiple) {
          //画面メタデータを保持メタデータにセット
          metadata_hold();//20230912不要か？20230915復活させてみる

          osfBlock.block();
          self.saveEditMetadataModal_mibyo()
            .finally(function () {
              osfBlock.unblock();

              self.editMetadata2(context, filepath, item, page_number, $dialog)
              .finally(function () {
                //osfBlock.unblock();
                $(dialog).modal('hide');
              });
  
            })
          // self.editMetadata2(context, filepath, item, page_number, $dialog)
          //   .finally(function () {
          //     //osfBlock.unblock();
          //     $(dialog).modal('hide');
          //   });
        } else {
          // self.saveEditMultipleMetadataModal_mibyo()
          // .finally(function() {
          //   osfBlock.unblock();
          // })
          console.log('createDialog-----context---->' + context);
          console.log('createDialog-----filepath---->' + filepath);
          console.log('createDialog-----item---->' + item);
          console.log('createDialog-----page_number--->' + page_number);
          console.log('createDialog-----$dialog---->' + $dialog);
          self.editMultipleMetadata_Mibyo(context, filepath, item, page_number, $dialog)
            .finally(function () {
              //osfBlock.unblock();
              $(dialog).modal('hide');
            });
        }
      });

      if (page_number != pageno) {
        active_page_number = pageno;
      }

      if (page_number == active_page_number) {
        link.addClass('active');
      }

      //ナビゲーターのバリデーション(外ループ：型、内ループ：値)
      (page.questions || []).forEach(function (pageItems) {
        console.log('createDialog-----start--pageItems.qid--->' + pageItems.qid);
        console.log('createDialog-----pageItems.type--->' + pageItems.type);
        console.log('createDialog-----pageItems.required--->' + pageItems.required);
        // console.log('pageItems.pattern--->' + pageItems.pattern);

        //20231003 
        if (pageItems.required){
          console.log('createDialog-----self.lastMetadata.items--->' + self.lastMetadata.items);
          console.log('createDialog-----self.lastMetadata.items.length--->' + self.lastMetadata.items.length);
          if (self.lastMetadata.items.length < 1){ pageValidate = false; }
        }

        (self.lastMetadata.items || []).forEach(function (navItems) {
          if (pageValidate) {
            if (self.currentSchemaId == navItems.schema) {
              console.log('createDialog-----self.currentSchemaId----->'+self.currentSchemaId);
              console.log('createDialog-----navItems--->' + navItems.schema);
              //console.log('createDialog-----navItems--->' + Object.entries(navItems.data));
              var result = Object.entries(navItems.data).filter(function(item) {
                return item[0] == pageItems.qid;
              });              
              ////var result = Object.entries(navItems.data).filter(item => item[0] == pageItems.qid);///これもes5対応が必要 --> 20231102 ok 
              console.log('createDialog-----result--->' + JSON.stringify(result));
              var resultValue = null;
              if (result.length > 0) {
                resultValue = result[0][1].value;
                console.log('createDialog-----result[0]--->' + JSON.stringify(result[0][1])+'---resultValue-type:'+typeof(resultValue));        
                //console.log('resultValue-type:'+typeof(resultValue));
                if ((typeof (resultValue) == "object")) {
                  // console.log('pageItemsFormat--->' + pageItems.format);
                  console.log('pageItemsFormat--->' + pageItems.format + '/qid-->'+ pageItems.qid + '/nav-->'+ pageItems.nav );
                  if (pageItems.format == "text2") {
                  } else if (pageItems.format == "text3") {
                  } else if (pageItems.format == "text4") {
                  } else if (pageItems.format == "text5") {
                    if (resultValue.checkboxes == "true") { 
                      console.log('createDialog-----text5---check:NG' + resultValue.checkboxes);        
                    } else if (resultValue.options != "") { 
                      console.log('createDialog-----text5---opt:ok' + resultValue.checkboxes);        
                    } else { 
                      console.log('createDialog-----text5---ng:' + resultValue.checkboxes+'---options:'+resultValue.checkboxes);        
                      resultValue = null; 
                    }
                    //console.log('createDialog-----text5---check:' + boolValue+'---options:'+intValue+'---resultValue:'+resultValue);        
                  } else if (pageItems.format == "text6") {
                    console.log('pageItems----qid--->'+pageItems.qid);
                    var rdo1 = pageItems.qid.replace('grdm-file:','radiobtn-') + '0';
                    rdo1 = rdo1.replace(/ /g, '-');
                    var resultValueTemp = resultValue;
                    console.log('rdo1--->'+rdo1+'/resultValue--->'+JSON.stringify(resultValue));
                    // if(resultValueTemp[rdo1] == 1 ){                      
                    //    if(!resultValueTemp.hasOwnProperty(rdo1+'1') || !resultValueTemp.hasOwnProperty(rdo1+'12') || !resultValueTemp.hasOwnProperty(rdo1+'123')){
                    //     console.log('createDialog-----text6---check:NG option=' + resultValueTemp["option"] + ', '+ rdo1 + '=' +  + resultValueTemp[rdo1] + ', '+ rdo1+'1' + resultValueTemp[rdo1+'1'] + '/' + rdo1+'12' + resultValueTemp[rdo1+'12'] + '/' + rdo1+'123' + resultValueTemp[rdo1+'123']); 
                    //     resultValue = null; 
                    //    }else{
                    //     console.log('createDialog-----text6---check:OK option=' + resultValueTemp["option"] + ', '+ rdo1 + '=' +  + resultValueTemp[rdo1] + ', '+ rdo1+'1' + resultValueTemp[rdo1+'1'] + '/' + rdo1+'12' + resultValueTemp[rdo1+'12'] + '/' + rdo1+'123' + resultValueTemp[rdo1+'123']); 
                    //    }

                    // }

                    if(resultValueTemp.hasOwnProperty('option')){  
                      if(resultValueTemp[rdo1] != "0" && (!resultValueTemp.hasOwnProperty(rdo1) || !resultValueTemp.hasOwnProperty(rdo1+'1') || !resultValue.hasOwnProperty(rdo1+'12') || !resultValueTemp.hasOwnProperty(rdo1+'123'))){      
                        resultValue = null; 
                        //  console.log('validateField-----text6---check:NG option=' + value["option"] + ', '+ rdo1 + '=' +  + value[rdo1] + ', '+ rdo1+'1' + value[rdo1+'1'] + '/' + rdo1+'12' + value[rdo1+'12'] + '/' + rdo1+'123' + value[rdo1+'123']);        
                      }    
                      if(resultValueTemp[rdo1] === "0"&& resultValueTemp['option'] == "") {
                        resultValue = null; 
                      }
                    }
                    
                    // if(resultValueTemp[rdo1] == 0 && resultValueTemp["option"] == ""){
                    //   console.log('createDialog-----text6---check:NG option=' + resultValueTemp["option"] + ', '+ rdo1 + '=' + resultValueTemp[rdo1]); 
                    //   resultValue = null; 
                    // } else {
                    //   console.log('createDialog-----text6---check:OK option=' + resultValueTemp["option"] + '/' +  rdo1 + '=' + resultValueTemp[rdo1]); 
                    // }
                    
                    if (resultValueTemp.hasOwnProperty('textbox0')) {
                      // if(!resultValueTemp.hasOwnProperty(rdo1) || resultValueTemp['textbox0'] == ''){
                      if(!resultValueTemp.hasOwnProperty(rdo1)){
                        resultValue = null; 
                        console.log('createDialog-----text6---check:NG '+ rdo1 + '='+ resultValueTemp[rdo1] + '/textbox0=' + resultValueTemp['textbox0']); 
                        // console.log('createDialog-----text6---check:NG '+ rdo1 + '='+ resultValueTemp[rdo1] + '/textbox0=' + resultValueTemp['textbox0']); 
                      }else if (resultValueTemp[rdo1] == 0 &&  resultValueTemp['textbox0'] == ""){
                        console.log('createDialog-----text6---check:NG '+ rdo1 + '='+ resultValueTemp[rdo1] + '/textbox0=' + resultValueTemp['textbox0']); 
                        resultValue = null; 
                      }else{
                        console.log('createDialog-----text6---check:OK '+ rdo1 + '='+ resultValueTemp[rdo1] + '/textbox0=' + resultValueTemp['textbox0']); 
                      }
                    } 
                  
                  } else if (pageItems.format == "text7") {
                    var name = pageItems.qid.replace('grdm-file:','radiobtn-') + '0';

                    if (resultValue[name]) {
                      console.log('createDialog-----text7---:' + resultValue[name]);        
                    } else {
                      resultValue = null; 
                    }
                  } else if (pageItems.format == "text8") {
                    if (resultValue['.form-control']) {
                      console.log('createDialog-----text8---:' + resultValue['.form-control']);        
                  } else {
                      resultValue = null; 
                    }
                  } else {
                    resultValue = Object.entries(resultValue).filter(function(item) {
                      return item[0] == pageItems.format;
                    });                                                
                    ////resultValue = Object.entries(resultValue).filter(item => item[0] == pageItems.format);////これもes5対応が必要 --> 20231102 okd
                    console.log('resultValueObj--->' + JSON.stringify(resultValue));
                    console.dir(resultValue);
                    if (resultValue.length > 0) {
                      if (!resultValue[0][1]) {
                        resultValue = resultValue[0][1];
                      }
                    }
                    console.log('createDialog-----resultValue2--->' + resultValue);
                  }
                }
                console.log('createDialog-----resultValue--->' + resultValue);
                pageValidate = validateField(pageItems, resultValue);
                var test = resultValue;
                var two = result[0][0];
                if(result[0][0] == 'grdm-file:available-date'){
                  // if(navItems.data['grdm-file:access-rights']['value'] === 'embargoed access' || navItems.data['grdm-file:access-rights']['value'] === '' ){
                  //   pageValidate = false;
                  // }else 
                  if(navItems.data['grdm-file:access-rights']['value'] === 'open access'  ||
                    navItems.data['grdm-file:access-rights']['value'] === 'restricted access' ||
                    navItems.data['grdm-file:access-rights']['value'] === 'metadata only access' ) {
                    pageValidate = true;
                  } 
                }
                if (!pageValidate) {
                  console.log('createDialog-----pageItems.qid--->' + pageItems.qid);
                  console.log('createDialog-----pageItems.type--->' + pageItems.type);
                  console.log('createDialog-----pageItems.required--->' + pageItems.required);
                  console.log('createDialog-----pageItems.pattern--->' + pageItems.pattern);
                  console.log('createDialog-----result.value--->' + resultValue);
                }
              } else {
                console.log('createDialog-----erroe-pageItems.qid--->' + pageItems.qid);
              }
            }
          }
        });
      });
      console.log('createDialog-----pageValidate ----->' + pageValidate);
     //.attr("content","\f05d") 

      if (!pageValidate && !multiple) {
      console.log('createDialog-----pageValidate1 ----->' + pageValidate);
        if (page_number == active_page_number) {
          link.append(
            $('<i class="fa fa-circle-red fa-fw ember-view _Icon_hvfztr"></i>')          
                .css('float', 'left').css('padding', '4px').css("color", "#333")
            );
        } else {
          link.append(
            $('<i class="fa fa-circle-red fa-fw ember-view _Icon_hvfztr"></i>')          
                .css('float', 'left').css('padding', '4px').css("color", "red")
            );    
        }
        //color: #333;
        // link.append(
        // $('<i class="fa fa-circle-red fa-fw ember-view _Icon_hvfztr"></i>')          
        //     .css('float', 'left').css('padding', '4px').css("color", "red")
        // );
        
      console.log('createDialog-----pageValidate2 ----->' + pageValidate);       
      if (page_number == active_page_number) {
          link.append(
            $('<div></div>')
              .append(
                $('<span></span>').css('display', 'block')
                  .text(level)
              )
              .append(
                $('<span></span>').css('display', 'block')
                  .text(firstPart)
              )
              .append(
                $('<span></span>')
                  .text(secondPart)
              )
          );
        } else {
          link.append(
            $('<div></div>')
              .append(
                $('<span></span>').css('display', 'block').css("color", "red")
                  .text(level)
              )
              .append(
                $('<span></span>').css('display', 'block').css("color", "red")
                  .text(firstPart)
              )
              .append(
                $('<span></span>').css("color", "red")
                  .text(secondPart)
              )
          );
        }
      // link.append(
      //     $('<div></div>')
      //       .append(
      //         $('<span></span>').css('display', 'block').css("color", "red")
      //           .text(level)
      //       )
      //       .append(
      //         $('<span></span>').css('display', 'block').css("color", "red")
      //           .text(firstPart)
      //       )
      //       .append(
      //         $('<span></span>').css("color", "red")
      //           .text(secondPart)
      //       )
      //   );
      } else {
      console.log('createDialog-----pageValidate3 ----->' + pageValidate);
        link.append(
          $('<i class="fa fa-circle fa-fw ember-view _Icon_hvfztr"></i>')
            .css('float', 'left').css('padding', '4px')
        );
      console.log('createDialog-----pageValidate4 ----->' + pageValidate);
        link.append(
          $('<div></div>')
            .append(
              $('<span></span>').css('display', 'block')
                .text(level)
            )
            .append(
              $('<span></span>').css('display', 'block')
                .text(firstPart)
            )
            .append(
              $('<span></span>')
                .text(secondPart)
            )
        );
      }
      // link.append(
      //   $('<i class="fa fa-circle fa-fw ember-view _Icon_hvfztr"></i>')
      //   .css('float', 'left').css('padding', '4px').css("color","red")
      // );
      // link.append(
      //   $('<div></div>')
      //   .append(
      //     $('<span></span>').css('display', 'block')
      //     .text(level)
      //   )
      //   .append(
      //     $('<span></span>').css('display', 'block')
      //     .text(firstPart)
      //   )
      //   .append(
      //     $('<span></span>')
      //     .text(secondPart)
      //   )
      //);

      leftside
        .append(div)
        .append(link);

      console.log(title + page_number);
    });
    //20230800 ナビゲーター部分の生成 <--

    //20230705 add KWT start-->  	    
    const rightside = $('<div></div>')
      .css('float', 'left')
      .css('width', '85%')
      .css('border-left', '1px solid #ddd')
      .css('position', 'relative')
      .css('z-index', '1')
      .css('left', '-1px');
    //20230705 add KWT end-->		 

    $dialog
      .append($('<div class="modal-dialog modal-lg"></div>')
        .css('width', '92%')
        .append($('<div class="modal-content"></div>')
          .append($('<div class="modal-header"></div>')
            .append($('<h3></h3>').text(titleMib)
              //.append($('<h3></h3>').text(editable ? label1 : label2)
              .append(hedderbtn)
              // .append(returnbtn)
              // .append(repossessionbtn)
              // .append(nextbtn)
            )
          )
          .append(close)
          //.append(message)

          .append($('<form></form>')

            .append($('<div class="modal-body"></div>')
              .append(leftside)
              .append(rightside
                .append($('<div class="row"></div>')
                  .append($('<div class="col-sm-12"></div>')
                    .append(toolbar))
                  .append($('<div class="col-sm-12"></div>')
                    .css('overflow-y', 'scroll')
                    .css('height', '70vh')
                    .append(container)))))
            .append($('<div class="modal-footer"></div>')
              .css('display', 'flex')
              .css('align-items', 'center')
              .css('clear', 'both') //20230705 add KWT
              .append(copyToClipboard.css('margin-left', 0).css('margin-right', 0))
              .append(copyStatus.css('margin-left', 0).css('margin-right', 'auto'))
              .append(notice)
              .append(close)
              .append(save)))));

    skip_page = [];
  }

  self.prepareFields2 = function (context, container, schema, filepath, fileitem, options, pageno) {
    var lastMetadataItem = {};
    if (!options.multiple) {
      lastMetadataItem = (self.lastMetadata.items || []).filter(function (item) {
        const resolved = self.resolveActiveSchemaId(item.schema) || self.currentSchemaId;
        return resolved === schema.id;
      })[0] || {};
    }
    container.empty();
    console.log('createFields2--------->' + pageno);
    const fields = self.createFields2(
      schema.attributes.schema,
      lastMetadataItem,
      {
        readonly: !((context.projectMetadata || {}).editable),
        multiple: options.multiple,
        context: context,
        filepath: filepath,
        wbcache: context.wbcache,
        fileitem: fileitem
      },
      self.fieldsChanged,
      pageno
    );
    self.lastFields = [];
    fields.forEach(function (fieldSet) {
      const errorContainer = $('<div></div>')
        .css('color', 'red').hide();
      const input = fieldSet.field.addElementTo(container, errorContainer);
      self.lastFields.push({
        field: fieldSet.field,
        question: fieldSet.question,
        input: input,
        lastError: null,
        errorContainer: errorContainer
      });
    });
    self.fieldsChanged(null, options);
  }

  self.createFields2 = function (schema, item, options, callback, pageno) {
    const fields = [];
    const itemData = options.multiple ? {} : item.data || {};
    const strPageno = 'page' + pageno;
    console.log('init_createFields2--------->itemData:' + JSON.stringify(itemData));
    (schema.pages || []).forEach(function (page) {
      if (pageno == "0"){
        //全件データ取得
      } else if (!page.id || !(page.id == strPageno)) {
        return;
      }
      console.log('init_createFields2--------->page:' + page.id);
      (page.questions || []).forEach(function (question) {
        if (!question.qid || !question.qid.match(/^grdm-file:.+/)) {
          return;
        }
        console.log('init_createFields2--------->qid:' + question.qid);
        console.dir(itemData[question.qid]);
        const value = itemData[question.qid];
        const field = metadataFields.createField(
          self.erad,
          question,
          value,
          options,
          callback
        );
        fields.push({ field: field, question: question });
      });
    });
    return fields;
  };

  //未病データベース構築プロトタイプ ダイアログのコンボアイテムをセットする
  //2023-08-26　R＆D　honda
  //
  self.createSchemaSelector_mib = function (targetItem) {
    const label = $('<label></label>').text(_('Metadata Schema:'));
    const schema = $('<select></select>');
    var activeSchemas = (self.registrationSchemas.schemas || [])
      .filter(function (s) {
        return s.attributes.active;
      });
    var filter = [];
    (activeSchemas || []).forEach(function (s) {
      if (s.attributes.schema.UserDefinedMetaData) {
        filter.push(s);
      }
    });
    activeSchemas = filter;
    // activeSchemas = (activeSchemas || [])
    //   .has(function(s) {
    //     return s.attributes.schema.UserDefinedMetaData;
    //   });
    if (activeSchemas.length === 0) {
      throw new Error('No active metadata schemas');
    }
    var currentSchemaId2 = null;
    activeSchemas.forEach(function (s) {
      console.log('createSchemaSelector_mib--->' + JSON.stringify(s.attributes));
      console.log('createSchemaSelector_mib---UserDefinedMetaData--->' + s.attributes.schema.UserDefinedMetaData);
      if (s.attributes.schema.UserDefinedMetaData) {
        //console.log('createSchemaSelector_mib----->'+JSON.stringify(s.attributes));
        // if (s.attributes.name == '未病データベース_メタデータ登録')
        // {
        schema.append($('<option></option>')
          .attr('value', s.id)
          .text(s.attributes.name));
        console.log('createSchemaSelector_mib---s.id--->' + s.id);
        if (!currentSchemaId2) { currentSchemaId2 = s.id; }
      }
    });

    //var currentSchemaId = currentSchemaId2;
    var currentSchemaId = null;
    const activeSchemaIds = activeSchemas.map(function (s) {
      return s.id;
    });
    if (targetItem.schema && activeSchemaIds.includes(targetItem.schema)) {
      currentSchemaId = targetItem.schema;
      schema.val(currentSchemaId);
      console.log(logPrefix, 'mib_currentSchemaA: ', currentSchemaId);
    } else if (targetItem.schema && self.resolveActiveSchemaId(targetItem.schema)) {
      currentSchemaId = self.resolveActiveSchemaId(targetItem.schema);
      schema.val(currentSchemaId);
      console.log(logPrefix, 'mib_currentSchemaB: ', currentSchemaId);
    } else {
      if (!activeSchemas[0].id) {
        currentSchemaId = currentSchemaId2;
        console.log(logPrefix, 'mib_currentSchemaC1: ');
      } else {
        currentSchemaId = activeSchemas[0].id;
        console.log(logPrefix, 'mib_currentSchemaC2: ');
      }
      schema.val(currentSchemaId);
      console.log(logPrefix, 'mib_currentSchemaC: ', currentSchemaId);
    }
    const group = $('<div></div>').addClass('form-group')
      .append(label)
      .append(schema);
    return {
      schema: schema,
      group: group,
      currentSchemaId: currentSchemaId,
    }
  }

  function getLocalizedTextNav(text) {
    if (!text) {
      return text;
    }
    if (!text.includes('|')) {
      return text;
    }
    const texts = text.split('|');
    if (rdmGettext.getBrowserLang() === 'ja') {
      return texts[0];
    }
    return texts[1];
  }

  function getLocalizedText(text, editable, multiple) {
    var retText = '';
    var editType = '';

    if (!text) {
      return text;
    }
    if (!text.includes('|')) {
      return text;
    }

    if (multiple) {
      if (editable) {
        editType = _('MultipleEdit');
      }
      else {
        editType = _('MultipleView');
      }
    }
    else {
      if (editable) {
        editType = _('Edit');
      }
      else {
        editType = _('View');
      }
    }

    const texts = text.split('|');
    if (rdmGettext.getBrowserLang() === 'ja') {
      retText = texts[0] + ' ' + editType;
    }
    else {
      retText = editType + ' ' + texts[1];
    }

    return retText;
    // const texts = text.split('|');
    // if (rdmGettext.getBrowserLang() === 'ja') {
    //   return texts[0];
    // }
    // return texts[1];
  }

  function metadata_hold() {
    if (self.lastMetadata_hold) {
      (self.lastFields || []).forEach(function (fieldSet2) {
        console.log('metadata_hold search---------- ' + fieldSet2.question.qid);
        (self.lastMetadata_hold || []).forEach(function (fieldSet) {
          if (fieldSet.question.qid == fieldSet2.question.qid) {
            console.log('metadata_hold =====----->>> ' + fieldSet2.question.qid + ' = ' + fieldSet2.input);
            fieldSet.input = fieldSet2.input;
          }
        });
      });
    }
  }

  /**  ナビゲーター用バリデーションチェック
     *  2023-09-06　R＆D honda　
     */
  function validateField(question, value) {
    const multiple = false;
    var valueTarget = value

    if (!valueTarget) {
      if (question.required && !multiple) {
        console.log('createDialog-----validateField--->1');
        return false;
      }
      console.log('createDialog-----validateField--->2');
      return true;
    }
    if (question.qid.includes('grdm-file:creators')) {
      console.log('createDialog-----validateField--->3');
      return validateCreators(question, valueTarget);
    }
    if (question.type == 'string') {
      if (question.pattern && !(new RegExp(question.pattern).test(valueTarget))) {
        console.log('createDialog-----validateField--->4');
        return false;
      }
      console.log('createDialog-----validateField--->5');
      return true;
    }
    console.log('createDialog-----validateField--->6');
    return true;
  }

  /** Creatorsのバリデーションチェック（未病では使っていない）
     *  2023-09-06　R＆D honda　
     */
  function validateCreators(question, value) {
    const creators = JSON.parse(value);
    if (!creators) {
      return true;
    }
    if (creators.some(function (creator) { /^[0-9a-zA-Z]*$/.test(creator.number || ''); })) {
      return false;
    }
    return true;
  }

  /** 全体保持用metadataからページmetadataに戻す
     *  2023-MM-dd　R＆D honda　
     */
  function metadata_return() {
    console.log('metadata_return search---------- 1');
    if (self.lastMetadata_hold) {
      (self.lastFields || []).forEach(function (fieldSet2) {
        console.log('metadata_return search---------- ' + fieldSet2.question.qid);
        (self.lastMetadata_hold || []).forEach(function (fieldSet) {
          if (fieldSet.question.qid == fieldSet2.question.qid) {
            console.log('metadata_return =====----->>> ' + fieldSet2.question.qid + ' = ' + fieldSet.input);
            fieldSet2.input = fieldSet.input;
          }
        });
      });
    }
  }

}

if (contextVars.metadataAddonEnabled) {
  const btn = new MetadataButtons();
  if ($('#fileViewPanelLeft').length > 0) {
    // File View
    btn.initFileView();
  } else {
    // Project Dashboard / Files
    btn.initFileTree();
  }
}
