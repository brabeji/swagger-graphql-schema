'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _uriTemplates = require('uri-templates');

var _uriTemplates2 = _interopRequireDefault(_uriTemplates);

var _areAllRequiredFormDataFieldsFilled = require('./areAllRequiredFormDataFieldsFilled');

var _areAllRequiredFormDataFieldsFilled2 = _interopRequireDefault(_areAllRequiredFormDataFieldsFilled);

var _ApiError = require('./ApiError');

var _ApiError2 = _interopRequireDefault(_ApiError);

var _lodash = require('lodash');

var _axios = require('axios');

var _axios2 = _interopRequireDefault(_axios);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const createHttpResolver = ({ apiDefinition, propertyName, operation: operationDescriptor }) => {
	return (root, args, context, info) => {
		// yay, make request!
		const fieldValue = (0, _lodash.get)(root, propertyName);
		if (fieldValue) {
			return fieldValue;
		}
		const scheme = (0, _lodash.first)((0, _lodash.get)(apiDefinition, 'schemes', ['http']));
		const resourceUriTemplate = `${scheme}://${(0, _lodash.get)(apiDefinition, 'host')}${(0, _lodash.get)(apiDefinition, 'basePath')}${(0, _lodash.get)(operationDescriptor, 'path')}`;
		// TODO translate params
		const argsValues = Object.assign({ root }, args);
		const parameters = (0, _lodash.get)(operationDescriptor, 'parameters');
		const parametersValues = parameters.reduce((acc, { name: paramName, ['x-argPath']: argPath, ['in']: paramIn }) => {
			const value = (0, _lodash.get)(argsValues, argPath || paramName);
			if (value && paramIn === 'query') {
				return Object.assign({}, acc, {
					queryParams: Object.assign({}, acc.queryParams, {
						[paramName]: value
					})
				});
			} else if (value && paramIn === 'path') {
				return Object.assign({}, acc, {
					pathParams: Object.assign({}, acc.pathParams, {
						[paramName]: value
					})
				});
			}
			return acc;
		}, {
			pathParams: {},
			queryParams: {}
		});
		const template = new _uriTemplates2.default(`${resourceUriTemplate}{?queryParams*}`);
		const resourceUri = template.fill(Object.assign({}, parametersValues.pathParams, {
			queryParams: parametersValues.queryParams
		}));
		const method = (0, _lodash.get)(operationDescriptor, 'operationMethod', 'get');
		let callArguments = [resourceUri, context.http];

		// if endpoint consumes multipart/form-data and all required form-data
		// fields are filled, build multipart/form-data request instead of
		// classic application/json request
		if ((0, _lodash.includes)((0, _lodash.get)(operationDescriptor, 'consumes'), 'multipart/form-data') && (0, _areAllRequiredFormDataFieldsFilled2.default)(parameters, args)) {
			const formData = new FormData();

			(0, _lodash.each)((0, _lodash.filter)(parameters, { in: 'formData' }), field => {
				let fileProxy; // es6 wtf duplicate declaration
				let file;
				if (!!field.schema) {
					// stringify object types
					formData.append(field.name, JSON.stringify(args[field.name]));
				} else if (field.type === 'file') {
					// append file type
					fileProxy = args[field.name];
					file = (0, _lodash.get)(context, ['files', fileProxy.path]);

					if (file) {
						formData.append(field.name, file);
					}
				} else if (field.type === 'array') {
					// append array of files
					(0, _lodash.each)(args[field.name], fileProxy => {
						fileProxy = args[field.name];
						file = (0, _lodash.get)(context, ['files', fileProxy.path]);

						if (file) {
							formData.append(`${field.name}[]`, file);
						}
					});
				} else {
					// just append scalar types
					formData.append(field.name, args[field.name]);
				}
			});

			callArguments = [callArguments[0], formData, (0, _lodash.merge)( // extend by headers needed by multipart/form-data request
			callArguments[1], {
				'Content-Type': 'multipart/form-data'
			})];
		} else {
			// build classic application/json request
			const bodyParameter = (0, _lodash.find)(parameters, { ['in']: 'body' });
			if (bodyParameter) {
				callArguments = [callArguments[0], args[bodyParameter.name], callArguments[1]];
			}
		}

		return _axios2.default[method](...callArguments).then(response => {
			return response.data;
		}).catch(error => {
			if (process.env.NODE_ENV === 'development') {
				console.log(`Resolver error for GET "${resourceUri}"`);
			}

			throw new _ApiError2.default({
				code: error.response.status,
				data: error.response.data
			});
		});
	};
};

exports.default = createHttpResolver;