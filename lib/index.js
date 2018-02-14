'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _lodash = require('lodash');

var _graphql = require('graphql');

var _graphqlTypeJson = require('graphql-type-json');

var _graphqlTypeJson2 = _interopRequireDefault(_graphqlTypeJson);

var _graphqlUnionInputType = require('graphql-union-input-type');

var _graphqlUnionInputType2 = _interopRequireDefault(_graphqlUnionInputType);

var _graphqlScalars = require('graphql-scalars');

var _traverse = require('./traverse');

var _traverse2 = _interopRequireDefault(_traverse);

var _findQueriesDescriptions = require('./findQueriesDescriptions');

var _findQueriesDescriptions2 = _interopRequireDefault(_findQueriesDescriptions);

var _findMutationsDescriptions = require('./findMutationsDescriptions');

var _findMutationsDescriptions2 = _interopRequireDefault(_findMutationsDescriptions);

var _invariant = require('invariant');

var _invariant2 = _interopRequireDefault(_invariant);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _objectWithoutProperties(obj, keys) { var target = {}; for (var i in obj) { if (keys.indexOf(i) >= 0) continue; if (!Object.prototype.hasOwnProperty.call(obj, i)) continue; target[i] = obj[i]; } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }
// import {
// 	GraphQLDate,
// 	GraphQLTime,
// 	GraphQLDateTime,
// } from 'graphql-iso-date';

// import {} from "graphql-tools-types" TODO constrained Int, Float, String...


var SCALAR_TYPE_MAP = {
	integer: _graphql.GraphQLInt,
	number: _graphql.GraphQLFloat,
	string: _graphql.GraphQLString,
	boolean: _graphql.GraphQLBoolean,
	json: _graphqlTypeJson2.default
};
var SCALAR_FORMAT_FACTORY_MAP = {
	// date: () => GraphQLDate,
	// time: () => GraphQLTime,
	// 'date-time': () => GraphQLDateTime,
	email: function email() {
		return _graphqlScalars.GraphQLEmailAddress;
	}
};

var ID_FORMATS = ['uuid', 'uniqueId'];

var TYPE_SCHEMA_SYMBOL_LABEL = 'swagger-graphql-schema type schema';
var IS_IN_INPUT_TYPE_CHAIN_SYMBOL = Symbol('swagger-graphql-schema input type chain');

var mergeAllOf = function mergeAllOf(schema) {
	var partialSchemas = schema.allOf || [schema];

	var properties = partialSchemas.reduce(function (acc, partialSchema) {
		return Object.assign({}, acc, partialSchema.properties || {});
	}, {});
	var links = partialSchemas.reduce(function (acc, partialSchema) {
		return Object.assign({}, acc, partialSchema['x-links'] || {});
	}, {});
	var required = partialSchemas.reduce(function (acc, partialSchema) {
		return [].concat(_toConsumableArray(acc), _toConsumableArray(partialSchema.required || []));
	}, []);
	return {
		// ...schema,
		properties: properties,
		links: links,
		required: required
	};
};

var makeTypeRequired = function makeTypeRequired(type) {
	return type === (0, _graphql.getNullableType)(type) ? new _graphql.GraphQLNonNull(type) : type;
};

var checkObjectSchemaForUnsupportedFeatures = function checkObjectSchemaForUnsupportedFeatures(schema) {
	if ((0, _lodash.get)(schema, 'additionalProperties')) {
		(0, _invariant2.default)(false, 'Object schema for %s has unsupported feature "additionalProperties"', JSON.stringify(schema, null, 2));
	}
};

var extractTypeName = function extractTypeName(nodeContext) {
	// console.log('nodeContext.node', nodeContext.node.title);
	var schema = nodeContext.node;
	if ((0, _lodash.isString)(schema.title)) {
		return schema.title;
	}
	if (nodeContext.parent && nodeContext.parent.parent && nodeContext.parent.parent.node.type === 'object') {
		return extractTypeName(nodeContext.parent) + '_' + nodeContext.key;
	}
	if (nodeContext.key === 'schema' && nodeContext.parent && nodeContext.parent.parent && nodeContext.parent.parent.parent) {
		return nodeContext.parent.parent.parent.node.operationId + '_' + nodeContext.parent.key;
	}
	if (nodeContext.parent) {
		return extractTypeName(nodeContext.parent);
	}
	return '';
};

var isIdSchema = function isIdSchema(schema) {
	var valueFormat = (0, _lodash.get)(schema, 'format');
	return (0, _lodash.includes)(ID_FORMATS, valueFormat);
};
var isEnum = function isEnum(type) {
	return type.hasOwnProperty('_enumConfig');
};

var scalarTypeFromSchema = function scalarTypeFromSchema(schema, schemaName) {
	if ((0, _lodash.get)(schema, 'enum') && (0, _lodash.get)(schema, 'type') === 'string') {
		return undefined;
	}
	var valueFormat = (0, _lodash.get)(schema, 'format');
	if (isIdSchema(schema)) {
		return new _graphql.GraphQLNonNull(_graphql.GraphQLID);
	}
	var resultingType = void 0;
	if (valueFormat) {
		var factory = SCALAR_FORMAT_FACTORY_MAP[valueFormat];
		if (factory) {
			resultingType = factory(schema, schemaName);
		}
	}
	if (!resultingType) {
		var valueType = (0, _lodash.get)(schema, 'type', 'object');
		if ((0, _lodash.isArray)(valueType) && valueType.length === 2 && (0, _lodash.includes)(valueType, 'null')) {
			valueType = (0, _lodash.first)((0, _lodash.filter)(valueType, function (v) {
				return v !== 'null';
			}));
		}
		if (valueType === 'object' && !(0, _lodash.get)(schema, 'properties') && !(0, _lodash.get)(schema, 'allOf') && !(0, _lodash.get)(schema, 'anyOf')) {
			valueType = 'json';
		}
		resultingType = SCALAR_TYPE_MAP[valueType];
	}

	return resultingType;
};

var parseEnums = function parseEnums(_ref) {
	var rootSchema = _ref.schema,
	    typesCache = _ref.types;

	(0, _traverse2.default)(rootSchema).forEach(function parseEnum(schema, context) {
		// const isEnum = (schema.type === 'string' || schema.type === 'boolean') && isArray(schema.enum);
		var isEnum = schema.type === 'string' && (0, _lodash.isArray)(schema.enum);
		var isCached = schema.$$type;
		if (isEnum && !isCached) {
			var schemaId = Symbol(TYPE_SCHEMA_SYMBOL_LABEL);
			schema.$$type = schemaId;
			var enumValues = schema.enum;
			typesCache[schemaId] = new _graphql.GraphQLEnumType({
				name: extractTypeName(context),
				values: enumValues.reduce(function (acc, enumValue) {
					return Object.assign({}, acc, _defineProperty({}, enumValue, { value: enumValue }));
				}, {})
			});
		}
	});
};

var parseInterfaces = function parseInterfaces(_ref2) {
	var rootSchema = _ref2.schema,
	    typesCache = _ref2.types;

	(0, _traverse2.default)(rootSchema).forEach(function parseInterface(schema, context) {
		var isInterface = context.parent && context.parent.key === 'allOf' && schema.type === 'object' && (0, _lodash.isString)(schema.title);
		var isCached = schema.$$type;
		if (isInterface && !isCached) {
			checkObjectSchemaForUnsupportedFeatures(schema);
			var schemaId = Symbol(TYPE_SCHEMA_SYMBOL_LABEL);
			schema.$$type = schemaId;
			var properties = schema.properties;
			typesCache[schemaId] = new _graphql.GraphQLInterfaceType({
				name: extractTypeName(context),
				fields: function fields() {
					return Object.keys(properties).reduce(function (acc, propertyName) {
						var propertySchema = properties[propertyName];
						var type = scalarTypeFromSchema(propertySchema);
						if (!type) {
							type = typesCache[propertySchema.$$type];
						}
						var propertyDescriptor = {
							type: type
						};
						return Object.assign({}, acc, _defineProperty({}, propertyName, propertyDescriptor));
					}, {});
				}
			});
		}
	});
};

var parseObjectTypes = function parseObjectTypes(_ref3) {
	var rootSchema = _ref3.schema,
	    apiDefinition = _ref3.apiDefinition,
	    operations = _ref3.operations,
	    typesCache = _ref3.types,
	    createResolver = _ref3.createResolver,
	    discriminatorFieldName = _ref3.discriminatorFieldName;

	(0, _traverse2.default)(rootSchema).forEach(function parseObjectType(schema, context) {
		var isObjectWithProperties = schema.type === 'object' && !!schema.properties;
		var isPlainType = (!context.parent || context.parent.key !== 'allOf') && (isObjectWithProperties || (0, _lodash.isArray)(schema.allOf));
		var isCached = schema.$$type;
		if (isPlainType && !isCached) {
			checkObjectSchemaForUnsupportedFeatures(schema);
			var schemaId = Symbol(TYPE_SCHEMA_SYMBOL_LABEL);
			schema.$$type = schemaId;

			var _mergeAllOf = mergeAllOf(schema),
			    properties = _mergeAllOf.properties,
			    links = _mergeAllOf.links,
			    required = _mergeAllOf.required;

			var name = extractTypeName(context);
			typesCache[schemaId] = new _graphql.GraphQLObjectType({
				name: name,
				interfaces: function interfaces() {
					return (schema.allOf || []).reduce(function (acc, partialSchema) {
						var possibleInterface = typesCache[partialSchema.$$type];
						if (possibleInterface && possibleInterface.hasOwnProperty('resolveType')) {
							// detect interface
							// console.log('INTERFACE', Object.keys(possibleInterface));
							return [].concat(_toConsumableArray(acc), [possibleInterface]);
						}
						return acc;
					}, []);
				},
				isTypeOf: function isTypeOf(value) {
					if ((0, _lodash.isObject)(value) && value[discriminatorFieldName]) {
						return value[discriminatorFieldName] === name;
					}
					return true;
				},
				fields: function fields() {
					return Object.keys(properties).filter(function (propertyName) {
						return propertyName !== discriminatorFieldName;
					}).reduce(function (acc, propertyName) {
						var propertySchema = properties[propertyName];
						var type = scalarTypeFromSchema(propertySchema);
						if (!type) {
							type = typesCache[propertySchema.$$type];
						}
						if ((0, _lodash.includes)(required, propertyName)) {
							try {
								type = makeTypeRequired(type);
							} catch (error) {
								console.log(type, propertyName, propertySchema);
							}
						}
						var operation = (0, _lodash.get)(operations, (0, _lodash.get)(links, propertyName));
						var resolve = void 0;
						var args = void 0;
						if (operation) {
							var schemaResolve = createResolver({ apiDefinition: apiDefinition, propertyName: propertyName, operation: operation });
							resolve = function resolve(root, args, context, info) {
								var resolvedValue = (0, _lodash.get)(root, propertyName);
								if (!resolvedValue) {
									resolvedValue = schemaResolve(root, args, context, info);
								}

								// TODO json schema validation
								// if (operation.schema) {
								// 	const valid = ajv.validate(operation.schema, resolvedValue);
								// 	if (!valid) {
								// 		throw new ApiError(
								// 			{
								// 				code: 5000,
								// 				data: {
								// 					validatedInstance: resolvedValue,
								// 					validationErrors: ajv.errors,
								// 				},
								// 			}
								// 		)
								// 	}
								// }

								return resolvedValue;
							};
							args = operation.parameters.reduce(function (acc, parameter) {
								var paramName = parameter.name,
								    required = parameter.required,
								    paramIn = parameter['in'],
								    parameterType = parameter.type,
								    parameterFormat = parameter.format,
								    argPath = parameter['x-argPath'],
								    paramSchema = parameter.schema;

								if (!argPath) {
									// this is a root operation or resolution path is not defined => parameter is required
									var _type = void 0;
									if (parameterType) {
										_type = scalarTypeFromSchema({ type: parameterType, format: parameterFormat });
									}
									if ((paramIn === 'body' || paramIn === 'formData') && paramSchema) {
										_type = typesCache[paramSchema.$$inputType];
									}
									if (!_type) {
										_type = _graphql.GraphQLString;
									}
									if ((required || paramIn === 'path') && parameterType !== 'file') {
										_type = makeTypeRequired(_type);
									}
									return Object.assign({}, acc, _defineProperty({}, paramName, { type: _type }));
								}
								return acc;
							}, {});
						}
						var propertyDescriptor = {
							type: type,
							args: args,
							resolve: resolve
						};
						return Object.assign({}, acc, _defineProperty({}, propertyName, propertyDescriptor));
					}, {});
				}
			});
		}
	});
};

var parseInputObjectTypes = function parseInputObjectTypes(_ref4) {
	var rootSchema = _ref4.schema,
	    apiDefinition = _ref4.apiDefinition,
	    operations = _ref4.operations,
	    typesCache = _ref4.types,
	    createResolver = _ref4.createResolver,
	    discriminatorFieldName = _ref4.discriminatorFieldName;

	(0, _traverse2.default)(rootSchema).forEach(function parseObjectType(schema, context) {
		var isObjectWithProperties = schema.type === 'object' && !!schema.properties;
		var isPlainType = (!context.parent || context.parent.key !== 'allOf') && (isObjectWithProperties || (0, _lodash.isArray)(schema.allOf));
		var isCached = schema.$$inputType;
		var baseName = extractTypeName(context);
		var name = baseName + 'Input';
		if (isPlainType && !isCached) {
			checkObjectSchemaForUnsupportedFeatures(schema);
			var schemaId = Symbol(TYPE_SCHEMA_SYMBOL_LABEL);
			schema.$$inputType = schemaId;

			var _mergeAllOf2 = mergeAllOf(schema),
			    _mergeAllOf2$properti = _mergeAllOf2.properties,
			    typeNameProperty = _mergeAllOf2$properti[discriminatorFieldName],
			    properties = _objectWithoutProperties(_mergeAllOf2$properti, [discriminatorFieldName]);

			var updatedProperties = Object.assign(_defineProperty({}, discriminatorFieldName, Object.assign({}, typeNameProperty, {
				readOnly: false
			})), properties);
			typesCache[schemaId] = new _graphql.GraphQLInputObjectType({
				name: name,
				fields: function fields() {
					return Object.keys(updatedProperties).filter(function (propertyName) {
						return !updatedProperties[propertyName].readOnly;
					}).reduce(function (acc, propertyName) {
						var propertySchema = updatedProperties[propertyName];

						var type = scalarTypeFromSchema(propertySchema);
						if (!type) {
							type = typesCache[propertySchema.$$inputType];
						}
						if (!type) {
							type = typesCache[propertySchema.$$type];
						}
						if (!type && propertyName === discriminatorFieldName) {
							type = new _graphql.GraphQLEnumType({
								name: baseName + '_' + discriminatorFieldName,
								values: _defineProperty({}, baseName, { value: baseName })
							});
						}
						// if (includes(required, propertyName)) {
						// 	type = makeTypeRequired(type);
						// }
						var propertyDescriptor = {
							type: (0, _graphql.getNullableType)(type)
						};
						return Object.assign({}, acc, _defineProperty({}, propertyName, propertyDescriptor));
					}, {});
				}
			});
		}
	});
};

var constructInputType = function constructInputType(_ref5) {
	var schema = _ref5.schema,
	    inputTypeName = _ref5.typeName,
	    typesCache = _ref5.typesCache,
	    _ref5$isNestedUnderEn = _ref5.isNestedUnderEntity,
	    isNestedUnderEntity = _ref5$isNestedUnderEn === undefined ? false : _ref5$isNestedUnderEn,
	    discriminatorFieldName = _ref5.discriminatorFieldName;

	checkObjectSchemaForUnsupportedFeatures(schema);

	var inputType = scalarTypeFromSchema(schema);
	if (isIdSchema(schema)) {
		inputType = (0, _graphql.getNullableType)(inputType);
	}
	if (schema.$$type && isEnum(typesCache[schema.$$type])) {
		return typesCache[schema.$$type];
	}
	if (schema.type === 'array') {
		return new _graphql.GraphQLList(constructInputType({
			schema: schema.items,
			typesCache: typesCache,
			isNestedUnderEntity: isNestedUnderEntity,
			typeName: inputTypeName
		}));
	}
	var typeName = inputTypeName + 'Input';

	if ((0, _lodash.isArray)(schema.anyOf)) {
		inputType = new _graphqlUnionInputType2.default({
			name: typeName,
			inputTypes: (0, _lodash.reduce)(schema.anyOf, function (acc, unionPartSchema) {
				return Object.assign({}, acc, _defineProperty({}, unionPartSchema.title, constructInputType({
					schema: unionPartSchema,
					typesCache: typesCache,
					isNestedUnderEntity: isNestedUnderEntity,
					typeName: inputTypeName
				})));
			}),
			typeKey: discriminatorFieldName
		});
	}

	if (!inputType) {
		schema[IS_IN_INPUT_TYPE_CHAIN_SYMBOL] = true;

		var _mergeAllOf3 = mergeAllOf(schema),
		    properties = _mergeAllOf3.properties,
		    required = _mergeAllOf3.required;

		var hasID = Object.keys(properties).reduce(function (acc, pn) {
			return acc || isIdSchema(properties[pn]);
		}, false);
		// const requireOnlyIdInput = hasID && isNestedUnderEntity;

		inputType = new _graphql.GraphQLInputObjectType({
			name: typeName,
			fields: Object.keys(properties)
			// .filter((k) => requireOnlyIdInput ? isIdSchema(properties[k]) : !properties[k].readOnly)
			.filter(function (k) {
				return !properties[k].readOnly && !properties[k][IS_IN_INPUT_TYPE_CHAIN_SYMBOL];
			}).reduce(function (acc, propertyName) {
				var propertySchema = properties[propertyName];
				var type = constructInputType({
					schema: propertySchema,
					typesCache: typesCache,
					isNestedUnderEntity: isNestedUnderEntity || hasID,
					typeName: inputTypeName + '_' + propertyName
				});
				// TODO all input fields are optional for now
				// if (includes(required, propertyName)) {
				// 	type = makeTypeRequired(type);
				// }
				var propertyDescriptor = {
					type: type
				};
				return Object.assign({}, acc, _defineProperty({}, propertyName, propertyDescriptor));
			}, {})
		});
		schema[IS_IN_INPUT_TYPE_CHAIN_SYMBOL] = false;
	}
	return inputType;
};
var parseRootInputTypes = function parseRootInputTypes(_ref6) {
	var rootSchema = _ref6.schema,
	    typesCache = _ref6.types,
	    discriminatorFieldName = _ref6.discriminatorFieldName;

	(0, _traverse2.default)(rootSchema).forEach(function parseRootInputType(schema, context) {
		var isRootInputType = context.key === 'schema' && context.parent.node.in === 'body' && context.parent.node.name;
		var isCachedRootInputType = schema.$$rootInputType;
		if (isRootInputType && !isCachedRootInputType) {
			schema.$$rootInputType = Symbol(TYPE_SCHEMA_SYMBOL_LABEL);
			var typeName = schema.title || 'Mutation_' + context.parent.parent.parent.node.operationId;
			typesCache[schema.$$rootInputType] = constructInputType({
				schema: schema,
				typesCache: typesCache,
				typeName: typeName,
				discriminatorFieldName: discriminatorFieldName
			});
		}
	});
};

var parseUnions = function parseUnions(_ref7) {
	var rootSchema = _ref7.schema,
	    typesCache = _ref7.types,
	    discriminatorFieldName = _ref7.discriminatorFieldName;

	(0, _traverse2.default)(rootSchema).forEach(function parseUnion(schema, context) {
		var isUnion = schema && (0, _lodash.isArray)(schema.anyOf);
		var isCached = schema && schema.$$type;
		if (isUnion && !isCached) {
			var schemaId = Symbol(TYPE_SCHEMA_SYMBOL_LABEL);
			schema.$$type = schemaId;
			typesCache[schemaId] = new _graphql.GraphQLUnionType({
				name: extractTypeName(context),
				types: function types() {
					return schema.anyOf.map(function (subSchema) {
						return typesCache[subSchema.$$type];
					});
				},
				resolveType: function resolveType(value) {
					if (value[discriminatorFieldName]) {
						return value[discriminatorFieldName];
					}
				}
			});
		}
	});
};

var parseInputUnions = function parseInputUnions(_ref8) {
	var rootSchema = _ref8.schema,
	    typesCache = _ref8.types,
	    discriminatorFieldName = _ref8.discriminatorFieldName;

	(0, _traverse2.default)(rootSchema).forEach(function parseUnion(schema, context) {
		var isUnion = schema && (0, _lodash.isArray)(schema.anyOf);
		var isCached = schema && schema.$$inputType;
		if (isUnion && !isCached) {
			var schemaId = Symbol(TYPE_SCHEMA_SYMBOL_LABEL);
			schema.$$inputType = schemaId;

			typesCache[schemaId] = new _graphqlUnionInputType2.default({
				name: extractTypeName(context) + 'Input',
				inputTypes: (0, _lodash.reduce)(schema.anyOf, function (acc, subSchema) {
					return Object.assign({}, acc, _defineProperty({}, subSchema.title, typesCache[subSchema.$$inputType]));
				}, {}),
				typeKey: discriminatorFieldName
			});
		}
	});
};

var parseLists = function parseLists(_ref9) {
	var rootSchema = _ref9.schema,
	    typesCache = _ref9.types;

	(0, _traverse2.default)(rootSchema).forEach(function parseList(schema) {
		var isList = schema && schema.type === 'array' && schema.items;
		var isCached = schema && schema.$$type;
		if (isList && !isCached) {
			var schemaId = Symbol(TYPE_SCHEMA_SYMBOL_LABEL);
			schema.$$type = schemaId;
			var innerType = scalarTypeFromSchema(schema.items);
			if (!innerType) {
				innerType = typesCache[schema.items.$$type];
			}
			if (!innerType) {
				throw new Error('No graphql type found for schema\n\n' + JSON.stringify(schema.items, null, 2));
			}
			typesCache[schemaId] = new _graphql.GraphQLList(innerType);
		}
	});
};

var parseInputLists = function parseInputLists(_ref10) {
	var rootSchema = _ref10.schema,
	    typesCache = _ref10.types;

	(0, _traverse2.default)(rootSchema).forEach(function parseList(schema) {
		var isList = schema && schema.type === 'array' && schema.items;
		var isCached = schema && schema.$$inputType;
		if (isList && !isCached) {
			var schemaId = Symbol(TYPE_SCHEMA_SYMBOL_LABEL);
			schema.$$inputType = schemaId;
			var innerType = scalarTypeFromSchema(schema.items);
			if (!innerType) {
				innerType = typesCache[schema.items.$$inputType];
			}
			if (!innerType) {
				throw new Error('No graphql type found for schema\n\n' + JSON.stringify(schema.items, null, 2));
			}
			typesCache[schemaId] = new _graphql.GraphQLList(innerType);
		}
	});
};

var swaggerToSchema = function swaggerToSchema() {
	var _ref11 = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
	    paths = _ref11.swagger.paths,
	    swagger = _ref11.swagger,
	    createResolver = _ref11.createResolver,
	    _ref11$discriminatorF = _ref11.discriminatorFieldName,
	    discriminatorFieldName = _ref11$discriminatorF === undefined ? 'typeName' : _ref11$discriminatorF;

	var queriesDescriptions = (0, _findQueriesDescriptions2.default)(paths);
	var mutationsDescriptions = (0, _findMutationsDescriptions2.default)(paths);
	var operations = Object.assign({}, queriesDescriptions, mutationsDescriptions);

	var completeSchema = Object.assign({}, swagger, {
		definitions: Object.assign({}, swagger.definitions || {}, {
			Query: {
				title: 'Query',
				type: 'object',
				description: 'query root type',
				properties: (0, _lodash.mapValues)(queriesDescriptions, function (_ref12) {
					var schema = _ref12.schema;
					return schema;
				}),
				'x-links': (0, _lodash.mapValues)(queriesDescriptions, function (_, linkName) {
					return linkName;
				})
			},
			Mutation: {
				title: 'Mutation',
				type: 'object',
				description: 'mutation root type',
				properties: (0, _lodash.mapValues)(mutationsDescriptions, function (_ref13) {
					var schema = _ref13.schema;
					return schema;
				}),
				'x-links': (0, _lodash.mapValues)(mutationsDescriptions, function (_, linkName) {
					return linkName;
				})
			}
		})
	});

	var types = {};

	[completeSchema.definitions.Query, completeSchema.definitions.Mutation, completeSchema].forEach(function (schema) {
		parseEnums({ schema: schema, types: types });
		parseInterfaces({ schema: schema, types: types });
	});

	[completeSchema.paths].forEach(function (schema) {
		parseInputObjectTypes({ schema: schema, types: types, discriminatorFieldName: discriminatorFieldName });
		parseInputUnions({ schema: schema, types: types, discriminatorFieldName: discriminatorFieldName });
		parseInputLists({ schema: schema, types: types, discriminatorFieldName: discriminatorFieldName });
	});

	[completeSchema.definitions.Query, completeSchema.definitions.Mutation, completeSchema].forEach(function (schema) {
		parseObjectTypes({
			schema: schema,
			operations: operations,
			apiDefinition: completeSchema,
			types: types,
			createResolver: createResolver,
			discriminatorFieldName: discriminatorFieldName
		});
		parseUnions({ schema: schema, types: types, discriminatorFieldName: discriminatorFieldName });
		parseLists({ schema: schema, types: types });
		// parseRootInputTypes({ schema, types, discriminatorFieldName });
	});

	var typesList = Object.getOwnPropertySymbols(types).map(function (s) {
		return types[s];
	});

	return new _graphql.GraphQLSchema({
		types: typesList,
		query: types[completeSchema.definitions.Query.$$type],
		mutation: types[completeSchema.definitions.Mutation.$$type]
	});
};

exports.default = swaggerToSchema;