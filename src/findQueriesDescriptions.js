import { get as g, reduce, mapValues, isArray, find } from 'lodash';

const findQueriesDescriptions = (paths) => {
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
							)
						);
						if (operationId && schema && method.toLowerCase() === 'get') {
							return {
								...acc,
								[operationId]: {
									path,
									schema: schema.title ? schema : { ...schema, title: operationId },
									// schema,
									parameters: g(operation, 'parameters', []).concat(g(pathMethods, 'parameters', [])),
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

export default findQueriesDescriptions;
