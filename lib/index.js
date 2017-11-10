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

var _graphql = require('graphql');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const FileInputType = new _graphql.GraphQLInputObjectType({
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

const scalartypeMap = {
	integer: _graphql.GraphQLInt,
	number: _graphql.GraphQLFloat,
	string: _graphql.GraphQLString,
	boolean: _graphql.GraphQLBoolean,
	file: FileInputType
};

const checkObjectSchemaForUnsupportedFeatures = schema => {
	if ((0, _lodash.get)(schema, 'additionalProperties')) {
		(0, _invariant2.default)(false, 'Object schema for %s has unsupported feature "additionalProperties"', JSON.stringify(schema, null, 2));
	}
};

const findChildSchemas = (schema, swagger) => {
	let acc = [];
	(0, _traverse2.default)(swagger).forEach(function (schemaNode) {
		// if (schemaNode === schema) doesn't work due to bug in ref parser
		// for now assume its the same schema like this
		if (schemaNode && schemaNode.title === schema.title) {
			if (this.parent.key === 'allOf') {
				acc = [...acc, this.parent.parent.node];
			}
		}
	});
	return acc;
};

const areAllRequiredFormDataFieldsFilled = (parameters, args) => {
	const requiredFormDataFields = (0, _lodash.filter)(parameters, { in: 'formData', required: true });
	return (0, _lodash.every)(requiredFormDataFields, field => {
		return !!args[field.name];
	});
};

const computeType = (inputSchema, operationsDescriptions, swagger, idFormats, typesBag, parentTypePath = '') => {
	// console.log('parentTypePath', parentTypePath, 'schema', g(schema, 'title'), schema);
	const allOf = (0, _lodash.get)(inputSchema, 'allOf');
	const schema = inputSchema;
	let valueType = (0, _lodash.get)(schema, 'type', 'object');
	const isInput = (0, _lodash.get)(schema, 'x-isInput', false);

	// filter out types with 2 values where one of them is "null"
	if ((0, _lodash.isArray)(valueType) && valueType.length === 2 && (0, _lodash.includes)(valueType, 'null')) {
		valueType = (0, _lodash.first)((0, _lodash.filter)(valueType, v => v !== 'null'));
	}

	if ((0, _lodash.isArray)(valueType)) {
		throw new Error('not implemented yet');
	} else {
		const description = (0, _lodash.get)(schema, 'description');
		if ((0, _lodash.includes)(idFormats, (0, _lodash.get)(schema, 'format'))) {
			return new _graphql.GraphQLNonNull(_graphql.GraphQLID);
		}

		if ((0, _lodash.get)(schema, 'format') === 'binary') {
			return FileInputType;
		}

		switch (valueType) {
			case 'array':
				const itemsSchema = (0, _lodash.get)(schema, 'items');

				return new _graphql.GraphQLList(computeType(Object.assign({}, itemsSchema, isInput ? { 'x-isInput': true } : {}), operationsDescriptions, swagger, idFormats, typesBag, parentTypePath));
				break;
			case 'object':
				checkObjectSchemaForUnsupportedFeatures(schema);
				const schemaTitle = (0, _lodash.get)(schema, 'title');
				let typeName = schemaTitle || parentTypePath;
				const shouldAppendInputToTypeName = isInput && !(0, _lodash.endsWith)(typeName, 'Input') && !!typesBag[typeName];
				typeName = shouldAppendInputToTypeName ? `${typeName}Input` : typeName;

				if (typesBag[typeName]) {
					return typesBag[typeName];
				}

				const links = (0, _lodash.get)(schema, 'x-links', {});
				let properties = (0, _lodash.get)(schema, 'properties');
				// let hasInterfaces = false;
				const discriminator = (0, _lodash.get)(schema, 'discriminator');
				const isInterface = !!discriminator;
				let TypeConstructor = !isInterface ? _graphql.GraphQLObjectType : _graphql.GraphQLInterfaceType;
				if (isInput) {
					TypeConstructor = _graphql.GraphQLInputObjectType;
				}
				let additionalConfig = {};
				if (isInterface) {
					const discriminatorPropertyName = (0, _lodash.get)(discriminator, 'propertyName');
					additionalConfig = {
						resolveType: value => {
							return (0, _lodash.get)(typesBag, (0, _lodash.get)(value, discriminatorPropertyName));
						}
					};
				}

				// find implemented interfaces
				let getInterfaces = () => [];
				if (allOf) {
					properties = allOf.reduce((acc, partialSchema) => Object.assign({}, acc, (0, _lodash.get)(partialSchema, 'properties', {})), {});
					getInterfaces = function getInterfaces() {
						return allOf.reduce((acc, partialSchema) => {
							const isInterface = !!(0, _lodash.get)(partialSchema, 'discriminator');
							if (!isInterface) {
								return acc;
							}
							return [...acc, computeType(partialSchema, operationsDescriptions, swagger, idFormats, typesBag)];
						}, []);
					};
				}
				const newType = new TypeConstructor(Object.assign({
					name: typeName,
					description,
					interfaces: getInterfaces
				}, additionalConfig, {
					fields: () => {
						return (0, _lodash.reduce)(properties, (acc, propertySchema, propertyName) => {
							const operationId = (0, _lodash.get)(links, propertyName);
							const operationDescriptor = (0, _lodash.get)(operationsDescriptions, operationId);
							const newParentTypePath = schemaTitle ? `${schemaTitle}_${propertyName}` : `${parentTypePath ? `${parentTypePath}_${propertyName}` : ''}`;
							const isRootQuery = (0, _lodash.get)(propertySchema, 'x-isRootOperation');
							const isReadOnly = !isRootQuery && (0, _lodash.get)(propertySchema, 'x-readOnly');
							const parameters = (0, _lodash.get)(operationDescriptor, 'parameters');

							if (isReadOnly && isInput) {
								return acc;
							}

							return Object.assign({}, acc, {
								[propertyName]: Object.assign({
									type: computeType(Object.assign({}, propertySchema, isInput ? { 'x-isInput': true } : {}), operationsDescriptions, swagger, idFormats, typesBag, newParentTypePath)
								}, operationDescriptor ? {
									args: parameters.reduce((acc, parameter) => {
										const paramName = parameter.name,
										      required = parameter.required,
										      paramIn = parameter['in'],
										      parameterType = parameter.type,
										      argPath = parameter['x-argPath'],
										      paramSchema = parameter.schema;

										if (isRootQuery || !argPath) {
											// this is a root operation or resolution path is not defined => parameter is required
											let type = _graphql.GraphQLString;
											if (parameterType) {
												type = computeType({ type: parameterType }, operationsDescriptions, swagger, idFormats, typesBag, newParentTypePath);
											}
											if ((paramIn === 'body' || paramIn === 'formData') && paramSchema) {
												type = computeType(Object.assign({}, paramSchema, {
													['x-isInput']: true
												}), operationsDescriptions, swagger, idFormats, typesBag, newParentTypePath);
											}
											if ((required || paramIn === 'path') && parameterType !== 'file') {
												type = new _graphql.GraphQLNonNull(type);
											}
											return Object.assign({}, acc, {
												[paramName]: { type }
											});
										}
										return acc;
									}, {}),
									resolve: (root, args, context, info) => {
										// yay, make request!
										const fieldValue = (0, _lodash.get)(root, propertyName);
										if (fieldValue) {
											return fieldValue;
										}
										const scheme = (0, _lodash.first)((0, _lodash.get)(swagger, 'schemes', ['http']));
										const resourceUriTemplate = `${scheme}://${(0, _lodash.get)(swagger, 'host')}${(0, _lodash.get)(swagger, 'basePath')}${(0, _lodash.get)(operationDescriptor, 'path')}`;
										// TODO translate params
										const argsValues = Object.assign({ root }, args);
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
										if ((0, _lodash.includes)((0, _lodash.get)(operationDescriptor, 'consumes'), 'multipart/form-data') && areAllRequiredFormDataFieldsFilled(parameters, args)) {
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

										return _axios2.default[method](...callArguments).then(response => response.data).catch(error => {
											console.log(`Resolver error for GET "${resourceUri}"`);
											throw error;
										});
									}
								} : {})
							});
						}, {});
					}
				}));
				typesBag[typeName] = newType;

				if (isInterface) {
					const childSchemas = findChildSchemas(schema, swagger);
					const childTypes = childSchemas.reduce((acc, childSchema) => Object.assign({}, acc, {
						[(0, _lodash.get)(childSchema, 'title')]: computeType(childSchema, operationsDescriptions, swagger, idFormats, typesBag)
					}), {});
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
	(0, _traverse2.default)(schema).forEach(node => {
		const title = (0, _lodash.get)(node, 'title');
		const hasTitle = !!title;
		const hasProperties = (0, _lodash.get)(node, 'properties');
		const hasAllOf = (0, _lodash.get)(node, 'allOf');
		const isObjectType = hasTitle && (hasProperties || hasAllOf);
		if (isObjectType) {
			typesBag[title] = computeType(node, queriesDescriptions, swagger, idFormats, typesBag);
		}
	});
};

const swaggerToSchema = (swagger, idFormats = ['uniqueId', 'uuid']) => {
	const queriesDescriptions = (0, _findQueriesDescriptions2.default)(swagger.paths);
	const mutationsDescriptions = (0, _findMutationsDescriptions2.default)(swagger.paths);

	const typesBag = {};

	const querySchema = {
		title: 'Query',
		type: 'object',
		description: 'query root type',
		properties: (0, _lodash.mapValues)(queriesDescriptions, ({ schema }) => Object.assign({}, schema, { 'x-isRootOperation': true })),
		'x-links': (0, _lodash.mapValues)(queriesDescriptions, (_, linkName) => linkName)
	};
	gatherObjectTypes(querySchema, queriesDescriptions, swagger, idFormats, typesBag);
	const QueryType = computeType(querySchema, queriesDescriptions, swagger, idFormats, typesBag);

	const mutationSchema = {
		title: 'Mutation',
		type: 'object',
		description: 'mutation root type',
		properties: (0, _lodash.mapValues)(mutationsDescriptions, ({ schema }) => Object.assign({}, schema, { 'x-isRootOperation': true })),
		'x-links': (0, _lodash.mapValues)(mutationsDescriptions, (_, linkName) => linkName)
	};
	gatherObjectTypes(mutationSchema, mutationsDescriptions, swagger, idFormats, typesBag);
	const MutationType = computeType(mutationSchema, mutationsDescriptions, swagger, idFormats, typesBag);

	const schema = new _graphql.GraphQLSchema({
		types: Object.values(typesBag),
		query: QueryType,
		mutation: MutationType
	});

	return schema;
};

exports.default = swaggerToSchema;