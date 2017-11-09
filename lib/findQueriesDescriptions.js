'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _lodash = require('lodash');

const findQueriesDescriptions = paths => {
	return (0, _lodash.reduce)(paths, (acc, pathMethods, path) => {
		return Object.assign({}, acc, (0, _lodash.reduce)(pathMethods, (acc, operation, method) => {
			const operationId = (0, _lodash.get)(operation, 'operationId');
			const consumes = (0, _lodash.get)(operation, 'consumes', []);
			const produces = (0, _lodash.get)(operation, 'produces', []);
			const schema = (0, _lodash.get)(operation, ['responses', '200', 'schema'], (0, _lodash.get)(operation, ['responses', '201', 'schema']));
			if (operationId && schema && method.toLowerCase() === 'get') {
				return Object.assign({}, acc, {
					[operationId]: {
						path,
						schema: schema.title ? schema : Object.assign({}, schema, { title: operationId }),
						// schema,
						parameters: (0, _lodash.get)(operation, 'parameters', []).concat((0, _lodash.get)(pathMethods, 'parameters', [])),
						consumes,
						produces
					}
				});
			}
			return acc;
		}, {}));
	}, {});
};

exports.default = findQueriesDescriptions;