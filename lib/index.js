'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _lodash = require('lodash');

var _graphql = require('graphql');

var _graphqlIsoDate = require('graphql-iso-date');

var _graphqlTypeJson = require('graphql-type-json');

var _graphqlTypeJson2 = _interopRequireDefault(_graphqlTypeJson);

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

// import Ajv from 'ajv';
// import ApiError from './ApiError';

// const ajv = new Ajv({ allErrors: true });

const SCALAR_TYPE_MAP = {
	integer: _graphql.GraphQLInt,
	number: _graphql.GraphQLFloat,
	string: _graphql.GraphQLString,
	boolean: _graphql.GraphQLBoolean,
	json: _graphqlTypeJson2.default
};
// import {} from "graphql-tools-types" TODO constrained Int, Float, String...

const SCALAR_FORMAT_FACTORY_MAP = {
	// date: () => GraphQLDate,
	// time: () => GraphQLTime,
	// 'date-time': () => GraphQLDateTime,
	email: () => _graphqlScalars.GraphQLEmailAddress
};

const ID_FORMATS = ['uuid', 'uniqueId'];

const TYPE_SCHEMA_SYMBOL_LABEL = 'swagger-graphql-schema type schema';
const IS_IN_INPUT_TYPE_CHAIN_SYMBOL = Symbol('swagger-graphql-schema input type chain');

const mergeAllOf = schema => {
	const partialSchemas = schema.allOf || [schema];

	const properties = partialSchemas.reduce((acc, partialSchema) => Object.assign({}, acc, partialSchema.properties || {}), {});
	const links = partialSchemas.reduce((acc, partialSchema) => Object.assign({}, acc, partialSchema['x-links'] || {}), {});
	const required = partialSchemas.reduce((acc, partialSchema) => [...acc, ...(partialSchema.required || [])], []);
	return {
		// ...schema,
		properties,
		links,
		required
	};
};

const makeTypeRequired = type => type === (0, _graphql.getNullableType)(type) ? new _graphql.GraphQLNonNull(type) : type;

const checkObjectSchemaForUnsupportedFeatures = schema => {
	if ((0, _lodash.get)(schema, 'additionalProperties')) {
		(0, _invariant2.default)(false, 'Object schema for %s has unsupported feature "additionalProperties"', JSON.stringify(schema, null, 2));
	}
};

const extractTypeName = nodeContext => {
	// console.log('nodeContext.node', nodeContext.node.title);
	const schema = nodeContext.node;
	if ((0, _lodash.isString)(schema.title)) {
		return schema.title;
	}
	if (nodeContext.parent && nodeContext.parent.parent && nodeContext.parent.parent.node.type === 'object') {
		return `${extractTypeName(nodeContext.parent)}_${nodeContext.key}`;
	}
	if (nodeContext.key === 'schema' && nodeContext.parent && nodeContext.parent.parent && nodeContext.parent.parent.parent) {
		return `${nodeContext.parent.parent.parent.node.operationId}_${nodeContext.parent.key}`;
	}
	if (nodeContext.parent) {
		return extractTypeName(nodeContext.parent);
	}
	return '';
};

const isIdSchema = schema => {
	const valueFormat = (0, _lodash.get)(schema, 'format');
	return (0, _lodash.includes)(ID_FORMATS, valueFormat);
};
const isEnum = type => {
	return type.hasOwnProperty('_enumConfig');
};

const scalarTypeFromSchema = (schema, schemaName) => {
	if ((0, _lodash.get)(schema, 'enum') && (0, _lodash.get)(schema, 'type') === 'string') {
		return undefined;
	}
	const valueFormat = (0, _lodash.get)(schema, 'format');
	if (isIdSchema(schema)) {
		return new _graphql.GraphQLNonNull(_graphql.GraphQLID);
	}
	let resultingType;
	if (valueFormat) {
		const factory = SCALAR_FORMAT_FACTORY_MAP[valueFormat];
		if (factory) {
			resultingType = factory(schema, schemaName);
		}
	}
	if (!resultingType) {
		let valueType = (0, _lodash.get)(schema, 'type', 'object');
		if ((0, _lodash.isArray)(valueType) && valueType.length === 2 && (0, _lodash.includes)(valueType, 'null')) {
			valueType = (0, _lodash.first)((0, _lodash.filter)(valueType, v => v !== 'null'));
		}
		if (valueType === 'object' && !(0, _lodash.get)(schema, 'properties') && !(0, _lodash.get)(schema, 'allOf') && !(0, _lodash.get)(schema, 'anyOf')) {
			valueType = 'json';
		}
		resultingType = SCALAR_TYPE_MAP[valueType];
	}

	return resultingType;
};

const parseEnums = ({ schema: rootSchema, types: typesCache }) => {
	(0, _traverse2.default)(rootSchema).forEach(function parseEnum(schema, context) {
		// const isEnum = (schema.type === 'string' || schema.type === 'boolean') && isArray(schema.enum);
		const isEnum = schema.type === 'string' && (0, _lodash.isArray)(schema.enum);
		const isCached = schema.$$type;
		if (isEnum && !isCached) {
			const schemaId = Symbol(TYPE_SCHEMA_SYMBOL_LABEL);
			schema.$$type = schemaId;
			const enumValues = schema.enum;
			typesCache[schemaId] = new _graphql.GraphQLEnumType({
				name: extractTypeName(context),
				values: enumValues.reduce((acc, enumValue) => {
					return Object.assign({}, acc, { [enumValue]: { value: enumValue } });
				}, [])
			});
		}
	});
};

const parseInterfaces = ({ schema: rootSchema, types: typesCache }) => {
	(0, _traverse2.default)(rootSchema).forEach(function parseInterface(schema, context) {
		const isInterface = context.parent && context.parent.key === 'allOf' && schema.type === 'object' && (0, _lodash.isString)(schema.title);
		const isCached = schema.$$type;
		if (isInterface && !isCached) {
			checkObjectSchemaForUnsupportedFeatures(schema);
			const schemaId = Symbol(TYPE_SCHEMA_SYMBOL_LABEL);
			schema.$$type = schemaId;
			const properties = schema.properties;
			typesCache[schemaId] = new _graphql.GraphQLInterfaceType({
				name: extractTypeName(context),
				fields: () => Object.keys(properties).reduce((acc, propertyName) => {
					const propertySchema = properties[propertyName];
					let type = scalarTypeFromSchema(propertySchema);
					if (!type) {
						type = typesCache[propertySchema.$$type];
					}
					const propertyDescriptor = {
						type
					};
					return Object.assign({}, acc, { [propertyName]: propertyDescriptor });
				}, {})
			});
		}
	});
};

const parseObjectTypes = ({ schema: rootSchema, apiDefinition, operations, types: typesCache, createResolver }) => {
	(0, _traverse2.default)(rootSchema).forEach(function parseObjectType(schema, context) {
		const isObjectWithProperties = schema.type === 'object' && !!schema.properties;
		const isPlainType = (!context.parent || context.parent.key !== 'allOf') && (isObjectWithProperties || (0, _lodash.isArray)(schema.allOf));
		const isCached = schema.$$type;
		if (isPlainType && !isCached) {
			checkObjectSchemaForUnsupportedFeatures(schema);
			const schemaId = Symbol(TYPE_SCHEMA_SYMBOL_LABEL);
			schema.$$type = schemaId;

			var _mergeAllOf = mergeAllOf(schema);

			const properties = _mergeAllOf.properties,
			      links = _mergeAllOf.links,
			      required = _mergeAllOf.required;

			const name = extractTypeName(context);
			typesCache[schemaId] = new _graphql.GraphQLObjectType({
				name,
				interfaces: () => {
					return (schema.allOf || []).reduce((acc, partialSchema) => {
						const possibleInterface = typesCache[partialSchema.$$type];
						if (possibleInterface && possibleInterface.hasOwnProperty('resolveType')) {
							// detect interface
							// console.log('INTERFACE', Object.keys(possibleInterface));
							return [...acc, possibleInterface];
						}
						return acc;
					}, []);
				},
				isTypeOf: value => {
					if ((0, _lodash.isObject)(value) && value.typeName) {
						return value.typeName === name;
					}
					return true;
				},
				fields: () => Object.keys(properties).reduce((acc, propertyName) => {
					const propertySchema = properties[propertyName];
					let type = scalarTypeFromSchema(propertySchema);
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
					const operation = (0, _lodash.get)(operations, (0, _lodash.get)(links, propertyName));
					let resolve;
					let args;
					if (operation) {
						const schemaResolve = createResolver({ apiDefinition, propertyName, operation });
						resolve = (root, args, context, info) => {
							let resolvedValue = (0, _lodash.get)(root, propertyName);
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
						args = operation.parameters.reduce((acc, parameter) => {
							const paramName = parameter.name,
							      required = parameter.required,
							      paramIn = parameter['in'],
							      parameterType = parameter.type,
							      parameterFormat = parameter.format,
							      argPath = parameter['x-argPath'],
							      paramSchema = parameter.schema;

							if (!argPath) {
								// this is a root operation or resolution path is not defined => parameter is required
								let type;
								if (parameterType) {
									type = scalarTypeFromSchema({ type: parameterType, format: parameterFormat });
								}
								if ((paramIn === 'body' || paramIn === 'formData') && paramSchema) {
									type = typesCache[paramSchema.$$inputType];
								}
								if (!type) {
									type = _graphql.GraphQLString;
								}
								if ((required || paramIn === 'path') && parameterType !== 'file') {
									type = makeTypeRequired(type);
								}
								return Object.assign({}, acc, {
									[paramName]: { type }
								});
							}
							return acc;
						}, {});
					}
					const propertyDescriptor = {
						type,
						args,
						resolve
					};
					return Object.assign({}, acc, { [propertyName]: propertyDescriptor });
				}, {})
			});
		}
	});
};

const constructInputType = ({ schema, typeName: inputTypeName, typesCache, isNestedUnderEntity = false }) => {
	checkObjectSchemaForUnsupportedFeatures(schema);
	const inputSchemaId = Symbol(TYPE_SCHEMA_SYMBOL_LABEL);
	schema.$$inputType = inputSchemaId;

	let inputType = scalarTypeFromSchema(schema);
	if (isIdSchema(schema)) {
		inputType = (0, _graphql.getNullableType)(inputType);
	}
	if (schema.$$type && isEnum(typesCache[schema.$$type])) {
		return typesCache[schema.$$type];
	}
	if (schema.type === 'array') {
		return new _graphql.GraphQLList(constructInputType({
			schema: schema.items,
			typesCache,
			isNestedUnderEntity: isNestedUnderEntity,
			typeName: inputTypeName
		}));
	}
	if (!inputType) {
		schema[IS_IN_INPUT_TYPE_CHAIN_SYMBOL] = true;

		var _mergeAllOf2 = mergeAllOf(schema);

		const properties = _mergeAllOf2.properties,
		      required = _mergeAllOf2.required;


		const hasID = Object.keys(properties).reduce((acc, pn) => acc || isIdSchema(properties[pn]), false);
		// const requireOnlyIdInput = hasID && isNestedUnderEntity;
		let typeName = `${inputTypeName}Input`;
		inputType = new _graphql.GraphQLInputObjectType({
			name: typeName,
			fields: Object.keys(properties)
			// .filter((k) => requireOnlyIdInput ? isIdSchema(properties[k]) : !properties[k].readOnly)
			.filter(k => !properties[k].readOnly && !properties[k][IS_IN_INPUT_TYPE_CHAIN_SYMBOL]).reduce((acc, propertyName) => {
				const propertySchema = properties[propertyName];
				let type = constructInputType({
					schema: propertySchema,
					typesCache,
					isNestedUnderEntity: isNestedUnderEntity || hasID,
					typeName: `${inputTypeName}_${propertyName}`
				});
				// TODO all input fields are optional for now
				// if (includes(required, propertyName)) {
				// 	type = makeTypeRequired(type);
				// }
				const propertyDescriptor = {
					type
				};
				return Object.assign({}, acc, { [propertyName]: propertyDescriptor });
			}, {})
		});
		schema[IS_IN_INPUT_TYPE_CHAIN_SYMBOL] = false;
		typesCache[inputSchemaId] = inputType;
	}
	return inputType;
};
const parseRootInputTypes = ({ schema: rootSchema, types: typesCache }) => {
	(0, _traverse2.default)(rootSchema).forEach(function parseRootInputType(schema, context) {
		const isRootInputType = context.key === 'schema' && context.parent.node.in === 'body' && context.parent.node.name;
		const isCachedRootInputType = schema.$$rootInputType;
		if (isRootInputType && !isCachedRootInputType) {
			schema.$$rootInputType = Symbol(TYPE_SCHEMA_SYMBOL_LABEL);
			constructInputType({
				schema,
				typesCache,
				typeName: schema.title || `Mutation_${context.parent.parent.parent.node.operationId}`
			});
		}
	});
};

const parseUnions = ({ schema: rootSchema, types: typesCache }) => {
	(0, _traverse2.default)(rootSchema).forEach(function parseUnion(schema, context) {
		const isUnion = schema && (0, _lodash.isArray)(schema.anyOf);
		const isCached = schema && schema.$$type;
		if (isUnion && !isCached) {
			const schemaId = Symbol(TYPE_SCHEMA_SYMBOL_LABEL);
			schema.$$type = schemaId;
			typesCache[schemaId] = new _graphql.GraphQLUnionType({
				name: extractTypeName(context),
				types: () => {
					return schema.anyOf.map(subSchema => {
						return typesCache[subSchema.$$type];
					});
				},
				resolveType: value => {
					if (value.typeName) {
						return value.typeName;
					}
				}
			});
		}
	});
};

const parseLists = ({ schema: rootSchema, types: typesCache }) => {
	(0, _traverse2.default)(rootSchema).forEach(function parseList(schema) {
		const isList = schema && schema.type === 'array' && schema.items;
		const isCached = schema && schema.$$type;
		if (isList && !isCached) {
			const schemaId = Symbol(TYPE_SCHEMA_SYMBOL_LABEL);
			schema.$$type = schemaId;
			let innerType = scalarTypeFromSchema(schema.items);
			if (!innerType) {
				innerType = typesCache[schema.items.$$type];
			}
			if (!innerType) {
				throw new Error(`No graphql type found for schema\n\n${JSON.stringify(schema.items, null, 2)}`);
			}
			typesCache[schemaId] = new _graphql.GraphQLList(innerType);
		}
	});
};

const swaggerToSchema = ({ swagger: { paths }, swagger, createResolver } = {}) => {
	const queriesDescriptions = (0, _findQueriesDescriptions2.default)(paths);
	const mutationsDescriptions = (0, _findMutationsDescriptions2.default)(paths);
	const operations = Object.assign({}, queriesDescriptions, mutationsDescriptions);

	const completeSchema = Object.assign({}, swagger, {
		definitions: Object.assign({}, swagger.definitions || {}, {
			Query: {
				title: 'Query',
				type: 'object',
				description: 'query root type',
				properties: (0, _lodash.mapValues)(queriesDescriptions, ({ schema }) => schema),
				'x-links': (0, _lodash.mapValues)(queriesDescriptions, (_, linkName) => linkName)
			},
			Mutation: {
				title: 'Mutation',
				type: 'object',
				description: 'mutation root type',
				properties: (0, _lodash.mapValues)(mutationsDescriptions, ({ schema }) => schema),
				'x-links': (0, _lodash.mapValues)(mutationsDescriptions, (_, linkName) => linkName)
			}
		})
	});

	const types = {};

	[completeSchema.definitions.Query, completeSchema.definitions.Mutation, completeSchema].forEach(schema => {
		parseEnums({ schema, types });
		parseInterfaces({ schema, types });
		parseObjectTypes({ schema, operations, apiDefinition: completeSchema, types, createResolver });
		parseUnions({ schema, types });
		parseLists({ schema, types });
		parseRootInputTypes({ schema, types });
	});

	const typesList = Object.getOwnPropertySymbols(types).map(s => types[s]);

	return new _graphql.GraphQLSchema({
		types: typesList,
		query: types[completeSchema.definitions.Query.$$type],
		mutation: types[completeSchema.definitions.Mutation.$$type]
	});
};

exports.default = swaggerToSchema;