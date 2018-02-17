'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; /* eslint-disable no-param-reassign */


var _lodash = require('lodash');

var VISITED = Symbol('visited');
var slashRegex = /\//g;
var dereference = function dereference(schema, root, cache) {
	if ((typeof schema === 'undefined' ? 'undefined' : _typeof(schema)) !== 'object') {
		return schema;
	}
	if (schema[VISITED]) {
		return schema;
	}

	var ref = schema.$ref;
	if (ref) {
		if (cache[ref]) {
			return cache[ref];
		}
		var path = ref.slice(2).replace(slashRegex, '.');
		cache[ref] = (0, _lodash.get)(root, path);
		return dereference(cache[ref], root, cache);
	}

	Object.keys(schema).forEach(function (key) {
		schema[key] = dereference(schema[key], root, cache);
	});
	schema[VISITED] = true;
	return schema;
};

/**
 * Resolves local JSON pointers in schema where all pointers start with "#/"
 * @param schema
 */
var dereferenceLocalAbsoluteJsonPointers = function dereferenceLocalAbsoluteJsonPointers(schema) {
	return dereference(schema, schema, {});
};

exports.default = dereferenceLocalAbsoluteJsonPointers;