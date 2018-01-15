import { every, filter } from 'lodash';

const areAllRequiredFormDataFieldsFilled = (parameters, args) => {
	const requiredFormDataFields = filter(parameters, { in: 'formData', required: true });
	return every(requiredFormDataFields, (field) => {
		return !!args[field.name];
	});
}

export default areAllRequiredFormDataFieldsFilled;
