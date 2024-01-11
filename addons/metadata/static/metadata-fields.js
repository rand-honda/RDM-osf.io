'use strict';

const $ = require('jquery');
const $osf = require('js/osfHelpers');
const fangorn = require('js/fangorn');
const rdmGettext = require('js/rdmGettext');
const _ = rdmGettext._;
const datepicker = require('js/rdmDatepicker');
require('typeahead.js');

const logPrefix = '[metadata] ';

// let previousType = null;
var rdo_btn_count = 1; //20230613 add KWT -- for radio button count
var chk_btn_count = 1; //20230613 add KWT -- for checkbox button count
// var rdo_group = 1; //20230613 add KWT -- for radio button group count
var rdo_group = '';
var set_value_count = 0;

function getLocalizedText(text) {
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

function createField(erad, question, valueEntry, options, onChange) {

  if (question.type == 'string') {
    return createStringField(erad, question, (valueEntry || {}).value, options, onChange);
  }
  if (question.type == 'choose') {
    return createChooseField(erad, question, (valueEntry || {}).value, options, onChange);
  }
  if (question.type == 'choose2') {
    return createChooseField2(erad, question, (valueEntry || {}).value, options, onChange);
  }
  if (question.type == 'choose3') {
    return createChooseField3(erad, question, (valueEntry || {}).value, options, onChange);
  }
  throw new Error('Unsupported type: ' + question.type);


}

function validateField(erad, question, value, fieldSetAndValues, options) {
  const multiple = (options || {}).multiple;

  //console.log('validateField---multiple>>>>>t:' + question.qid + ':' + multiple);
  console.log('validateField---value>>>>>t:' + question.qid + ':' + value);

  if (!multiple && question.qid == 'grdm-file:available-date') {
    return validateAvailableDateField(erad, question, value, fieldSetAndValues);
  }
  if (!multiple && question.qid == 'grdm-file:data-man-email') {
    return validateContactManagerField(erad, question, value, fieldSetAndValues);
  }

  if(question.format == "text5" && question.required && !multiple){    
    var rdo1 = question.qid.replace('grdm-file:','radiobtn-') + '0';
    rdo1 = rdo1.replace(/ /g, '-');
    console.log('validateField-----text5--value-->'+JSON.stringify(value));
    if(value['checkboxes'] == "false" && value['options'] == ""){
      throw new Error(_("This field can't be blank."));
    }
  }else if(question.format == "text6" && question.required && !multiple){
    var rdo1 = question.qid.replace('grdm-file:','radiobtn-') + '0';
    rdo1 = rdo1.replace(/ /g, '-');
    console.log('validateField-----text6--value-->'+JSON.stringify(value));    
    // if((value[rdo1] == 1 && value.hasOwnProperty('option')) || (value['option'] == "" && !value.hasOwnProperty(rdo1))){  
    if(value.hasOwnProperty('option')){  
      if(value[rdo1] != "0" && (!value.hasOwnProperty(rdo1) || !value.hasOwnProperty(rdo1+'1') || !value.hasOwnProperty(rdo1+'12') || !value.hasOwnProperty(rdo1+'123'))){      
        throw new Error(_("This field can't be blank."));
        //  console.log('validateField-----text6---check:NG option=' + value["option"] + ', '+ rdo1 + '=' +  + value[rdo1] + ', '+ rdo1+'1' + value[rdo1+'1'] + '/' + rdo1+'12' + value[rdo1+'12'] + '/' + rdo1+'123' + value[rdo1+'123']);        
      }
      
      if(value[rdo1] === "1" && value['option'] == "") {
        throw new Error(_("This field can't be blank."));
      }
      // else{
      //   console.log('validateField-----text6---check:OK option=' + value["option"] + ', '+ rdo1 + '=' +  + value[rdo1] + ', '+ rdo1+'1' + value[rdo1+'1'] + '/' + rdo1+'12' + value[rdo1+'12'] + '/' + rdo1+'123' + value[rdo1+'123']); 
      // }
    }
    // else if(value[rdo1] == 0 && value["option"] == ""){      
    //   throw new Error(_("This field can't be blank."));
    // } 

    if(value.hasOwnProperty('textbox0')){
      if(value[rdo1] == 0 && value["textbox0"] == "") {        
          // console.log('validateField-----text6---check:NG '+ rdo1 + '='+ value[rdo1] + '/textbox0=' + value['textbox0']);        
          throw new Error(_("This field can't be blank."));
      }else if (!value.hasOwnProperty(rdo1)){
          throw new Error(_("This field can't be blank."));
      } 
    }

  }else if(question.format == "text7" && question.required && !multiple){
    var rdo1 = question.qid.replace('grdm-file:','radiobtn-') + '0';
    rdo1 = rdo1.replace(/ /g, '-');
    console.log('validateField-----text7--value-->'+JSON.stringify(value));    
    if(!value.hasOwnProperty(rdo1) || value == ""){
      throw new Error(_("This field can't be blank."));
    }      
  }else{
    
    if (!value) {
      if (question.required && !multiple) {
        console.log('validateField---throw>>>>>t:' + question.qid);
        throw new Error(_("This field can't be blank."))
      }
      return;
    } else if (typeof (value) === "object") {
      console.log('validateField---object>>>>>t:' + question.required);
      if ("textarea" in value) {
        if (!value.textarea) {
          console.log('validateField---!value>>>>>t:' + question.required);
          if (question.required && !multiple) {
            console.log('validateField---throw>>>>>t:' + question.qid);
            throw new Error(_("This field can't be blank."))
          }
          return;
        }
      }
    }
  
  }




  if (question.qid == 'grdm-file:creators') {
    return validateCreators(erad, question, value);
  }
  if (question.type == 'string') {

    return validateStringField(erad, question, value);
  }
  if (question.type == 'choose') {

    return validateChooseField(erad, question, value);
  }
  if (question.type == 'choose2') {

    return validateChooseField(erad, question, value);
  }
  if (question.type == 'choose3') {

    return validateChooseField(erad, question, value);
  }

  throw new Error('Unsupported type: ' + question.type);

}

function createStringField(erad, question, value, options, onChange) {
  if (question.format == 'text') {
    return new SingleElementField(
      createFormElement(function () {
        const elem = $('<input></input>');
        //const format = question.qid.includes('grdm-file:') ? question.qid.split(':')[1].toLowerCase().replace(/\s+/g, '-') : question.id;        
        //const elem = $('<input class="form-control" type="' + content.type + '" name="'+ format + '"></input>');
        //const elem = $('<input class="form-control" type="text name="'+ format + '"></input>');
        if (question.indent) {
          elem.css('margin-left', '20px')
            .css('width', '100%');
        }
        return elem;
      }, question, options),
      (options && options.multiple) ? createClearFormElement(question) : null,
      question,
      value,
      options,
      onChange
    );
    // return new SingleElementField(
    //   createFormElement(function () {
    //     return $('<input></input>');
    //   }, question, options),
    //   (options && options.multiple) ? createClearFormElement(question) : null,
    //   question,
    //   value,
    //   options,
    //   onChange
    // );
  } else if (question.format == 'textarea') {
    return new SetElement(
      createElement(
        function () {
          const elem = $('<textarea></textarea>');
          if (question.indent) {
            elem.css('margin-left', '20px');
          }
          return elem;
        },
        question,
        options
      ),
      (options && options.multiple) ? createClearFormElement(question) : null,
      question,
      value,
      options,
      onChange
    );
    // return new SetElement(
    //   createElement(      
    //   function() { return $('<textarea></textarea>'); },
    //   question, 
    //   options
    //   ),   
    //   (options && options.multiple) ? createClearFormElement(question) : null,
    //   question,
    //   value,
    //   options,
    //   onChange
    // );
  } else if (question.format == 'date') {
    return new SingleElementField(
      createFormElement(function () {
        //const elem = $('<input></input>').addClass('datepicker');
        const elem = $('<input></input>').addClass('datepicker');
        //20230620 chg KWT -->
        if (question.indent) {
          elem.css('margin-left', '20px')
            .css('width', '100%');
        }
        //20230620 chg KWT --<
        datepicker.mount(elem, null);
        return elem;
      }, question, options),
      (options && options.multiple) ? createClearFormElement(question) : null,
      question,
      value,
      options,
      onChange
    );
  } else if (question.format == 'file-creators') {
    return new SingleElementField(
      createFileCreatorsFieldElement(erad, options),
      (options && options.multiple) ? createClearFormElement(question) : null,
      question,
      value,
      options,
      onChange
    );
  } else if (question.format == 'file-creators2') {
    return new SingleElementField(
      createFileCreatorsFieldElement2(erad, options, question), // 20230614 chg KWT
      (options && options.multiple) ? createClearFormElement(question) : null,
      question,
      value,
      options,
      onChange
    );
  } else if (question.format == 'file-creators3') {
    return new SingleElementField(
      // createFileCreatorsFieldElement3(erad, options),
      createFileCreatorsFieldElement2(erad, options, question), // 20230614 chg KWT
      (options && options.multiple) ? createClearFormElement(question) : null,
      question,
      value,
      options,
      onChange
    );
  } else if (question.format == 'file-creators4') {
    return new SingleElementField(
      createFileCreatorsFieldElement2(erad, options, question), // 20230614 chg KWT
      // createFileCreatorsFieldElement4(erad, options, question), //20230614 chg KWT
      (options && options.multiple) ? createClearFormElement(question) : null,
      question,
      value,
      options,
      onChange
    );
  } else if (question.format == 'file-creators5') {
    return new SingleElementField(
      // createFileCreatorsFieldElement5(erad, options, question), //20230612 chg KWT
      createFileCreatorsFieldElement2(erad, options, question), //20230612 chg KWT
      (options && options.multiple) ? createClearFormElement(question) : null,
      question,
      value,
      options,
      onChange
    );
  } else if (question.format == 'file-creators6') {
    return new SingleElementField(
      createFileCreatorsFieldElement2(erad, options, question), // 20230614 chg KWT
      // createFileCreatorsFieldElement6(erad, options, question), //20230622 chg KWT
      (options && options.multiple) ? createClearFormElement(question) : null,
      question,
      value,
      options,
      onChange
    );
  } else if (question.format == 'file-creators7') {
    return new SingleElementField(
      // createFileCreatorsFieldElement7(erad, options, question, value),
      createFileCreatorsFieldElement2(erad, options, question),
      // createFileCreatorsFieldElement7(erad, options, question, value),
      (options && options.multiple) ? createClearFormElement(question) : null,
      question,
      value,
      options,
      onChange
    );
  } else if (question.format == 'e-rad-researcher-number') {
    return new SingleElementField(
      createERadResearcherNumberFieldElement(erad, options),
      (options && options.multiple) ? createClearFormElement(question) : null,
      question,
      value,
      options,
      onChange
    );
  } else if (
    question.format == 'e-rad-researcher-name-ja' ||
    question.format == 'e-rad-researcher-name-en' ||
    question.format == 'file-institution-identifier'
  ) {
    return new SingleElementField(
      createFormElement(function () {
        return $('<input></input>').addClass(question.format);
      }, question, options),
      (options && options.multiple) ? createClearFormElement(question) : null,
      question,
      value,
      options,
      onChange
    );
  } else if (question.format == 'file-capacity') {
    return new SingleElementField(
      createFileCapacityFieldElement(function () {
        return $('<input></input>');
      }, options, question.qid), //20230607 add parameter KWT
      (options && options.multiple) ? createClearFormElement(question) : null,
      question,
      value,
      options,
      onChange
    );
  } else if (question.format == 'file-url') {
    return new SingleElementField(
      createFileURLFieldElement(function () {
        return $('<input></input>');
      }, options, question), //20230621 chg KWT
      (options && options.multiple) ? createClearFormElement(question) : null,
      question,
      value,
      options,
      onChange
    );
  } else if (question.format == 'text2') {
    // return new DoubleElementField(
    //   createFileURLFieldElement2(function () {
    return new TripleElementField(
      createFileURLFieldElement3(function () {
        return $('<input></input>');
      }, options, question), //20230615 chg KWT
      (options && options.multiple) ? createClearFormElement(question) : null,
      question,
      value,
      options,
      onChange
    );
  } else if (question.format == 'text3') {
    return new TripleElementField(
      createFileURLFieldElement3(function () {
        return $('<input></input>');
      }, options, question), //20230615 chg KWT
      (options && options.multiple) ? createClearFormElement(question) : null,
      question,
      value,
      options,
      onChange
    );
  } else if (question.format == 'text4') {
    return new SingleElementField(
      createFileURLFieldElement4(
        function () { return createChooser(question, options); },
        function () { return $('<input></input>'); },
        question, options),
      (options && options.multiple) ? createClearFormElement(question) : null,
      question,
      value,
      options,
      onChange
    );
  } else if (question.format == 'text5') {
    return new SingleElementField(
      createFileURLFieldElement5(
        function () { return createChooser(question, options); },
        function () { return $('<input type="checkbox"></input>'); },
        //function () { return $('<input class="form-check-input" type="checkbox" id="checktext5" style="transform:scale(1.0)"></input>'); },
        question, options),
      (options && options.multiple) ? createClearFormElement(question) : null,
      question,
      value,
      options,
      onChange
    );
    // return new SingleElementField(
    //   createFileURLFieldElement5(
    //     function () { return createChooser(question, options); },
    //     function () { return $('<input type="checkbox"></input>'); },
    //     //function () { return $('<input class="form-check-input" type="checkbox" id="checktext5" style="transform:scale(1.0)"></input>'); },
    //     question, options),
    //   null,
    //   question,
    //   value,
    //   options,
    //   onChange
    // );
  } else if (question.format == 'text6') {
    return new SingleElementField2(
      createFileURLFieldElement6(
        function () { return createChooser(question, options); },
        function () { return $('<input type="radio"></input>'); },
        question, options),
      (options && options.multiple) ? createClearFormElement(question) : null,
      question,
      value,
      options,
      onChange,
      true
    );
    // return new SingleElementField2(
    //   createFileURLFieldElement6(
    //     function () { return createChooser(question, options); },
    //     function () { return $('<input type="radio"></input>'); },
    //     question, options),
    //   null,
    //   question,
    //   value,
    //   options,
    //   onChange
    // );
  } else if (question.format == 'text7') {
    return new SingleElementField2(
      // createFileURLFieldElement7(
      createFileURLFieldElement6(
        function () { return createChooser(question, options); },
        function () { return $('<input type="radio"></input>'); },
        question, options),
      (options && options.multiple) ? createClearFormElement(question) : null,
      question,
      value,
      options,
      onChange,
      false
    );
    // return new SingleElementField2(
    //   // createFileURLFieldElement7(
    //   createFileURLFieldElement6(
    //     function () { return createChooser(question, options); },
    //     function () { return $('<input type="radio"></input>'); },
    //     question, options),
    //   null,
    //   question,
    //   value,
    //   options,
    //   onChange
    // );
  } else if (question.format == 'text8') {
    // return new SingleElementField(
    //   createFormElement2(function () {
    //     const elem = $('<input></input>');
    //     if (question.indent) {
    //       elem.css('margin-left', '20px');
    //     }
    //     return elem;
    //   }, question, options),
    //   (options && options.multiple) ? createClearFormElement(question) : null,
    //   question,
    //   value,
    //   options,
    //   onChange
    // );
    return new SetElement(
      createElement(
        function () {
          const format = question.qid.includes('grdm-file:') ? question.qid.split(':')[1].toLowerCase().replace(/\s+/g, '-') : question.qid;
          const elem = $('<input class="form-control" type="text" name="' + format + '"></input>');
          //const elem = $('<input></input>');
          if (question.indent) {
            elem.css('margin-left', '20px');
          }
          return elem;
        },
        question,
        options
      ),
      (options && options.multiple) ? createClearFormElement(question) : null,
      question,
      value,
      options,
      onChange
    );
    // return new SingleElementField(
    //   createFileURLFieldElement6(
    //     function () { return createChooser(question, options); },
    //     function () { return $('<input type="radio"></input>'); },
    //     question, options),
    //     (options && options.multiple) ? createClearFormElement(question) : null,
    //   question,
    //   value,
    //   options,
    //   onChange
    // );
    // return new SingleElementField(
    //   createFileURLFieldElement6(
    //     function () { return createChooser(question, options); },
    //     function () { return $('<input type="radio"></input>'); },
    //     question, options),
    //   null,
    //   question,
    //   value,
    //   options,
    //   onChange
    // );
  } else if (question.format == 'text9') {
    return new SingleElementField(
      createFileURLFieldElement7(
        function () { return createChooser(question, options); },
        function () { return $('<input type="radio"></input>'); },
        question, options),
      (options && options.multiple) ? createClearFormElement(question) : null,
      question,
      value,
      options,
      onChange
    );
    // return new SingleElementField(
    //   createFileURLFieldElement7(
    //     function () { return createChooser(question, options); },
    //     function () { return $('<input type="radio"></input>'); },
    //     question, options),
    //   null,
    //   question,
    //   value,
    //   options,
    //   onChange
    // );
    //const label1 = $('<input type="checkbox"></input>').append($('<label>' + _('Grid Other') + '</label>'));


  } else if (
    question.format == 'file-institution-ja' ||
    question.format == 'file-institution-en'
  ) {
    return new SingleElementField(
      createFileInstitutionFieldElement(options, question.format),
      (options && options.multiple) ? createClearFormElement(question) : null,
      question,
      value,
      options,
      onChange
    );
  }
  return new SingleElementField(
    createFormElement(function () {
      return $('<input></input>');
    }, question, options),
    (options && options.multiple) ? createClearFormElement(question) : null,
    question,
    value,
    options,
    onChange
  );
}

function createChooseField(erad, question, value, options, onChange) {
  if (question.format == 'singleselect') {
    return new SingleElementField(
      createFormElement(function () {
        return createChooser(question, options);
      }, question, options),
      null,
      question,
      value,
      options,
      onChange
    );
  }
  return new SingleElementField(
    createFormElement(function () {
      return $('<input></input>');
    }, question, options),
    null,
    question,
    value,
    options,
    onChange
  );
}

function createChooseField2(erad, question, value, options, onChange) {
  if (question.format == 'singleselect') {
    return new SingleElementField2(
      createFormElement(function () {
        return createChooser(question, options);
      }, question, options),
      null,
      question,
      value,
      options,
      onChange,
      false
    );
  }
  return new SingleElementField2(
    createFormElement(function () {
      return $('<input></input>');
    }, question, options),
    null,
    question,
    value,
    options,
    onChange,
    false
  );
}

function createChooseField3(erad, question, value, options, onChange) {
  if (question.format == 'singleselect') {
    return new SingleElementField3(
      createFormElement(function () {
        return createChooser(question, options);
      }, question, options),
      null,
      question,
      value,
      options,
      onChange
    );
  }
  return new SingleElementField3(
    createFormElement(function () {
      return $('<input></input>');
    }, question, options),
    null,
    question,
    value,
    options,
    onChange
  );
}

function validateStringField(erad, question, value) {
  if (question.pattern && !(new RegExp(question.pattern).test(value))) {
    throw new Error(_("Please enter the correct value. ") + getLocalizedText(question.help));
  }
}

function validateChooseField(erad, question, value) {
}

function validateAvailableDateField(erad, question, value, fieldSetAndValues) {
  const accessRightsPair = fieldSetAndValues.find(function (fieldSetAndValue) {
    return fieldSetAndValue.fieldSet.question.qid === 'grdm-file:access-rights';
  })
  if (!accessRightsPair) return;
  const requiredDateAccessRights = ['embargoed access'];
  if (requiredDateAccessRights.includes(accessRightsPair.value) && !value) {
    throw new Error(_("This field can't be blank."));
  }
}

function validateContactManagerField(erad, question, value, fieldSetAndValues) {
  function getFieldValue(qid) {
    const field = fieldSetAndValues.find(function (fieldSetAndValue) {
      return fieldSetAndValue.fieldSet.question.qid === qid;
    });
    if (!field) return null;
    return field.value;
  }

  const email = value;
  const tel = getFieldValue('grdm-file:data-man-tel');
  const address = getFieldValue('grdm-file:data-man-address-ja') &&
    getFieldValue('grdm-file:data-man-address-en');
  const org = getFieldValue('grdm-file:data-man-org-ja') &&
    getFieldValue('grdm-file:data-man-org-en');

  if (!email && !(tel && address && org)) {
    throw new Error(_("Contacts of data manager can't be blank. Please fill mail address, or organization name, address and phone number."));
  }
}

function validateCreators(erad, question, value) {
  const creators = JSON.parse(value);
  if (!creators) {
    return;
  }
  if (creators.some(function (creator) {
    return ! /^[0-9a-zA-Z]*$/.test(creator.number || '');
  })) {
    throw new Error(_("Please enter the correct value. ") + getLocalizedText(question.help));
  }
}

function createChooser(question, options) {
  const select = $('<select></select>');
  const defaultOption = $('<option></option>').attr('value', '');

  //20230620 chg KWT -->
  if (question.indent) {
    select.css('margin-left', '20px')
      .css('width', '100%');
  }
  //20230620 chg KWT <--

  if (options.multiple) {
    defaultOption.text(_('(Not Modified)'));
    defaultOption.attr('selected', true)
  } else {
    defaultOption.text(_('Choose...'));
  }
  select.append(defaultOption);
  var groupElem = null;
  (question.options || []).forEach(function (opt) {
    if (opt.text && opt.text.startsWith('group:None:')) {
      groupElem = null;
    } else if (opt.text && opt.text.startsWith('group:')) {
      groupElem = $('<optgroup></optgroup>').attr('label', getLocalizedText(opt.tooltip));
      select.append(groupElem);
    } else {
      const optElem = $('<option></option>')
        .attr('value', opt.text === undefined ? opt : opt.text)
        .text(opt.text === undefined ? opt : getLocalizedText(opt.tooltip));
      if (!options.multiple && opt.default) {
        optElem.attr('selected', true);
      }
      if (groupElem) {
        groupElem.append(optElem);
      } else {
        select.append(optElem);
      }
    }
  });
  return select;
}

function createChooser1(selectElement, value, options) {
  const defaultOption = $('<option></option>').attr('value', '');

  //20230620 chg KWT -->
  if (value.indent) {
    selectElement.css('margin-left', '20px');
  }
  //20230620 chg KWT <--

  if (options.multiple) {
    defaultOption.text(_('(Not Modified)'));
    defaultOption.attr('selected', true)
  } else {
    defaultOption.text(_('Choose...'));
  }
  selectElement.append(defaultOption);

  const optElem = $('<option></option>')
    .attr('value', value.text === undefined ? value : value.text)
    .text(value.text === undefined ? value : getLocalizedText(value.tooltip));
  if (!options.multiple && value.default) {
    optElem.attr('selected', true);
  }
  selectElement.append(optElem);
  return selectElement;
}

function createChooser_mib(question, options) {
  const select = $('<select></select>');
  const defaultOption = $('<option></option>').attr('value', '');
  if (options.multiple) {
    defaultOption.text(_('(Not Modified)'));
    defaultOption.attr('selected', true)
  } else {
    defaultOption.text(_('Choose...'));
  }
  select.css('margin-left', '2em')
  select.append(defaultOption);
  var groupElem = null;
  (question.options || []).forEach(function (opt) {
    if (opt.text && opt.text.startsWith('group:None:')) {
      groupElem = null;
    } else if (opt.text && opt.text.startsWith('group:')) {
      groupElem = $('<optgroup></optgroup>').attr('label', getLocalizedText(opt.tooltip));
      select.append(groupElem);
    } else {
      const optElem = $('<option></option>')
        .attr('value', opt.text === undefined ? opt : opt.text)
        .text(opt.text === undefined ? opt : getLocalizedText(opt.tooltip));
      if (!options.multiple && opt.default) {
        optElem.attr('selected', true);
      }
      if (groupElem) {
        groupElem.append(optElem);
      } else {
        select.append(optElem);
      }
    }
  });
  return select;
}

function normalize(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function createElement(createElement, question, options) {
  return {
    create: function (addToContainer, onChange) {
      //console.log('createElement---create---start:'+question.qid);
      const self = this;
      self.label = question.qid;
      self.title = question.title;
      self.help = question.help;
      // self.clearField = null;

      const container = $('<div></div>');

      const label = $('<label></label>').text(
        function () {
          if (!self.title) {
            return "";
          }
          return getLocalizedText(self.title);
        }
      );

      if (question.indent) {
        label.css('margin-left', '20px');
      }

      if (question.auto_value) {
        label.append('<span>&nbsp; &#10227</span>');
      }

      if (question.required) {
        label.append($('<span></span>')
          .css('color', 'red')
          .css('font-weight', 'bold')
          .text('*')
        );
      }

      container.append(label);

      //下に移動してみる
      // if (self.help) {
      //   var isDisplayedHelp = false;
      //   const helpLink = $('<a></a>')
      //     .addClass('help-toggle-button')
      //     .text(_('Show example'));

      //   //20230607 KWT add -->  
      //   //const p = $('<p></p>').append(helpLink);
      //   const p = $('<p></p>')
      //   .css('padding','0px')
      //   .css('margin', '20px')
      //   .append(helpLink);
      //   if (question.indent) {
      //     p.css('margin-left', '20px');
      //   }

      //   const helpLinkBlock = p;
      //   //20230607 KWT add --<

      //   const help = $('<p></p>')
      //     .addClass('help-block')
      //     .text(
      //       function() {
      //         return getLocalizedText(self.help);
      //       }
      //     )
      //     .hide();
      //   helpLink.on('click', function (e) {
      //     e.preventDefault();
      //     if (isDisplayedHelp) {
      //       helpLink.text(_('Show example'));
      //       help.hide();
      //       isDisplayedHelp = false;
      //     } else {
      //       helpLink.text(_('Hide example'));
      //       help.show();
      //       isDisplayedHelp = true;
      //     }
      //   });
      //   container.append(helpLinkBlock).append(help);
      // }

      // 項目名の別名
      if (question.alias) {
        const alias_input = $('<input></input>')
          .attr('id', 'alias')
          .css('margin-left', '10px');
        container.append(alias_input);
      }

      if (self.help) {
        var isDisplayedHelp = false;
        const helpLink = $('<a></a>')
          .addClass('help-toggle-button')
          .text(_('Show example'));

        //20230607 KWT add -->  
        //const p = $('<p></p>').append(helpLink);
        const p = $('<p></p>')
          .css('padding', '0px')
          .css('margin', '10px')
          .append(helpLink);
        if (question.indent) {
          p.css('margin-left', '20px');
        }

        const helpLinkBlock = p;
        //20230607 KWT add --<

        const help = $('<p></p>')
          .addClass('help-block')
          .text(
            function () {
              return getLocalizedText(self.help);
            }
          )
          .hide();
        helpLink.on('click', function (e) {
          e.preventDefault();
          if (isDisplayedHelp) {
            helpLink.text(_('Show example'));
            help.hide();
            isDisplayedHelp = false;
          } else {
            helpLink.text(_('Hide example'));
            help.show();
            isDisplayedHelp = true;
          }
        });
        container.append(helpLinkBlock).append(help);
      }

      // element 
      const element = createElement();
      if (options && options.readonly) {
        element.attr('readonly', true);
      }
      if (onChange) {
        element.change(function (event) {
          const value = event.target.value
          if (value && question.space_normalization) {
            const normalized = normalize(value);
            if (value !== normalized) {
              self.setValue(element, normalized);
            }
          }
          onChange(event, options);
        });
      }
      element.addClass('form-control');
      container.append(element);

      // element 組み合わせ
      addToContainer(container);
      //console.log('createElement---create---end:'+question.qid);
      return container;

    }, 
    getValue: function (container) {
      var json = {};
      var format = question.qid.includes('grdm-file:') ? question.qid.split(':')[1].toLowerCase().replace(/\s+/g, '-') : question.id;

      //console.log('createElement---getValue---start');
      if (container.find('input#alias').length > 0
        && container.find('textarea').length > 0) {

        if (container.find('input#alias').length > 0) {
          json['alias'] = container.find('input#alias').val();
        }

        if (container.find('textarea').length > 0) {
          json['textarea'] = container.find('textarea').val();
        }
        //console.log('createElement---getValue---end');    
        return json;
      } else if (container.find('input#alias').length > 0
        && container.find('.form-control').length > 0) {
          
        console.log('createElement---getValue---aliasform-control');
        if (container.find('input#alias').length > 0) {
          console.log('createElement---getValue---alias');
          json['alias'] = container.find('input#alias').val();
        }

        if (container.find('.form-control').length > 0) {
          console.log('createElement---getValue---form-control');
          json['.form-control'] = container.find('.form-control').val();
        }
        console.log('createElement---getValue---end');
        return json;

      } else if (container.find('input#alias').length > 0
        && container.find(format).length > 0) {

        if (container.find('input#alias').length > 0) {
          json['alias'] = container.find('input#alias').val();
        }

        if (container.find(format).length > 0) {
          json[format] = container.find(format).val();
        }
        //console.log('createElement---getValue---end');    
        return json;

      } else {
        //console.log('createElement---getValue---end');
        return container.find('input').val();
      }
    },
    setValue: function (container, value) {
      console.log('createElement---setValue---start' + question.qid);
      console.log('createElement---setValue---' + JSON.stringify(container));
      var format = question.qid.includes('grdm-file:') ? question.qid.split(':')[1].toLowerCase().replace(/\s+/g, '-') : question.id;

      if (container.hasClass('datepicker')) {
        container.datepicker('update', value);
      } else if (container.find('input#alias').length > 0
        && container.find('textarea').length > 0) {

        console.log('createElement---setValue---' + value);
        console.log('createElement---setValue---' + JSON.stringify(value));
        console.dir(value);

        if (container.find('input#alias').length > 0) {
          container.find('input#alias').val(value.alias);
          //container.find('input#alias').val('apple');
        }

        if (container.find('textarea').length > 0) {
          container.find('textarea').val(value.textarea);
          //container.find('textarea').val('orange');
        }
      } else if (container.find('input#alias').length > 0
        && container.find('.form-control').length > 0) {

        console.log('createElement---setValue---' + value);
        console.log('createElement---setValue---' + JSON.stringify(value));
        console.dir(value);

        if (value) {
          if (container.find('input#alias').length > 0) {
            container.find('input#alias').val(value.alias);
            //container.find('input#alias').val('apple');
          }
  
          if (container.find('.form-control').length > 0) {
            container.find('.form-control').val(value[".form-control"]);
            //container.find(format).val('orange');
          }  
        }

      } else {
        container.val(value);
      }
      console.log('createElement---setValue---end');
    },
    reset: function (container) {
      if (container.find('textarea').length > 0) {
        container.find('textarea').val(null);
      }
      if (container.find('.form-control').length > 0) {
        container.find('.form-control').val(null);
      }  
      //container.val(null);
    },
    disable: function (container, disabled) {
      if (container.find('textarea').length > 0) {
        container.find('textarea').attr('disabled', disabled);
      }      
      if (container.find('.form-control').length > 0) {
        container.find('.form-control').attr('disabled', disabled);
        //container.find(format).val('orange');
      }  
      //container.attr('disabled', disabled);
    },
    // reset: function (input) {
    //   input.val(null);
    // },
    // disable: function (input, disabled) {
    //   input.attr('disabled', disabled);
    // },

  };
}

function createElement_mibyo(createElement, question, options, clearField) {
  return {
    create: function (addToContainer, onChange) {
      console.log('createElement---create---start:' + question.qid);
      const self = this;
      self.label = question.qid;
      self.title = question.title;
      self.help = question.help;
      self.clearField = null;

      const container = $('<div></div>');

      const label = $('<label></label>').text(
        function () {
          if (!self.title) {
            return "";
          }
          return getLocalizedText(self.title);
        }
      );

      if (question.indent) {
        label.css('margin-left', '20px');
      }

      if (question.auto_value) {
        label.append('<span>&nbsp; &#10227</span>');
      }

      if (question.required) {
        label.append($('<span></span>')
          .css('color', 'red')
          .css('font-weight', 'bold')
          .text('*')
        );
      }

      container.append(label);

      if (self.help) {
        var isDisplayedHelp = false;
        const helpLink = $('<a></a>')
          .addClass('help-toggle-button')
          .text(_('Show example'));

        //20230607 KWT add -->  
        //const p = $('<p></p>').append(helpLink);
        const p = $('<p></p>')
          .css('padding', '0px')
          .css('margin', '20px')
          .append(helpLink);
        if (question.indent) {
          p.css('margin-left', '20px');
        }

        const helpLinkBlock = p;
        //20230607 KWT add --<

        const help = $('<p></p>')
          .addClass('help-block')
          .text(
            function () {
              return getLocalizedText(self.help);
            }
          )
          .hide();
        helpLink.on('click', function (e) {
          e.preventDefault();
          if (isDisplayedHelp) {
            helpLink.text(_('Show example'));
            help.hide();
            isDisplayedHelp = false;
          } else {
            helpLink.text(_('Hide example'));
            help.show();
            isDisplayedHelp = true;
          }
        });
        container.append(helpLinkBlock).append(help);
      }

      // 項目名の別名
      if (question.alias) {
        const alias_input = $('<input></input>')
          .attr('id', 'alias')
          .css('margin-left', '10px');
        container.append(alias_input);
      }

      // element 
      const element = createElement();
      if (options && options.readonly) {
        element.attr('readonly', true);
      }
      if (onChange) {
        element.change(function (event) {
          const value = event.target.value
          if (value && question.space_normalization) {
            const normalized = normalize(value);
            if (value !== normalized) {
              self.setValue(element, normalized);
            }
          }
          onChange(event, options);
        });
      }
      element.addClass('form-control');
      container.append(element);

      // element 組み合わせ
      addToContainer(container);
      console.log('createElement---create---end:' + question.qid);
      return container;

    }, getValue: function (container) {
      var json = {};
      console.log('createElement---getValue---start');
      if (container.find('input#alias').length > 0
        && container.find('textarea').length > 0) {

        if (container.find('input#alias').length > 0) {
          json['alias'] = container.find('input#alias').val();
        }

        if (container.find('textarea').length > 0) {
          json['textarea'] = container.find('textarea').val();
        }
        console.log('createElement---getValue---end');
        return json;

      } else {
        console.log('createElement---getValue---end');
        return container.find('input').val();
      }
    },
    setValue: function (container, value) {
      console.log('createElement---setValue---start');
      if (container.hasClass('datepicker')) {
        container.datepicker('update', value);
        // }else if(container.find('input#alias').length > 0
        // && container.find('textarea').length > 0){

        //   if(container.find('input#alias').length > 0){
        //     container.find('input#alias').val('apple');
        //   }

        //   if(container.find('textarea').length > 0){
        //     container.find('textarea').val('orange');
        //   }                   

      } else {
        container.val(value);
      }
      console.log('createElement---setValue---end');
    },
    reset: function (container) {
      container.val(null);
    },
    disable: function (container, disabled) {
      container.attr('disabled', disabled);
    },
  };
}

function createFormElement(createHandler, question, options) {
  const format = question.qid.includes('grdm-file:') ? question.qid.split(':')[1].toLowerCase().replace(/\s+/g, '-') : question.id;

  return {
    create: function (addToContainer, onChange) {
      //console.log('createFormElement-----create-start');
      const self = this;
      const elem = createHandler();
      if (options && options.readonly) {
        elem.attr('readonly', true);
      }
      if (onChange) {
        elem.change(function (event) {
          const value = event.target.value
          if (value && question.space_normalization) {
            const normalized = normalize(value);
            if (value !== normalized) {
              self.setValue(elem, normalized);
            }
          }
          onChange(event, options);
        });
      }
      //elem.addClass('form-control');
      elem.addClass('form-control')
        .attr('type', 'text')
        .attr('name', format);
      //contentInputs = $('<input class="form-control" type="' + content.type + '" name="'+ format + '-' + content.text + '">');
      addToContainer(elem);
      //console.log('createFormElement-----create-end');
      return elem;
    },
    getValue: function (input) {
      console.log('createFormElement-----getValue-start');
      var json = {};

      if (input.closest('.form-group').find('input#alias').length > 0)
      {
        console.log('createFormElement-----getValue-closesetalias---ok');
      }
      if (input.closest('.form-group').find('select option').length > 0) {
        console.log('createFormElement-----getValue-closeelect option---ok');
      }
      if (input.find('select option').length > 0) {
        console.log('createFormElement-----getValue-select option---ok');
      }

      if (input.closest('.form-group').find('input#alias').length > 0
      && input.find('textarea').length > 0) {

        if (input.closest('.form-group').find('input#alias').length > 0) {
          json['alias'] = input.closest('.form-group').find('input#alias').val();
        }

        if (input.find('textarea').length > 0) {
          json['textarea'] = input.val();
        }
        console.log('createFormElement-----getValueA-end');
        return json;
      } else if (input.closest('.form-group').find('input#alias').length > 0
      && input.closest('.form-group').find('select option').length > 0) {

        if (input.closest('.form-group').find('input#alias').length > 0) {
          json['alias'] = input.closest('.form-group').find('input#alias').val();
          console.log('createElement---getValue---alias');
        }

        if (input.closest('.form-group').find('select option').length > 0) {
          json['options'] = input.closest('.form-group').find('select option:selected').val();
          console.log('createElement---getValue---select');
        }
        //ok    
        console.log('createFormElement-----getValueB-end'+JSON.stringify(json));
        return json;

      } else if (input.closest('.form-group').find('input#alias').length > 0
      && input.find('select option').length > 0) {

        if (input.closest('.form-group').find('input#alias').length > 0) {
          json['alias'] = input.closest('.form-group').find('input#alias').val();
          console.log('createElement---getValue---alias2');
        }

        if (input.find('select option').length > 0) {
          json['options'] = input.find('select option:selected').val();
          console.log('createElement---getValue---select2');
        }
            
        console.log('createFormElement-----getValueB2-end'+JSON.stringify(json));
        return json;


      } else {
        console.log('createFormElement-----getValueN-end');
        return input.val();
      }
      // return input.val();
    },
    setValue: function (input, value) {
      console.log('createFormElement-----setValue-start');
      console.log('createFormElement-----setValue-start'+question.qid + ' --> ' + JSON.stringify(value));
      console.log('createFormElement-----setValue-start'+question.qid + ' --> ' + JSON.stringify(value));

      // if (input.find('input#alias').length > 0) {
      //   console.log('createFormElement-----setValue-alias---ok');
      // }
      if (input.find('select option').length > 0) {
        console.log('createFormElement-----setValue-select option---ok');
      }
      if (input.closest('.form-group').find('input#alias').length > 0)
      {
        //ok
        console.log('createFormElement-----setValue-closesetalias---ok');
        //console.log('createFormElement-----setValue-aliasv'+value);
        //console.log('createFormElement-----setValue-aliasal'+value.alias);
      }
      if (input.closest('.form-group').find('select option').length > 0) {
        //ok
        console.log('createFormElement-----setValue-closeelect option---ok');
        //console.log('createFormElement-----setValue-selectv'+value);
        //console.log('createFormElement-----setValue-selectop'+value.options);
      }

      if (input.hasClass('datepicker')) {
        input.datepicker('update', value);
      } else if (input.closest('.form-group').find('input#alias').length > 0
        && input.find('textarea').length > 0) {

        if (input.closest('.form-group').find('input#alias').length > 0) {
          input.closest('.form-group').find('input#alias').val('apple');
        }

        if (input.find('textarea').length > 0) {
          input.val(value);
        }

      } else if (input.closest('.form-group').find('input#alias').length > 0
      && input.closest('.form-group').find('select option').length > 0) {

        if (value) {
          if (input.closest('.form-group').find('input#alias').length > 0) {
            input.closest('.form-group').find('input#alias').val(value.alias);
            //input.closest('.form-group').find('input#alias').val(value.alias);
            //console.log('createFormElement-----setValue-alias'+value.alias);
          }       

          if (input.closest('.form-group').find('select option').length > 0) {
            //input.closest('.form-group').find('input#alias').val(value.alias);
            input.closest('.form-group').find('select option[value="' + value.options + '"]').attr('selected', true);
            //input.find('select option[value="' + value.options + '"]').attr('selected', true);
            //console.log('createFormElement-----setValue-select'+value.options);
          }
        }

        // for (var key in value) {
        //   if (value.hasOwnProperty(key)) {
        //     var itemValue = value[key];
  
        //     if (key == 'alias') {
        //       input.find('input#alias').val(itemValue);
        //       console.log('createFormElement-----setValue-alias');
        //     }
  
        //     if (key == 'option') {
        //       input.find('select option[value="' + itemValue + '"]').attr('selected', true);
        //       console.log('createFormElement-----setValue-select');
        //     }
        //     console.log(question.qid + ' --> ' + JSON.stringify(itemValue));
        //   }
        //}
  
        console.log('createFormElement-----setValueN-end');
        //return json;

      } else {
        input.val(value);
      }
      //console.log('createFormElement-----setValue-start');
    },
    reset: function (input) {
      input.val(null);
    },
    disable: function (input, disabled) {
      input.attr('disabled', disabled);
    },
  };
}

function createFormElement2(createHandler, question, options) {
  const format = question.qid.includes('grdm-file:') ? question.qid.split(':')[1].toLowerCase().replace(/\s+/g, '-') : question.id;

  return {
    create: function (addToContainer, onChange) {
      //console.log('createFormElement-----create-start');
      const self = this;
      const elem = createHandler();
      //const elem = createHandler();
      if (options && options.readonly) {
        elem.attr('readonly', true);
      }
      if (onChange) {
        elem.change(function (event) {
          const value = event.target.value
          if (value && question.space_normalization) {
            const normalized = normalize(value);
            if (value !== normalized) {
              self.setValue(elem, normalized);
            }
          }
          onChange(event, options);
        });
      }
      //elem.addClass('form-control');
      elem.addClass('form-control')
        .attr('type', 'text')
        .attr('name', format);
      //contentInputs = $('<input class="form-control" type="' + content.type + '" name="'+ format + '-' + content.text + '">');
      addToContainer(elem);
      //console.log('createFormElement-----create-end');
      return elem;
    },
    getValue: function (input) {
      console.log('createFormElement2[][][]getValue-start');
      var json = {};
      if (input.find('input#alias').length > 0
        && input.find('.form-control').length > 0) {

        if (input.find('input#alias').length > 0) {
          json['alias'] = input.find('input#alias').val();
        }

        if (input.find('.form-control').length > 0) {
          json['.form-control'] = input.find('.form-control').val();
        }
        console.log('createFormElement2[][][]getValue1-end');
        //console.log('createElement---getValue---end');    
        return json;
        // }
        // if (input.closest('.form-group').find('input#alias').length > 0) {

        //   if (input.closest('.form-group').find('input#alias').length > 0) {
        //     json['alias'] = input.closest('.form-group').find('input#alias').val();
        //   }
        //   json['.form-control'] = input.val();
        //   console.log('createFormElement2[][][]getValue1-end');
        //   return json;

      } else {
        console.log('createFormElement2[][][]getValue2-end');
        return input.val();
      }
      // return input.val();
    },
    setValue: function (input, value) {
      console.log('createFormElement2[][][]setValue-start');
      console.log('createElement---setValue---' + value);
      console.log('createElement---setValue---' + JSON.stringify(value));
      console.dir(value);
      if (input.find('input#alias').length > 0) {
        console.log('createFormElement2[][][]setValue-2unit');

        if (input.find('input#alias').length > 0) {
          input.find('input#alias').val(value.alias);
          //input.closest('.form-group').find('input#alias').val(value.alias);
        }

        if (container.find(format).length > 0) {
          container.find('input').val(value.input);
        }

        //input.val(value);

      } else {
        console.log('createFormElement2[][][]setValue-1unit');
        input.val(value);
      }
      console.log('createFormElement2[][][]setValue-start');
    },
    reset: function (input) {
      input.val(null);
    },
    disable: function (input, disabled) {
      input.attr('disabled', disabled);
    },
  };
}

function createClearFormElement(question) {
  return {
    create: function () {
      const clearId = 'clear-' + question.qid.replace(':', '-');
      const clearField = $('<input></input>')
        .addClass('form-check-input')
        .addClass('metadata-form-clear-checkbox')
        .attr('type', 'checkbox')
        .attr('id', clearId);
      const clearLabel = $('<label></label>')
        .addClass('form-check-label')
        .attr('for', clearId)
        .text(_('Clear'));
      const clearForm = $('<div></div>')
        .addClass('form-check')
        .append(clearField)
        .append(clearLabel);
      return {
        element: clearForm,
        checked: function () {
          return clearField.prop('checked');
        }
      };
    }
  };
}

//未病データベース構築_プロトタイプ　（

function SetElement(formField, question, defaultValue, onChange) {
  if (!question.qid) {
    throw new Error('No labels');
  }
  const self = this;

  self.formField = formField;
  self.defaultValue = defaultValue;

  self.createFormGroup = function (input, errorContainer) {
    const group = $('<div></div>').addClass('form-group');
    group
      .append(input)
      .append(errorContainer);
    return group;
  }

  self.getValue = function (input) {
    return formField.getValue(input);
  };

  self.setValue = function (input, value) {
    formField.setValue(input, value);
  };

  self.checkedClear = function () {
    return self.clearField && self.clearField.checked();
  };

  self.addElementTo = function (parent, errorContainer) {
    console.log('addElementTo' + question.qid + ' ------- start ');

    const input = formField.create(
      function (child) {
        parent.append(self.createFormGroup(child, errorContainer));
      },
      onChange
    );
    // console.log(input);
    var format = question.qid.includes('grdm-file:') ? question.qid.split(':')[1].toLowerCase().replace(/\s+/g, '-') : question.id;
    console.log(question.qid + ' --> ' + self.defaultValue);
    // if (self.defaultValue) {
    if (input.find('input[type="checkbox"]').length > 0
      && input.find('select option').length > 0) {

      for (var key in self.defaultValue) {
        if (self.defaultValue.hasOwnProperty(key)) {
          var value = self.defaultValue[key];

          if (key == 'checkboxes') {
            if (value == 'true') {
              // console.log(value);
              input.find('input[type="checkbox"]').prop('checked', true);
              formField.setValue(input, 'true');
            } else {
              // console.log(value);
              input.find('input[type="checkbox"]').prop('checked', true);
              formField.setValue(input, 'false');
            }
          }

          if (key == 'options') {
            input.find('select option[value="' + value + '"]').attr('selected', true);
          }

          // console.log(`Key: ${key}, Value: ${JSON.stringify(value)}`);
          // console.log(question.qid+' --> '+ JSON.stringify(value));
        }
      }

    } else if (input.find('input[type="radio"]').length > 0
      && input.find('select option').length > 0) {
      for (var key in self.defaultValue) {
        if (self.defaultValue.hasOwnProperty(key)) {
          var value = self.defaultValue[key];

          if (key == 'radios') {
            console.log(value);
            input.find('input[type="radio"][value="' + value + '"]').prop('checked', true);
          }

          if (key == 'options') {
            console.log(value);
            input.find('select option[value="' + value + '"]').attr('selected', true);
          }

          console.log(question.qid + ' --> ' + JSON.stringify(value));
        }
      }

    } else if (input.find('input[type="checkbox"]').length > 0
      && !input.find('select option').length) {
      if (self.defaultValue) {
        input.find('input[type="checkbox"]').prop('checked', true);
      } else {
        input.find('input[type="checkbox"]').prop('checked', false);
      }
    } else if (input.find('input[type="radio"]').length > 0
      && !input.find('select option').length) {
      input.find('input[type="radio"][value="' + self.defaultValue + '"]').prop('checked', true);
    } else if (input.find('input#alias').length > 0
      && input.find('textarea').length > 0) {
      for (var key in self.defaultValue) {
        if (self.defaultValue.hasOwnProperty(key)) {
          var value = self.defaultValue[key];

          if (key == 'alias') {
            input.find('input#alias').val(value);
          }

          if (key == 'textarea') {
            input.find('textarea').val(value);
          }
          console.log(question.qid + ' --> ' + JSON.stringify(value));
        }
      }
    } else if (input.find('input#alias').length > 0
    && input.find('.form-control').length > 0) {
    for (var key in self.defaultValue) {
      if (self.defaultValue.hasOwnProperty(key)) {
        var value = self.defaultValue[key];

        if (key == 'alias') {
          input.find('input#alias').val(value);
        }

        if (key == '.form-control') {
          input.find('.form-control').val(value);
        }
        console.log(question.qid + ' --> ' + JSON.stringify(value));
      }
    }
    } else if (input.find('input#alias').length > 0
      && input.find(format).length > 0) {
      for (var key in self.defaultValue) {
        if (self.defaultValue.hasOwnProperty(key)) {
          var value = self.defaultValue[key];

          if (key == 'alias') {
            input.find('input#alias').val(value);
          }

          if (key == format) {
            input.find(format).val(value);
          }
          console.log(question.qid + ' --> ' + JSON.stringify(value));
        }
      }
    } else {
      console.log('addElementTo' + question.qid + ' ------- else ');
      formField.setValue(input, self.defaultValue);
    }

    console.log('addElementTo' + question.qid + ' ------- End ');

    return input;
  };
}

function SetElement(formField, clearField, question, defaultValue, options, onChange) {
  if (!question.qid) {
    throw new Error('No labels');
  }
  const self = this;

  self.formField = formField;
  self.label = question.qid;
  // self.title = question.title;
  // self.help = question.help;
  self.defaultValue = defaultValue;
  self.clearField = null;

  self.createFormGroup = function (input, errorContainer) {

    const group = $('<div></div>').addClass('form-group');

    if (clearField) {
      self.clearField = clearField.create();
      self.clearField.element.css('float', 'right');
      self.clearField.element.on('change', function () {
        if (self.clearField.checked()) {
          self.formField.reset(input);
          self.formField.disable(input, true);
        } else {
          self.formField.disable(input, false);
        }
      });
      //input.append(self.clearField.element);
      // self.clearField.element.insertAfert(input);
      // input = self.clearField.element;
      //input.insertAfert(self.clearField.element);
      //header.append(self.clearField.element);
      //group.append(self.clearField.element);
      input.prepend(self.clearField.element);
      //input.append(self.clearField.element);
    }


    //const group = $('<div></div>').addClass('form-group');

    group
      .append(input)
      .append(errorContainer);
    return group;
  }

  self.getDisplayText = function () {
    if (!self.title) {
      return "";
    }
    return getLocalizedText(self.title);
  }

  self.getHelpText = function () {
    return getLocalizedText(self.help);
  }

  self.getValue = function (input) {
    return formField.getValue(input);
  };

  self.setValue = function (input, value) {
    formField.setValue(input, value);
  };

  self.checkedClear = function () {
    return self.clearField && self.clearField.checked();
  };

  self.addElementTo = function (parent, errorContainer) {
    const input = formField.create(
      function (child) {
        parent.append(self.createFormGroup(child, errorContainer));
      },
      onChange
    );
    // console.log(input);
    console.log('setElement' + question.qid + ' --> ' + self.defaultValue);
    // if (self.defaultValue) {
    if (input.find('input[type="checkbox"]').length > 0
      && input.find('select option').length > 0) {

      for (var key in self.defaultValue) {
        if (self.defaultValue.hasOwnProperty(key)) {
          var value = self.defaultValue[key];

          if (key == 'checkboxes') {
            if (value == 'true') {
              // console.log(value);
              input.find('input[type="checkbox"]').prop('checked', true);
              formField.setValue(input, 'true');
            } else {
              // console.log(value);
              input.find('input[type="checkbox"]').prop('checked', true);
              formField.setValue(input, 'false');
            }
          }

          if (key == 'options') {
            input.find('select option[value="' + value + '"]').attr('selected', true);
          }

          // console.log(`Key: ${key}, Value: ${JSON.stringify(value)}`);
          // console.log(question.qid+' --> '+ JSON.stringify(value));
        }
      }

    } else if (input.find('input[type="radio"]').length > 0
      && input.find('select option').length > 0) {
      for (var key in self.defaultValue) {
        if (self.defaultValue.hasOwnProperty(key)) {
          var value = self.defaultValue[key];

          if (key == 'radios') {
            console.log(value);
            input.find('input[type="radio"][value="' + value + '"]').prop('checked', true);
          }

          if (key == 'options') {
            console.log(value);
            input.find('select option[value="' + value + '"]').attr('selected', true);
          }
          console.log(question.qid + ' --> ' + JSON.stringify(value));
        }
      }

    } else if (input.find('input[type="checkbox"]').length > 0
      && !input.find('select option').length) {
      if (self.defaultValue) {
        input.find('input[type="checkbox"]').prop('checked', true);
      } else {
        input.find('input[type="checkbox"]').prop('checked', false);
      }
    } else if (input.find('input[type="radio"]').length > 0
      && !input.find('select option').length) {
      input.find('input[type="radio"][value="' + self.defaultValue + '"]').prop('checked', true);
    } else if (input.find('input#alias').length > 0
      && input.find('textarea').length > 0) {
      for (var key in self.defaultValue) {
        if (self.defaultValue.hasOwnProperty(key)) {
          var value = self.defaultValue[key];

          if (key == 'alias') {
            input.find('input#alias').val(value);
          }

          if (key == 'textarea') {
            input.find('textarea').val(value);
          }
          console.log('setElement---textarea' + question.qid + ' --> ' + JSON.stringify(value));
        }
      }
    } else {
      console.log('setElement---else' + question.qid + ' --> ' + JSON.stringify(value));
      formField.setValue(input, self.defaultValue);
    }

    return input;
  };
}

function SetElement_mibyo(formField, clearField, question, defaultValue, options, onChange) {
  if (!question.qid) {
    throw new Error('No labels');
  }
  const self = this;

  self.formField = formField;
  self.label = question.qid;
  // self.title = question.title;
  // self.help = question.help;
  self.defaultValue = defaultValue;
  self.clearField = null;

  self.createFormGroup = function (input, errorContainer) {
    if (clearField) {
      self.clearField = clearField.create();
      self.clearField.element.css('float', 'right');
      self.clearField.element.on('change', function () {
        if (self.clearField.checked()) {
          self.formField.reset(input);
          self.formField.disable(input, true);
        } else {
          self.formField.disable(input, false);
        }
      });
      //header.append(self.clearField.element);
      input.append(self.clearField.element);
    }

    const group = $('<div></div>').addClass('form-group');

    group
      .append(input)
      .append(errorContainer);
    return group;
  }

  self.getDisplayText = function () {
    if (!self.title) {
      return "";
    }
    return getLocalizedText(self.title);
  }

  self.getHelpText = function () {
    return getLocalizedText(self.help);
  }

  self.getValue = function (input) {
    return formField.getValue(input);
  };

  self.setValue = function (input, value) {
    formField.setValue(input, value);
  };

  self.checkedClear = function () {
    return self.clearField && self.clearField.checked();
  };

  self.addElementTo = function (parent, errorContainer) {
    const input = formField.create(
      function (child) {
        parent.append(self.createFormGroup(child, errorContainer));
      },
      onChange
    );
    // console.log(input);
    console.log(question.qid + ' --> ' + self.defaultValue);
    // if (self.defaultValue) {
    if (input.find('input[type="checkbox"]').length > 0
      && input.find('select option').length > 0) {

      for (var key in self.defaultValue) {
        if (self.defaultValue.hasOwnProperty(key)) {
          var value = self.defaultValue[key];

          if (key == 'checkboxes') {
            if (value == 'true') {
              // console.log(value);
              input.find('input[type="checkbox"]').prop('checked', true);
              formField.setValue(input, 'true');
            } else {
              // console.log(value);
              input.find('input[type="checkbox"]').prop('checked', true);
              formField.setValue(input, 'false');
            }
          }

          if (key == 'options') {
            input.find('select option[value="' + value + '"]').attr('selected', true);
          }

          // console.log(`Key: ${key}, Value: ${JSON.stringify(value)}`);
          // console.log(question.qid+' --> '+ JSON.stringify(value));
        }
      }

    } else if (input.find('input[type="radio"]').length > 0
      && input.find('select option').length > 0) {
      for (var key in self.defaultValue) {
        if (self.defaultValue.hasOwnProperty(key)) {
          var value = self.defaultValue[key];

          if (key == 'radios') {
            console.log(value);
            input.find('input[type="radio"][value="' + value + '"]').prop('checked', true);
          }

          if (key == 'options') {
            console.log(value);
            input.find('select option[value="' + value + '"]').attr('selected', true);
          }
          console.log(question.qid + ' --> ' + JSON.stringify(value));
        }
      }

    } else if (input.find('input[type="checkbox"]').length > 0
      && !input.find('select option').length) {
      if (self.defaultValue) {
        input.find('input[type="checkbox"]').prop('checked', true);
      } else {
        input.find('input[type="checkbox"]').prop('checked', false);
      }
    } else if (input.find('input[type="radio"]').length > 0
      && !input.find('select option').length) {
      input.find('input[type="radio"][value="' + self.defaultValue + '"]').prop('checked', true);
    } else if (input.find('input#alias').length > 0
      && input.find('textarea').length > 0) {
      for (var key in self.defaultValue) {
        if (self.defaultValue.hasOwnProperty(key)) {
          var value = self.defaultValue[key];

          if (key == 'alias') {
            input.find('input#alias').val(value);
          }

          if (key == 'textarea') {
            input.find('textarea').val(value);
          }
          console.log(question.qid + ' --> ' + JSON.stringify(value));
        }
      }
    } else {
      formField.setValue(input, self.defaultValue);
    }

    return input;
  };
}

function SingleElementField(formField, clearField, question, defaultValue, options, onChange) {
  if (!question.qid) {
    throw new Error('No labels');
  }
  const self = this;

  self.formField = formField;
  self.label = question.qid;
  self.title = question.title;
  self.help = question.help;
  self.defaultValue = defaultValue;
  self.clearField = null;
  self.group_title = question.group_title; //20230620 add KWT

  //console.log('SingleElementField---'+question.qid+' ---> '+ JSON.stringify(value));
  self.createFormGroup = function (input, errorContainer) {
    const header = $('<div></div>');
    const label = $('<label></label>').text(self.getDisplayText_label());
    //const label = $('<label></label>').text(self.getDisplayText());    //202308161641

    const header2 = $('<div></div>');
    const label2 = $('<label></label>').text(self.getDisplayText());

    //202308161641
    // if (question.required) {
    //   label.append($('<span></span>')
    //     .css('color', 'red')
    //     .css('font-weight', 'bold')
    //     .text('*'));
    // }

    // 20230619 chg KWT -->
    if (question.indent) {
      label2.css('margin-left', '20px');
      //label.css('margin-left', '20px');//202308161641
    }

    if (question.auto_value) {
      label2.append('<span>&nbsp; &#10227;</span>');
      //label.append('<span>&nbsp; &#10227;</span>');//202308161641
    }

    if (question.required) {
      label2.append($('<span></span>')
        .css('color', 'red')
        .css('font-weight', 'bold')
        .text('*'));
    }


    // 20230619 chg KWT <--
    header.append(label);
    header2.append(label2);

    //20230619 chg KWT -->
    if (question.alias) {
      const input = $('<input></input>')
        .attr('id', 'alias')
        .css('margin-left', '10px');
      header2.append(input);
      //header.append(input);//202308161641
    }
    //20230619 chg KWT --<

    // if (self.group_title && question.required) { //20230621 chg KWT
    //   label.append($('<span></span>')
    //     .css('color', 'red')
    //     .css('font-weight', 'bold')
    //     .text('*'));
    // }
    // if (question.required) {
    //   label2.append($('<span></span>')
    //     .css('color', 'red')
    //     .css('font-weight', 'bold')
    //     .text('*'));
    // }

    //20230606 kwy add <--    
    if (clearField) {
      self.clearField = clearField.create();
      self.clearField.element.css('float', 'right');
      self.clearField.element.on('change', function () {
        if (self.clearField.checked()) {
          self.formField.reset(input);
          self.formField.disable(input, true);
        } else {
          self.formField.disable(input, false);
        }
      });
      header2.append(self.clearField.element);
      //header.append(self.clearField.element);
    }

    // const group = $('<div></div>').addClass('form-group')
    //   .append(header);

    const group = $('<div></div>').addClass('form-group');
    //if (question.indent) {
    //group.css('margin-left', '20px');
    //}

    if ($.trim(self.group_title) !== '') {
      group.append(header);//SingleElementField
    }

    if ($.trim(self.title) !== '') {
      group.append(header2);
    }
    //group.append(header); 202308161632 
    // const group = $('<div></div>').addClass('form-group')
    //   .append(header);

    if (self.help) {
      var isDisplayedHelp = false;
      const helpLink = $('<a></a>')
        .addClass('help-toggle-button')
        .text(_('Show example'));

      //20230607 KWT add -->  
      //const p = $('<p></p>').append(helpLink);
      const p = $('<p></p>')
        .css('padding', '0px')
        .append(helpLink);

      if (question.indent) {
        p.css('margin-left', '20px');
      }

      const helpLinkBlock = p;
      //20230607 KWT add --<

      // 2023-08-23 修正 R&D honda -->
      const help = $('<p></p>');
      if (question.indent) {
        help.css('margin-left', '20px');
      }
      help.addClass('help-block')
        .text(self.getHelpText())
        .hide();
      // const help = $('<p></p>')
      //   .addClass('help-block')
      //   .text(self.getHelpText())
      //   .hide();
      // 2023-08-23 修正 R&D honda <--

      helpLink.on('click', function (e) {
        e.preventDefault();
        if (isDisplayedHelp) {
          helpLink.text(_('Show example'));
          help.hide();
          isDisplayedHelp = false;
        } else {
          helpLink.text(_('Hide example'));
          help.show();
          isDisplayedHelp = true;
        }
      });

      group.append(helpLinkBlock).append(help);
    }

    group
      .append(input)
      .append(errorContainer);
    return group;
  }

  self.getDisplayText = function () {
    if (!self.title) {
      return "";
    }
    return getLocalizedText(self.title);
  }

  //20230621 chg KWT -->
  self.getDisplayText_label = function () {
    if (!self.group_title) {
      return "";
    }
    return getLocalizedText(self.group_title);
  }
  //20230621 chg KWT --<

  self.getHelpText = function () {
    return getLocalizedText(self.help);
  }

  self.getValue = function (input) {
    console.log('SingleElementField----getValue-call:'+self.label);
    return formField.getValue(input);
  };

  self.setValue = function (input, value) {
    console.log('SingleElementField----setValue-call:'+self.label);
    formField.setValue(input, value);
  };

  self.checkedClear = function () {
    return self.clearField && self.clearField.checked();
  };

  self.addElementTo = function (parent, errorContainer) {
    const input = formField.create(
      function (child) {
        parent.append(self.createFormGroup(child, errorContainer));
      },
      onChange
    );
    // console.log(input);
    // console.log(question.qid+' --> '+ self.defaultValue);
    console.log('SingleElementField --- addElementTo ---' + question.qid + '-->' + JSON.stringify(self.defaultValue));
    // if (self.defaultValue) {
    // if(input.find('input[type="checkbox"]').length > 0
    // && input.find('select option').length > 0){

    //   for (var key in self.defaultValue) {
    //     if (self.defaultValue.hasOwnProperty(key)) {
    //       var value = self.defaultValue[key];

    //       if(key == 'checkboxes'){              
    //         if(value == 'true'){
    //           // console.log(value);
    //           input.find('input[type="checkbox"]').prop('checked', true);  
    //           formField.setValue(input, 'true');
    //         }else{
    //           // console.log(value);
    //           input.find('input[type="checkbox"]').prop('checked', true);  
    //           formField.setValue(input, 'false');
    //         }                         
    //       }

    //       if(key == 'options'){
    //         input.find('select option[value="'+ value +'"]').attr('selected', true);
    //       }

    //       // console.log(`Key: ${key}, Value: ${JSON.stringify(value)}`);
    //       // console.log(question.qid+' --> '+ JSON.stringify(value));
    //     }
    //   }

    // }else 
    // if(input.find('input[type="radio"]').length > 0
    // && input.find('select option').length > 0){
    //   console.log(JSON.stringify(self.defaultValue));
    //   for(var key in self.defaultValue) {
    //     if(self.defaultValue.hasOwnProperty(key)){
    //       var value = self.defaultValue[key];

    //       if(key == 'radios'){
    //         console.log(value);
    //         input.find('input[type="radio"][value="'+ value +'"]').prop('checked', true);
    //       }

    //       if(key == 'options'){
    //         console.log(value);
    //         input.find('select option[value="' + value + '"]').attr('selected', true);
    //       }

    //       console.log(question.qid+' --> '+ JSON.stringify(value));
    //     }
    //   }

    // }else if(input.find('input[type="checkbox"]').length > 0
    // && !input.find('select option').length){
    //   if(self.defaultValue){
    //     input.find('input[type="checkbox"]').prop('checked', true);        
    //   }else{        
    //     input.find('input[type="checkbox"]').prop('checked', false);         
    //   }                     
    // }else if(input.find('input[type="radio"]').length > 0
    // && !input.find('select option').length){ 
    //   input.find('input[type="radio"][value="'+ self.defaultValue +'"]').prop('checked', true);                  
    // }else if (input.find('input').length > 0
    // && input.find('select option').length > 0){
    //   for(const key in self.defaultValue){
    //     if(self.defaultValue.hasOwnProperty(key)){
    //       const value = self.defaultValue[key];

    //       if(key == 'options'){
    //         input.find('select option[value="' + value + '"]').attr('selected', true);
    //       }

    //       if(key == 'input'){
    //         input.find('input').val(value);
    //       }
    //     }
    //   }
    // }
    // else{
    formField.setValue(input, self.defaultValue);
    // }

    return input;
  };
}
// function SingleElementField(formField, clearField, question, defaultValue, options, onChange) {
//   if (!question.qid) {
//     throw new Error('No labels');
//   }
//   const self = this;

//   self.formField = formField;
//   self.label = question.qid;
//   self.title = question.title;
//   self.help = question.help;
//   self.defaultValue = defaultValue;
//   self.clearField = null;

//   self.createFormGroup = function (input, errorContainer) {
//     const header = $('<div></div>');        
//     const label = $('<label></label>').text(self.getDisplayText());

//     if (question.required) {
//       label.append($('<span></span>')
//         .css('color', 'red')
//         .css('font-weight', 'bold')
//         .text('*'));
//     }

//     // 20230619 chg KWT -->
//     if (question.indent) {
//       label.css('margin-left', '20px');
//     }

//     if (question.auto_value) {
//       label.append('<span>&nbsp; &#10227;</span>');
//     }
//     // 20230619 chg KWT <--
//     header.append(label);

//      //20230619 chg KWT -->
//      if (question.alias) {
//       const input = $('<input></input>')
//       .attr('id', 'alias')
//       .css('margin-left', '10px');
//       header.append(input);
//     }
//     //20230619 chg KWT --<
//     if (question.required) {
//       label.append($('<span></span>')
//         .css('color', 'red')
//         .css('font-weight', 'bold')
//         .text('*'));
//     }

//     //20230606 kwy add <--
//     if (clearField) {
//       self.clearField = clearField.create();
//       self.clearField.element.css('float', 'right');
//       self.clearField.element.on('change', function () {
//         if (self.clearField.checked()) {
//           self.formField.reset(input);
//           self.formField.disable(input, true);
//         } else {
//           self.formField.disable(input, false);
//         }
//       });
//       header.append(self.clearField.element);
//     }

//     // const group = $('<div></div>').addClass('form-group')
//     //   .append(header);

//     const group = $('<div></div>').addClass('form-group');
//     //if (question.indent) {
//     //group.css('margin-left', '20px');
//     //}
//     group.append(header);
//     // const group = $('<div></div>').addClass('form-group')
//     //   .append(header);

//     if (self.help) {
//       var isDisplayedHelp = false;
//       const helpLink = $('<a></a>')
//         .addClass('help-toggle-button')
//         .text(_('Show example'));

//       //20230607 KWT add -->  
//       const p = $('<p></p>').append(helpLink);

//       if (question.indent) {
//         p.css('margin-left', '20px');
//       }

//       const helpLinkBlock = p;
//       //20230607 KWT add --<

//       const help = $('<p></p>')
//         .addClass('help-block')
//         .text(self.getHelpText())
//         .hide();
//       helpLink.on('click', function (e) {
//         e.preventDefault();
//         if (isDisplayedHelp) {
//           helpLink.text(_('Show example'));
//           help.hide();
//           isDisplayedHelp = false;
//         } else {
//           helpLink.text(_('Hide example'));
//           help.show();
//           isDisplayedHelp = true;
//         }
//       });
//       group.append(helpLinkBlock).append(help);
//     }

//     group
//       .append(input)
//       .append(errorContainer);
//     return group;
//   }

//   self.getDisplayText = function () {
//     if (!self.title) {
//       return "";
//     }
//     return getLocalizedText(self.title);
//   }

//   self.getHelpText = function () {
//     return getLocalizedText(self.help);
//   }

//   self.getValue = function (input) {   
//     return formField.getValue(input);
//   };

//   self.setValue = function (input, value) {
//     formField.setValue(input, value);
//   };

//   self.checkedClear = function () {
//     return self.clearField && self.clearField.checked();
//   };

//   self.addElementTo = function (parent, errorContainer) {
//     const input = formField.create(
//       function (child) {
//         parent.append(self.createFormGroup(child, errorContainer));
//       },
//       onChange
//     );
//     // console.log(input);
//     // console.log(question.qid+' --> '+ self.defaultValue);
//     console.log(question.qid + '-->'  +JSON.stringify(self.defaultValue));
//     // if (self.defaultValue) {
//       // if(input.find('input[type="checkbox"]').length > 0
//       // && input.find('select option').length > 0){

//       //   for (var key in self.defaultValue) {
//       //     if (self.defaultValue.hasOwnProperty(key)) {
//       //       var value = self.defaultValue[key];

//       //       if(key == 'checkboxes'){              
//       //         if(value == 'true'){
//       //           // console.log(value);
//       //           input.find('input[type="checkbox"]').prop('checked', true);  
//       //           formField.setValue(input, 'true');
//       //         }else{
//       //           // console.log(value);
//       //           input.find('input[type="checkbox"]').prop('checked', true);  
//       //           formField.setValue(input, 'false');
//       //         }                         
//       //       }

//       //       if(key == 'options'){
//       //         input.find('select option[value="'+ value +'"]').attr('selected', true);
//       //       }

//       //       // console.log(`Key: ${key}, Value: ${JSON.stringify(value)}`);
//       //       // console.log(question.qid+' --> '+ JSON.stringify(value));
//       //     }
//       //   }

//       // }else 
//       // if(input.find('input[type="radio"]').length > 0
//       // && input.find('select option').length > 0){
//       //   console.log(JSON.stringify(self.defaultValue));
//       //   for(var key in self.defaultValue) {
//       //     if(self.defaultValue.hasOwnProperty(key)){
//       //       var value = self.defaultValue[key];

//       //       if(key == 'radios'){
//       //         console.log(value);
//       //         input.find('input[type="radio"][value="'+ value +'"]').prop('checked', true);
//       //       }

//       //       if(key == 'options'){
//       //         console.log(value);
//       //         input.find('select option[value="' + value + '"]').attr('selected', true);
//       //       }

//       //       console.log(question.qid+' --> '+ JSON.stringify(value));
//       //     }
//       //   }

//       // }else if(input.find('input[type="checkbox"]').length > 0
//       // && !input.find('select option').length){
//       //   if(self.defaultValue){
//       //     input.find('input[type="checkbox"]').prop('checked', true);        
//       //   }else{        
//       //     input.find('input[type="checkbox"]').prop('checked', false);         
//       //   }                     
//       // }else if(input.find('input[type="radio"]').length > 0
//       // && !input.find('select option').length){ 
//       //   input.find('input[type="radio"][value="'+ self.defaultValue +'"]').prop('checked', true);                  
//       // }else if (input.find('input').length > 0
//       // && input.find('select option').length > 0){
//       //   for(const key in self.defaultValue){
//       //     if(self.defaultValue.hasOwnProperty(key)){
//       //       const value = self.defaultValue[key];

//       //       if(key == 'options'){
//       //         input.find('select option[value="' + value + '"]').attr('selected', true);
//       //       }

//       //       if(key == 'input'){
//       //         input.find('input').val(value);
//       //       }
//       //     }
//       //   }
//       // }
//       // else{
//         formField.setValue(input, self.defaultValue);
//       // }

//     return input;
//   };
// }

function SingleElementField2(formField, clearField, question, defaultValue, options, onChange, lblflg) {
  if (!question.qid) {
    throw new Error('No labels');
  }
  const self = this;

  self.formField = formField;
  self.label = question.qid;
  self.title = question.title;
  self.help = question.help;
  self.defaultValue = defaultValue;
  self.clearField = null;
  self.nav = question.nav;
  self.group_title = question.group_title; //20230620 add KWT

  self.createFormGroup = function (input, errorContainer) {
    const header = $('<div></div>');
    const label = $('<label></label>').text(self.getDisplayText_label()); // 20230612 chg KWT

    const header2 = $('<div></div>');
    const label2 = $('<label></label>').text(self.getDisplayText());

    // 20230619 chg KWT -->
    if (question.indent) {
      label2.css('margin-left', '20px');
    }

    if (question.auto_value) {
      label2.append('<span>&nbsp; &#10227;</span>');
    }
    // 20230619 chg KWT <--

    if (question.required) { //20230621 chg KWT
      if ((lblflg) && self.group_title && question.required) { //20230621 chg KWT
        label.append($('<span></span>')
          .css('color', 'red')
          .css('font-weight', 'bold')
          .text('*'));
      } else {
        label2.append($('<span></span>')
          .css('color', 'red')
          .css('font-weight', 'bold')
          .text('*'));
      }
    }

    header.append(label);
    header2.append(label2);

    //20230619 chg KWT -->
    if (question.alias) {
      const input = $('<input></input>')
        .attr('id', 'alias')
        .css('margin-left', '10px');
      header2.append(input);
    }
    //20230619 chg KWT --<

    if (clearField) {
      self.clearField = clearField.create();
      self.clearField.element.css('float', 'right');
      self.clearField.element.on('change', function () {
        if (self.clearField.checked()) {
          self.formField.reset(input);
          self.formField.disable(input, true);
        } else {
          self.formField.disable(input, false);
        }
      });
      header.append(self.clearField.element);
    }

    const group = $('<div></div>').addClass('form-group');

    if ($.trim(self.group_title) !== '') {
      group.append(header);
    }

    if ($.trim(self.title) !== '') {
      group.append(header2);
    }

    if (self.help) {
      var isDisplayedHelp = false;
      const helpLink = $('<a></a>')
        .addClass('help-toggle-button')
        .text(_('Show example'));
      //20230607 KWT add -->   
      const helpLinkBlock = $('<p></p>')
        .css('padding', '0px') //2023-08-23
        .append(helpLink);
      if (question.indent) {
        helpLinkBlock.css('margin-left', '20px');
      }
      //.css('margin-left', '20px');
      //20230607 KWT add --<

      // 2023-08-23 修正 R&D honda -->
      const help = $('<p></p>');
      if (question.indent) {
        help.css('margin-left', '20px');
      }
      help.addClass('help-block')
        .text(self.getHelpText())
        .hide();
      // const help = $('<p></p>')
      //   .addClass('help-block')
      //   .text(self.getHelpText())
      //   .hide();
      // 2023-08-23 修正 R&D honda <--

      helpLink.on('click', function (e) {
        e.preventDefault();
        if (isDisplayedHelp) {
          helpLink.text(_('Show example'));
          help.hide();
          isDisplayedHelp = false;
        } else {
          helpLink.text(_('Hide example'));
          help.show();
          isDisplayedHelp = true;
        }
      });
      group.append(helpLinkBlock).append(help);
    }
    group
      .append(input)
      .append(errorContainer);
    return group;
  }

  self.getDisplayText = function () {
    if (!self.title) {
      return "";
    }
    return getLocalizedText(self.title);
  }

  // self.getDisplayText_nav = function () {
  //   if (!self.nav) {
  //     return self.label;
  //   }
  //   return self.nav;
  // }

  //20230621 chg KWT -->
  self.getDisplayText_label = function () {
    if (!self.group_title) {
      return "";
    }
    return getLocalizedText(self.group_title);
  }
  //20230621 chg KWT --<

  self.getHelpText = function () {
    return getLocalizedText(self.help);
  }

  self.getValue = function (input) {
    return formField.getValue(input);
  };

  self.setValue = function (input, value) {
    formField.setValue(input, value);
  };

  self.checkedClear = function () {
    return self.clearField && self.clearField.checked();
  };

  self.addElementTo = function (parent, errorContainer) {
    const input = formField.create(
      function (child) {
        parent.append(self.createFormGroup(child, errorContainer));
      },
      onChange
    );
    console.log(question.qid + '-->' + JSON.stringify(self.defaultValue));
    // if(input.find('input[type="checkbox"]').length > 0
    //   && input.find('select option').length > 0){

    //     for (const key in self.defaultValue) {
    //       if (self.defaultValue.hasOwnProperty(key)) {
    //         const value = self.defaultValue[key];

    //         if(key == 'checkboxes'){
    //           if(value){
    //             input.find('input[type="checkbox"]').prop('checked', true);  
    //           }else{
    //             input.find('input[type="checkbox"]').prop('checked', false);  
    //           } 
    //         }

    //         if(key == 'options'){
    //           input.find('select option[value="'+ value +'"]').attr('selected', true);
    //         }

    //         // console.log(`Key: ${key}, Value: ${JSON.stringify(value)}`);
    //       }
    //     }

    //   }else 
    //   if(input.find('input[type="radio"]').length > 0
    // && input.find('select option').length > 0){
    //   for(const key in self.defaultValue) {
    //     if(self.defaultValue.hasOwnProperty(key)){
    //       const value = self.defaultValue[key];

    //       if(key == 'radios'){
    //         input.find('input[type="radio"][value="'+ value +'"]').prop('checked', true);
    //       }

    //       if(key == 'options'){
    //         input.find('select option[value="' + value + '"]').attr('selected', true);
    //       }
    //     }
    //   }

    // }else 
    // if(input.find('input[type="checkbox"]').length > 0
    // && !input.find('select option').length
    // ){
    //   if(self.defaultValue){
    //     input.find('input[type="checkbox"]').prop('checked', true);        
    //   }else{        
    //     input.find('input[type="checkbox"]').prop('checked', false);         
    //   }                     
    // }else if(input.find('input[type="radio"]').length > 0
    // && !input.find('select option').length ){ 
    //   input.find('input[type="radio"][value="'+ self.defaultValue +'"]').prop('checked', true);            
    // }else{
    formField.setValue(input, self.defaultValue);
    // }
    return input;
  };
}

//page1 リポジトリ、データ作成者、データ管理者　などの字下げ用
function SingleElementField3(formField, clearField, question, defaultValue, options, onChange) {
  if (!question.qid) {
    throw new Error('No labels');
  }
  const self = this;

  self.formField = formField;
  self.label = question.qid;
  self.title = question.title;
  self.help = question.help;
  self.defaultValue = defaultValue;
  self.clearField = null;

  //20230606 kwy add -->
  // previousType = (question.qid.includes('data-number')) ? null : '';
  //20230606 kwy add <--

  self.createFormGroup = function (input, errorContainer) {
    const header = $('<div></div>');
    const label = $('<label></label>').text(self.getDisplayText_label());
    const header2 = $('<div></div>');
    const label2 = $('<label></label>').text(self.getDisplayText());

    // 20230619 chg KWT -->
    if (question.indent) {
      label2.css('margin-left', '20px');
    }

    if (question.auto_value) {
      label2.append('<span>&nbsp; &#10227;</span>');
    }
    // 20230619 chg KWT <--

    if (question.required) {
      label2.append($('<span></span>')
        .css('color', 'red')
        .css('font-weight', 'bold')
        .text('*'));
    }

    header.append(label);
    header2.append(label2);

    //20230619 chg KWT -->
    if (question.alias) {
      const input = $('<input></input>')
        .attr('id', 'alias')
        .css('margin-left', '10px');
      header2.append(input);
    }
    //20230619 chg KWT --<

    // if (question.required) {
    //   label.append($('<span></span>')
    //     .css('color', 'red')
    //     .css('font-weight', 'bold')
    //     .text('*'));
    // }
    // if (question.required) {
    //   label.append($('<span></span>')
    //     .css('color', 'red')
    //     .css('font-weight', 'bold')
    //     .text('*'));
    // }
    // header.append(label);

    //20230606 kwy add <--

    if (clearField) {
      self.clearField = clearField.create();
      self.clearField.element.css('float', 'right');
      self.clearField.element.on('change', function () {
        if (self.clearField.checked()) {
          self.formField.reset(input);
          self.formField.disable(input, true);
        } else {
          self.formField.disable(input, false);
        }
      });
      header2.append(self.clearField.element);
    }
    //const group = $('<div></div>').addClass('form-group').css('margin', 'auto 0 auto 15px')
    //const group = $('<div></div>').addClass('form-group').append(header);
    const group = $('<div></div>').addClass('form-group');

    if ($.trim(self.group_title) !== '') {
      group.append(header);SingleElementField
    }

    if ($.trim(self.title) !== '') {
      group.append(header2);
    }

    if (self.help) {
      var isDisplayedHelp = false;
      const helpLink = $('<a></a>')
        .addClass('help-toggle-button')
        .text(_('Show example'));
      //20230607 KWT add -->   
      const helpLinkBlock = $('<p></p>')
        .css('padding', '0px') //2023-08-23
        .append(helpLink);
      if (question.indent) {
        helpLinkBlock.css('margin-left', '20px');
      }
      //20230607 KWT add --<

      // 2023-08-23 修正 R&D honda -->
      const help = $('<p></p>');
      if (question.indent) {
        help.css('margin-left', '20px');
      }
      help.addClass('help-block')
        .text(self.getHelpText())
        .hide();
      // const help = $('<p></p>')
      //   .addClass('help-block')
      //   .text(self.getHelpText())
      //   .hide();
      // 2023-08-23 修正 R&D honda <--

      helpLink.on('click', function (e) {
        e.preventDefault();
        if (isDisplayedHelp) {
          helpLink.text(_('Show example'));
          help.hide();
          isDisplayedHelp = false;
        } else {
          helpLink.text(_('Hide example'));
          help.show();
          isDisplayedHelp = true;
        }
      });
      group.append(helpLinkBlock).append(help);
    }
    group
      .append(input)
      .append(errorContainer);
    return group;
  }

  self.getDisplayText = function () {
    if (!self.title) {
      return "";
    }
    return getLocalizedText(self.title);
  }

  self.getDisplayText_label = function () {
    if (!self.group_title) {
      return "";
    }
    return getLocalizedText(self.group_title);
  }

  self.getHelpText = function () {
    return getLocalizedText(self.help);
  }

  self.getValue = function (input) {
    return formField.getValue(input);
  };

  self.setValue = function (input, value) {
    formField.setValue(input, value);
  };

  self.checkedClear = function () {
    return self.clearField && self.clearField.checked();
  };

  self.addElementTo = function (parent, errorContainer) {
    const input = formField.create(
      function (child) {
        parent.append(self.createFormGroup(child, errorContainer));
      },
      onChange
    );
    if (input.closest('.form-group').find('input#alias').length > 0
    && input.closest('.form-group').find('select option').length > 0) {
      // if (input.find('input#alias').length > 0
      // && input.find('select option').length > 0) {
  
      for (var key in self.defaultValue) {
        if (self.defaultValue.hasOwnProperty(key)) {
          var value = self.defaultValue[key];

          if (key == 'alias') {
            console.log('SingleElementFeild3-----addElementTo----aliasv:'+value);
            //console.log('SingleElementFeild3-----addElementTo----aliasal'+value.alias);
            input.closest('.form-group').find('input#alias').val(value);
          }

          if (key == 'options') {
            console.log('SingleElementFeild3-----addElementTo----select optionv:'+value);
            //console.log('SingleElementFeild3-----addElementTo----select optionop'+value.options);
            input.closest('.form-group').find('select option[value="' + value + '"]').attr('selected', true);
          }
        }
      }
    } else if (self.defaultValue) {
      console.log('SingleElementFeild3-----addElementTo----defaultValue');
      formField.setValue(input, self.defaultValue);
    }
    // if (self.defaultValue) {
    //   formField.setValue(input, self.defaultValue);
    // }
    return input;
  };
}

//未病データベース構築_プロトタイプ　（
function TripleElementField(formField, clearField, question, defaultValue, options, onChange) {
  if (!question.qid) {
    throw new Error('No labels');
  }
  const self = this;

  self.formField = formField;
  self.label = question.qid;
  self.title = question.title;
  self.help = question.help;
  self.defaultValue = defaultValue;
  self.clearField = null;

  self.createFormGroup = function (input, errorContainer) {
    const header = $('<div></div>');
    const label = $('<label></label>').text(self.getDisplayText())
    if (question.required) {
      label.append($('<span></span>')
        .css('color', 'red')
        .css('font-weight', 'bold')
        .text('*'));
    }

    header.append(label);

    if (clearField) {
      self.clearField = clearField.create();
      self.clearField.element.css('float', 'right');
      self.clearField.element.on('change', function () {
        if (self.clearField.checked()) {
          self.formField.reset(input);
          self.formField.disable(input, true);
        } else {
          self.formField.disable(input, false);
        }
      });
      header.append(self.clearField.element);
    }
    const group = $('<div></div>').addClass('form-group')
      .append(header);

    if (self.help) {
      var isDisplayedHelp = false;
      const helpLink = $('<a></a>')
        .addClass('help-toggle-button')
        .text(_('Show example'));
      // 2023-08-23 修正 R&D honda -->        
      const helpLinkBlock = $('<p></p>')
        .css('padding', '0px') //2023-08-23
        .append(helpLink);
      if (question.indent) {
        helpLinkBlock.css('margin-left', '20px');
      }
      //const helpLinkBlock = $('<p></p>').append(helpLink);
      // 2023-08-23 修正 R&D honda <--

      // 2023-08-23 修正 R&D honda -->
      const help = $('<p></p>');
      if (question.indent) {
        help.css('margin-left', '20px');
      }
      help.addClass('help-block')
        .text(self.getHelpText())
        .hide();
      // const help = $('<p></p>')
      //   .addClass('help-block')
      //   .text(self.getHelpText())
      //   .hide();
      // 2023-08-23 修正 R&D honda <--

      helpLink.on('click', function (e) {
        e.preventDefault();
        if (isDisplayedHelp) {
          helpLink.text(_('Show example'));
          help.hide();
          isDisplayedHelp = false;
        } else {
          helpLink.text(_('Hide example'));
          help.show();
          isDisplayedHelp = true;
        }
      });
      group.append(helpLinkBlock).append(help);
    }
    // const group = $('<div></div>').addClass('form-group');
    group
      .append(input)
      .append(errorContainer);
    return group;
  }

  self.getDisplayText = function () {
    if (!self.title) {
      return "";
    }
    return getLocalizedText(self.title);
  }

  self.getHelpText = function () {
    return getLocalizedText(self.help);
  }

  self.getValue = function (input) {
    return formField.getValue(input);
  };

  self.setValue = function (input, value) {
    formField.setValue(input, value);
  };

  self.checkedClear = function () {
    return self.clearField && self.clearField.checked();
  };

  self.addElementTo = function (parent, errorContainer) {
    const input = formField.create(
      function (child) {
        parent.append(self.createFormGroup(child, errorContainer));
      },
      onChange
    );

    console.log(question.qid + '-->' + JSON.stringify(self.defaultValue));

    if (self.defaultValue) {
      formField.setValue(input, self.defaultValue);
    }
    return input;
  };
}

// function createFileCapacityFieldElement(createHandler, options) {
function createFileCapacityFieldElement(createHandler, options, qid) { //20230607 add parameter KWT 
  // ref: website/project/util.py sizeof_fmt()
  function sizeofFormat(num) {
    const units = ['', 'K', 'M', 'G', 'T', 'P', 'E', 'Z'];
    for (var i = 0; i < units.length; i++) {
      const unit = units[i];
      if (Math.abs(num) < 1000) {
        return Math.round(num * 10) / 10 + unit + 'B';
      }
      num /= 1000.0
    }
    return Math.round(num * 10) / 10 + 'YB';
  }

  function calcCapacity(input, calcIndicator, errorContainer) {
    if (contextVars.file) {
      return new Promise(function (resolve, reject) {
        const totalSize = contextVars.file.size || 0;
        console.log(logPrefix, 'totalSize: ', totalSize);
        input.val(sizeofFormat(totalSize)).change();
        resolve();
      });
    }
    errorContainer.hide().text('');
    calcIndicator.show();
    options.wbcache.clearCache();
    const task = options.filepath.endsWith('/') ?
      options.wbcache.listFiles(options.filepath, true)
        .then(function (files) {
          return files.reduce(function (y, x) {
            return y + Number(x.item.attributes.size);
          }, 0);
        }) :
      new Promise(function (resolve, reject) {
        try {
          options.wbcache.searchFile(options.filepath, function (item) {
            resolve(Number(item.attributes.size));
          });
        } catch (err) {
          reject(err);
        }
      });
    return task
      .then(function (totalSize) {
        console.log(logPrefix, 'totalSize: ', totalSize);
        input.val(sizeofFormat(totalSize)).change();
      })
      .catch(function (err) {
        console.error(err);
        Raven.captureMessage(_('Could not list files'), {
          extra: {
            error: err.toString()
          }
        });
        errorContainer.text(_('Could not list files')).show();
      })
      .then(function () {
        calcIndicator.hide();
      });
  }

  return {
    create: function (addToContainer, onChange) {
      const input = createHandler();
      if (options && options.readonly) {
        input.attr('readonly', true);
      }
      if (onChange) {
        input.change(function (event) {
          onChange(event, options);
        });
      }
      input.addClass('form-control');

      //const container = $('<div>').append(input);
      //20230607 chg KWT -->
      const div = $('<div>').append(input);
      const container = div;
      //20230607 chg KWT --<

      if (!options || (!options.readonly && !options.multiple)) {
        container.css('display', 'flex');
        const calcIndicator = $('<i class="fa fa-spinner fa-pulse">')
          .hide();
        const calcButton = $('<a class="btn btn-default btn-sm">')
          .append($('<i class="fa fa-refresh"></i>'))
          .append($('<span></span>').text(_('Calculate')))
          .append(calcIndicator);
        const errorContainer = $('<span>')
          .css('color', 'red').css('margin-left', '20px').hide();
        const calcContainer = $('<div>')
          .css('margin', 'auto 0 auto 8px')
          .append(calcButton)
          .append(errorContainer);
        var calculating = false;
        calcButton.on('click', function (e) {
          e.preventDefault();
          if (!calculating) {
            calculating = true;
            calcButton.attr('disabled', true);
            calcCapacity(input, calcIndicator, errorContainer)
              .then(function () {
                calculating = false;
                calcButton.attr('disabled', false);
              });
          }
        });
        container.append(calcContainer)
      }

      addToContainer(container);
      return container;
    },
    getValue: function (container) {
      return container.find('input').val();
    },
    setValue: function (container, value) {
      container.find('input').val(value);
    },
    reset: function (container) {
      container.find('input').val(null);
    },
    disable: function (container, disabled) {
      container.find('input').attr('disabled', disabled);
    },
  };
}

function createFileURLFieldElement(createHandler, options, question) {
  return {
    create: function (addToContainer, onChange) {
      const input = createHandler();
      if (options && options.readonly) {
        input.attr('readonly', true);
      }
      if (onChange) {
        input.change(function (event) {
          onChange(event, options);
        });
      }
      input.addClass('form-control');
      //const container = $('<div>').append(input);
      // 20230621 chg KWT -->
      const div = $('<div>').append(input);
      if (question.indent) {
        div.css('margin-left', '20px');
      }
      const container = div;
      //20230607 chg KWT --<
      if (!options || (!options.readonly && !options.multiple)) {
        container.css('display', 'flex');
        const fillButton = $('<a class="btn btn-default btn-sm">')
          .append($('<i class="fa fa-refresh"></i>'))
          .append($('<span></span>').text(_('Fill')));
        const fillContainer = $('<div>')
          .css('margin', 'auto 0 auto 8px')
          .append(fillButton);
        fillButton.on('click', function (e) {
          e.preventDefault();
          input.val(fangorn.getPersistentLinkFor(options.fileitem)).change();
        });
        container.append(fillContainer)
      }
      addToContainer(container);
      return container;
    },
    getValue: function (container) {
      return container.find('input').val();
    },
    setValue: function (container, value) {
      container.find('input').val(value);
    },
    reset: function (container) {
      container.find('input').val(null);
    },
    disable: function (container, disabled) {
      container.find('input').attr('disabled', disabled);
    },
  };
}


//未病データベース構築_プロトタイプ　（全サイズ 全フォルダ数　全ファイル数　最大階層数)
function createFileURLFieldElement3(createHandler, options, question) {
  const format = question.qid.includes('grdm-file:') ? question.qid.split(':')[1].toLowerCase().replace(/\s+/g, '-') : question.id;

  return {
    create: function (addToContainer, onChange) {
      const self = this;
      self.label = question.qid;
      self.title = question.title;
      self.help = question.help;

      //20230615 chg KWT -->
      const container = $('<div></div>');
      const table = $('<table></table>').css('width', '65%');
      const thead = $('<thead></thead>')
        .css('border-bottom', '1px solid #e1dada')
        .css('height', '37px');
      const tr1 = $('<tr></tr>');

      const tbody = $('<tbody></tbody>')
        .css('height', '53px');
      const tr2 = $('<tr></tr>');

      // const div1 = $('<div></div>');
      // const div2 = $('<div></div>');

      (question.multiple_items || []).forEach(function (item) {
        var multiple_label = $('<label></label>').text(
          function () {
            if (!item.tooltip) {
              return "";
            }
            return getLocalizedText(item.tooltip);
          }
        );

        if (question.indent || item.indent) {
          multiple_label.css('margin-left', '20px');
        }

        var multiple_alias = '';
        if (question.alias || item.alias) {
          // multiple_label.css('margin', 'auto 0 auto 11px');
          multiple_alias = $('<input></input>')
            .attr('name', format + '-alias-' + item.text)
            .css('width', '43%')
          // .css('margin-left', '5px');
          // multiple_alias = $('<input></input>')
          // .attr('name', format + '-alias-' + item.text)
          // .css('width', '50%')
          // .css('margin-left', '5px');
        }
        // else {
        //   multiple_label.css('margin', 'auto 0 auto 62px');
        // }

        if (question.auto_value || item.alias) {
          multiple_label.append('<span>&nbsp; &#10227;</span>').append(multiple_alias);
        }

        // div1.append(multiple_label);
        tr1.append($('<th></th>').append(multiple_label).css('padding-right', '14px'));

        const multiple_input = createHandler().addClass('form-control');
        multiple_input.attr('name', format + '-' + item.text);

        if (options && options.readonly) {
          multiple_input.attr('readonly', true);
        }

        // if (onChange) {
        //   multiple_input.change(function (event) {
        //     onChange(event, options);
        //   });
        // }
        tr2.append($('<td></td>').append(multiple_input).css('padding-right', '4px'));
        // multiple_input.addClass('form-control');     

      });

      //20230917 chg honda 
      container.append(table.append(thead.append(tr1)).append(tbody.append(tr2)));
      // if (!options || (!options.readonly && !options.multiple)) {
      //   // container.css('display', 'flex');
      //   // const fillContainer = $('<div>')
      //   //   .append(multiple_input)
      //   //   .css('width', '600px')
      //   //   .css('margin', 'auto 0 auto 8px');

      //   // div2.append(multiple_input);
      //   container.append(table.append(thead.append(tr1)).append(tbody.append(tr2)));
      // }

      //20230615 chg KWT <--
      addToContainer(container);
      return container;
    },
    getValue: function (container) {
      // return container.find('thead tr th [name="all-sizes-alias-0"]').val('999');
      //console.log('createFileURLFieldElement3-----getValue-1');

      const result = {};
      if (container.find('thead tr').length > 0) {
        (question.multiple_items || []).forEach(function (item) {
          const alias = format + '-alias-' + item.text;
          result[alias] = container.find('[name=' + alias + ']').val();
        });
      } else {
        //console.log('createFileURLFieldElement3-----getValue-2b');
      }

      if (container.find('tbody tr').length > 0) {
        (question.multiple_items || []).forEach(function (item) {
          const input = format + '-' + item.text;
          result[input] = container.find('[name=' + input + ']').val();
        });
      } else {
        //console.log('createFileURLFieldElement3-----getValue-3b');
      }

      //console.log('createFileURLFieldElement3-----getValue-end');
      return result;

    },
    setValue: function (container, value) {
      console.log(value);
      for (var key in value) {
        if (value.hasOwnProperty(key)) {
          const result = value[key];
          console.log(key + ' --> ' + result);
          if (key.includes('alias')) {
            container.find('thead tr th [name="' + key + '"]').val(result);
          } else {
            container.find('tbody tr [name="' + key + '"]').val(result);
          }
        }
      }
    },
    reset: function (container) {
      container.find('input').val(null);
    },
    disable: function (container, disabled) {
      container.find('input').attr('disabled', disabled);
    },
  };
}

//未病データベース構築_プロトタイプ　（時系列データ種別 その他の場合)
function createFileURLFieldElement4(createHandler, createHandler2, question, options) {

  return {
    create: function (addToContainer, onChange) {
      var input = null;
      console.log('createFileURLFieldElement4 --- create --- start:' + question.id);

      
      const container = $('<div>').css('width', '600px');

      var select = $('<select></select>').attr('name', 'select0');
      const defaultOption = $('<option></option>').attr('value', '').attr('id', 'textbox0:true');
      if (options.multiple) {   
        defaultOption.text(_('(Not Modified)'));
        defaultOption.attr('selected', true)
      } else {
        defaultOption.text(_('Choose...'));
      }

      select.append(defaultOption);

      if (options && options.readonly) {
        //20230828 comboselect_boxってなんだ？
        //select.attr('readonly', true);
        select.prop('disabled', true);
        //comboselect_box.attr('readonly', true);
      }

      (question.multiple_items || []).forEach(function (item) {

        (item.options || []).forEach(function (opt) {
          const optElem = $('<option></option>')
            .attr('value', opt.text === undefined ? opt : opt.text)
            .attr('id', opt.lock)
            .text(opt.text === undefined ? value : getLocalizedText(opt.tooltip));
          if (!options.multiple && opt.default) {
            optElem.attr('selected', true);
          }
          select.append(optElem);

          select.addClass('form-control');

          // if(opt.lock){     
          //   var value = opt.lock.includes(':') ? opt.lock.split(':') : opt.lock;             
          //   select.on('change', function(){
          //     var checkedValue = $(this).val();               
          //     console.log(value[0] + '-->' + value[1] +'>' + checkedValue); 
          //     input.attr('id', value[0]).prop('disabled', value[1] === 'true');
          //   });
          // }
        });

        select.on('change', function () {
          var id = $(this).find('option:selected').attr('id');
          var value = id.includes(':') ? id.split(':') : id;
          console.log(value[0] + '-->' + value[1]);
          input.attr('id', value[0]).prop('disabled', value[1] === 'true');
        });

        container.append(select);

        (item.textbox || []).forEach(function (txt) {
          input = $('<input type="text"></input>').prop('disabled', 'true');
          input.attr('id', 'textbox' + txt.text);
          if (options && options.readonly) {
            input.attr('readonly', true);
          }
          if (onChange) {
            input.change(function (event) {
              onChange(event, options);
            });
          }
          input.addClass('form-control');

          const label = $('<label></label>')
            .css('min-width', '109px')
            .append($('<p>' + _('Grid Other') + '</p>'));
          //const label1 = $('<label></label>').text(_('Grid Other'));
          //.text(_('Grid ColumnCnt'))    

          if (options && options.readonly) {
            //20230828 comboselect_boxってなんだ？
            //input.attr('readonly', true);
            input.prop('disabled', true);
          }

          //20230828 
          //if (!options || (!options.readonly && !options.multiple)) {
          container.css('display', 'flex')
            .css('margin', 'auto 0 auto 8px');
          container
            .append(label)
            .append(input);
          //}
        });
      });

      // const input = createHandler();
      // if (options && options.readonly) {
      //   input.attr('readonly', true);
      // }
      // if (onChange) {
      //   input.change(function (event) {
      //     onChange(event, options);
      //   });
      // }
      // input.addClass('form-control');

      // const input2 = createHandler2();
      // if (options && options.readonly) {
      //   input.attr('readonly', true);
      // }
      // if (onChange) {
      //   input2.change(function (event) {
      //     onChange(event, options);
      //   });
      // }
      // input2.addClass('form-control');

      // const input3 = createHandler2();
      // if (options && options.readonly) {
      //   input.attr('readonly', true);
      // }
      // if (onChange) {
      //   input3.change(function (event) {
      //     onChange(event, options);
      //   });
      // }
      // input3.addClass('form-control');

      // const label1 = $('<label></label>')
      // .css('min-width', '109px')
      // .append($('<p>' + _('Grid Other') + '</p>'));
      // //const label1 = $('<label></label>').text(_('Grid Other'));
      // //.text(_('Grid ColumnCnt'))

      // const container = $('<div>').append(input).css('width', '600px');
      // if (!options || (!options.readonly && !options.multiple)) {
      //   container.css('display', 'flex')
      //     .css('margin', 'auto 0 auto 8px');       
      //   container
      //    .append(label1)
      //     .append(input3);
      // }
      addToContainer(container);
      console.log('createFileURLFieldElement4 --- create --- end:' + question.id);
      return container;
    },
    getValue: function (container) {
      var json = {};
      // console.log('createFileURLFieldElement4 --- getValue --- start:' + question.id);
      // console.log('createFileURLFieldElement4 --- getValue --- start:' + JSON.stringify(container));

      //これら単独では呼ばれている
      if (container.closest('.form-group').find('input#alias').length > 0)
      {
        console.log('createFileURLFieldElement4-----getValue-closesetalias---ok');
      }
      if (container.closest('.form-group').find('select option').length > 0) {
        console.log('createFileURLFieldElement4-----getValue-closeelect option---ok');
        json['alias'] = container.closest('.form-group').find('input#alias').val();        
      }
      if (container.closest('.form-group').find('input').length > 0) {
        console.log('createFileURLFieldElement4-----getValue-closeinput---ok');
      }
      if (container.find('select option').length > 0) {
        console.log('createFileURLFieldElement4 --- getValue --- option:' + question.id);
        json['options'] = container.find('select option:selected').val();        
      }
      if (container.find('input').length > 0) {
        console.log('createFileURLFieldElement4 --- getValue --- input:' + question.id);
        json['input'] = container.find('input').val();
      }
      if (container.find('input#alias').length > 0) {
        console.log('createFileURLFieldElement4 --- getValue --- alias:' + question.id);
        json['alias'] = container.find('input#alias').val();
      }

      if (container.find('select option').length > 0
      && container.find('input').length > 0
      && container.find('input#alias').length > 0) {
        console.log('createFileURLFieldElement4 --- getValue --- 1:' + question.id);
        if (container.find('select option').length > 0) {
          console.log('createFileURLFieldElement4 --- getValue --- 2:' + question.id);
          json['options'] = container.find('select option:selected').val();
        }

        if (container.find('input').length > 0) {
          var tmpVal = container.find('input').val();
          console.dir(tmpVal);
          console.log('createFileURLFieldElement4 --- getValue --- 3:' + JSON.stringify(tmpVal, null, 2));
          console.log('createFileURLFieldElement4 --- getValue --- 3:' + typeof tmpVal);
          json['input'] = container.find('input').val();
        }

        if (container.find('input#alias').length > 0) {
          var tmpVal = container.find('input#alias').val();
          console.dir(tmpVal);
          console.log('createFileURLFieldElement4 --- getValue --- 4:' + JSON.stringify(tmpVal, null, 2));
          console.log('createFileURLFieldElement4 --- getValue --- 4:' + typeof tmpVal);
          json['alias'] = container.find('input#alias').val();
        }

      }
      // if (container.find('select option').length > 0
      //   && container.find('input').length > 0) {
      //   console.log('createFileURLFieldElement4 --- getValue --- 1:' + question.id);
      //   if (container.find('select option').length > 0) {
      //     console.log('createFileURLFieldElement4 --- getValue --- 2:' + question.id);
      //     json['options'] = container.find('select option:selected').val();
      //   }

      //   if (container.find('input').length > 0) {
      //     var tmpVal = container.find('input').val();
      //     console.dir(tmpVal);
      //     console.log('createFileURLFieldElement4 --- getValue --- 3:' + JSON.stringify(tmpVal, null, 2));
      //     console.log('createFileURLFieldElement4 --- getValue --- 3:' + typeof tmpVal);
      //     json['input'] = container.find('input').val();
      //   }
      // }
      else {
        console.log('createFileURLFieldElement4 --- getValue --- else:' + question.id);
        json['input'] = container.find('input').val();
      }
      console.log('createFileURLFieldElement4 --- getValue --- end:' + question.id + JSON.stringify(json));
      return json;
    },
    setValue: function (container, value) {
      console.log(JSON.stringify(value));
      console.log('createFileURLFieldElement4 --- setValue --- start:' + JSON.stringify(container));
      console.log('createFileURLFieldElement4 --- setValue --- start:' + question.id);
      for (var key in value) {
        if (value.hasOwnProperty(key)) {
          if (key == 'options') {
            console.log('createFileURLFieldElement4 --- setValue --- else3:' + key + ' --> ' + value.options);
            container.find('select option[value="' + value.options + '"]').attr('selected', true);
          } else {
            console.log('createFileURLFieldElement4 --- setValue --- else1:' + question.id);
          }

          if (key == 'input') {
            console.log('createFileURLFieldElement4 --- setValue --- else3:' + key + ' --> ' + value.input);
            container.find('input').val(value.input);
          } else {
            console.log('createFileURLFieldElement4 --- setValue --- else2:' + question.id);
          }

          if (key == 'alias') {
            console.log('createFileURLFieldElement4 --- setValue --- else3:' + key + ' --> ' + value.alias);
            container.closest('.form-group').find('input#alias').val(value.alias);
          } else {
            console.log('createFileURLFieldElement4 --- setValue --- else3:' + question.id);
          }

        } else {
          console.log('createFileURLFieldElement4 --- setValue --- else3:' + question.id);
        }
      }
      console.log('createFileURLFieldElement4 --- setValue --- end:' + question.id);


    },
    reset: function (container) {
      container.find('input').val(null);
    },
    disable: function (container, disabled) {
      container.find('input').attr('disabled', disabled);
    },
  };
}

//未病データベース構築_プロトタイプ　（時系列データ種別 その他の場合)
function createFileURLFieldElement5(createHandler, createHandler2, question, options) {

  return {
    create: function (addToContainer, onChange) {
      console.log('createFileURLFieldElement5-----create:');
      const combo_box = createHandler();
      if (options && options.readonly) {
        //combo_box.attr('readonly', true);
        combo_box.prop('disabled', true);
      }
      if (onChange) {
        combo_box.change(function (event) {
          onChange(event, options);
        });
      }
      //console.log('createFileURLFieldElement5-----1:');
      combo_box.addClass('form-control');
      //20230613 chg KWT -->        
      const container = $('<div></div>');
      container.css('width', '100%')
        .css('margin', 'auto 10px auto 10px');

      //if (!options || (!options.readonly)) {
      //if (!options || (!options.readonly && !options.multiple)) {
      container.css('display', 'flex')
        .css('margin', 'auto 0 auto 8px');

      //console.log('createFileURLFieldElement5-----2:');
      (question.checkboxes || []).forEach(function (chk) {
        const fillContainer1 = $('<div></div>');

        //console.log('createFileURLFieldElement5-----3:');
        const checkbox_button = createHandler2();
        checkbox_button.addClass('form-control')
          .attr('id', 'chk' + chk_btn_count)
          .attr('name', 'chkbox')
          .prop('checked', false)
          .css('float', 'left')
          .css('width', '50px')
          .css('inline-size', '1.5rem')
          .css('border', '0');
        //.css('margin', 'auto auto auto 10px');
        if (options && options.readonly) {
          //checkbox_button.attr('readonly', true);
          checkbox_button.prop('disabled', true);
        }

        console.log('checked --> ' + checkbox_button.prop('checked'));
        (checkbox_button.prop('checked')) ? combo_box.attr('disabled', true) : combo_box.attr('disabled', false);

        //console.log('createFileURLFieldElement5-----4:');
        checkbox_button.on('change', function (event) {
          var isChecked = $(this).prop('checked');
          if (isChecked) {
            combo_box.attr('disabled', true);
          } else {
            combo_box.attr('disabled', false);
          }
          onChange(event, options);
        });

        //console.log('createFileURLFieldElement5-----5:');
        fillContainer1.append(checkbox_button)
          .css('width', '16%')
          .css('margin', 'auto 10px auto 10px');

        //console.log('createFileURLFieldElement5-----6');
        const checkbox_button_label = $('<label></label>');
        checkbox_button_label.addClass('form-control')
          .attr('for', 'chk' + chk_btn_count)
          .css('margin', '0px')
          .css('padding', '8px 0px 0px 23px')
          .css('border', '0')
          .text(getLocalizedText(chk.tooltip));

        //console.log('createFileURLFieldElement5-----7:');
        fillContainer1.append(checkbox_button_label)
          // .css('margin', 'auto auto auto 10px');
          .css('margin-right', '10px');

        //onsole.log('createFileURLFieldElement5-----8:');
        container.append(fillContainer1);
        chk_btn_count++;
      });
      //console.log('createFileURLFieldElement5-----9:');

      const fillContainer2 = $('<div>')
        .append(combo_box)
        .css('width', '70%')
        .css('margin', 'auto auto auto 10px');
      container.append(fillContainer2);
      //console.log('createFileURLFieldElement5-----10:');
      //}
      //20230613 chg KWT <-- 

      addToContainer(container);
      console.log('createFileURLFieldElement5-----end:');
      return container;
    },
    getValue: function (container) {
      console.log('createFileURLFieldElement5-----getValue:');
      if (container.find('input[type="checkbox"]').length > 0
        && container.find('select option').length > 0) {
        var json = {};

        //console.log('createFileURLFieldElement5-----getValue-1');

        if (container.find('input[type="checkbox"]').length > 0) {
          const checkboxChecked = container.find('input[type="checkbox"]').prop('checked');
          if (checkboxChecked) {
            // container.find('input[type="checkbox"]').prop('checked', true);
            json['checkboxes'] = 'true';
          } else {
            // container.find('input[type="checkbox"]').prop('checked', false);
            json['checkboxes'] = 'false';
          }
        } else {
          json['checkboxes'] = 'true';
        }
        //

        //console.log('createFileURLFieldElement5-----getValue-2');

        if (container.find('select option').length > 0) {
          var value = container.find('select option:selected').val();
          // container.find('select option[value="' + val + '"]').attr('selected', true);
          json['options'] = value;
        } else {
          json['options'] = "0";
        }
        //console.log('createFileURLFieldElement5-----getValue-3');

        return json;
      } else {
        var json = {};
        json['checkboxes'] = 'true';
        json['options'] = "0";
      }
      console.log('createFileURLFieldElement5-----getValue-END');
    },
    setValue: function (container, value) {
      console.log('createFileURLFieldElement5-----setValue:' + value);
      for (var key in value) {
        if (value.hasOwnProperty(key)) {
          var val = value[key];
          if (key == 'checkboxes') {
            if (val == 'true') {
              //console.log(value);
              container.find('input[type="checkbox"][name="chkbox"]').prop('checked', true);
              container.find('select').attr('disabled', true);
            } else {
              //console.log(value);
              container.find('input[type="checkbox"][name="chkbox"]').prop('checked', false);
            }
          }

          if (key == 'options') {
            container.find('select option[value="' + val + '"]').attr('selected', true);
          }
        }
      }
      console.log('createFileURLFieldElement5-----setValue:end');
    },
    reset: function (container) {
      console.log('createFileURLFieldElement5-----reset:');
      container.find('input[type="checkbox"]').val(true);
      //container.find('input[type="checkbox"]').val(null);
      container.find('select option[value="0"]').attr('selected', true);
    },
    disable: function (container, disabled) {
      console.log('createFileURLFieldElement5-----disable:');
      container.find('input').attr('disabled', disabled);
    },
  };
}

//未病データベース構築_プロトタイプ　（時系列データ種別 その他の場合)　ラジオとコンボ　
function createFileURLFieldElement6(createHandler, createHandler2, question, options) {
  // rdo_group = 1;  
  // rdo_group = (rdo_group > 1) ? rdo_group : 1;
  return {
    create: function (addToContainer, onChange) {
      //20230613 chg KWT -->
      const container = $('<div></div>');
      container.css('width', '100%')
        .css('margin', 'auto 10px auto 10px');
      console.log('createFileURLFieldElement6---create---start:' + question.qid);
      //if (!options || (!options.readonly)) {//20230828

      //if (!options || (!options.readonly && !options.multiple)) {
      // container.css('display', 'flex')
      //   .css('margin', 'auto 0 auto 8px');
      var multiple_items_control_name = '';
      rdo_group = question.qid.includes('grdm-file:') ? question.qid.split(':')[1].toLowerCase().replace(/\s+/g, '-') : '';
      (question.multiple_items || []).forEach(function (item) {        
        if ($.trim(item.tooltip) !== '') {
          const div1 = $('<div></div>')
            .append($('<label></label>')
              .text(getLocalizedText(item.tooltip)))
            .css('margin', 'auto 0 auto 8px');
          container.append(div1);
        }

        const div2 = $('<div></div>')
          .css('width', '37%')
          .css('display', 'flex')
          .css('margin', 'auto 0 auto 8px');

        var radio_button = null;
        var textbox = null;
        var select = null;
        rdo_group = rdo_group + item.text;
        (item.radios || []).forEach(function (rdo) {
          radio_button = createHandler2();
          radio_button.addClass('form-control')
            .attr('id', 'rdo' + rdo_btn_count)
            .attr('name', 'radiobtn-' + rdo_group)
            .prop('value', rdo.text) //20230720 add KWT
            .css('float', 'left')
            .css('width', '50px')
            .css('inline-size', '1.5rem')
            .css('border', '0')
            .css('margin', '0px 4px');  //20230615 chg KWT               

          div2.append(radio_button);
          // .css('width', '100px');
          //.css('margin', 'auto 10px auto 10px');

          const radio_button_label = $('<label></label>');
          radio_button_label.addClass('form-control')
            .attr('for', 'rdo' + rdo_btn_count)
            .css('border', '0')
            .css('padding', '6px 0px') //20230615 add KWT
            .text(getLocalizedText(rdo.tooltip));

          div2.append(radio_button_label)
            // .css('margin', 'auto auto auto 10px');
            .css('margin-right', '10px');

          // container.append(fillContainer1);
          rdo_btn_count++;

          if (rdo.lock) {
            var value = rdo.lock.includes(':') ? rdo.lock.split(':') : rdo.lock;
            radio_button.on('change', function (event) {
              console.log(value[0] + '-->' + value[1]);
              textbox.attr('id', value[0]).prop('disabled', value[1] === 'true');
              onChange(event, options);
            });            
          }

          radio_button.on('change', function (event) {      
            onChange(event, options);
          });  

          // if (item.text === '0' && item.options) {
          //   radio_button.on('change', function () {
          //     var checkedValue = $(this).val();
          //     if (select != null) {
          //       if (checkedValue === '0') {
          //         select.prop('disabled', true);
          //       } else {
          //         select.prop('disabled', false);
          //       }
          //     }
          //   });
          // }

          if (options && options.readonly) {
            radio_button.prop('disabled', true);
            //textbox.prop('disabled', true); 
            //div2.prop('disabled', true);            
            //comboselect_box.attr('readonly', true);
          }
          // rdo_group = '';
        });
        // rdo_group++;

        // var combo_box = null;
        select = $('<select></select>').attr('name', 'select0');
        const defaultOption = $('<option></option>').attr('value', '');

        if (options.multiple) {
          defaultOption.text(_('(Not Modified)'));
          defaultOption.attr('selected', true)
        } else {
          defaultOption.text(_('Choose...'));
        }
        select.append(defaultOption);

        if (options && options.readonly) {
          select.prop('disabled', true);
          //comboselect_box.attr('readonly', true);
        }
        if (onChange) {
          select.change(function (event) {
            onChange(event, options);
          });
        }

        (item.options || []).forEach(function (opt) {
          if (opt == '') {
            div2.css('width', '24%');
          }
          const optElem = $('<option></option>')
            .attr('value', opt.text === undefined ? opt : opt.text)
            .text(opt.text === undefined ? value : getLocalizedText(opt.tooltip));
          if (!options.multiple && opt.default) {
            optElem.attr('selected', true);
          }
          select.append(optElem);

          select.addClass('form-control');
          div2.append(select);
        });


        (item.textbox || []).forEach(function (txt) {
          textbox = $('<input type="text"></input>').attr('id', 'textbox' + txt.text).addClass('form-control');
          if (options && options.readonly) {
            textbox.attr('readonly', true);
            //optElem.prop('disabled', true);            
            //comboselect_box.attr('readonly', true);
          }
          textbox.on('input', function(event){
            onChange(event, options);
          });
          div2.append(textbox);
        });

        var radios = div2.find('input[type="radio"]');
        // console.log("radios --> " + JSON.stringify(div));
        radios.each(function (event) {
          if(!$(this).prop('checked')){
            // onChange(event, options); --- 20231207
          }
        });

        if(item.multiple_items_control){                  
          multiple_items_control_name =  'radiobtn-' + rdo_group;         
        }else if (item.hasOwnProperty('multiple_items_control') && !item.multiple_items_control){
          var radios = div2.find('input[type="radio"][name="radiobtn-'+ rdo_group +'"]');
          console.log("no-control-radio--> radiobtn-"+ rdo_group);
          radios.each(function(event) {
            $(this).attr('data-disabled', 'true');          
          });
        };

        container
          .append(div2);
      });

      if(multiple_items_control_name != ''){        
        const control_radio = container.find('input[name="'+ multiple_items_control_name +'"]');               
        const radios = container.find('input[type="radio"][name!="'+ multiple_items_control_name +'"]');
        control_radio.on('change', function (event) {          
          
          if ($(this).val() === '1') {
            container.find('select').prop('disabled', true);
            radios.each(function () {                
              $(this).prop('disabled', false);                                                           
            });
          } else {
            container.find('select').prop('disabled', false);
            radios.each(function () {                        
              $(this).prop('disabled', true);             
            });
          }
          onChange(event, options);
        });        
      }

      // const rdo1 = container.find('input[name="radiobtn-no-informed-consent0"]');

      // rdo1.on('change', function () {
      //   const radios = container.find('input[type="radio"][name!="radiobtn-no-informed-consent0"]');

      //   if ($(this).val() === '1') {
      //     container.find('select').prop('disabled', true);
      //     radios.each(function () {
      //       // const number = $(this).attr('name').replace('radiobtn', '');  
      //       // if(number > 1){
      //       $(this).prop('disabled', false);
      //       // container.find('input[name="radiobtn'+ number +'"]').prop('disabled', false); 
      //       // }                                                  
      //     });
      //   } else {
      //     container.find('select').prop('disabled', false);
      //     radios.each(function () {
      //       // const number = $(this).attr('name').replace('radiobtn', ''); 
      //       // if(number > 1){               
      //       $(this).prop('disabled', true);
      //       // container.find('input[name="radiobtn'+ number +'"]').prop('disabled', true);      
      //       // }
      //     });
      //   }
      // });

      // const fillContainer2 = $('<div>')
      //   .append(combo_box)
      //   .css('width', '70%')
      //   .css('margin', 'auto auto auto 10px');
      // container.append(fillContainer2);
      // rdo_group++;
      //}//20230828

      //20230613 chg KWT <--   
      addToContainer(container);
      console.log('createFileURLFieldElement6---create---end:' + question.qid);
      return container;
    },
    getValue: function (container) {
      console.log('createFileURLFieldElement6---getValue---start:' + question.qid);
      console.log('createFileURLFieldElement6---getValue---container:' + JSON.stringify(container));
      const result = {};
      if (container.find('select option').length > 0) {
        result['option'] = container.find('option:selected').val();
        console.log('createFileURLFieldElement6---getValue---option:' + JSON.stringify(result));
      }

      const radios = container.find('input[type="radio"]').map(function () {
        //console.log('createFileURLFieldElement6---getValue---radios:' + JSON.stringify(radios));
        if ($(this).attr('name').includes('radiobtn-')) {
          const name = $(this).attr('name');
          //console.log('createFileURLFieldElement6---getValue---name:' + name);
          if ($(this).prop('checked')) {
            result[name] = $(this).val();
          }
        }
        console.log('createFileURLFieldElement6---getValue---radio:' + JSON.stringify(result));
        // return result;
      })

      // container.find('input[type="radio"]').map(function () {
      //   if ($(this).attr('name').includes('radio')) {
      //     const name = $(this).attr('name');
      //     if ($(this).prop('checked')) {
      //       result[name] = $(this).val();
      //     }
      //   }
      //   console.log('createFileURLFieldElement6---getValue---radio2:' + JSON.stringify(result));
      //   // return result;
      // })

      container.find('input[type="text"]').map(function () {
        if ($(this).attr('id').includes('textbox')) {
          const name = $(this).attr('id');
          result[name] = $(this).val();
        }
        console.log('createFileURLFieldElement6---getValue---text:' + JSON.stringify(result));
        // return result;
      })
      console.log(result);
      console.log('createFileURLFieldElement6---getValue---end:' + question.qid);
      return result;
    },
    setValue: function (container, value) {
      console.log('createFileURLFieldElement6---setValue---start:' + question.qid);
      console.log(JSON.stringify(value));
      for (var name in value) {
        console.log('createFileURLFieldElement6---setValue---name:' + name);
        if (value.hasOwnProperty(name)) {
          const result = value[name];
          if (name.includes('option')) {
            console.log('createFileURLFieldElement6---setValue---option --> value='+ result);
            container.find('select option[value="' + result + '"]').attr('selected', true);
          }
          if (name.includes('radiobtn-')) {
            console.log('createFileURLFieldElement6---setValue---radio --> name=' + name + ' / value=' + result);
            container.find('input[type="radio"][name="' + name + '"][value="' + result + '"]').prop('checked', true);
           
            if(name === 'radiobtn-no-informed-consent0' && result === '1'){              
              container.find('select').prop('disabled', true);                              
            }

            if(name === 'radiobtn-no-informed-consent0' && result === '0'){
              const disabledRadios = container.find('input[type="radio"][data-disabled="true"]');
              disabledRadios.each(function() {
                $(this).prop('disabled', true);
              });
            }

            if(name === 'radiobtn-conflict-of-interest0' && result === ''){              
              container.find('input[type="text"]').prop('disabled', true);              
            }            
          }
          if (name.includes('textbox')) {
            console.log('createFileURLFieldElement6---setValue---textbox --> name=' + name + ' / value=' + result);
            container.find('input[type="text"][id="' + name + '"]').val(result);
          }
        }
      }
      console.log('createFileURLFieldElement6---setValue---end:' + question.qid);
    },
    reset: function (container) {
      container.find('input').val(null);
    },
    disable: function (container, disabled) {
      container.find('input').attr('disabled', disabled);
    },
  };
}

//未病データベース構築_プロトタイプ　（時系列データ種別 その他の場合)  ラジオのみ
function createFileURLFieldElement7(createHandler, createHandler2, question, options) {

  return {
    create: function (addToContainer, onChange) {
      const input = createHandler();
      if (options && options.readonly) {
        //input.attr('readonly', true);
        input.prop('disabled', true);
      }
      if (onChange) {
        input.change(function (event) {
          onChange(event, options);
        });
      }
      input.addClass('form-control');
      //20230613 chg KWT -->
      const container = $('<div></div>');
      container.css('width', '100%')
        .css('margin', 'auto 10px auto 10px');
      if (!options || (!options.readonly && !options.multiple)) {
        container.css('display', 'flex')
          .css('margin', 'auto 0 auto 8px');

        (question.radios || []).forEach(function (rdo) {
          const fillContainer1 = $('<div></div>');

          const radio_button = createHandler2();
          radio_button.addClass('form-control')
            .attr('id', 'rdo' + rdo_btn_count)
            .attr('name', 'radiobtn-' + rdo_group)
            .prop('value', rdo.text) //20230720 add KWT
            .css('float', 'left')
            .css('width', '50px')
            .css('inline-size', '1.5rem')
            .css('border', '0')
            .css('margin', '0px 4px'); //20230615 chg KWT

          fillContainer1.append(radio_button)
            .css('width', '100px');
          //.css('margin', 'auto 10px auto 10px');

          const radio_button_label = $('<label></label>');
          radio_button_label.addClass('form-control')
            .attr('for', 'rdo' + rdo_btn_count)
            .css('border', '0')
            .css('padding', '6px 0px') //20230615 add KWT
            .text(getLocalizedText(rdo.tooltip));

          fillContainer1.append(radio_button_label)
            // .css('margin', 'auto auto auto 10px');
            .css('margin-right', '10px');

          container.append(fillContainer1);
          rdo_btn_count++;
        });
        // rdo_group++;
        //20230613 chg KWT <--    
      }

      addToContainer(container);
      return container;
    },
    getValue: function (container) {
      if (container.find('input[type="radio"]').length > 0
        && container.find('select option').length > 0
      ) {
        var json = {};

        if (container.find('input[type="radio"]').length > 0) {
          const value = container.find('input[type="radio"]:checked').val();
          container.find('input[type="radio"][value="' + value + '"]').prop('checked', true);
          json['radios'] = value;
        }

        if (container.find('select option').length > 0) {
          var value = container.find('select option:selected').val();
          container.find('select option[value="' + value + '"]').attr('selected', true);
          json['options'] = value;
        }
        return json;
      } else if (container.find('input[type="radio"]').length > 0
        && !container.find('select option').length) {
        const value = container.find('input[type="radio"]:checked').val();
        container.find('input[type="radio"][value="' + value + '"]').prop('checked', true);
        return value;
      } else {
        return container.find('input').val();
      }

      // return container.find('input').val();
    },
    setValue: function (container, value) {
      if (container.find('input[type="radio"]').length > 0) {
        const radioChecked = container.find('input[type="radio"]').prop('checked');
        if (radioChecked) {
          const checked_val = container.find('input[type="radio"]:checked').val();
          container.val(checked_val);
        } else {
          container.find('input').val(value);
        }

      }
      // container.find('input').val(value);
    },
    reset: function (container) {
      container.find('input').val(null);
    },
    disable: function (container, disabled) {
      container.find('input').attr('disabled', disabled);
    },
  };
}

function createFileCreatorsFieldElement(erad, options) {
  const emptyLine = $('<td></td>')
    .attr('colspan', '4')
    .css('text-align', 'center')
    .css('padding', '1em')
    .text(_('No members'))
    .show();

  const addResearcher = function (container, defaultValues) {
    const numberInput = $('<input class="form-control" name="file-creator-number">');
    const nameJaInput = $('<input class="form-control" name="file-creator-name-ja">');
    const nameEnInput = $('<input class="form-control" name="file-creator-name-en">');
    if (options && options.readonly) {
      numberInput.attr('readonly', true);
      nameJaInput.attr('readonly', true);
      nameEnInput.attr('readonly', true);
    }
    if (defaultValues) {
      numberInput.val(defaultValues.number).change();
      nameJaInput.val(defaultValues.name_ja).change();
      nameEnInput.val(defaultValues.name_en).change();
    }
    const tr = $('<tr>')
      .append($('<td>').append(numberInput))
      .append($('<td>').append(nameJaInput))
      .append($('<td>').append(nameEnInput));
    if (!options || !options.readonly) {
      tr.append('<td><span class="file-creator-remove"><i class="fa fa-times fa-2x remove-or-reject"></i></span></td>');
    }
    const tbody = container.find('tbody');
    tbody.append(tr);
    numberInput.typeahead(
      {
        hint: false,
        highlight: true,
        minLength: 0
      },
      {
        display: function (data) {
          return data.kenkyusha_no;
        },
        templates: {
          suggestion: function (data) {
            return '<div style="background-color: white;"><span>' + $osf.htmlEscape(data.kenkyusha_shimei) + '</span> ' +
              '<span><small class="m-l-md text-muted">' +
              $osf.htmlEscape(data.kenkyusha_no) + ' - ' +
              $osf.htmlEscape(data.kenkyukikan_mei) + ' - ' +
              $osf.htmlEscape(data.kadai_mei) + ' (' + data.nendo + ')'
              + '</small></span></div>';
          }
        },
        source: substringMatcher(erad.candidates),
      }
    );
    numberInput.bind('typeahead:selected', function (event, data) {
      if (!data.kenkyusha_no) {
        return;
      }
      const names = data.kenkyusha_shimei.split('|');
      const jaNames = names.slice(0, Math.floor(names.length / 2))
      const enNames = names.slice(Math.floor(names.length / 2))
      nameJaInput.val(jaNames.join('')).change();
      nameEnInput.val(enNames.reverse().join(' ')).change();
    });
    tbody.find('.twitter-typeahead').css('width', '100%');
    emptyLine.hide();
  }

  return {
    create: function (addToContainer, onChange) {
      const thead = $('<thead>')
        .append($('<tr>')
          .append($('<th>' + _('e-Rad Researcher Number') + '</th>'))
          .append($('<th>' + _('Name (Japanese)') + '</th>'))
          .append($('<th>' + _('Name (English)') + '</th>'))
          .append($('<th></th>'))
        );
      const tbody = $('<tbody>');
      const container = $('<div></div>')
        .addClass('file-creators-container')
        .append($('<table class="table responsive-table responsive-table-xxs">')
          .append(thead)
          .append(tbody)
        );
      tbody.append(emptyLine);
      if (!options || !options.readonly) {
        const addButton = $('<a class="btn btn-success btn-sm">')
          .append($('<i class="fa fa-plus"></i>'))
          .append($('<span></span>').text(_('Add')));
        container.append(addButton);
        addButton.on('click', function (e) {
          e.preventDefault();
          addResearcher(container);
        });
        tbody.on('click', '.file-creator-remove', function (e) {
          e.preventDefault();
          $(this).closest('tr').remove();
          if (container.find('tbody tr').length === 0) {
            emptyLine.show();
          }
          if (onChange) {
            onChange(e, options);
          }
        });
      }
      tbody.on('change', 'input', function (e) {
        const value = e.target.value
        if (value && e.target.getAttribute('name').startsWith('file-creator-name')) {
          const normalized = normalize(value);
          if (value !== normalized) {
            e.target.value = normalized;
          }
        }
        if (onChange) {
          onChange(e, options);
        }
      });
      addToContainer(container);
      return container;
    },
    getValue: function (container) {
      const researchers = container.find('tbody tr').map(function () {
        return {
          'number': $(this).find('[name=file-creator-number]').val(),
          'name_ja': $(this).find('[name=file-creator-name-ja]').val(),
          'name_en': $(this).find('[name=file-creator-name-en]').val()
        };
      }).toArray().filter(function (researcher) {
        return Object.values(researcher).some(function (v) { return v && v.trim().length > 0; });
      });
      if (researchers.length === 0) {
        return '';
      }
      return JSON.stringify(researchers);
    },
    setValue: function (container, value) {
      const researchers = value ? JSON.parse(value) : [];
      researchers.forEach(function (researcher) {
        addResearcher(container, researcher);
      });
    },
    reset: function (container) {
      container.find('tbody').empty();
    },
    disable: function (container, disabled) {
      const btn = container.find('.btn');
      if (disabled) {
        btn.addClass('disabled');
      } else {
        btn.removeClass('disabled');
      }
    },
  };
}

//未病データベース構築_プロトタイプ （フォルダ構成）
function createFileCreatorsFieldElement2(erad, options, question) {  
  var format = question.qid.includes('grdm-file:') ? question.qid.split(':')[1].toLowerCase().replace(/\s+/g, '-') : question.id;
  
  // 20230612 chg KWT -->
  const value = _('No members');
  var _no_members = value;
  if (rdmGettext.getBrowserLang() === 'ja') {
    const index = value.indexOf('が');
    _no_members = question.nav + value.substring(index);
  }
  // 20230612 chg KWT <--

  const emptyLine = $('<td></td>')
    .attr('colspan', '4')
    .css('text-align', 'center')
    .css('padding', '1em')
    // .text(_('No members'))
    .text(_no_members) //20230608 chg kwt
    .show();

  const addResearcher = function (container, defaultValues) {
    // 20230622 chg KWT -->
    var action = null;
    const tbody = container.find('tbody');
    const tr = $('<tr>');

    (question.table_headers || [{ 'type': 'text', 'text': '0', 'width': 'true' }]).forEach(function (content) {
      var contentInputs = '';
      // if(content.action !== undefined){
      //   console.log(content.action);
      //   action = content.action.split(':');
      // }

      if (content.type == 'text' || content.type == 'checkbox') {
        if(content.hasOwnProperty('action')){
          var action = (content.action || []) ? content.action.split(':') :'none';   
          action = format + '-' + action[0] + ':' + action[1];
        }
   
        contentInputs = $('<input class="form-control" type="' + content.type + '" name="' + format + '-' + content.text + '" id="' + format + '-' + content.text + '" data-action="'+ action +'">');
      }

      if (content.type == 'textarea') {
        contentInputs = $('<textarea class="form-control" name="' + format + '-' + content.text + '">');
      }

      if (content.type == 'checkbox') {
        // contentInputs.val('false'); //初期値
        contentInputs.on('change', function () {
          var isChecked = $(this).prop('checked');
          if (isChecked) {
            contentInputs.val('true');
          } else {
            contentInputs.val('false');
          }
        });

        contentInputs.css('inline-size', '1.5rem').css('margin', '0 auto'); //20230621 add KWT
      }
      if (options && options.readonly) {
        contentInputs.attr('readonly', true);
      }
      if (defaultValues) {
        if (Object.keys(defaultValues).some(function(v) {
            return v.includes(format);
          })) {
        //if (Object.keys(defaultValues).some(v => v.includes(format))) {
          if (content.type == 'checkbox') {
            contentInputs.prop('checked', defaultValues[format + '-' + content.text] === 'true').change();
          } else {
            contentInputs.val(defaultValues[format + '-' + content.text]).change();
          }
        }
      }

      // if (defaultValues) {
      //   if (Object.keys(defaultValues).some(v => v.includes(format))) {
      //     if (content.type == 'checkbox') {
      //       contentInputs.prop('checked', defaultValues[format + '-' + content.text] === 'true').change();
      //     } else {
      //       contentInputs.val(defaultValues[format + '-' + content.text]).change();
      //     }
      //   }
      // }

      const td = $('<td>');
      if (content.width) {
        td.css('width', '200px');
      }
      tr.append(td.append(contentInputs));

      tbody.append(tr);
      if (content.text === '0') {
        contentInputs.typeahead(
          {
            hint: false,
            highlight: true,
            minLength: 0
          },
          {
            display: function (data) {
              return data.kenkyusha_no;
            },
            templates: {
              suggestion: function (data) {
                return '<div style="background-color: white;"><span>' + $osf.htmlEscape(data.kenkyusha_shimei) + '</span> ' +
                  '<span><small class="m-l-md text-muted">' +
                  $osf.htmlEscape(data.kenkyusha_no) + ' - ' +
                  $osf.htmlEscape(data.kenkyukikan_mei) + ' - ' +
                  $osf.htmlEscape(data.kadai_mei) + ' (' + data.nendo + ')'
                  + '</small></span></div>';
              }
            },
            source: substringMatcher(erad.candidates),
          }
        );
        contentInputs.bind('typeahead:selected', function (event, data) {
          if (!data.kenkyusha_no) {
            return;
          }
          const names = data.kenkyusha_shimei.split('|');
          const jaNames = names.slice(0, Math.floor(names.length / 2))
          const enNames = names.slice(Math.floor(names.length / 2))
          nameInput.val(jaNames.join('')).change();
          noteInput.val(enNames.reverse().join(' ')).change();
        });
      }
    });
    if (!options || !options.readonly) {
      tr.append('<td><span class="file-creator-remove"><i class="fa fa-times fa-2x remove-or-reject"></i></span></td>');
    }
    tbody.append(tr);
    // 20230622 chg KWT <--

    tbody.on('change', 'input[type="checkbox"]', function () {
      const checkbox = $(this);
      const isChecked = checkbox.prop('checked');
      const name = checkbox.data('action').split(':');
      const tr = checkbox.closest('tr');
      // if(action != null){
      var input = tr.find('input[type="text"][name="'+ name[0] +'"]');
      // console.log(format + '-' + action[0]);
      // console.log(action[1]);
      if (isChecked) {
        input.val(name[1]);
      } else {
        input.val('');
      }
      // }      
    });

    tbody.find('.twitter-typeahead').css('width', '100%');
    emptyLine.hide();
  }

  return {
    create: function (addToContainer, onChange) {
      //20230614 chg KWT -->
      const thead = $('<thead></thead>');
      const tr = $('<tr></tr>');
      (question.table_headers || []).forEach(function (header) {
        const th = $('<th>').text(getLocalizedText(header.tooltip));
        if (!header.alias) {
          th.css('vertical-align', 'top');
        } else {
          th.append($('<input name="alias-' + header.text + '">').css('display', 'block'));
        }
        tr.append(th);
      });

      thead.append(tr);
      //20230612 chg KWT <--

      const tbody = $('<tbody>');
      const container = $('<div></div>')
        .addClass('file-creators-container')
        .css('margin-bottom', '3%')
        .append($('<table class="table responsive-table responsive-table-xxs">')
          .css('margin', '0px')
          .append(thead)
          .append(tbody)
        );
      tbody.append(emptyLine);
      if (!options || !options.readonly) {
        const addButton = $('<a class="btn btn-success btn-sm">')
          .append($('<i class="fa fa-plus"></i>'))
          .append($('<span></span>').text(_('Add')));
        container.append(addButton);
        addButton.on('click', function (e) {
          e.preventDefault();
          addResearcher(container);
        });
        tbody.on('click', '.file-creator-remove', function (e) {
          e.preventDefault();
          $(this).closest('tr').remove();
          if (container.find('tbody tr').length === 0) {
            emptyLine.show();
          }
          if (onChange) {
            onChange(e, options);
          }
        });
      }
      tbody.on('change', 'input', function (e) {
        const value = e.target.value
        if (value && e.target.getAttribute('name').startsWith('file-creator-name')) {
          const normalized = normalize(value);
          if (value !== normalized) {
            e.target.value = normalized;
          }
        }
        if (onChange) {
          onChange(e, options);
        }
      });
      addToContainer(container);
      return container;
    },
    getValue: function (container) {
      const researchers = container.find('thead tr, tbody tr').map(function () {

        const result = {};

        (question.table_headers || [{ 'type': 'text', 'text': '0', 'width': 'true' }]).forEach(function (header) {
          if (header.alias) {
            const alias = 'alias-' + header.text;
            result[alias] = $(this).find('[name=' + alias + ']').val();
          }
          const input = format + '-' + header.text;
          result[input] = $(this).find('[name=' + input + ']').val();
        }, this);
        return result;
      }).toArray().filter(function (researcher) {
        return Object.values(researcher).some(function (v) { return v && v.trim().length > 0; });
      });
      if (researchers.length === 0) {
        return '';
      }
      return JSON.stringify(researchers);
    },
    setValue: function (container, value) {
      const researchers = value ? JSON.parse(value) : [];
      researchers.forEach(function (researcher) {
        for (var value in researcher) {
          if (value.startsWith('alias')) {
            container.find('thead tr th input[name=' + value + ']').val(researcher[value]);
          }
        }

        if (Object.keys(researcher).some(function (v) {
          return v.includes(format);
          })) {
        //if (Object.keys(researcher).some(v => v.includes(format))) {
          addResearcher(container, researcher);
        }
        // addResearcher(container, researcher);       
      });
    },
    reset: function (container) {
      container.find('tbody').empty();
    },
    disable: function (container, disabled) {
      const btn = container.find('.btn');
      if (disabled) {
        btn.addClass('disabled');
      } else {
        btn.removeClass('disabled');
      }
    },
  };
}

//未病データベース構築_プロトタイプ （測定回数）
function createFileCreatorsFieldElement3(erad, options) {
  // 20230612 chg KWT -->
  const value = _('No members');
  var _no_members = value;

  if (rdmGettext.getBrowserLang() === 'ja') {
    const index = value.indexOf('が');
    _no_members = '測定回数' + value.substring(index);
  }
  // 20230612 chg KWT <--

  const emptyLine = $('<td></td>')
    .attr('colspan', '1')
    .css('text-align', 'center')
    .css('padding', '1em')
    // .text(_('No members'))
    .text(_no_members) // 20230608 chg KWT
    .show();

  const addResearcher = function (container, defaultValues) {
    const nameInput = $('<input class="form-control" name="file-creator3-name">');
    if (options && options.readonly) {
      nameInput.attr('readonly', true);
    }
    if (defaultValues) {
      nameInput.val(defaultValues.name).change();
    }
    const tr = $('<tr>')
      .append($('<td>').append(nameInput).css('width', '200px'))
    if (!options || !options.readonly) {
      tr.append('<td><span class="file-creator-remove"><i class="fa fa-times fa-2x remove-or-reject"></i></span></td>');
    }
    const tbody = container.find('tbody');
    tbody.append(tr);
    nameInput.typeahead(
      {
        hint: false,
        highlight: true,
        minLength: 0
      },
      {
        display: function (data) {
          return data.kenkyusha_no;
        },
        templates: {
          suggestion: function (data) {
            return '<div style="background-color: white;"><span>' + $osf.htmlEscape(data.kenkyusha_shimei) + '</span> ' +
              '<span><small class="m-l-md text-muted">' +
              $osf.htmlEscape(data.kenkyusha_no) + ' - ' +
              $osf.htmlEscape(data.kenkyukikan_mei) + ' - ' +
              $osf.htmlEscape(data.kadai_mei) + ' (' + data.nendo + ')'
              + '</small></span></div>';
          }
        },
        source: substringMatcher(erad.candidates),
      }
    );
    nameInput.bind('typeahead:selected', function (event, data) {
      if (!data.kenkyusha_no) {
        return;
      }
      const names = data.kenkyusha_shimei.split('|');
      const jaNames = names.slice(0, Math.floor(names.length / 2))
      const enNames = names.slice(Math.floor(names.length / 2))
      nameInput.val(jaNames.join('')).change();
      noteInput.val(enNames.reverse().join(' ')).change();
    });
    tbody.find('.twitter-typeahead').css('width', '100%');
    emptyLine.hide();
  }

  return {
    create: function (addToContainer, onChange) {
      const thead = $('<thead>')
        .append($('<tr>')
          // .append($('<th>' + _('Grid Name') + '</th>'))
          .append($('<th></th>'))
        );
      const tbody = $('<tbody>');
      const container = $('<div></div>')
        .addClass('file-creators-container')
        .append($('<table class="table responsive-table responsive-table-xxs">')
          //.append(thead)
          .append(tbody)
        );
      tbody.append(emptyLine);
      if (!options || !options.readonly) {
        const addButton = $('<a class="btn btn-success btn-sm">')
          .append($('<i class="fa fa-plus"></i>'))
          .append($('<span></span>').text(_('Add')));
        container.append(addButton);
        addButton.on('click', function (e) {
          e.preventDefault();
          addResearcher(container);
        });
        tbody.on('click', '.file-creator-remove', function (e) {
          e.preventDefault();
          $(this).closest('tr').remove();
          if (container.find('tbody tr').length === 0) {
            emptyLine.show();
          }
          if (onChange) {
            onChange(e, options);
          }
        });
      }
      tbody.on('change', 'input', function (e) {
        const value = e.target.value
        if (value && e.target.getAttribute('name').startsWith('file-creator-name')) {
          const normalized = normalize(value);
          if (value !== normalized) {
            e.target.value = normalized;
          }
        }
        if (onChange) {
          onChange(e, options);
        }
      });
      addToContainer(container);
      return container;
    },
    getValue: function (container) {
      const researchers = container.find('tbody tr').map(function () {
        return {
          'name': $(this).find('[name=file-creator2-name]').val()
        };
      }).toArray().filter(function (researcher) {
        return Object.values(researcher).some(function (v) { return v && v.trim().length > 0; });
      });
      if (researchers.length === 0) {
        return '';
      }
      return JSON.stringify(researchers);
    },
    setValue: function (container, value) {
      const researchers = value ? JSON.parse(value) : [];
      researchers.forEach(function (researcher) {
        addResearcher(container, researcher);
      });
    },
    reset: function (container) {
      container.find('tbody').empty();
    },
    disable: function (container, disabled) {
      const btn = container.find('.btn');
      if (disabled) {
        btn.addClass('disabled');
      } else {
        btn.removeClass('disabled');
      }
    },
  };
}

//未病データベース構築_プロトタイプ （計測装置名、手順）
function createFileCreatorsFieldElement4(erad, options, question) {
  //20230612 chg KWT -->
  const value = _('No members');
  var _no_members = value;

  if (rdmGettext.getBrowserLang() === 'ja') {
    const index = value.indexOf("が");
    _no_members = question.nav + value.substring(index);
  }
  //20230612 chg KWT <--

  const emptyLine = $('<td></td>')
    .attr('colspan', '2')
    .css('text-align', 'center')
    .css('padding', '1em')
    // .text(_('No members'))
    .text(_no_members) //20230608 chg KWT
    .show();

  const addResearcher = function (container, defaultValues) {
    const nameInput = $('<input class="form-control" name="file-creator4-name">');
    const noteInput = $('<textarea class="form-control" name="file-creator4-note">');
    if (options && options.readonly) {
      nameInput.attr('readonly', true);
      noteInput.attr('readonly', true);
    }
    if (defaultValues) {
      nameInput.val(defaultValues.name).change();
      noteInput.val(defaultValues.note).change();
    }
    const tr = $('<tr>')
      .append($('<td>').append(nameInput).css('width', '200px'))
      .append($('<td>').append(noteInput));
    if (!options || !options.readonly) {
      tr.append('<td><span class="file-creator-remove"><i class="fa fa-times fa-2x remove-or-reject"></i></span></td>');
    }
    const tbody = container.find('tbody');
    tbody.append(tr);
    nameInput.typeahead(
      {
        hint: false,
        highlight: true,
        minLength: 0
      },
      {
        display: function (data) {
          return data.kenkyusha_no;
        },
        templates: {
          suggestion: function (data) {
            return '<div style="background-color: white;"><span>' + $osf.htmlEscape(data.kenkyusha_shimei) + '</span> ' +
              '<span><small class="m-l-md text-muted">' +
              $osf.htmlEscape(data.kenkyusha_no) + ' - ' +
              $osf.htmlEscape(data.kenkyukikan_mei) + ' - ' +
              $osf.htmlEscape(data.kadai_mei) + ' (' + data.nendo + ')'
              + '</small></span></div>';
          }
        },
        source: substringMatcher(erad.candidates),
      }
    );
    nameInput.bind('typeahead:selected', function (event, data) {
      if (!data.kenkyusha_no) {
        return;
      }
      const names = data.kenkyusha_shimei.split('|');
      const jaNames = names.slice(0, Math.floor(names.length / 2))
      const enNames = names.slice(Math.floor(names.length / 2))
      nameInput.val(jaNames.join('')).change();
      noteInput.val(enNames.reverse().join(' ')).change();
    });
    tbody.find('.twitter-typeahead').css('width', '100%');
    emptyLine.hide();
  }

  return {
    create: function (addToContainer, onChange) {
      const thead = $('<thead>')
        .append($('<tr>')
          // .append($('<th>' + _('Grid Name') + '</th>'))
          // .append($('<th>' + _('Grid Note') + '</th>'))
          .append($('<th></th>'))
        );
      const tbody = $('<tbody>');
      const container = $('<div></div>')
        .addClass('file-creators-container')
        .append($('<table class="table responsive-table responsive-table-xxs">')
          //.append(thead)
          .append(tbody)
        );
      tbody.append(emptyLine);
      if (!options || !options.readonly) {
        const addButton = $('<a class="btn btn-success btn-sm">')
          .append($('<i class="fa fa-plus"></i>'))
          .append($('<span></span>').text(_('Add')));
        container.append(addButton);
        addButton.on('click', function (e) {
          e.preventDefault();
          addResearcher(container);
        });
        tbody.on('click', '.file-creator-remove', function (e) {
          e.preventDefault();
          $(this).closest('tr').remove();
          if (container.find('tbody tr').length === 0) {
            emptyLine.show();
          }
          if (onChange) {
            onChange(e, options);
          }
        });
      }
      tbody.on('change', 'input', function (e) {
        const value = e.target.value
        if (value && e.target.getAttribute('name').startsWith('file-creator-name')) {
          const normalized = normalize(value);
          if (value !== normalized) {
            e.target.value = normalized;
          }
        }
        if (onChange) {
          onChange(e, options);
        }
      });
      addToContainer(container);
      return container;
    },
    getValue: function (container) {
      const researchers = container.find('tbody tr').map(function () {
        return {
          'name': $(this).find('[name=file-creator2-name]').val(),
          'note': $(this).find('[name=file-creator2-note]').val()
        };
      }).toArray().filter(function (researcher) {
        return Object.values(researcher).some(function (v) { return v && v.trim().length > 0; });
      });
      if (researchers.length === 0) {
        return '';
      }
      return JSON.stringify(researchers);
    },
    setValue: function (container, value) {
      const researchers = value ? JSON.parse(value) : [];
      researchers.forEach(function (researcher) {
        addResearcher(container, researcher);
      });
    },
    reset: function (container) {
      container.find('tbody').empty();
    },
    disable: function (container, disabled) {
      const btn = container.find('.btn');
      if (disabled) {
        btn.addClass('disabled');
      } else {
        btn.removeClass('disabled');
      }
    },
  };
}

//未病データベース構築_プロトタイプ （行の説明、位置の説明）
//function createFileCreatorsFieldElement5(erad, options) {
function createFileCreatorsFieldElement5(erad, options, question) { //20230608 add parameter KWT
  // 20230612 chg KWT -->
  const value = _('No members');
  var _no_members = value;
  if (rdmGettext.getBrowserLang() === 'ja') {
    const index = value.indexOf('が');
    _no_members = question.nav + value.substring(index);
  }
  // 20230612 chg KWT <--

  const emptyLine = $('<td></td>')
    .attr('colspan', '3')
    .css('text-align', 'center')
    .css('padding', '1em')
    // .text(_('No members'))
    .text(_no_members) //20230608 chg KWT
    .show();
  //const tbody = container.find('tbody');
  const addResearcher = function (container, defaultValues) {
    // 20230622 chg KWT -->
    const tbody = container.find('tbody');
    const tr = $('<tr>');
    (question.table_headers || []).forEach(function (content) {
      const contentInputs = $('<input class="form-control" type="' + content.type + '" name="file-creator2-"' + content.text + '>');
      if (content.type == 'checkbox') {
        contentInputs.css('inline-size', '1.5rem').css('margin', '0 auto'); //20230621 add KWT
      }

      if (options && options.readonly) {
        contentInputs.attr('readonly', true);
      }
      if (defaultValues) {
        contentInputs.val(defaultValues.number).change();
      }

      tr.append($('<td>').append(contentInputs));

      tbody.append(tr);
      if (content.text === '0') {
        contentInputs.typeahead(
          {
            hint: false,
            highlight: true,
            minLength: 0
          },
          {
            display: function (data) {
              return data.kenkyusha_no;
            },
            templates: {
              suggestion: function (data) {
                return '<div style="background-color: white;"><span>' + $osf.htmlEscape(data.kenkyusha_shimei) + '</span> ' +
                  '<span><small class="m-l-md text-muted">' +
                  $osf.htmlEscape(data.kenkyusha_no) + ' - ' +
                  $osf.htmlEscape(data.kenkyukikan_mei) + ' - ' +
                  $osf.htmlEscape(data.kadai_mei) + ' (' + data.nendo + ')'
                  + '</small></span></div>';
              }
            },
            source: substringMatcher(erad.candidates),
          }
        );
        contentInputs.bind('typeahead:selected', function (event, data) {
          if (!data.kenkyusha_no) {
            return;
          }
          const names = data.kenkyusha_shimei.split('|');
          const jaNames = names.slice(0, Math.floor(names.length / 2))
          const enNames = names.slice(Math.floor(names.length / 2))
          nameInput.val(jaNames.join('')).change();
          noteInput.val(enNames.reverse().join(' ')).change();
        });
      }
    });
    if (!options || !options.readonly) {
      tr.append('<td><span class="file-creator-remove"><i class="fa fa-times fa-2x remove-or-reject"></i></span></td>');
    }
    tbody.append(tr);
    // 20230622 chg KWT <--

    tbody.find('.twitter-typeahead').css('width', '100%');
    emptyLine.hide();
  }

  return {
    create: function (addToContainer, onChange) {
      // const thead = $('<thead>')
      //   .append($('<tr>')
      //     .append($('<th>' + _('Grid Pos') + '</th>'))
      //     .append($('<th>' + _('Grid Name') + '</th>'))
      //     .append($('<th>' + _('Grid Note') + '</th>'))
      //     .append($('<th></th>'))
      //   );
      //20230614 chg KWT -->
      const thead = $('<thead></thead>');
      const tr = $('<tr></tr>');
      (question.table_headers || []).forEach(function (header) {
        const th = $('<th>').text(getLocalizedText(header.tooltip));
        if (header.text === '0') {
          th.css('vertical-align', 'top');
        } else {
          th.append($('<input>').css('display', 'block'));
        }
        tr.append(th);
      });
      thead.append(tr);
      //20230614 chg KWT <--

      const tbody = $('<tbody>');
      const container = $('<div></div>')
        .addClass('file-creators-container')
        .append($('<table class="table responsive-table responsive-table-xxs">')
          .append(thead)
          .append(tbody)
        );
      tbody.append(emptyLine);
      if (!options || !options.readonly) {
        const addButton = $('<a class="btn btn-success btn-sm">')
          .append($('<i class="fa fa-plus"></i>'))
          .append($('<span></span>').text(_('Add')));
        container.append(addButton);
        addButton.on('click', function (e) {
          e.preventDefault();
          addResearcher(container);
        });
        tbody.on('click', '.file-creator-remove', function (e) {
          e.preventDefault();
          $(this).closest('tr').remove();
          if (container.find('tbody tr').length === 0) {
            emptyLine.show();
          }
          if (onChange) {
            onChange(e, options);
          }
        });
      }
      tbody.on('change', 'input', function (e) {
        const value = e.target.value
        if (value && e.target.getAttribute('name').startsWith('file-creator-name')) {
          const normalized = normalize(value);
          if (value !== normalized) {
            e.target.value = normalized;
          }
        }
        if (onChange) {
          onChange(e, options);
        }
      });
      addToContainer(container);
      return container;
    },
    getValue: function (container) {
      const researchers = container.find('tbody tr').map(function () {
        return {
          'number': $(this).find('[name=file-creator2-pos]').val(),
          'name': $(this).find('[name=file-creator2-name]').val(),
          'note': $(this).find('[name=file-creator2-note]').val()
        };
      }).toArray().filter(function (researcher) {
        return Object.values(researcher).some(function (v) { return v && v.trim().length > 0; });
      });
      if (researchers.length === 0) {
        return '';
      }
      return JSON.stringify(researchers);
    },
    setValue: function (container, value) {
      const researchers = value ? JSON.parse(value) : [];
      researchers.forEach(function (researcher) {
        addResearcher(container, researcher);
      });
    },
    reset: function (container) {
      container.find('tbody').empty();
    },
    disable: function (container, disabled) {
      const btn = container.find('.btn');
      if (disabled) {
        btn.addClass('disabled');
      } else {
        btn.removeClass('disabled');
      }
    },
  };
}

//未病データベース構築_プロトタイプ （追加項目）
function createFileCreatorsFieldElement6(erad, options, question) {
  // 20230612 chg KWT -->
  const value = _('No members');
  var _no_members = value;
  if (rdmGettext.getBrowserLang() === 'ja') {
    const index = value.indexOf('が');
    _no_members = question.nav + value.substring(index);
  }
  // 20230612 chg KWT <--

  const emptyLine = $('<td></td>')
    .attr('colspan', '1')
    .css('text-align', 'center')
    .css('padding', '1em')
    // .text(_('No members'))
    .text(_no_members) //20230608 chg KWT
    .show();

  const addResearcher = function (container, defaultValues) {
    const nameInput = $('<input class="form-control" name="file-creator3-name">');
    if (options && options.readonly) {
      nameInput.attr('readonly', true);
    }
    if (defaultValues) {
      nameInput.val(defaultValues.name).change();
    }
    const tr = $('<tr>')
      .append($('<td>').append(nameInput))
    if (!options || !options.readonly) {
      tr.append('<td><span class="file-creator-remove"><i class="fa fa-times fa-2x remove-or-reject"></i></span></td>');
    }
    const tbody = container.find('tbody');
    tbody.append(tr);
    nameInput.typeahead(
      {
        hint: false,
        highlight: true,
        minLength: 0
      },
      {
        display: function (data) {
          return data.kenkyusha_no;
        },
        templates: {
          suggestion: function (data) {
            return '<div style="background-color: white;"><span>' + $osf.htmlEscape(data.kenkyusha_shimei) + '</span> ' +
              '<span><small class="m-l-md text-muted">' +
              $osf.htmlEscape(data.kenkyusha_no) + ' - ' +
              $osf.htmlEscape(data.kenkyukikan_mei) + ' - ' +
              $osf.htmlEscape(data.kadai_mei) + ' (' + data.nendo + ')'
              + '</small></span></div>';
          }
        },
        source: substringMatcher(erad.candidates),
      }
    );
    nameInput.bind('typeahead:selected', function (event, data) {
      if (!data.kenkyusha_no) {
        return;
      }
      const names = data.kenkyusha_shimei.split('|');
      const jaNames = names.slice(0, Math.floor(names.length / 2))
      const enNames = names.slice(Math.floor(names.length / 2))
      nameInput.val(jaNames.join('')).change();
      noteInput.val(enNames.reverse().join(' ')).change();
    });
    tbody.find('.twitter-typeahead').css('width', '100%');
    emptyLine.hide();
  }

  return {
    create: function (addToContainer, onChange) {
      const thead = $('<thead>')
        .append($('<tr>')
          // .append($('<th>' + _('Grid Name') + '</th>'))
          .append($('<th></th>'))
        );
      const tbody = $('<tbody>');
      const container = $('<div></div>')
        .addClass('file-creators-container')
        .append($('<table class="table responsive-table responsive-table-xxs">')
          //.append(thead)
          .append(tbody)
        );
      tbody.append(emptyLine);
      if (!options || !options.readonly) {
        const addButton = $('<a class="btn btn-success btn-sm">')
          .append($('<i class="fa fa-plus"></i>'))
          .append($('<span></span>').text(_('Add')));
        container.append(addButton);
        addButton.on('click', function (e) {
          e.preventDefault();
          addResearcher(container);
        });
        tbody.on('click', '.file-creator-remove', function (e) {
          e.preventDefault();
          $(this).closest('tr').remove();
          if (container.find('tbody tr').length === 0) {
            emptyLine.show();
          }
          if (onChange) {
            onChange(e, options);
          }
        });
      }
      tbody.on('change', 'input', function (e) {
        const value = e.target.value
        if (value && e.target.getAttribute('name').startsWith('file-creator-name')) {
          const normalized = normalize(value);
          if (value !== normalized) {
            e.target.value = normalized;
          }
        }
        if (onChange) {
          onChange(e, options);
        }
      });
      addToContainer(container);
      return container;
    },
    getValue: function (container) {
      const researchers = container.find('tbody tr').map(function () {
        return {
          'name': $(this).find('[name=file-creator2-name]').val()
        };
      }).toArray().filter(function (researcher) {
        return Object.values(researcher).some(function (v) { return v && v.trim().length > 0; });
      });
      if (researchers.length === 0) {
        return '';
      }
      return JSON.stringify(researchers);
    },
    setValue: function (container, value) {
      const researchers = value ? JSON.parse(value) : [];
      researchers.forEach(function (researcher) {
        addResearcher(container, researcher);
      });
    },
    reset: function (container) {
      container.find('tbody').empty();
    },
    disable: function (container, disabled) {
      const btn = container.find('.btn');
      if (disabled) {
        btn.addClass('disabled');
      } else {
        btn.removeClass('disabled');
      }
    },
  };
}

//未病データベース構築_プロトタイプ （器官）
function createFileCreatorsFieldElement7(erad, options, question, value) {
  // 202306012 chg KWT -->
  const value1 = _('No members');
  var _no_members = value;
  if (rdmGettext.getBrowserLang() === 'ja') {
    const index = value1.indexOf('が');
    _no_members = '器官の種別' + value1.substring(index);
  }
  // 20230612 chg KWT <--

  const emptyLine = $('<td></td>')
    .attr('colspan', '3')
    .css('text-align', 'center')
    .css('padding', '1em')
    // .text(_('No members'))
    .text(_no_members) //20230608 chg KWT
    .show();


  var frmElement = createFormElement(function () {
    return createChooser(question, options);
  }, question, options)

  self.formField = frmElement.formField;
  self.label = question.qid;
  self.title = question.title;
  self.help = question.help;
  self.defaultValue = value;
  self.clearField = null;

  const addResearcher = function (container, defaultValues) {
    // 20230622 chg KWT -->
    const tbody = container.find('tbody');
    const tr = $('<tr>');
    (question.table_headers || []).forEach(function (content) {
      const contentInputs = $('<input class="form-control" type="' + content.type + '" name="file-creator7-"' + content.text + '>');
      if (content.type == 'checkbox') {
        contentInputs.css('inline-size', '1.5rem').css('margin', '0 auto'); //20230621 add KWT
      }
      if (options && options.readonly) {
        contentInputs.attr('readonly', true);
      }
      if (defaultValues) {
        contentInputs.val(defaultValues.number).change();
      }

      tr.append($('<td>').append(contentInputs));
      tbody.append(tr);
      if (content.text === '0') {
        contentInputs.typeahead(
          {
            hint: false,
            highlight: true,
            minLength: 0
          },
          {
            display: function (data) {
              return data.kenkyusha_no;
            },
            templates: {
              suggestion: function (data) {
                return '<div style="background-color: white;"><span>' + $osf.htmlEscape(data.kenkyusha_shimei) + '</span> ' +
                  '<span><small class="m-l-md text-muted">' +
                  $osf.htmlEscape(data.kenkyusha_no) + ' - ' +
                  $osf.htmlEscape(data.kenkyukikan_mei) + ' - ' +
                  $osf.htmlEscape(data.kadai_mei) + ' (' + data.nendo + ')'
                  + '</small></span></div>';
              }
            },
            source: substringMatcher(erad.candidates),
          }
        );
        contentInputs.bind('typeahead:selected', function (event, data) {
          if (!data.kenkyusha_no) {
            return;
          }
          const names = data.kenkyusha_shimei.split('|');
          const jaNames = names.slice(0, Math.floor(names.length / 2))
          const enNames = names.slice(Math.floor(names.length / 2))
          nameInput.val(jaNames.join('')).change();
          noteInput.val(enNames.reverse().join(' ')).change();
        });
      }
    });
    if (!options || !options.readonly) {
      tr.append('<td><span class="file-creator-remove"><i class="fa fa-times fa-2x remove-or-reject"></i></span></td>');
    }
    tbody.append(tr);

    tbody.find('.twitter-typeahead').css('width', '100%');
    emptyLine.hide();
  }

  return {
    create: function (addToContainer, onChange) {
      // const thead = $('<thead>')
      //   .append($('<tr>')
      //     .append($('<th>' + _('Grid OrganType') + '</th>'))
      //     .append($('<th>' + _('Grid OrganName') + '</th>'))
      //     .append($('<th></th>'))
      //   );

      //20230614 chg KWT -->
      const thead = $('<thead></thead>');
      const tr = $('<tr></tr>');
      (question.table_headers || []).forEach(function (header) {
        const th = $('<th>').text(getLocalizedText(header.tooltip));
        th.append($('<input>').css('display', 'block'));
        tr.append(th);
      });

      thead.append(tr);
      //20230614 chg KWT <--

      const tbody = $('<tbody>');
      const container = $('<div></div>')
        .addClass('file-creators-container')
        .append($('<table class="table responsive-table responsive-table-xxs">')
          .append(thead)
          .append(tbody)
        );
      tbody.append(emptyLine);
      if (!options || !options.readonly) {
        const addButton = $('<a class="btn btn-success btn-sm">')
          .append($('<i class="fa fa-plus"></i>'))
          .append($('<span></span>').text(_('Add')));
        container.append(addButton);
        addButton.on('click', function (e) {
          e.preventDefault();
          addResearcher(container);
        });
        tbody.on('click', '.file-creator-remove', function (e) {
          e.preventDefault();
          $(this).closest('tr').remove();
          if (container.find('tbody tr').length === 0) {
            emptyLine.show();
          }
          if (onChange) {
            onChange(e, options);
          }
        });
      }
      tbody.on('change', 'input', function (e) {
        //const value = e.target.value
        if (value && e.target.getAttribute('name').startsWith('file-creator7-name')) {
          const normalized = normalize(value);
          if (value !== normalized) {
            e.target.value = normalized;
          }
        }
        if (onChange) {
          onChange(e, options);
        }
      });
      addToContainer(container);
      return container;
    },
    getValue: function (container) {
      const researchers = container.find('tbody tr').map(function () {
        return {
          'type': $(this).find('[name=file-creator7-type]').val(),
          'name': $(this).find('[name=file-creator7-name]').val()
        };
      }).toArray().filter(function (researcher) {
        return Object.values(researcher).some(function (v) { return v && v.trim().length > 0; });
      });
      if (researchers.length === 0) {
        return '';
      }
      return JSON.stringify(researchers);
    },
    setValue: function (container, value) {
      const researchers = value ? JSON.parse(value) : [];
      researchers.forEach(function (researcher) {
        addResearcher(container, researcher);
      });
    },
    reset: function (container) {
      container.find('tbody').empty();
    },
    disable: function (container, disabled) {
      const btn = container.find('.btn');
      if (disabled) {
        btn.addClass('disabled');
      } else {
        btn.removeClass('disabled');
      }
    },
  };
}

function createERadResearcherNumberFieldElement(erad, options) {
  return {
    create: function (addToContainer, onChange) {
      const input = $('<input></input>').addClass('erad-researcher-number');
      if (options && options.readonly) {
        input.attr('readonly', true);
      }
      const container = $('<div></div>')
        .addClass('erad-researcher-number-container')
        .append(input.addClass('form-control'));
      addToContainer(container);
      input.typeahead(
        {
          hint: false,
          highlight: true,
          minLength: 0
        },
        {
          display: function (data) {
            return data.kenkyusha_no;
          },
          templates: {
            suggestion: function (data) {
              return '<div style="background-color: white;"><span>' + $osf.htmlEscape(data.kenkyusha_shimei) + '</span> ' +
                '<span><small class="m-l-md text-muted">' +
                $osf.htmlEscape(data.kenkyusha_no) + ' - ' +
                $osf.htmlEscape(data.kenkyukikan_mei) + ' - ' +
                $osf.htmlEscape(data.kadai_mei) + ' (' + data.nendo + ')'
                + '</small></span></div>';
            }
          },
          source: substringMatcher(erad.candidates),
        }
      );
      input.bind('typeahead:selected', function (event, data) {
        if (data.kenkyusha_shimei) {
          const names = data.kenkyusha_shimei.split('|');
          const jaNames = names.slice(0, Math.floor(names.length / 2))
          const enNames = names.slice(Math.floor(names.length / 2))
          $('.e-rad-researcher-name-ja').val(jaNames.join('')).change();
          $('.e-rad-researcher-name-en').val(enNames.reverse().join(' ')).change();
        }
        if (data.kenkyukikan_mei) {
          const names = data.kenkyukikan_mei.split('|');
          const jaNames = names.slice(0, Math.floor(names.length / 2))
          const enNames = names.slice(Math.floor(names.length / 2))
          $('.file-institution-ja').typeahead('val', jaNames.join('')).change();
          $('.file-institution-en').typeahead('val', enNames.join(' ')).change();
        }
      });
      container.find('.twitter-typeahead').css('width', '100%');
      if (onChange) {
        input.change(function (event) {
          onChange(event, options);
        });
      }
      return container;
    },
    getValue: function (container) {
      return container.find('input').val();
    },
    setValue: function (container, value) {
      container.find('input').val(value);
    },
    reset: function (container) {
      container.find('input').val(null);
    },
    disable: function (container, disabled) {
      container.find('input').attr('disabled', disabled);
    },
  };
}

function createFileInstitutionFieldElement(options, format) {
  return {
    create: function (addToContainer, onChange) {
      const input = $('<input></input>').addClass(format);
      if (options && options.readonly) {
        input.attr('readonly', true);
      }
      const container = $('<div></div>')
        .addClass('erad-file-institution')
        .append(input.addClass('form-control'));
      addToContainer(container);
      function getJaName(data) {
        if (data && data.labels && data.labels.length) {
          const ja = data.labels.filter(function (label) {
            return label.iso639 === 'ja';
          });
          if (ja.length) {
            return ja[0].label;
          }
        }
        return null;
      }
      input.typeahead(
        {
          hint: false,
          highlight: true,
          minLength: 0
        },
        {
          display: function (data) {
            const ja = getJaName(data);
            if (format.endsWith('ja') && ja) {
              return ja;
            }
            return data.name;
          },
          templates: {
            suggestion: function (data) {
              const ja = getJaName(data);
              return '<div style="background-color: white;"><span>' + $osf.htmlEscape(data.name) + '</span> ' +
                '<span><small class="m-l-md text-muted">' +
                (ja ? $osf.htmlEscape(ja) : '')
                + '</small></span></div>';
            }
          },
          source: $osf.throttle(function (q, cb) {
            $.ajax({
              method: 'GET',
              url: 'https://api.ror.org/organizations',
              data: {
                query: q
              },
              cache: true,
            }).then(function (result) {
              cb(result && result.items || []);
            }).catch(function (error) {
              console.error(error);
              cb([]);
            });
          }, 500, { leading: false }),
        }
      );
      input.bind('typeahead:selected', function (event, data) {
        const en = data.name;
        const ja = getJaName(data) || en;
        const id = data.id;
        $('.file-institution-en').typeahead('val', en).change();
        $('.file-institution-ja').typeahead('val', ja).change();
        $('.file-institution-identifier').val(id).change();
      });
      container.find('.twitter-typeahead').css('width', '100%');
      if (onChange) {
        input.change(function (event) {
          onChange(event, options);
        });
      }
      return container;
    },
    getValue: function (container) {
      return container.find('input').val();
    },
    setValue: function (container, value) {
      container.find('input').val(value);
    },
    reset: function (container) {
      container.find('input').val(null);
    },
    disable: function (container, disabled) {
      container.find('input').attr('disabled', disabled);
    },
  };
}

function substringMatcher(candidates) {
  return function findMatches(q, cb) {
    const substrRegex = new RegExp(q, 'i');
    const matches = (candidates || []).filter(function (c) {
      if (!c.kenkyusha_no) {
        return false;
      }
      return substrRegex.test(c.kenkyusha_no);
    });
    cb(matches);
  };
}

module.exports = {
  createField: createField,
  validateField: validateField
};