import {
	difference,
} from 'lodash';


const calculateFieldsEquality = (value, fieldNames) => fieldNames.length - difference(fieldNames, Object.keys(value)).length;

/**
 * Value and type shallow comparison
 * @param  {Object}		value
 * @param  {Object}		type
 * @return {boolean}
 */
const isTypeOf = (value, type) => {
	const fields = type.getFields();
	const fieldNames = Object.keys(fields);
	const requiredFieldNames = fieldNames.filter((fieldName) => fields[fieldName].type.constructor.name === 'GraphQLNonNull');
	return requiredFieldNames.length ? (
		calculateFieldsEquality(value, requiredFieldNames) === requiredFieldNames.length
	) : (
		calculateFieldsEquality(value, fieldNames) > 0
	);
};

export default isTypeOf;