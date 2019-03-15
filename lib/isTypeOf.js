'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _lodash = require('lodash');

var calculateFieldsEquality = function calculateFieldsEquality(value, fieldNames) {
	return fieldNames.length - (0, _lodash.difference)(fieldNames, Object.keys(value)).length;
};

/**
 * Value and type shallow comparison
 * @param  {Object}		value
 * @param  {Object}		type
 * @return {boolean}
 */
var isTypeOf = function isTypeOf(value, type) {
	var fields = type.getFields();
	var fieldNames = Object.keys(fields);
	var requiredFieldNames = fieldNames.filter(function (fieldName) {
		return fields[fieldName].type.constructor.name === 'GraphQLNonNull';
	});
	return requiredFieldNames.length ? calculateFieldsEquality(value, requiredFieldNames) === requiredFieldNames.length : calculateFieldsEquality(value, fieldNames) > 0;
};

exports.default = isTypeOf;