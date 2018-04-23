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

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

var createHttpResolver = function createHttpResolver(_ref) {
	var apiDefinition = _ref.apiDefinition,
	    propertyName = _ref.propertyName,
	    operationDescriptor = _ref.operation;

	return function (root, args, context, info) {
		// yay, make request!
		var fieldValue = (0, _lodash.get)(root, propertyName);
		if (fieldValue) {
			return fieldValue;
		}
		var scheme = (0, _lodash.first)((0, _lodash.get)(apiDefinition, 'schemes', ['http']));
		var resourceUriTemplate = scheme + '://' + (0, _lodash.get)(apiDefinition, 'host') + (0, _lodash.get)(apiDefinition, 'basePath') + (0, _lodash.get)(operationDescriptor, 'path');
		// TODO translate params
		var argsValues = Object.assign({ root: root }, args);
		var parameters = (0, _lodash.get)(operationDescriptor, 'parameters');
		var parametersValues = parameters.reduce(function (acc, _ref2) {
			var paramName = _ref2.name,
			    argPath = _ref2['x-argPath'],
			    paramIn = _ref2['in'];

			var value = (0, _lodash.get)(argsValues, argPath, (0, _lodash.get)(argsValues, paramName));
			if (value && paramIn === 'query') {
				return Object.assign({}, acc, {
					queryParams: Object.assign({}, acc.queryParams, _defineProperty({}, paramName, value))
				});
			} else if (value && paramIn === 'path') {
				return Object.assign({}, acc, {
					pathParams: Object.assign({}, acc.pathParams, _defineProperty({}, paramName, value))
				});
			}
			return acc;
		}, {
			pathParams: {},
			queryParams: {}
		});
		var template = new _uriTemplates2.default(resourceUriTemplate + '{?queryParams*}');
		var resourceUri = template.fill(Object.assign({}, parametersValues.pathParams, {
			queryParams: parametersValues.queryParams
		}));
		var method = (0, _lodash.get)(operationDescriptor, 'operationMethod', 'get');

		var reqConfig = Object.assign({
			url: resourceUri
		}, context.http);

		// if endpoint consumes multipart/form-data and all required form-data
		// fields are filled, build multipart/form-data request instead of
		// classic application/json request
		if ((0, _lodash.includes)((0, _lodash.get)(operationDescriptor, 'consumes'), 'multipart/form-data') && (0, _areAllRequiredFormDataFieldsFilled2.default)(parameters, args)) {
			var formData = new FormData();

			(0, _lodash.each)((0, _lodash.filter)(parameters, { in: 'formData' }), function (field) {
				var fileProxy = void 0; // es6 wtf duplicate declaration
				var file = void 0;
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
					(0, _lodash.each)(args[field.name], function (fileProxy) {
						fileProxy = args[field.name];
						file = (0, _lodash.get)(context, ['files', fileProxy.path]);

						if (file) {
							formData.append(field.name + '[]', file);
						}
					});
				} else {
					// just append scalar types
					formData.append(field.name, args[field.name]);
				}
			});

			reqConfig['data'] = formData;
			reqConfig['headers']['Content-Type'] = 'multipart/form-data';
		} else {
			// build classic application/json request
			var bodyParameter = (0, _lodash.find)(parameters, _defineProperty({}, 'in', 'body'));

			if (bodyParameter) {
				reqConfig['data'] = args[bodyParameter.name];
			}
		}

		return (0, _axios2.default)(Object.assign({
			method: method
		}, reqConfig)).then(function (response) {
			return response.data;
		}).catch(function (error) {
			if (process.env.NODE_ENV === 'development') {
				console.log('Resolver error for GET "' + resourceUri + '"');
			}

			throw new _ApiError2.default({
				code: error.response.status,
				data: error.response.data
			});
		});
	};
};

exports.default = createHttpResolver;