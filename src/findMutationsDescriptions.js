import { get as g, reduce, mapValues, isArray, find, includes } from 'lodash';
import { TYPE_NAME_VENDOR_PROPERTY_NAME } from './constants';

const findMutationsDescriptions = (paths) => {
	return reduce(
		paths,
		(acc, pathMethods, path) => {
			return {
				...acc,
				...reduce(
					pathMethods,
					(acc, operation, method) => {
						const operationId = g(operation, 'operationId');
						const consumes = g(operation, 'consumes', []);
						const produces = g(operation, 'produces', []);
						const schema = g(
							operation,
							['responses', '200', 'schema'],
							g(
								operation,
								['responses', '201', 'schema'],
								g(
									operation,
									['responses', '204', 'schema'],
								)
							)
						);
						const lcMethod = method.toLowerCase();
						if (operationId && schema && (includes(['put', 'post', 'patch', 'delete'], lcMethod))) {
							const parameters = g(operation, 'parameters', []).concat(g(pathMethods, 'parameters', []));
							const inputSchema = g(find(parameters, { in: 'body' }), 'schema');
							// console.log('inputSchema', inputSchema);
							return {
								...acc,
								[operationId]: {
									path,
									inputSchema,
									schema: (schema.title || schema[TYPE_NAME_VENDOR_PROPERTY_NAME]) ? schema : {
										...schema,
										[TYPE_NAME_VENDOR_PROPERTY_NAME]: operationId
									},
									// schema,
									parameters,
									operationMethod: lcMethod,
									consumes,
									produces,
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

export default findMutationsDescriptions;
