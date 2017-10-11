'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});
exports.findQueriesDescriptions = undefined;

var _lodash = require('lodash');

var _invariant = require('invariant');

var _invariant2 = _interopRequireDefault(_invariant);

var _axios = require('axios');

var _axios2 = _interopRequireDefault(_axios);

var _uriTemplates = require('uri-templates');

var _uriTemplates2 = _interopRequireDefault(_uriTemplates);

var _graphql = require('graphql');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const findQueriesDescriptions = exports.findQueriesDescriptions = paths => {
	return (0, _lodash.reduce)(paths, (acc, pathMethods, path) => {
		return Object.assign({}, acc, (0, _lodash.reduce)(pathMethods, (acc, operation, method) => {
			const operationId = (0, _lodash.get)(operation, 'operationId');
			const schema = (0, _lodash.get)(operation, ['responses', '200', 'schema'], (0, _lodash.get)(operation, ['responses', '201', 'schema']));
			if (operationId && schema && method.toLowerCase() === 'get') {
				return Object.assign({}, acc, {
					[operationId]: {
						path,
						schema: schema.title ? schema : Object.assign({}, schema, { title: operationId }),
						// schema,
						parameters: (0, _lodash.get)(operation, 'parameters', [])
					}
				});
			}
			return acc;
		}, {}));
	}, {});
};

const scalartypeMap = {
	integer: _graphql.GraphQLInt,
	string: _graphql.GraphQLString,
	boolean: _graphql.GraphQLBoolean
};

const checkObjectSchemaForUnsupportedFeatures = schema => {
	if ((0, _lodash.get)(schema, 'additionalProperties')) {
		(0, _invariant2.default)(false, 'Object schema for %s has unsupported feature "additionalProperties"', getSchemaJSON());
	}
};

const computeType = (schema, queriesDescriptions, swagger, typesBag, parentTypePath = '') => {
	// console.log('parentTypePath', parentTypePath, 'schema', g(schema, 'title'), schema);
	const valueType = (0, _lodash.get)(schema, 'type', (0, _lodash.get)(schema, 'anyOf', 'object'));
	if ((0, _lodash.isArray)(valueType)) {
		console.log('shiz');
	} else {
		const description = (0, _lodash.get)(schema, 'description');
		if ((0, _lodash.get)(schema, 'format') === 'uniqueId') {
			return _graphql.GraphQLID;
		}
		switch (valueType) {
			case 'array':
				const itemsSchema = (0, _lodash.get)(schema, 'items');
				return new _graphql.GraphQLList(computeType(itemsSchema, queriesDescriptions, swagger, typesBag, parentTypePath));
				break;
			case 'object':
				checkObjectSchemaForUnsupportedFeatures(schema);
				const schemaTitle = (0, _lodash.get)(schema, 'title');
				if (typesBag[schemaTitle]) {
					return typesBag[schemaTitle];
				}
				const links = (0, _lodash.get)(schema, 'x-links', {});
				const properties = (0, _lodash.get)(schema, 'properties');
				const newType = new _graphql.GraphQLObjectType({
					name: schemaTitle || parentTypePath,
					description,
					fields: () => {
						return (0, _lodash.mapValues)(properties, (propertySchema, propertyName) => {
							const operationId = (0, _lodash.get)(links, propertyName);
							const queryDescriptor = (0, _lodash.get)(queriesDescriptions, operationId);
							const newParentTypePath = schemaTitle ? `${schemaTitle}_${propertyName}` : `${parentTypePath ? `${parentTypePath}_${propertyName}` : ''}`;
							const isRootQuery = (0, _lodash.get)(propertySchema, 'x-isRootQuery');
							const parameters = (0, _lodash.get)(queryDescriptor, 'parameters');
							return Object.assign({
								type: computeType(propertySchema, queriesDescriptions, swagger, typesBag, newParentTypePath)
							}, queryDescriptor ? {
								args: parameters.reduce((acc, { name: paramName, required, ['in']: paramIn, schema: parameterSchema, ['x-argPath']: argPath }) => {
									if (isRootQuery || !argPath) {
										// this is a root query, all parameters are required

										let type = _graphql.GraphQLString; // TODO proper types
										if (parameterSchema) {
											type = computeType(parameterSchema, queriesDescriptions, swagger, typesBag, newParentTypePath);
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
									const resourceUriTemplate = `http://${(0, _lodash.get)(swagger, 'host')}${(0, _lodash.get)(swagger, 'basePath')}${(0, _lodash.get)(queryDescriptor, 'path')}`;
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
									return _axios2.default.get(resourceUri).then(response => response.data).catch(error => {
										console.log(`Resolver error for GET "${resourceUri}"`);
										throw error;
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
				const scalarType = scalartypeMap[valueType];
				if (scalarType) {
					return scalarType;
				}
				throw new Error(`Could not find type mapping for "${valueType}"`);
		}
	}
};

const swaggerToSchema = swagger => {
	const queriesDescriptions = findQueriesDescriptions(swagger.paths);

	const typeBag = {};

	const QueryType = computeType({
		title: 'Query',
		type: 'object',
		description: 'query root type',
		properties: (0, _lodash.mapValues)(queriesDescriptions, ({ schema }) => Object.assign({}, schema, { 'x-isRootQuery': true })),
		'x-links': (0, _lodash.mapValues)(queriesDescriptions, (_, linkName) => linkName)
	}, queriesDescriptions, swagger, typeBag);

	const schema = new _graphql.GraphQLSchema({
		query: QueryType
	});
	return schema;
};

exports.default = swaggerToSchema;