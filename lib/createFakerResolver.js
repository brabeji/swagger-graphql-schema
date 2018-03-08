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

var RANDOM_SEED = '2h33g4vbrnifo8rik';
var generateUUID = function generateUUID(random) {
    return function () {
        var v1options = {
            node: [0x01, 0x23, 0x45, 0x67, 0x89, 0xab],
            clockseq: random(),
            msecs: random() * 10000000,
            nsecs: random() * 1000
        };
        return (0, _v2.default)(v1options);
    };
};

var createFakerResolver = function createFakerResolver(_ref) {
    var apiDefinition = _ref.apiDefinition,
        propertyName = _ref.propertyName,
        operation = _ref.operation;

    return function (root, args, context, info) {
        var random = (0, _seedrandom2.default)(RANDOM_SEED);
        _jsonSchemaFaker2.default.format('uuid', generateUUID(random));
        _jsonSchemaFaker2.default.format('uniqueId', generateUUID(random));
        _jsonSchemaFaker2.default.option({ random: random });
        var fake = (0, _jsonSchemaFaker2.default)(operation.schema);
        // console.log(`CALLING API: ${operation.path}\n\n${JSON.stringify(fake, null, 2)}`);
        return fake;
    };
};

exports.default = createFakerResolver;