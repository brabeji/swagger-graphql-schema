'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _lodash = require('lodash');

const traverse = (value, context, callback) => {
	const nextContext = { key: context.key, parent: context.parent, node: value };
	callback(value, nextContext);
	if ((0, _lodash.isObject)(value)) {
		for (let i = 0, keys = Object.keys(value), l = keys.length; i < l; ++i) {
			traverse(value[keys[i]], { node: context.node, key: keys[i], parent: nextContext }, callback);
		}
	}
};

const traverseExport = value => {
	return {
		forEach: callback => traverse(value, {}, callback)
	};
};

exports.default = traverseExport;