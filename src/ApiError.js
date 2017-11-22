import { get as g } from 'lodash';
import { GraphQLError } from 'graphql';

export default class ApiError extends GraphQLError {
	constructor(error) {
		super(g(error, 'data.message', 'Api call failed.'));
		this.code = error.code;
		this.data = error.data;
	}
}
