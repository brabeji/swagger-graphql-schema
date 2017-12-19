'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _lodash = require('lodash');

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

var findMutationsDescriptions = function findMutationsDescriptions(paths) {
	return (0, _lodash.reduce)(paths, function (acc, pathMethods, path) {
		return Object.assign({}, acc, (0, _lodash.reduce)(pathMethods, function (acc, operation, method) {
			var operationId = (0, _lodash.get)(operation, 'operationId');
			var consumes = (0, _lodash.get)(operation, 'consumes', []);
			var produces = (0, _lodash.get)(operation, 'produces', []);
			var schema = (0, _lodash.get)(operation, ['responses', '200', 'schema'], (0, _lodash.get)(operation, ['responses', '201', 'schema'], (0, _lodash.get)(operation, ['responses', '204', 'schema'])));
			var lcMethod = method.toLowerCase();
			if (operationId && schema && (0, _lodash.includes)(['put', 'post', 'patch', 'delete'], lcMethod)) {
				var parameters = (0, _lodash.get)(operation, 'parameters', []).concat((0, _lodash.get)(pathMethods, 'parameters', []));
				var inputSchema = (0, _lodash.get)((0, _lodash.find)(parameters, { in: 'body' }), 'schema');
				// console.log('inputSchema', inputSchema);
				return Object.assign({}, acc, _defineProperty({}, operationId, {
					path: path,
					inputSchema: inputSchema,
					schema: schema.title ? schema : Object.assign({}, schema, { title: operationId }),
					// schema,
					parameters: parameters,
					operationMethod: lcMethod,
					consumes: consumes,
					produces: produces
				}));
			}
			return acc;
		}, {}));
	}, {});
};

exports.default = findMutationsDescriptions;