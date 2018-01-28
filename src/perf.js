import path from 'path';
import swaggerToSchema from './index';
import createFakerResolver from './createFakerResolver';
import RefParser from 'json-schema-ref-parser/lib/index';
import perfy from 'perfy';

const PERF_LABEL = 'perf';

RefParser.dereference(path.resolve(__dirname, './test/fixtures/cd.json'))
	.then(
		(cdSwagger) => {
			debugger;
			perfy.start(PERF_LABEL);
			swaggerToSchema({ swagger: cdSwagger, createResolver: createFakerResolver });
			console.log(perfy.end(PERF_LABEL).time);
			process.exit();
		}
	);
