'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _lodash = require('lodash');

var _constants = require('./constants');

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

var findQueriesDescriptions = function findQueriesDescriptions(paths) {
	return (0, _lodash.reduce)(paths, function (acc, pathMethods, path) {
		return Object.assign({}, acc, (0, _lodash.reduce)(pathMethods, function (acc, operation, method) {
			var operationId = (0, _lodash.get)(operation, 'operationId');
			var consumes = (0, _lodash.get)(operation, 'consumes', []);
			var produces = (0, _lodash.get)(operation, 'produces', []);
			var schema = (0, _lodash.get)(operation, ['responses', '200', 'schema'], (0, _lodash.get)(operation, ['responses', '201', 'schema']));
			if (operationId && schema && method.toLowerCase() === 'get') {
				return Object.assign({}, acc, _defineProperty({}, operationId, {
					path: path,
					schema: schema.title || schema[_constants.TYPE_NAME_VENDOR_PROPERTY_NAME] ? schema : Object.assign({}, schema, _defineProperty({}, _constants.TYPE_NAME_VENDOR_PROPERTY_NAME, operationId)),
					// schema,
					parameters: (0, _lodash.get)(operation, 'parameters', []).concat((0, _lodash.get)(pathMethods, 'parameters', [])),
					consumes: consumes,
					produces: produces
				}));
			}
			return acc;
		}, {}));
	}, {});
};

exports.default = findQueriesDescriptions;