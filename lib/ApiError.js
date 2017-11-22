'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _lodash = require('lodash');

var _graphql = require('graphql');

class ApiError extends _graphql.GraphQLError {
	constructor(error) {
		super((0, _lodash.get)(error, 'data.message', 'Api call failed.'));
		this.code = error.code;
		this.data = error.data;
	}
}
exports.default = ApiError;