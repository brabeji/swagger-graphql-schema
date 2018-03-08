/* eslint-disable no-param-reassign */
import { get as g } from 'lodash';

const VISITED = Symbol('visited');
const slashRegex = /\//g;
const dereference = (schema, root, cache) => {
	if (!schema || typeof schema !== 'object' || schema[VISITED]) {
		return schema;
	}

	const ref = schema.$ref;
	if (ref) {
		if (cache[ref]) {
			return cache[ref];
		}
		const path = ref.slice(2).replace(slashRegex, '.');
		cache[ref] = g(root, path);
		return dereference(cache[ref], root, cache);
	}

	Object.keys(schema).forEach((key) => {
		schema[key] = dereference(schema[key], root, cache);
	});
	schema[VISITED] = true;
	return schema;
};


/**
 * Resolves local JSON pointers in schema where all pointers start with "#/"
 * @param schema
 */
const dereferenceLocalAbsoluteJsonPointers = (schema) => {
	return dereference(schema, schema, {});
};

export default dereferenceLocalAbsoluteJsonPointers;
