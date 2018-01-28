'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _lodash = require('lodash');

var _invariant = require('invariant');

var _invariant2 = _interopRequireDefault(_invariant);

var _traverse = require('traverse');

var _traverse2 = _interopRequireDefault(_traverse);

var _axios = require('axios');

var _axios2 = _interopRequireDefault(_axios);

var _uriTemplates = require('uri-templates');

var _uriTemplates2 = _interopRequireDefault(_uriTemplates);

var _findQueriesDescriptions = require('./findQueriesDescriptions');

var _findQueriesDescriptions2 = _interopRequireDefault(_findQueriesDescriptions);

var _findMutationsDescriptions = require('./findMutationsDescriptions');

var _findMutationsDescriptions2 = _interopRequireDefault(_findMutationsDescriptions);

var _ApiError = require('./ApiError');

var _ApiError2 = _interopRequireDefault(_ApiError);

var _graphql = require('graphql');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

var FileInputType = new _graphql.GraphQLInputObjectType({
	name: 'FileInput',
	fields: {
		name: {
			type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
		},
		type: {
			type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
		},
		size: {
			type: new _graphql.GraphQLNonNull(_graphql.GraphQLInt)
		},
		path: {
			type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
		}
	}
});

var scalartypeMap = {
	integer: _graphql.GraphQLInt,
	number: _graphql.GraphQLFloat,
	string: _graphql.GraphQLString,
	boolean: _graphql.GraphQLBoolean,
	file: FileInputType
};

var checkObjectSchemaForUnsupportedFeatures = function checkObjectSchemaForUnsupportedFeatures(schema) {
	if ((0, _lodash.get)(schema, 'additionalProperties')) {
		(0, _invariant2.default)(false, 'Object schema for %s has unsupported feature "additionalProperties"', JSON.stringify(schema, null, 2));
	}
};

var findChildSchemas = function findChildSchemas(schema, swagger) {
	var acc = [];
	(0, _traverse2.default)(swagger).forEach(function (schemaNode) {
		// if (schemaNode === schema) doesn't work due to bug in ref parser
		// for now assume its the same schema like this
		if (schemaNode && schemaNode.title === schema.title) {
			if (this.parent.key === 'allOf') {
				acc = [].concat(_toConsumableArray(acc), [this.parent.parent.node]);
			}
		}
	});
	return acc;
};

var areAllRequiredFormDataFieldsFilled = function areAllRequiredFormDataFieldsFilled(parameters, args) {
	var requiredFormDataFields = (0, _lodash.filter)(parameters, { in: 'formData', required: true });
	return (0, _lodash.every)(requiredFormDataFields, function (field) {
		return !!args[field.name];
	});
};

var computeType = function computeType(inputSchema, operationsDescriptions, swagger, idFormats, typesBag) {
	var parentTypePath = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : '';

	// console.log('parentTypePath', parentTypePath, 'schema', g(schema, 'title'), schema);
	var allOf = (0, _lodash.get)(inputSchema, 'allOf');
	var schema = inputSchema;
	var schemaTitle = (0, _lodash.get)(schema, 'title');
	var valueType = (0, _lodash.get)(schema, 'type', 'object');
	var isInput = (0, _lodash.get)(schema, 'x-isInput', false);

	// filter out types with 2 values where one of them is "null"
	if ((0, _lodash.isArray)(valueType) && valueType.length === 2 && (0, _lodash.includes)(valueType, 'null')) {
		valueType = (0, _lodash.first)((0, _lodash.filter)(valueType, function (v) {
			return v !== 'null';
		}));
	}

	// compute type name
	var typeName = schemaTitle || parentTypePath;
	var shouldAppendInputToTypeName = isInput && !(0, _lodash.endsWith)(typeName, 'Input') && !!typesBag[typeName];
	typeName = shouldAppendInputToTypeName ? typeName + 'Input' : typeName;

	// return cached copy if exists
	if (typesBag[typeName]) {
		return typesBag[typeName];
	}

	if ((0, _lodash.isArray)(valueType)) {
		throw new Error('not implemented yet');
	} else {
		var description = (0, _lodash.get)(schema, 'description');
		if ((0, _lodash.includes)(idFormats, (0, _lodash.get)(schema, 'format'))) {
			return new _graphql.GraphQLNonNull(_graphql.GraphQLID);
		}

		if ((0, _lodash.get)(schema, 'format') === 'binary') {
			return FileInputType;
		}

		switch (valueType.toLowerCase()) {
			case 'array':
				var itemsSchema = (0, _lodash.get)(schema, 'items');

				return new _graphql.GraphQLList(computeType(Object.assign({}, itemsSchema, isInput ? { 'x-isInput': true } : {}), operationsDescriptions, swagger, idFormats, typesBag, parentTypePath));
				break;
			case 'object':
				checkObjectSchemaForUnsupportedFeatures(schema);

				var links = (0, _lodash.get)(schema, 'x-links', {});
				var properties = (0, _lodash.get)(schema, 'properties');
				// let hasInterfaces = false;
				var discriminator = (0, _lodash.get)(schema, 'discriminator');
				var isInterface = !!discriminator;
				var TypeConstructor = !isInterface ? _graphql.GraphQLObjectType : _graphql.GraphQLInterfaceType;
				if (isInput) {
					TypeConstructor = _graphql.GraphQLInputObjectType;
				}
				var additionalConfig = {};
				if (isInterface) {
					var discriminatorPropertyName = (0, _lodash.get)(discriminator, 'propertyName');
					additionalConfig = {
						resolveType: function resolveType(value) {
							return (0, _lodash.get)(typesBag, (0, _lodash.get)(value, discriminatorPropertyName));
						}
					};
				}

				// find implemented interfaces
				var getInterfaces = function getInterfaces() {
					return [];
				};
				if (allOf) {
					properties = allOf.reduce(function (acc, partialSchema) {
						return Object.assign({}, acc, (0, _lodash.get)(partialSchema, 'properties', {}));
					}, {});
					getInterfaces = function getInterfaces() {
						return allOf.reduce(function (acc, partialSchema) {
							var isInterface = !!(0, _lodash.get)(partialSchema, 'discriminator');
							if (!isInterface) {
								return acc;
							}
							return [].concat(_toConsumableArray(acc), [computeType(partialSchema, operationsDescriptions, swagger, idFormats, typesBag)]);
						}, []);
					};
				}
				var newType = new TypeConstructor(Object.assign({
					name: typeName,
					description: description,
					interfaces: getInterfaces
				}, additionalConfig, {
					fields: function fields() {
						return (0, _lodash.reduce)(properties, function (acc, propertySchema, propertyName) {
							var operationId = (0, _lodash.get)(links, propertyName);
							var operationDescriptor = (0, _lodash.get)(operationsDescriptions, operationId);
							var newParentTypePath = schemaTitle ? schemaTitle + '_' + propertyName : '' + (parentTypePath ? parentTypePath + '_' + propertyName : '');
							var isRootQuery = (0, _lodash.get)(propertySchema, 'x-isRootOperation');
							var isReadOnly = !isRootQuery && (0, _lodash.get)(propertySchema, 'x-readOnly');
							var parameters = (0, _lodash.get)(operationDescriptor, 'parameters');

							if (isReadOnly && isInput) {
								return acc;
							}

							return Object.assign({}, acc, _defineProperty({}, propertyName, Object.assign({
								type: computeType(Object.assign({}, propertySchema, isInput ? { 'x-isInput': true } : {}), operationsDescriptions, swagger, idFormats, typesBag, newParentTypePath)
							}, operationDescriptor ? {
								args: parameters.reduce(function (acc, parameter) {
									var paramName = parameter.name,
									    required = parameter.required,
									    paramIn = parameter['in'],
									    parameterType = parameter.type,
									    argPath = parameter['x-argPath'],
									    paramSchema = parameter.schema;

									if (isRootQuery || !argPath) {
										// this is a root operation or resolution path is not defined => parameter is required
										var type = _graphql.GraphQLString;
										if (parameterType) {
											type = computeType({ type: parameterType }, operationsDescriptions, swagger, idFormats, typesBag, newParentTypePath);
										}
										if ((paramIn === 'body' || paramIn === 'formData') && paramSchema) {
											type = computeType(Object.assign({}, paramSchema, _defineProperty({}, 'x-isInput', true)), operationsDescriptions, swagger, idFormats, typesBag, newParentTypePath);
										}
										if ((required || paramIn === 'path') && parameterType !== 'file') {
											type = new _graphql.GraphQLNonNull(type);
										}
										return Object.assign({}, acc, _defineProperty({}, paramName, { type: type }));
									}
									return acc;
								}, {}),
								resolve: function resolve(root, args, context, info) {
									debugger;
									// yay, make request!
									var fieldValue = (0, _lodash.get)(root, propertyName);
									if (fieldValue) {
										return fieldValue;
									}
									var scheme = (0, _lodash.first)((0, _lodash.get)(swagger, 'schemes', ['http']));
									var resourceUriTemplate = scheme + '://' + (0, _lodash.get)(swagger, 'host') + (0, _lodash.get)(swagger, 'basePath') + (0, _lodash.get)(operationDescriptor, 'path');
									// TODO translate params
									var argsValues = Object.assign({ root: root }, args);
									var parametersValues = parameters.reduce(function (acc, _ref) {
										var paramName = _ref.name,
										    argPath = _ref['x-argPath'],
										    paramIn = _ref['in'];

										var value = (0, _lodash.get)(argsValues, argPath || paramName);
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
									var callArguments = [resourceUri, context.http];

									// if endpoint consumes multipart/form-data and all required form-data
									// fields are filled, build multipart/form-data request instead of
									// classic application/json request
									if ((0, _lodash.includes)((0, _lodash.get)(operationDescriptor, 'consumes'), 'multipart/form-data') && areAllRequiredFormDataFieldsFilled(parameters, args)) {
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

										callArguments = [callArguments[0], formData, (0, _lodash.merge)( // extend by headers needed by multipart/form-data request
										callArguments[1], {
											'Content-Type': 'multipart/form-data'
										})];
									} else {
										// build classic application/json request
										var bodyParameter = (0, _lodash.find)(parameters, _defineProperty({}, 'in', 'body'));
										if (bodyParameter) {
											callArguments = [callArguments[0], args[bodyParameter.name], callArguments[1]];
										}
									}

									return _axios2.default[method].apply(_axios2.default, _toConsumableArray(callArguments)).then(function (response) {
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
								}
							} : {})));
						}, {});
					}
				}));
				typesBag[typeName] = newType;

				if (isInterface) {
					var childSchemas = findChildSchemas(schema, swagger);
					var childTypes = childSchemas.reduce(function (acc, childSchema) {
						return Object.assign({}, acc, _defineProperty({}, (0, _lodash.get)(childSchema, 'title'), computeType(childSchema, operationsDescriptions, swagger, idFormats, typesBag)));
					}, {});
				}

				return newType;
				break;
			case 'string':
				var enumValues = (0, _lodash.get)(schema, 'enum');
				if (enumValues) {
					var _newType = new _graphql.GraphQLEnumType({
						name: typeName,
						values: enumValues.reduce(function (acc, enumValue, i) {
							return Object.assign({}, acc, _defineProperty({}, enumValue, { value: enumValue }));
						}, [])
					});
					typesBag[typeName] = _newType;
					return _newType;
				}
			default:
				var scalarType = scalartypeMap[valueType];
				if (scalarType) {
					return scalarType;
				}
				throw new Error('Could not find type mapping for "' + valueType + '"');
		}
	}
};

var gatherObjectTypes = function gatherObjectTypes(schema, queriesDescriptions, swagger, idFormats, typesBag) {
	(0, _traverse2.default)(schema).forEach(function (node) {
		var title = (0, _lodash.get)(node, 'title');
		var hasTitle = !!title;
		var hasProperties = (0, _lodash.get)(node, 'properties');
		var hasAllOf = (0, _lodash.get)(node, 'allOf');
		var isObjectType = hasTitle && (hasProperties || hasAllOf);
		if (isObjectType) {
			typesBag[title] = computeType(node, queriesDescriptions, swagger, idFormats, typesBag);
		}
	});
};

var swaggerToSchema = function swaggerToSchema(swagger) {
	var idFormats = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : ['uniqueId', 'uuid'];

	var queriesDescriptions = (0, _findQueriesDescriptions2.default)(swagger.paths);
	var mutationsDescriptions = (0, _findMutationsDescriptions2.default)(swagger.paths);

	var typesBag = {};

	var querySchema = {
		title: 'Query',
		type: 'object',
		description: 'query root type',
		properties: (0, _lodash.mapValues)(queriesDescriptions, function (_ref2) {
			var schema = _ref2.schema;
			return Object.assign({}, schema, { 'x-isRootOperation': true });
		}),
		'x-links': (0, _lodash.mapValues)(queriesDescriptions, function (_, linkName) {
			return linkName;
		})
	};
	gatherObjectTypes(querySchema, queriesDescriptions, swagger, idFormats, typesBag);
	var QueryType = computeType(querySchema, queriesDescriptions, swagger, idFormats, typesBag);

	var mutationSchema = {
		title: 'Mutation',
		type: 'object',
		description: 'mutation root type',
		properties: (0, _lodash.mapValues)(mutationsDescriptions, function (_ref3) {
			var schema = _ref3.schema;
			return Object.assign({}, schema, { 'x-isRootOperation': true });
		}),
		'x-links': (0, _lodash.mapValues)(mutationsDescriptions, function (_, linkName) {
			return linkName;
		})
	};
	gatherObjectTypes(mutationSchema, mutationsDescriptions, swagger, idFormats, typesBag);
	var MutationType = computeType(mutationSchema, mutationsDescriptions, swagger, idFormats, typesBag);

	var schema = new _graphql.GraphQLSchema(Object.assign({
		types: Object.values(typesBag)
	}, (0, _lodash.size)(queriesDescriptions) ? { query: QueryType } : {}, (0, _lodash.size)(mutationsDescriptions) ? { mutation: MutationType } : {}));

	return schema;
};

exports.default = swaggerToSchema;