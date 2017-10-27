import { get as g, reduce, mapValues, isArray, find, merge, first, endsWith } from 'lodash';
import invariant from 'invariant';
import traverse from 'traverse';
import axios from 'axios';
import UriTemplate from 'uri-templates';
import findQueriesDescriptions from './findQueriesDescriptions';
import findMutationsDescriptions from './findMutationsDescriptions';

import {
	GraphQLSchema,
	GraphQLObjectType,
	GraphQLInputObjectType,
	GraphQLInt,
	GraphQLFloat,
	GraphQLString,
	GraphQLBoolean,
	GraphQLList,
	GraphQLID,
	GraphQLNonNull,
	GraphQLUnionType,
	GraphQLInterfaceType,
} from 'graphql';

const scalartypeMap = {
	integer: GraphQLInt,
	number: GraphQLFloat,
	string: GraphQLString,
	boolean: GraphQLBoolean,
};

const checkObjectSchemaForUnsupportedFeatures = (schema) => {
	if (g(schema, 'additionalProperties')) {
		invariant(false, 'Object schema for %s has unsupported feature "additionalProperties"', JSON.stringify(schema, null, 2));
	}
};

const findChildSchemas = (schema, swagger) => {
	let acc = [];
	traverse(swagger).forEach(
		function (schemaNode) {
			// if (schemaNode === schema) doesn't work due to bug in ref parser
			// for now assume its the same schema like this
			if (schemaNode.title === schema.title) {
				if (this.parent.key === 'allOf') {
					acc = [...acc, this.parent.parent.node];
				}
			}
		},
	);
	return acc;
};

const computeType = (inputSchema, operationsDescriptions, swagger, typesBag, parentTypePath = '') => {
	// console.log('parentTypePath', parentTypePath, 'schema', g(schema, 'title'), schema);
	const allOf = g(inputSchema, 'allOf');
	const schema = inputSchema;
	const valueType = g(schema, 'type', 'object');
	const isInput = g(schema, 'x-isInput', false);

	if (isArray(valueType)) {
		throw new Error('not implemented yet');
	} else {
		const description = g(schema, 'description');
		if (g(schema, 'format') === 'uniqueId') {
			return GraphQLID;
		}
		switch (valueType) {
			case 'array':
				const itemsSchema = g(schema, 'items');

				return new GraphQLList(computeType({
					...itemsSchema,
					...(isInput ? { 'x-isInput': true }: {}),
				}, operationsDescriptions, swagger, typesBag, parentTypePath));
				break;
			case 'object':
				checkObjectSchemaForUnsupportedFeatures(schema);
				const schemaTitle = g(schema, 'title');
				let typeName = schemaTitle || parentTypePath;
				typeName = isInput && !endsWith(typeName, 'Input') ? `${typeName}Input` : typeName;

				if (typesBag[typeName]) {
					return typesBag[typeName];
				}

				const links = g(schema, 'x-links', {});
				let properties = g(schema, 'properties');
				// let hasInterfaces = false;
				const discriminator = g(schema, 'discriminator');
				const isInterface = !!discriminator;
				let TypeConstructor = !isInterface ? GraphQLObjectType : GraphQLInterfaceType;
				if (isInput) {
					TypeConstructor = GraphQLInputObjectType;
				}
				let additionalConfig = {};
				if (isInterface) {
					const discriminatorPropertyName = g(discriminator, 'propertyName');
					additionalConfig = {
						resolveType: (value) => {
							return g(typesBag, g(value, discriminatorPropertyName));
						},
					}
				}

				// find implemented interfaces
				let getInterfaces = () => [];
				if (allOf) {
					properties = allOf.reduce((acc, partialSchema) => ({ ...acc, ...g(partialSchema, 'properties', {}) }), {});
					getInterfaces = function () {
						return allOf.reduce(
							(acc, partialSchema) => {
								const isInterface = !!g(partialSchema, 'discriminator');
								if (!isInterface) {
									return acc;
								}
								return [
									...acc,
									computeType(partialSchema, operationsDescriptions, swagger, typesBag),
								];
							},
							[],
						);
					}
				}
				const newType = new TypeConstructor(
					{
						name: typeName,
						description,
						interfaces: getInterfaces,
						...additionalConfig,
						fields: () => {
							return reduce(
								properties,
								(acc, propertySchema, propertyName) => {
									const operationId = g(links, propertyName);
									const operationDescriptor = g(operationsDescriptions, operationId);
									const newParentTypePath = schemaTitle ? `${schemaTitle}_${propertyName}` : `${parentTypePath ? `${parentTypePath}_${propertyName}` : ''}`;
									const isRootQuery = g(propertySchema, 'x-isRootOperation');
									const isReadOnly = !isRootQuery && g(propertySchema, 'x-readOnly');
									const parameters = g(operationDescriptor, 'parameters');

									if (isReadOnly && isInput) {
										return acc;
									}

									return {
										...acc,
										[propertyName]: {
											type: computeType({
												...propertySchema,
												...(isInput ? { 'x-isInput': true }: {}),
											}, operationsDescriptions, swagger, typesBag, newParentTypePath),
											...(
												operationDescriptor ? {
													args: parameters.reduce(
														(acc, parameter) => {
															const {
																name: paramName,
																required,
																['in']: paramIn,
																type: parameterType,
																['x-argPath']: argPath,
																schema: paramSchema,
															} = parameter;
															if (isRootQuery || !argPath) {
																// this is a root operation or resolution path is not defined => parameter is required
																let type = GraphQLString; // TODO proper types
																if (parameterType) {
																	type = computeType({ type: parameterType }, operationsDescriptions, swagger, typesBag, newParentTypePath);
																}
																if (paramIn === 'body' && paramSchema) {
																	type = computeType({
																		...paramSchema,
																		['x-isInput']: true
																	}, operationsDescriptions, swagger, typesBag, newParentTypePath);
																}
																if (required || paramIn === 'path') {
																	type = new GraphQLNonNull(type);
																}
																return {
																	...acc,
																	[paramName]: { type },
																}
															}
															return acc;
														},
														{}
													),
													resolve: (root, args, context, info) => {
														// yay, make request!
														const fieldValue = g(root, propertyName);
														if (fieldValue) {
															return fieldValue;
														}
														const scheme = first(g(swagger, 'schemes', ['http']));
														const resourceUriTemplate = `${scheme}://${g(swagger, 'host')}${g(swagger, 'basePath')}${g(operationDescriptor, 'path')}`;
														// TODO translate params
														const argsValues = { root, ...args };
														const parametersValues = parameters.reduce(
															(acc, { name: paramName, ['x-argPath']: argPath, ['in']: paramIn }) => {
																const value = g(argsValues, argPath || paramName);
																if (value && paramIn === 'query') {
																	return {
																		...acc,
																		queryParams: {
																			...acc.queryParams,
																			[paramName]: value
																		}
																	};
																} else if (value && paramIn === 'path') {
																	return {
																		...acc,
																		pathParams: {
																			...acc.pathParams,
																			[paramName]: value
																		}
																	};
																}
																return acc;
															},
															{
																pathParams: {},
																queryParams: {},
															},
														);
														const template = new UriTemplate(`${resourceUriTemplate}{?queryParams*}`);
														const resourceUri = template.fill(
															{
																...parametersValues.pathParams,
																queryParams: parametersValues.queryParams,
															}
														);
														const method = g(operationDescriptor, 'operationMethod', 'get');
														let callArguments = [resourceUri, context.http];
														const bodyParameter = find(parameters, { ['in']: 'body' });
														if (bodyParameter) {
															callArguments = [callArguments[0], args[bodyParameter.name], callArguments[1]];
														}
														return axios[method](...callArguments).then(
															(response) => response.data
														).catch(
															(error) => {
																console.log(`Resolver error for GET "${resourceUri}"`);
																throw error;
															}
														)
													}
												} : {}
											),
										}
									}
								}, {}
							);
						},
					}
				);
				typesBag[typeName] = newType;

				if (isInterface) {
					const childSchemas = findChildSchemas(schema, swagger);
					const childTypes = childSchemas.reduce(
						(acc, childSchema) => ({
							...acc,
							[g(childSchema, 'title')]: computeType(childSchema, operationsDescriptions, swagger, typesBag)
						}),
						{}
					);
				}

				return newType;
				break;
			default:
				const scalarType = scalartypeMap[valueType];
				if (scalarType) {
					return scalarType;
				}
				throw new Error(`Could not find type mapping for "${valueType}"`);
		}
	}
};

const gatherObjectTypes = (schema, queriesDescriptions, swagger, typesBag) => {
	traverse(schema).forEach(
		(node) => {
			const title = g(node, 'title');
			const hasTitle = !!title;
			const hasProperties = g(node, 'properties');
			const hasAllOf = g(node, 'allOf');
			const isObjectType = hasTitle && (hasProperties || hasAllOf);
			if (isObjectType) {
				typesBag[title] = computeType(node, queriesDescriptions, swagger, typesBag);
			}
		},
	)
};

const swaggerToSchema = (swagger) => {
	const queriesDescriptions = findQueriesDescriptions(swagger.paths);
	const mutationsDescriptions = findMutationsDescriptions(swagger.paths);

	// console.log('mutationsDescriptions', mutationsDescriptions);
	// debugger;

	const typesBag = {};

	const querySchema = {
		title: 'Query',
		type: 'object',
		description: 'query root type',
		properties: mapValues(
			queriesDescriptions,
			({ schema }) => ({ ...schema, 'x-isRootOperation': true }),
		),
		'x-links': mapValues(
			queriesDescriptions,
			(_, linkName) => linkName,
		)
	};
	gatherObjectTypes(querySchema, queriesDescriptions, swagger, typesBag);
	const QueryType = computeType(
		querySchema,
		queriesDescriptions,
		swagger,
		typesBag
	);

	const mutationSchema = {
		title: 'Mutation',
		type: 'object',
		description: 'mutation root type',
		properties: mapValues(
			mutationsDescriptions,
			({ schema }) => ({ ...schema, 'x-isRootOperation': true }),
		),
		'x-links': mapValues(
			mutationsDescriptions,
			(_, linkName) => linkName,
		)
	};
	gatherObjectTypes(mutationSchema, mutationsDescriptions, swagger, typesBag);
	const MutationType = computeType(
		mutationSchema,
		mutationsDescriptions,
		swagger,
		typesBag
	);

	// debugger;

	const schema = new GraphQLSchema({
		types: Object.values(typesBag),
		query: QueryType,
		mutation: MutationType,
	});

	return schema;
};

export default swaggerToSchema;
