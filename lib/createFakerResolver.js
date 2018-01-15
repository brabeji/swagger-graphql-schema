'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _jsonSchemaFaker = require('json-schema-faker');

var _jsonSchemaFaker2 = _interopRequireDefault(_jsonSchemaFaker);

var _v = require('uuid/v1');

var _v2 = _interopRequireDefault(_v);

var _seedrandom = require('seedrandom');

var _seedrandom2 = _interopRequireDefault(_seedrandom);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const RANDOM_SEED = '2h33g4vbrnifo8rik';
const random = (0, _seedrandom2.default)(RANDOM_SEED);
const generateUUID = () => {
	const v1options = {
		node: [0x01, 0x23, 0x45, 0x67, 0x89, 0xab],
		clockseq: random(),
		msecs: random() * 10000000,
		nsecs: random() * 1000
	};
	return (0, _v2.default)(v1options);
};
_jsonSchemaFaker2.default.format('uuid', generateUUID);
_jsonSchemaFaker2.default.format('uniqueId', generateUUID);
_jsonSchemaFaker2.default.option({ random: (0, _seedrandom2.default)(RANDOM_SEED) });

const createFakerResolver = ({ apiDefinition, propertyName, operation }) => {
	return (root, args, context, info) => {
		const fake = (0, _jsonSchemaFaker2.default)(operation.schema);
		// console.log(`CALLING API: ${operation.path}\n\n${JSON.stringify(fake, null, 2)}`);
		return fake;
	};
};

exports.default = createFakerResolver;