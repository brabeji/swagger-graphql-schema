'use strict';

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _index = require('./index');

var _index2 = _interopRequireDefault(_index);

var _createFakerResolver = require('./createFakerResolver');

var _createFakerResolver2 = _interopRequireDefault(_createFakerResolver);

var _index3 = require('json-schema-ref-parser/lib/index');

var _index4 = _interopRequireDefault(_index3);

var _perfy = require('perfy');

var _perfy2 = _interopRequireDefault(_perfy);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const PERF_LABEL = 'perf';

_index4.default.dereference(_path2.default.resolve(__dirname, './test/fixtures/cd.json')).then(cdSwagger => {
	debugger;
	_perfy2.default.start(PERF_LABEL);
	(0, _index2.default)({ swagger: cdSwagger, createResolver: _createFakerResolver2.default });
	console.log(_perfy2.default.end(PERF_LABEL).time);
	process.exit();
});