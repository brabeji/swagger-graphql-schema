import { curry, forIn, isArray, isObject, mapValues, mapKeys } from 'lodash';

const traverse = (value, context, callback) => {
	const nextContext = { key: context.key, parent: context.parent, node: value };
	callback(value, nextContext);
	if (isObject(value)) {
		for (let i = 0, keys = Object.keys(value), l = keys.length; i < l; ++i) {
			traverse(value[keys[i]], { node: context.node, key: keys[i], parent: nextContext }, callback)
		}
	}
};

const traverseExport = (value) => {
	return {
		forEach: (callback) => traverse(value, {}, callback),
	}
};

export default traverseExport;
