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

const scalartypeMap = {
	integer: _graphql.GraphQLInt,
	number: _graphql.GraphQLFloat,
	string: _graphql.GraphQLString,
	boolean: _graphql.GraphQLBoolean
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
		if (schemaNode.title === schema.title) {
			if (this.parent.key === 'allOf') {
				acc = [...acc, this.parent.parent.node];
			}
		}
	});
	return acc;
};

const computeType = (inputSchema, operationsDescriptions, swagger, typesBag, parentTypePath = '') => {
	// console.log('parentTypePath', parentTypePath, 'schema', g(schema, 'title'), schema);
	const allOf = (0, _lodash.get)(inputSchema, 'allOf');
	const schema = inputSchema;
	const valueType = (0, _lodash.get)(schema, 'type', 'object');
	const isInput = (0, _lodash.get)(schema, 'x-isInput', false);

	if ((0, _lodash.isArray)(valueType)) {
		throw new Error('not implemented yet');
	} else {
		const description = (0, _lodash.get)(schema, 'description');
		if ((0, _lodash.get)(schema, 'format') === 'uniqueId') {
			return new _graphql.GraphQLNonNull(_graphql.GraphQLID);
		}
		switch (valueType) {
			case 'array':
				const itemsSchema = (0, _lodash.get)(schema, 'items');

				return new _graphql.GraphQLList(computeType(Object.assign({}, itemsSchema, isInput ? { 'x-isInput': true } : {}), operationsDescriptions, swagger, typesBag, parentTypePath));
				break;
			case 'object':
				checkObjectSchemaForUnsupportedFeatures(schema);
				const schemaTitle = (0, _lodash.get)(schema, 'title');
				let typeName = schemaTitle || parentTypePath;
				typeName = isInput && !(0, _lodash.endsWith)(typeName, 'Input') ? `${typeName}Input` : typeName;

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
							return [...acc, computeType(partialSchema, operationsDescriptions, swagger, typesBag)];
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
									type: computeType(Object.assign({}, propertySchema, isInput ? { 'x-isInput': true } : {}), operationsDescriptions, swagger, typesBag, newParentTypePath)
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
												type = computeType({ type: parameterType }, operationsDescriptions, swagger, typesBag, newParentTypePath);
											}
											if (paramIn === 'body' && paramSchema) {
												type = computeType(Object.assign({}, paramSchema, {
													['x-isInput']: true
												}), operationsDescriptions, swagger, typesBag, newParentTypePath);
											}
											if (required || paramIn === 'path') {
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
										const bodyParameter = (0, _lodash.find)(parameters, { ['in']: 'body' });
										if (bodyParameter) {
											callArguments = [callArguments[0], args[bodyParameter.name], callArguments[1]];
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
						[(0, _lodash.get)(childSchema, 'title')]: computeType(childSchema, operationsDescriptions, swagger, typesBag)
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

const gatherObjectTypes = (schema, queriesDescriptions, swagger, typesBag) => {
	(0, _traverse2.default)(schema).forEach(node => {
		const title = (0, _lodash.get)(node, 'title');
		const hasTitle = !!title;
		const hasProperties = (0, _lodash.get)(node, 'properties');
		const hasAllOf = (0, _lodash.get)(node, 'allOf');
		const isObjectType = hasTitle && (hasProperties || hasAllOf);
		if (isObjectType) {
			typesBag[title] = computeType(node, queriesDescriptions, swagger, typesBag);
		}
	});
};

const swaggerToSchema = swagger => {
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
	gatherObjectTypes(querySchema, queriesDescriptions, swagger, typesBag);
	const QueryType = computeType(querySchema, queriesDescriptions, swagger, typesBag);

	const mutationSchema = {
		title: 'Mutation',
		type: 'object',
		description: 'mutation root type',
		properties: (0, _lodash.mapValues)(mutationsDescriptions, ({ schema }) => Object.assign({}, schema, { 'x-isRootOperation': true })),
		'x-links': (0, _lodash.mapValues)(mutationsDescriptions, (_, linkName) => linkName)
	};
	gatherObjectTypes(mutationSchema, mutationsDescriptions, swagger, typesBag);
	const MutationType = computeType(mutationSchema, mutationsDescriptions, swagger, typesBag);

	const schema = new _graphql.GraphQLSchema({
		types: Object.values(typesBag),
		query: QueryType,
		mutation: MutationType
	});

	return schema;
};

exports.default = swaggerToSchema;