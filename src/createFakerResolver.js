import jsf from 'json-schema-faker';
import uuid from 'uuid/v1';
import seedrandom from 'seedrandom';
const RANDOM_SEED = '2h33g4vbrnifo8rik';
const random = seedrandom(RANDOM_SEED);
const generateUUID = () => {
	const v1options = {
		node: [0x01, 0x23, 0x45, 0x67, 0x89, 0xab],
		clockseq: random(),
		msecs: random() * 10000000,
		nsecs: random() * 1000
	};
	return uuid(v1options);
};
jsf.format('uuid', generateUUID);
jsf.format('uniqueId', generateUUID);
jsf.option({ random: seedrandom(RANDOM_SEED) });

const createFakerResolver = ({ apiDefinition, propertyName, operation }) => {
	return (root, args, context, info) => {
		const fake = jsf(operation.schema);
		// console.log(`CALLING API: ${operation.path}\n\n${JSON.stringify(fake, null, 2)}`);
		return fake;
	}
};

export default createFakerResolver;
