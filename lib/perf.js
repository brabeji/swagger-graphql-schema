'use strict';

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _graphqlTag = require('graphql-tag');

var _graphqlTag2 = _interopRequireDefault(_graphqlTag);

var _index = require('./index');

var _index2 = _interopRequireDefault(_index);

var _createFakerResolver = require('./createFakerResolver');

var _createFakerResolver2 = _interopRequireDefault(_createFakerResolver);

var _createHttpResolver = require('./createHttpResolver');

var _createHttpResolver2 = _interopRequireDefault(_createHttpResolver);

var _index3 = require('json-schema-ref-parser/lib/index');

var _index4 = _interopRequireDefault(_index3);

var _perfy = require('perfy');

var _perfy2 = _interopRequireDefault(_perfy);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var PERF_LABEL = 'perf';

// RefParser.dereference(path.resolve(__dirname, './test/fixtures/cd.json'))
_index4.default.dereference('http://api-gateway/api/v2/swagger.json').then(function (cdSwagger) {
	console.log('Start');
	_perfy2.default.start(PERF_LABEL);
	// swaggerToSchema({ swagger: cdSwagger, createResolver: createFakerResolver });
	(0, _index2.default)({ swagger: cdSwagger, createResolver: _createHttpResolver2.default });

	console.log('End');
	// console.log(JSON.stringify(result.data.__schema.types.length, null, 2));
	console.log(_perfy2.default.end(PERF_LABEL).time);
	process.exit();
});