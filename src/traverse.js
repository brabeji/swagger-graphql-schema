import { curry, forIn, isArray, isObject, mapValues, mapKeys } from 'lodash';

const traverse = (valueVisitedKey, value, context, callback) => {
	const nextContext = { key: context.key, parent: context.parent, node: value };
	callback(value, nextContext);
	// if (isObject(value)) {
	if (isObject(value) && !value[valueVisitedKey]) {
		value[valueVisitedKey] = true;
		for (let i = 0, keys = Object.keys(value), l = keys.length; i < l; ++i) {
			traverse(
				valueVisitedKey,
				value[keys[i]],
				{
					node: context.node,
					key: keys[i],
					parent: nextContext,
				},
				callback,
			);
		}
	}
};

const traverseExport = (value) => {
	return {
		forEach: (callback) => {
			const valueVisitedKey = Symbol('traverse value visited');
			return traverse(valueVisitedKey, value, {}, callback);
		},
	}
};

export default traverseExport;
