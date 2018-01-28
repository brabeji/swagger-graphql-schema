import UriTemplate from 'uri-templates';
import areAllRequiredFormDataFieldsFilled from './areAllRequiredFormDataFieldsFilled';
import ApiError from './ApiError';
import { get as g, each, filter, find, first, includes, merge } from 'lodash';

import axios from 'axios';

const createHttpResolver = ({ apiDefinition, propertyName, operation: operationDescriptor }) => {
	return (root, args, context, info) => {
		// yay, make request!
		const fieldValue = g(root, propertyName);
		if (fieldValue) {
			return fieldValue;
		}
		const scheme = first(g(apiDefinition, 'schemes', ['http']));
		const resourceUriTemplate = `${scheme}://${g(apiDefinition, 'host')}${g(apiDefinition, 'basePath')}${g(operationDescriptor, 'path')}`;
		// TODO translate params
		const argsValues = { root, ...args };
		const parameters = g(operationDescriptor, 'parameters');
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
	};
};

export default createHttpResolver;
