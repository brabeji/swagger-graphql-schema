'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _lodash = require('lodash');

const findMutationsDescriptions = paths => {
	return (0, _lodash.reduce)(paths, (acc, pathMethods, path) => {
		return Object.assign({}, acc, (0, _lodash.reduce)(pathMethods, (acc, operation, method) => {
			const operationId = (0, _lodash.get)(operation, 'operationId');
			const schema = (0, _lodash.get)(operation, ['responses', '200', 'schema'], (0, _lodash.get)(operation, ['responses', '201', 'schema']));
			const lcMethod = method.toLowerCase();
			if (operationId && schema && (lcMethod === 'put' || lcMethod === 'post' || lcMethod === 'delete')) {
				const parameters = (0, _lodash.get)(operation, 'parameters', []).concat((0, _lodash.get)(pathMethods, 'parameters', []));
				const inputSchema = (0, _lodash.get)((0, _lodash.find)(parameters, { in: 'body' }), 'schema');
				// console.log('inputSchema', inputSchema);
				return Object.assign({}, acc, {
					[operationId]: {
						path,
						inputSchema,
						schema: schema.title ? schema : Object.assign({}, schema, { title: operationId }),
						// schema,
						parameters,
						operationMethod: lcMethod
					}
				});
			}
			return acc;
		}, {}));
	}, {});
};

exports.default = findMutationsDescriptions;