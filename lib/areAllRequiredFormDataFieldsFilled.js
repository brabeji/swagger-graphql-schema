'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _lodash = require('lodash');

var areAllRequiredFormDataFieldsFilled = function areAllRequiredFormDataFieldsFilled(parameters, args) {
	var requiredFormDataFields = (0, _lodash.filter)(parameters, { in: 'formData', required: true });
	return (0, _lodash.every)(requiredFormDataFields, function (field) {
		return !!args[field.name];
	});
};

exports.default = areAllRequiredFormDataFieldsFilled;