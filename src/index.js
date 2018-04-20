import dereferenceLocalAbsoluteJsonPointers from './dereferenceLocalAbsoluteJsonPointers';

import {
	mapValues,
	get as g,
	includes,
	isString,
	isArray,
	isObject,
	filter,
	each,
	merge,
	find,
	first,
	cloneDeep,
} from 'lodash';
import {
	GraphQLSchema,
	getNullableType,
	GraphQLObjectType,
	GraphQLInputObjectType,
	GraphQLBoolean,
	GraphQLInterfaceType,
	GraphQLInt,
	GraphQLFloat,
	GraphQLString,
	GraphQLNonNull,
	GraphQLID,
	GraphQLList,
	GraphQLEnumType,
	GraphQLUnionType,
} from 'graphql';
// import {
// 	GraphQLDate,
// 	GraphQLTime,
// 	GraphQLDateTime,
// } from 'graphql-iso-date';
import GraphQLJSON from 'graphql-type-json';
import GraphQLUnionInputType from 'graphql-union-input-type';
// import {} from "graphql-tools-types" TODO constrained Int, Float, String...
import { GraphQLEmailAddress } from 'graphql-scalars'
import traverse from './traverse';
import findQueriesDescriptions from './findQueriesDescriptions';
import findMutationsDescriptions from './findMutationsDescriptions';
import invariant from 'invariant';
import { reduce } from 'lodash';

const SCALAR_TYPE_MAP = {
	integer: GraphQLInt,
	number: GraphQLFloat,
	string: GraphQLString,
	boolean: GraphQLBoolean,
	json: GraphQLJSON,
};
const SCALAR_FORMAT_FACTORY_MAP = {
	// date: () => GraphQLDate,
	// time: () => GraphQLTime,
	// 'date-time': () => GraphQLDateTime,
	email: () => GraphQLEmailAddress,
};

const ID_FORMATS = ['uuid', 'uniqueId'];

const TYPE_SCHEMA_SYMBOL_LABEL = 'swagger-graphql-schema type schema';
const IS_IN_INPUT_TYPE_CHAIN_SYMBOL = Symbol('swagger-graphql-schema input type chain');

const mergeAllOf = (schema) => {
	const partialSchemas = schema.allOf || [schema];

	const properties = partialSchemas.reduce(
		(acc, partialSchema) => ({ ...acc, ...(partialSchema.properties || {}) }),
		{},
	);
	const links = partialSchemas.reduce(
		(acc, partialSchema) => ({ ...acc, ...(partialSchema['x-links'] || {}) }),
		{},
	);
	const required = partialSchemas.reduce(
		(acc, partialSchema) => ([...acc, ...(partialSchema.required || [])]),
		[],
	);
	return {
		// ...schema,
		properties,
		links,
		required,
	}
};

const makeTypeRequired = (type) => type === getNullableType(type) ? new GraphQLNonNull(type) : type;

const checkObjectSchemaForUnsupportedFeatures = (schema) => {
	if (g(schema, 'additionalProperties')) {
		invariant(false, 'Object schema for %s has unsupported feature "additionalProperties"', JSON.stringify(schema, null, 2));
	}
};

const extractTypeName = (nodeContext) => {
	// console.log('nodeContext.node', nodeContext.node.title);
	const schema = nodeContext.node;
	if (schema && isString(schema.title)) {
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

const isIdSchema = (schema) => {
	const valueFormat = g(schema, 'format');
	return includes(ID_FORMATS, valueFormat);
};
const isEnum = (type) => {
	return type.hasOwnProperty('_enumConfig');
};

const scalarTypeFromSchema = (schema, schemaName) => {
	if (g(schema, 'enum') && g(schema, 'type') === 'string') {
		return undefined;
	}
	const valueFormat = g(schema, 'format');
	if (isIdSchema(schema)) {
		return new GraphQLNonNull(GraphQLID);
	}
	let resultingType;
	if (valueFormat) {
		const factory = SCALAR_FORMAT_FACTORY_MAP[valueFormat];
		if (factory) {
			resultingType = factory(schema, schemaName);
		}
	}
	if (!resultingType) {
		let valueType = g(schema, 'type', 'object');
		if (isArray(valueType) && valueType.length === 2 && includes(valueType, 'null')) {
			valueType = first(filter(valueType, (v) => v !== 'null'));
		}
		if (valueType === 'object' && (!g(schema, 'properties') && !g(schema, 'allOf') && !g(schema, 'anyOf'))) {
			valueType = 'json';
		}
		resultingType = SCALAR_TYPE_MAP[valueType];
	}

	return resultingType;
};

const parseEnums = ({ schema: rootSchema, operations, types: typesCache }) => {
	traverse(rootSchema).forEach(
		function parseEnum(schema, context) {
			// const isEnum = (schema.type === 'string' || schema.type === 'boolean') && isArray(schema.enum);
			const isEnum = schema && (schema.type === 'string') && isArray(schema.enum);
			const isCached = schema && schema.$$type;
			if (isEnum && !isCached) {
				const schemaId = Symbol(TYPE_SCHEMA_SYMBOL_LABEL);
				schema.$$type = schemaId;
				const enumValues = schema.enum;
				const typeName = extractTypeName(context);
				typesCache[schemaId] = new GraphQLEnumType(
					{
						name: typeName,
						values: enumValues.reduce(
							(acc, enumValue) => {
								return ({ ...acc, [enumValue]: { value: enumValue } })
							},
							{},
						),
					}
				);
			}
		}
	);
};

const constructOperationArgsAndResolver = (apiDefinition, operations, links, propertyName, createResolver, typesCache, typeName) => {
	const operation = g(operations, g(links, propertyName));
	let resolve;
	let args;
	if (operation) {
		const schemaResolve = createResolver(
			{ apiDefinition, propertyName, operation }
		);
		resolve = (root, args, context, info) => {
			let resolvedValue = g(root, propertyName);
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
		args = operation.parameters.reduce(
			(acc, parameter) => {
				const {
					name: paramName,
					required,
					['in']: paramIn,
					type: parameterType,
					format: parameterFormat,
					['x-argPath']: argPath,
					schema: paramSchema,
				} = parameter;
				if ((!argPath || typeName === 'Query') && paramIn !== 'header') {
					// this is a root operation or resolution path is not defined => parameter is required
					let type;
					if (parameterType) {
						type = scalarTypeFromSchema(
							{ type: parameterType, format: parameterFormat }
						);
					}
					if ((paramIn === 'body' || paramIn === 'formData') && paramSchema) {
						type = typesCache[paramSchema.$$inputType];
					}
					if (!type) {
						type = GraphQLString;
					}
					if ((required || paramIn === 'path') && parameterType !== 'file') {
						type = makeTypeRequired(type);
					}
					return {
						...acc,
						[paramName]: { type },
					}
				}
				return acc;
			},
			{}
		)
	}
	return { args, resolve };
};

const parseInterfaces = ({ schema: rootSchema, apiDefinition, operations, types: typesCache, createResolver }) => {
	traverse(rootSchema).forEach(
		function parseInterface(schema, context) {
			const isInterface = context.parent && context.parent.key === 'allOf' && schema.type === 'object' && isString(schema.title);
			const isCached = schema && schema.$$type;
			if (isInterface && !isCached) {
				checkObjectSchemaForUnsupportedFeatures(schema);
				const schemaId = Symbol(TYPE_SCHEMA_SYMBOL_LABEL);
				schema.$$type = schemaId;
				const { properties, ['x-links']: links, required } = schema;
				const name = extractTypeName(context);
				typesCache[schemaId] = new GraphQLInterfaceType(
					{
						name,
						fields: () => Object.keys(properties).reduce(
							(acc, propertyName) => {
								const propertySchema = properties[propertyName];
								let type = scalarTypeFromSchema(propertySchema);
								if (!type) {
									type = typesCache[propertySchema.$$type];
								}
								if (includes(required, propertyName)) {
									try {
										type = makeTypeRequired(type);
									} catch (error) {
										console.log(type, propertyName, propertySchema);
									}
								}
								const { args, resolve } = constructOperationArgsAndResolver(
									apiDefinition,
									operations,
									links,
									propertyName,
									createResolver,
									typesCache,
									name,
								);
								const propertyDescriptor = {
									type,
									args,
									resolve,
								};
								return { ...acc, [propertyName]: propertyDescriptor };
							},
							{},
						),
					}
				);
			}
		},
	);
};

const parseObjectTypes = ({ schema: rootSchema, apiDefinition, operations, types: typesCache, createResolver, discriminatorFieldName }) => {
	traverse(rootSchema).forEach(
		function parseObjectType(schema, context) {
			const isObjectWithProperties = schema && schema.type === 'object' && !!schema.properties;
			const isPlainType = schema && (!context.parent || context.parent.key !== 'allOf') && (isObjectWithProperties || isArray(schema.allOf));
			const isCached = schema && schema.$$type;
			if (isPlainType && !isCached) {
				checkObjectSchemaForUnsupportedFeatures(schema);
				const schemaId = Symbol(TYPE_SCHEMA_SYMBOL_LABEL);
				schema.$$type = schemaId;
				const { properties, links, required } = mergeAllOf(schema);
				const name = extractTypeName(context);
				typesCache[schemaId] = new GraphQLObjectType(
					{
						name,
						interfaces: () => {
							return (schema.allOf || []).reduce(
								(acc, partialSchema) => {
									const possibleInterface = typesCache[partialSchema.$$type];
									if (possibleInterface && possibleInterface.hasOwnProperty('resolveType')) { // detect interface
										// console.log('INTERFACE', Object.keys(possibleInterface));
										return [...acc, possibleInterface];
									}
									return acc;
								},
								[],
							);
						},
						isTypeOf: (value) => {
							if (isObject(value) && value[discriminatorFieldName]) {
								return value[discriminatorFieldName] === name;
							}
							return true;
						},
						fields: () => Object.keys(properties).filter(propertyName => propertyName !== discriminatorFieldName).reduce(
							(acc, propertyName) => {
								const propertySchema = properties[propertyName];
								let type = scalarTypeFromSchema(propertySchema);
								if (!type) {
									type = typesCache[propertySchema.$$type];
								}
								if (includes(required, propertyName)) {
									try {
										type = makeTypeRequired(type);
									} catch (error) {
										console.log(type, propertyName, propertySchema);
									}
								}
								const { args, resolve } = constructOperationArgsAndResolver(
									apiDefinition,
									operations,
									links,
									propertyName,
									createResolver,
									typesCache,
									name,
								);
								const propertyDescriptor = {
									type,
									args,
									resolve,
								};
								return { ...acc, [propertyName]: propertyDescriptor };
							},
							{},
						),
					}
				);
			}
		},
	);
};

const parseInputObjectTypes = ({ schema: rootSchema, apiDefinition, operations, types: typesCache, createResolver, discriminatorFieldName }) => {
	traverse(rootSchema).forEach(
		function parseObjectType(schema, context) {
			const isObjectWithProperties = schema && schema.type === 'object' && !!schema.properties;
			const isPlainType = schema && (!context.parent || context.parent.key !== 'allOf') && (isObjectWithProperties || isArray(schema.allOf));
			const isCached = schema && schema.$$inputType;
			const baseName = extractTypeName(context);
			const name = `${baseName}Input`;
			if (isPlainType && !isCached) {
				checkObjectSchemaForUnsupportedFeatures(schema);
				const schemaId = Symbol(TYPE_SCHEMA_SYMBOL_LABEL);
				schema.$$inputType = schemaId;
				const {
					properties: { [discriminatorFieldName]: typeNameProperty, ...properties },
					// required,
				} = mergeAllOf(schema);
				const updatedProperties = {
					[discriminatorFieldName]: {
						...typeNameProperty,
						readOnly: false,
					},
					...properties,
				};
				typesCache[schemaId] = new GraphQLInputObjectType(
					{
						name,
						fields: () => Object
							.keys(updatedProperties)
							.filter((propertyName) => !updatedProperties[propertyName].readOnly)
							.reduce(
								(acc, propertyName) => {
									const propertySchema = updatedProperties[propertyName];

									let type = scalarTypeFromSchema(propertySchema);
									if (!type) {
										type = typesCache[propertySchema.$$inputType];
									}
									if (!type) {
										type = typesCache[propertySchema.$$type];
									}
									if (!type && propertyName === discriminatorFieldName) {
										type = new GraphQLEnumType(
											{
												name: `${baseName}_${discriminatorFieldName}`,
												values: { [baseName]: { value: baseName } },
											}
										);
									}
									// if (includes(required, propertyName)) {
									// 	type = makeTypeRequired(type);
									// }
									const propertyDescriptor = {
										type: getNullableType(type),
									};
									return { ...acc, [propertyName]: propertyDescriptor };
								},
								{},
							),
					}
				);
			}
		},
	);
};

const constructInputType = ({ schema, typeName: inputTypeName, typesCache, isNestedUnderEntity = false, discriminatorFieldName }) => {
	checkObjectSchemaForUnsupportedFeatures(schema);

	let inputType = scalarTypeFromSchema(schema);
	if (isIdSchema(schema)) {
		inputType = getNullableType(inputType);
	}
	if (schema.$$type && isEnum(typesCache[schema.$$type])) {
		return typesCache[schema.$$type];
	}
	if (schema.type === 'array') {
		return new GraphQLList(
			constructInputType(
				{
					schema: schema.items,
					typesCache,
					isNestedUnderEntity: isNestedUnderEntity,
					typeName: inputTypeName,
				},
			)
		);
	}
	let typeName = `${inputTypeName}Input`;

	if (isArray(schema.anyOf)) {
		inputType = new GraphQLUnionInputType(
			{
				name: typeName,
				inputTypes: reduce(
					schema.anyOf,
					(acc, unionPartSchema) => {
						return {
							...acc,
							[unionPartSchema.title]: constructInputType({
								schema: unionPartSchema,
								typesCache,
								isNestedUnderEntity: isNestedUnderEntity,
								typeName: inputTypeName,
							}),
						};
					}
				),
				typeKey: discriminatorFieldName,
			}
		)
	}

	if (!inputType) {
		schema[IS_IN_INPUT_TYPE_CHAIN_SYMBOL] = true;
		const { properties, required } = mergeAllOf(schema);

		const hasID = Object.keys(properties).reduce((acc, pn) => acc || isIdSchema(properties[pn]), false);
		// const requireOnlyIdInput = hasID && isNestedUnderEntity;

		inputType = new GraphQLInputObjectType(
			{
				name: typeName,
				fields: Object
					.keys(properties)
					// .filter((k) => requireOnlyIdInput ? isIdSchema(properties[k]) : !properties[k].readOnly)
					.filter((k) => !properties[k].readOnly && !properties[k][IS_IN_INPUT_TYPE_CHAIN_SYMBOL])
					.reduce(
						(acc, propertyName) => {
							const propertySchema = properties[propertyName];
							let type = constructInputType(
								{
									schema: propertySchema,
									typesCache,
									isNestedUnderEntity: isNestedUnderEntity || hasID,
									typeName: `${inputTypeName}_${propertyName}`,
								},
							);
							// TODO all input fields are optional for now
							// if (includes(required, propertyName)) {
							// 	type = makeTypeRequired(type);
							// }
							const propertyDescriptor = {
								type,
							};
							return { ...acc, [propertyName]: propertyDescriptor };
						},
						{},
					),
			},
		);
		schema[IS_IN_INPUT_TYPE_CHAIN_SYMBOL] = false;
	}
	return inputType;
};
const parseRootInputTypes = ({ schema: rootSchema, types: typesCache, discriminatorFieldName }) => {
	traverse(rootSchema).forEach(
		function parseRootInputType(schema, context) {
			const isRootInputType = context.key === 'schema' && context.parent.node.in === 'body' && context.parent.node.name;
			const isCachedRootInputType = schema.$$rootInputType;
			if (isRootInputType && !isCachedRootInputType) {
				schema.$$rootInputType = Symbol(TYPE_SCHEMA_SYMBOL_LABEL);
				const typeName = schema.title || `Mutation_${context.parent.parent.parent.node.operationId}`;
				typesCache[schema.$$rootInputType] = constructInputType({
					schema,
					typesCache,
					typeName,
					discriminatorFieldName,
				});
			}
		},
	);
};

const parseUnions = ({ schema: rootSchema, types: typesCache, discriminatorFieldName }) => {
	traverse(rootSchema).forEach(
		function parseUnion(schema, context) {
			const isUnion = schema && isArray(schema.anyOf);
			const isCached = schema && schema.$$type;
			if (isUnion && !isCached) {
				const schemaId = Symbol(TYPE_SCHEMA_SYMBOL_LABEL);
				schema.$$type = schemaId;
				typesCache[schemaId] = new GraphQLUnionType(
					{
						name: extractTypeName(context),
						types: () => {
							return schema.anyOf.map(
								(subSchema) => {
									return typesCache[subSchema.$$type];
								}
							)
						},
						resolveType: (value) => {
							if (value[discriminatorFieldName]) {
								return value[discriminatorFieldName];
							}
						},
					}
				);
			}
		},
	);
};

const parseInputUnions = ({ schema: rootSchema, types: typesCache, discriminatorFieldName }) => {
	traverse(rootSchema).forEach(
		function parseUnion(schema, context) {
			const isUnion = schema && isArray(schema.anyOf);
			const isCached = schema && schema.$$inputType;
			if (isUnion && !isCached) {
				const schemaId = Symbol(TYPE_SCHEMA_SYMBOL_LABEL);
				schema.$$inputType = schemaId;

				typesCache[schemaId] = new GraphQLUnionInputType(
					{
						name: `${extractTypeName(context)}Input`,
						inputTypes: reduce(schema.anyOf, (acc, subSchema) => {
							return {
								...acc,
								[subSchema.title]: typesCache[subSchema.$$inputType],
							};
						}, {}),
						typeKey: discriminatorFieldName,
					}
				);
			}
		},
	);
};

const parseLists = ({ schema: rootSchema, types: typesCache }) => {
	traverse(rootSchema).forEach(
		function parseList(schema) {
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
				typesCache[schemaId] = new GraphQLList(innerType);
			}
		},
	);
};

const parseInputLists = ({ schema: rootSchema, types: typesCache }) => {
	traverse(rootSchema).forEach(
		function parseList(schema) {
			const isList = schema && schema.type === 'array' && schema.items;
			const isCached = schema && schema.$$inputType;
			if (isList && !isCached) {
				const schemaId = Symbol(TYPE_SCHEMA_SYMBOL_LABEL);
				schema.$$inputType = schemaId;
				let innerType = scalarTypeFromSchema(schema.items);
				if (!innerType) {
					innerType = typesCache[schema.items.$$inputType];
				}
				if (!innerType) {
					innerType = typesCache[schema.items.$$type]; // FIXME this branch is effectively only for enums
				}
				if (!innerType) {
					throw new Error(`No graphql type found for schema\n\n${JSON.stringify(schema.items, null, 2)}`);
				}
				typesCache[schemaId] = new GraphQLList(innerType);
			}
		},
	);
};

const swaggerToSchema = ({ swagger: { paths }, swagger, createResolver, discriminatorFieldName = 'typeName' } = {}) => {
	const queriesDescriptions = findQueriesDescriptions(paths);
	const mutationsDescriptions = findMutationsDescriptions(paths);
	const operations = { ...queriesDescriptions, ...mutationsDescriptions };

	const completeSchema = {
		...swagger,
		definitions: {
			...(swagger.definitions || {}),
			Query: {
				title: 'Query',
				type: 'object',
				description: 'query root type',
				properties: mapValues(
					queriesDescriptions,
					({ schema }) => schema,
				),
				'x-links': mapValues(
					queriesDescriptions,
					(_, linkName) => linkName,
				),
			},
			Mutation: {
				title: 'Mutation',
				type: 'object',
				description: 'mutation root type',
				properties: mapValues(
					mutationsDescriptions,
					({ schema }) => schema,
				),
				'x-links': mapValues(
					mutationsDescriptions,
					(_, linkName) => linkName,
				),
			},
		},
	};

	const types = {};

	[
		completeSchema.definitions.Query,
		completeSchema.definitions.Mutation,
		completeSchema,
	].forEach(
		(schema) => {
			parseEnums({ schema, types });
			parseInterfaces(
				{
					schema,
					operations,
					apiDefinition: completeSchema,
					types,
					createResolver,
				}
			);
		},
	);

	[
		completeSchema.paths,
	].forEach(
		(schema) => {
			parseInputObjectTypes({ schema, types, discriminatorFieldName });
			parseInputUnions({ schema, types, discriminatorFieldName });
			parseInputLists({ schema, types, discriminatorFieldName });
		},
	);

	[
		completeSchema.definitions.Query,
		completeSchema.definitions.Mutation,
		completeSchema,
	].forEach(
		(schema) => {
			parseObjectTypes(
				{
					schema,
					operations,
					apiDefinition: completeSchema,
					types,
					createResolver,
					discriminatorFieldName
				}
			);
			parseUnions({ schema, types, discriminatorFieldName });
			parseLists({ schema, types });
			// parseRootInputTypes({ schema, types, discriminatorFieldName });
		},
	);

	const typesList = Object.getOwnPropertySymbols(types).map(s => types[s]);

	return new GraphQLSchema(
		{
			types: typesList,
			query: types[completeSchema.definitions.Query.$$type],
			mutation: types[completeSchema.definitions.Mutation.$$type],
		}
	);
};

export default swaggerToSchema;

export { dereferenceLocalAbsoluteJsonPointers };
