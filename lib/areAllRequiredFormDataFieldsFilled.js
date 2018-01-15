'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _lodash = require('lodash');

const areAllRequiredFormDataFieldsFilled = (parameters, args) => {
	const requiredFormDataFields = (0, _lodash.filter)(parameters, { in: 'formData', required: true });
	return (0, _lodash.every)(requiredFormDataFields, field => {
		return !!args[field.name];
	});
};

exports.default = areAllRequiredFormDataFieldsFilled;