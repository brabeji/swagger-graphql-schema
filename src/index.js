import { get as g, reduce, mapValues, isArray } from 'lodash';
import invariant from 'invariant';
import axios from 'axios';
import UriTemplate from 'uri-templates';

import {
	GraphQLSchema,
	GraphQLObjectType,
	GraphQLInt,
	GraphQLString,
	GraphQLBoolean,
	GraphQLList,
	GraphQLID,
	GraphQLNonNull,
} from 'graphql';


export const findQueriesDescriptions = (paths) => {
	return reduce(
		paths,
		(acc, pathMethods, path) => {
			return {
				...acc,
				...reduce(
					pathMethods,
					(acc, operation, method) => {
						const operationId = g(operation, 'operationId');
						const schema = g(
							operation,
							['responses', '200', 'schema'],
							g(
								operation,
								['responses', '201', 'schema'],
							)
						);
						if (operationId && schema && method.toLowerCase() === 'get') {
							return {
								...acc,
								[operationId]: {
									path,
									schema: schema.title ? schema : { ...schema, title: operationId },
									// schema,
									parameters: g(operation, 'parameters', []),
								},
							};
						}
						return acc;
					},
					{}
				),
			}
		},
		{}
	);
};

const scalartypeMap = {
	integer: GraphQLInt,
	string: GraphQLString,
	boolean: GraphQLBoolean,
};

const checkObjectSchemaForUnsupportedFeatures = (schema) => {
	if (g(schema, 'additionalProperties')) {
		invariant(false, 'Object schema for %s has unsupported feature "additionalProperties"', getSchemaJSON());
	}
};

const computeType = (schema, queriesDescriptions, swagger, typesBag, parentTypePath = '') => {
	// console.log('parentTypePath', parentTypePath, 'schema', g(schema, 'title'), schema);
	const valueType = g(schema, 'type', g(schema, 'anyOf', 'object'));
	if (isArray(valueType)) {
		console.log('shiz');
	} else {
		const description = g(schema, 'description');
		if (g(schema, 'format') === 'uniqueId') {
			return GraphQLID;
		}
		switch (valueType) {
			case 'array':
				const itemsSchema = g(schema, 'items');
				return new GraphQLList(computeType(itemsSchema, queriesDescriptions, swagger, typesBag, parentTypePath));
				break;
			case 'object':
				checkObjectSchemaForUnsupportedFeatures(schema);
				const schemaTitle = g(schema, 'title');
				if (typesBag[schemaTitle]) {
					return typesBag[schemaTitle];
				}
				const links = g(schema, 'x-links', {});
				const properties = g(schema, 'properties');
				const newType = new GraphQLObjectType(
					{
						name: schemaTitle || parentTypePath,
						description,
						fields: () => {
							return mapValues(
								properties,
								(propertySchema, propertyName) => {
									const operationId = g(links, propertyName);
									const queryDescriptor = g(queriesDescriptions, operationId);
									const newParentTypePath = schemaTitle ? `${schemaTitle}_${propertyName}` : `${parentTypePath ? `${parentTypePath}_${propertyName}` : ''}`;
									const isRootQuery = g(propertySchema, 'x-isRootQuery');
									const parameters = g(queryDescriptor, 'parameters');
									return {
										type: computeType(propertySchema, queriesDescriptions, swagger, typesBag, newParentTypePath),
										...(
											queryDescriptor ? {
												args: parameters.reduce(
													(acc, { name: paramName, required, ['in']: paramIn, schema: parameterSchema, ['x-argPath']: argPath }) => {
														if (isRootQuery || !argPath) {
															// this is a root query, all parameters are required

															let type = GraphQLString; // TODO proper types
															if (parameterSchema) {
																type = computeType(parameterSchema, queriesDescriptions, swagger, typesBag, newParentTypePath);
															}
															if (required || paramIn === 'path') {
																type = new GraphQLNonNull(type);
															}
															return {
																...acc,
																[paramName]: { type }
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
													const resourceUriTemplate = `http://${g(swagger, 'host')}${g(swagger, 'basePath')}${g(queryDescriptor, 'path')}`;
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
													return axios.get(resourceUri)
														.then(
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
								},
							);
						},
					}
				);
				typesBag[schemaTitle] = newType;
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

const swaggerToSchema = (swagger) => {
	const queriesDescriptions = findQueriesDescriptions(swagger.paths);

	const typeBag = {};

	const QueryType = computeType(
		{
			title: 'Query',
			type: 'object',
			description: 'query root type',
			properties: mapValues(
				queriesDescriptions,
				({ schema }) => ({ ...schema, 'x-isRootQuery': true }),
			),
			'x-links': mapValues(
				queriesDescriptions,
				(_, linkName) => linkName,
			)
		},
		queriesDescriptions,
		swagger,
		typeBag
	);

	const schema = new GraphQLSchema({
		query: QueryType,
	});
	return schema;
};

export default swaggerToSchema;
