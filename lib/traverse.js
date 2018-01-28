'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _lodash = require('lodash');

var traverse = function traverse(valueVisitedKey, value, context, callback) {
	var nextContext = { key: context.key, parent: context.parent, node: value };
	callback(value, nextContext);
	// if (isObject(value)) {
	if ((0, _lodash.isObject)(value) && !value[valueVisitedKey]) {
		value[valueVisitedKey] = true;
		for (var i = 0, keys = Object.keys(value), l = keys.length; i < l; ++i) {
			traverse(valueVisitedKey, value[keys[i]], {
				node: context.node,
				key: keys[i],
				parent: nextContext
			}, callback);
		}
	}
};

var traverseExport = function traverseExport(value) {
	return {
		forEach: function forEach(callback) {
			var valueVisitedKey = Symbol('traverse value visited');
			return traverse(valueVisitedKey, value, {}, callback);
		}
	};
};

exports.default = traverseExport;