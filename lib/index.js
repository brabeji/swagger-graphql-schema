'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});
exports.findQueriesDescriptions = undefined;

var _defineProperty2 = require('babel-runtime/helpers/defineProperty');

var _defineProperty3 = _interopRequireDefault(_defineProperty2);

var _extends6 = require('babel-runtime/helpers/extends');

var _extends7 = _interopRequireDefault(_extends6);

var _lodash = require('lodash');

var _invariant = require('invariant');

var _invariant2 = _interopRequireDefault(_invariant);

var _axios = require('axios');

var _axios2 = _interopRequireDefault(_axios);

var _uriTemplates = require('uri-templates');

var _uriTemplates2 = _interopRequireDefault(_uriTemplates);

var _graphql = require('graphql');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var findQueriesDescriptions = exports.findQueriesDescriptions = function findQueriesDescriptions(paths) {
	return (0, _lodash.reduce)(paths, function (acc, pathMethods, path) {
		return (0, _extends7.default)({}, acc, (0, _lodash.reduce)(pathMethods, function (acc, operation, method) {
			var operationId = (0, _lodash.get)(operation, 'operationId');
			var schema = (0, _lodash.get)(operation, ['responses', '200', 'schema'], (0, _lodash.get)(operation, ['responses', '201', 'schema']));
			if (operationId && schema && method.toLowerCase() === 'get') {
				return (0, _extends7.default)({}, acc, (0, _defineProperty3.default)({}, operationId, {
					path: path,
					schema: schema.title ? schema : (0, _extends7.default)({}, schema, { title: operationId }),
					// schema,
					parameters: (0, _lodash.get)(operation, 'parameters', [])
				}));
			}
			return acc;
		}, {}));
	}, {});
};

// const computeTypeFields = (fields, queriesDescriptions, typesBag) => {
// 	mapValues(
// 		fields,
// 		(queryDescription, queryName) => {
// 			debugger;
// 			return {
// 				type: new GraphQLList(PageType),
// 				resolve: (root, args) => {
// 					debugger;
// 				},
// 			};
// 		},
// 	)
// };

var scalartypeMap = {
	integer: _graphql.GraphQLInt,
	string: _graphql.GraphQLString,
	boolean: _graphql.GraphQLBoolean
};

var checkObjectSchemaForUnsupportedFeatures = function checkObjectSchemaForUnsupportedFeatures(schema) {
	if ((0, _lodash.get)(schema, 'additionalProperties')) {
		(0, _invariant2.default)(false, 'Object schema for %s has unsupported feature "additionalProperties"', getSchemaJSON());
	}
};

var computeType = function computeType(schema, queriesDescriptions, swagger, typesBag) {
	var parentTypePath = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : '';

	console.log('parentTypePath', parentTypePath, 'schema', (0, _lodash.get)(schema, 'title'), schema);
	var valueType = (0, _lodash.get)(schema, 'type', (0, _lodash.get)(schema, 'anyOf', 'object'));
	if ((0, _lodash.isArray)(valueType)) {
		console.log('shiz');
	} else {
		var description = (0, _lodash.get)(schema, 'description');
		if ((0, _lodash.get)(schema, 'format') === 'uniqueId') {
			return _graphql.GraphQLID;
		}
		switch (valueType) {
			case 'array':
				var itemsSchema = (0, _lodash.get)(schema, 'items');
				return new _graphql.GraphQLList(computeType(itemsSchema, queriesDescriptions, swagger, typesBag, parentTypePath));
				break;
			case 'object':
				checkObjectSchemaForUnsupportedFeatures(schema);
				var schemaTitle = (0, _lodash.get)(schema, 'title');
				if (typesBag[schemaTitle]) {
					return typesBag[schemaTitle];
				}
				var links = (0, _lodash.get)(schema, 'x-links', {});
				var properties = (0, _lodash.get)(schema, 'properties');
				var newType = new _graphql.GraphQLObjectType({
					name: schemaTitle || parentTypePath,
					description: description,
					fields: function fields() {
						return (0, _lodash.mapValues)(properties, function (propertySchema, propertyName) {
							var operationId = (0, _lodash.get)(links, propertyName);
							var queryDescriptor = (0, _lodash.get)(queriesDescriptions, operationId);
							var newParentTypePath = schemaTitle ? schemaTitle + '_' + propertyName : '' + (parentTypePath ? parentTypePath + '_' + propertyName : '');
							var isRootQuery = (0, _lodash.get)(propertySchema, 'x-isRootQuery');
							var parameters = (0, _lodash.get)(queryDescriptor, 'parameters');
							return (0, _extends7.default)({
								type: computeType(propertySchema, queriesDescriptions, swagger, typesBag, newParentTypePath)
							}, queryDescriptor ? {
								args: parameters.reduce(function (acc, _ref) {
									var paramName = _ref.name,
									    required = _ref.required,
									    paramIn = _ref['in'],
									    parameterSchema = _ref.schema,
									    argPath = _ref['x-argPath'];

									if (isRootQuery || !argPath) {
										// this is a root query, all parameters are required

										var type = _graphql.GraphQLString; // TODO proper types
										if (parameterSchema) {
											type = computeType(parameterSchema, queriesDescriptions, swagger, typesBag, newParentTypePath);
										}
										if (required || paramIn === 'path') {
											type = new _graphql.GraphQLNonNull(type);
										}
										return (0, _extends7.default)({}, acc, (0, _defineProperty3.default)({}, paramName, { type: type }));
									}
									return acc;
								}, {}),
								resolve: function resolve(root, args, context, info) {
									// yay, make request!
									var fieldValue = (0, _lodash.get)(root, propertyName);
									if (fieldValue) {
										return fieldValue;
									}
									var resourceUriTemplate = 'http://' + (0, _lodash.get)(swagger, 'host') + (0, _lodash.get)(swagger, 'basePath') + (0, _lodash.get)(queryDescriptor, 'path');
									// TODO translate params
									var argsValues = (0, _extends7.default)({ root: root }, args);
									var parametersValues = parameters.reduce(function (acc, _ref2) {
										var paramName = _ref2.name,
										    argPath = _ref2['x-argPath'],
										    paramIn = _ref2['in'];

										var value = (0, _lodash.get)(argsValues, argPath || paramName);
										if (value && paramIn === 'query') {
											return (0, _extends7.default)({}, acc, {
												queryParams: (0, _extends7.default)({}, acc.queryParams, (0, _defineProperty3.default)({}, paramName, value))
											});
										} else if (value && paramIn === 'path') {
											return (0, _extends7.default)({}, acc, {
												pathParams: (0, _extends7.default)({}, acc.pathParams, (0, _defineProperty3.default)({}, paramName, value))
											});
										}
										return acc;
									}, {
										pathParams: {},
										queryParams: {}
									});
									var template = new _uriTemplates2.default(resourceUriTemplate + '{?queryParams*}');
									var resourceUri = template.fill((0, _extends7.default)({}, parametersValues.pathParams, {
										queryParams: parametersValues.queryParams
									}));
									return _axios2.default.get(resourceUri).then(function (response) {
										return response.data;
									});
								}
							} : {});
						});
					}
				});
				typesBag[schemaTitle] = newType;
				return newType;
				break;
			default:
				var scalarType = scalartypeMap[valueType];
				if (scalarType) {
					return scalarType;
				}
				throw new Error('Could not find type mapping for "' + valueType + '"');
		}
	}
};

var swaggerToSchema = function swaggerToSchema(swagger) {
	var queriesDescriptions = findQueriesDescriptions(swagger.paths);

	console.log(queriesDescriptions);

	var typeBag = {};

	var QueryType = computeType({
		title: 'Query',
		type: 'object',
		description: 'query root type',
		properties: (0, _lodash.mapValues)(queriesDescriptions, function (_ref3) {
			var schema = _ref3.schema;
			return (0, _extends7.default)({}, schema, { 'x-isRootQuery': true });
		}),
		'x-links': (0, _lodash.mapValues)(queriesDescriptions, function (_, linkName) {
			return linkName;
		})
	}, queriesDescriptions, swagger, typeBag);

	var schema = new _graphql.GraphQLSchema({
		query: QueryType
	});
	return schema;
};

exports.default = swaggerToSchema;