import {
	get as g,
	reduce,
	mapValues,
	isArray,
	find,
	merge,
	first,
	endsWith,
	includes,
	filter,
	every,
	each,
	size,
} from 'lodash';
import invariant from 'invariant';
import traverse from 'traverse';
import axios from 'axios';
import UriTemplate from 'uri-templates';
import findQueriesDescriptions from './findQueriesDescriptions';
import findMutationsDescriptions from './findMutationsDescriptions';
import ApiError from './ApiError';

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


const FileInputType = new GraphQLInputObjectType({
	name: 'FileInput',
	fields: {
		name: {
			type: new GraphQLNonNull(GraphQLString),
		},
		type: {
			type: new GraphQLNonNull(GraphQLString),
		},
		size: {
			type: new GraphQLNonNull(GraphQLInt),
		},
		path: {
			type: new GraphQLNonNull(GraphQLString),
		},
	},
});

const scalartypeMap = {
	integer: GraphQLInt,
	number: GraphQLFloat,
	string: GraphQLString,
	boolean: GraphQLBoolean,
	file: FileInputType,
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
			if (schemaNode && schemaNode.title === schema.title) {
				if (this.parent.key === 'allOf') {
					acc = [...acc, this.parent.parent.node];
				}
			}
		},
	);
	return acc;
};

const areAllRequiredFormDataFieldsFilled = (parameters, args) => {
	const requiredFormDataFields = filter(parameters, { in: 'formData', required: true });
	return every(requiredFormDataFields, (field) => {
		return !!args[field.name];
	});
}

const computeType = (inputSchema, operationsDescriptions, swagger, idFormats, typesBag, parentTypePath = '') => {
	// console.log('parentTypePath', parentTypePath, 'schema', g(schema, 'title'), schema);
	const allOf = g(inputSchema, 'allOf');
	const schema = inputSchema;
	let valueType = g(schema, 'type', 'object');
	const isInput = g(schema, 'x-isInput', false);

	// filter out types with 2 values where one of them is "null"
	if (isArray(valueType) && valueType.length === 2 && includes(valueType, 'null')) {
		valueType = first(filter(valueType, (v) => v !== 'null'));
	}

	if (isArray(valueType)) {
		throw new Error('not implemented yet');
	} else {
		const description = g(schema, 'description');
		if (includes(idFormats, g(schema, 'format'))) {
			return new GraphQLNonNull(GraphQLID);
		}

		if (g(schema, 'format') === 'binary') {
			return FileInputType;
		}

		switch (valueType) {
			case 'array':
				const itemsSchema = g(schema, 'items');

				return new GraphQLList(computeType({
					...itemsSchema,
					...(isInput ? { 'x-isInput': true } : {}),
				}, operationsDescriptions, swagger, idFormats, typesBag, parentTypePath));
				break;
			case 'object':
				checkObjectSchemaForUnsupportedFeatures(schema);
				const schemaTitle = g(schema, 'title');
				let typeName = schemaTitle || parentTypePath;
				const shouldAppendInputToTypeName = isInput && !endsWith(typeName, 'Input') && !!typesBag[typeName];
				typeName = shouldAppendInputToTypeName ? `${typeName}Input` : typeName;

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
									computeType(partialSchema, operationsDescriptions, swagger, idFormats, typesBag),
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
												...(isInput ? { 'x-isInput': true } : {}),
											}, operationsDescriptions, swagger, idFormats, typesBag, newParentTypePath),
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
																let type = GraphQLString;
																if (parameterType) {
																	type = computeType({ type: parameterType }, operationsDescriptions, swagger, idFormats, typesBag, newParentTypePath);
																}
																if ((paramIn === 'body' || paramIn === 'formData') && paramSchema) {
																	type = computeType({
																		...paramSchema,
																		['x-isInput']: true
																	}, operationsDescriptions, swagger, idFormats, typesBag, newParentTypePath);
																}
																if ((required || paramIn === 'path') && parameterType !== 'file') {
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

														// if endpoint consumes multipart/form-data and all required form-data
														// fields are filled, build multipart/form-data request instead of
														// classic application/json request
														if (
															includes(g(operationDescriptor, 'consumes'), 'multipart/form-data') &&
															areAllRequiredFormDataFieldsFilled(parameters, args)
														) {
															const formData = new FormData();

															each(filter(parameters, { in: 'formData' }), (field) => {
																let fileProxy; // es6 wtf duplicate declaration
																let file;
																if (!!field.schema) {
																	// stringify object types
																	formData.append(field.name, JSON.stringify(args[field.name]));
																} else if (field.type === 'file') {
																	// append file type
																	fileProxy = args[field.name];
																	file = g(context, ['files', fileProxy.path]);

																	if (file) {
																		formData.append(field.name, file);
																	}
																} else if (field.type === 'array') {
																	// append array of files
																	each(args[field.name], (fileProxy) => {
																		fileProxy = args[field.name];
																		file = g(context, ['files', fileProxy.path]);

																		if (file) {
																			formData.append(`${field.name}[]`, file);
																		}
																	});
																} else {
																	// just append scalar types
																	formData.append(field.name, args[field.name]);
																}
															});

															callArguments = [
																callArguments[0],
																formData,
																merge( // extend by headers needed by multipart/form-data request
																	callArguments[1],
																	{
																		'Content-Type': 'multipart/form-data',
																	}
																)
															];
														} else {
															// build classic application/json request
															const bodyParameter = find(parameters, { ['in']: 'body' });
															if (bodyParameter) {
																callArguments = [callArguments[0], args[bodyParameter.name], callArguments[1]];
															}
														}

														return axios[method](...callArguments)
															.then(
																(response) => {
																	return response.data;
																}
															)
															.catch(
																(error) => {
																	if (process.env.NODE_ENV === 'development') {
																		console.log(`Resolver error for GET "${resourceUri}"`);
																	}

																	throw new ApiError(
																		{
																			code: error.response.status,
																			data: error.response.data,
																		}
																	)
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
							[g(childSchema, 'title')]: computeType(childSchema, operationsDescriptions, swagger, idFormats, typesBag)
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

const gatherObjectTypes = (schema, queriesDescriptions, swagger, idFormats, typesBag) => {
	traverse(schema).forEach(
		(node) => {
			const title = g(node, 'title');
			const hasTitle = !!title;
			const hasProperties = g(node, 'properties');
			const hasAllOf = g(node, 'allOf');
			const isObjectType = hasTitle && (hasProperties || hasAllOf);
			if (isObjectType) {
				typesBag[title] = computeType(node, queriesDescriptions, swagger, idFormats, typesBag);
			}
		},
	)
};

const swaggerToSchema = (swagger, idFormats = ['uniqueId', 'uuid']) => {
	const queriesDescriptions = findQueriesDescriptions(swagger.paths);
	const mutationsDescriptions = findMutationsDescriptions(swagger.paths);

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
	gatherObjectTypes(querySchema, queriesDescriptions, swagger, idFormats, typesBag);
	const QueryType = computeType(
		querySchema,
		queriesDescriptions,
		swagger,
		idFormats,
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
	gatherObjectTypes(mutationSchema, mutationsDescriptions, swagger, idFormats, typesBag);
	const MutationType = computeType(
		mutationSchema,
		mutationsDescriptions,
		swagger,
		idFormats,
		typesBag
	);

	const schema = new GraphQLSchema(
		{
			types: Object.values(typesBag),
			...(size(queriesDescriptions) ? { query: QueryType } : {}),
			...(size(mutationsDescriptions) ? { mutation: MutationType } : {}),
		}
	);

	return schema;
};

export default swaggerToSchema;
