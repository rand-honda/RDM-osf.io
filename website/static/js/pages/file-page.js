var $ = require('jquery');
var m = require('mithril');
var $osf = require('js/osfHelpers');
var FileViewPage = require('js/filepage');
var Raven = require('raven-js');

require('jquery-tagsinput');

var _ = require('js/rdmGettext')._;

m.mount(document.getElementsByClassName('file-view-panels')[0], FileViewPage(window.contextVars));

var tagUrl = '/api/v1/' + window.contextVars.node.id + '/osfstorage' + window.contextVars.file.path + '/tags/';

$(function() {
    // Tag input
    $('#fileTags').tagsInput({
        width: '100%',
        interactive: window.contextVars.currentUser.canEdit,
        maxChars: 128,
        defaultText: _('Add a file tag to enhance discoverability'),
        onAddTag: function (tag) {
            $('a[title="Removing tag"]').attr('title', _('Removing tag'));
            $('#fileTags_tag').attr('data-default', _('Add a tag'));
            var url = tagUrl;
            var request = $osf.postJSON(url, {'tag': tag });
            request.fail(function (xhr, textStatus, error) {
                $osf.growl('Error', _('Could not add tag.'));
                Raven.captureMessage(_('Failed to add tag'), {
                    extra: { tag: tag, url: url, textStatus: textStatus, error: error }
                });
            });
        },
        onRemoveTag: function (tag) {
            // Don't try to delete a blank tag (would result in a server error)
            if (!tag) {
                return false;
            }
            var request = $osf.ajaxJSON('DELETE', tagUrl, {'data': {'tag': tag}});
            request.fail(function (xhr, textStatus, error) {
                // Suppress "tag not found" errors, as the end result is what the user wanted (tag is gone)- eg could be because two people were working at same time
                if (xhr.status !== 409) {
                    $osf.growl('Error', _('Could not remove tag.'));
                    Raven.captureMessage(_('Failed to remove tag'), {
                        extra: {tag: tag, url: tagUrl, textStatus: textStatus, error: error}
                    });
                }
            });
        }
    });

    // allows inital default message to fit on empty tag -> allow all default messages width 280px
    //if(!$('.tag').length){
        $('#fileTags_tag').css('width', '280px');
    //}

    $('#fileTags_tag').attr('maxlength', '128');
    $('a[title="Removing tag"]').attr('title', _('Removing tag'));
    if (!window.contextVars.currentUser.canEdit || window.contextVars.node.isRegistration) {
        $('a[title="' + _('Removing tag') + '"]').remove();
        $('span.tag span').each(function(idx, elm) {
            $(elm).text($(elm).text().replace(/\s*$/, ''));
        });
    }

    var titleEditable = function () {
        var readOnlyProviders = ['bitbucket', 'figshare', 'dataverse', 'gitlab', 'onedrive'];
        var ctx = window.contextVars;
        if (readOnlyProviders.indexOf(ctx.file.provider) >= 0 || ctx.file.checkoutUser || !ctx.currentUser.canEdit || ctx.node.isRegistration)
            return false;
        else
            return true;
    };

    if(titleEditable()) {
        $('#fileTitleEditable').editable({
            type: 'text',
            mode: 'inline',
            send: 'always',
            url: window.contextVars.file.urls.delete,
            ajaxOptions: {
                type: 'post',
                contentType: 'application/json',
                dataType: 'json',
                beforeSend: $osf.setXHRAuthorization,
                crossOrigin: true,
            },
            validate: function(value) {
                if($.trim(value) === ''){
                    return _('The file title cannot be empty.');
                } else if(value.length > 100){
                    return _('The file title cannot be more than 100 characters.');
                }
            },
            params: function(params) {
                var payload = {
                    action: 'rename',
                    rename: params.value,
                };
                return JSON.stringify(payload);
            },
            success: function(response) {
                $osf.growl('Success', _('Your file was successfully renamed. To view the new filename in the file tree below, refresh the page.'), 'success');
            },
            error: function (response) {
                var msg = response.responseJSON.message;
                if (msg) {
                    // This is done to override inherited css style and prevent error message lines from overlapping with each other
                    $('.editable-error-block').css('line-height', '35px');
                    return msg;
                }
            }
        });
    }

    $.ajax({
        url: window.contextVars.node.urls.api + 'files/timestamp/' + window.contextVars.file.provider + window.contextVars.file.path,
        timeout: 0,
        method: 'GET'
    }).done(function (result) {
        if (result.timestamp_verify_result_title === 'OK') {
            $('#timestamp-status').html('');
        } else {
            $('#timestamp-status').html('<font color="red"><b>' + _('Timestamp verification:') + _(result.timestamp_verify_result_title) + '</b></font>');
        }
    }).fail(function (result) {
        $('#timestamp-status').html('<font color="red"><b>' + _('Timestamp verification:') + _('Fail: not responded') + '</b></font>');
    });
});
