import path from 'path';
import gql from 'graphql-tag';
import swaggerToSchema from './index';
import createFakerResolver from './createFakerResolver';
import createHttpResolver from './createHttpResolver';
import RefParser from 'json-schema-ref-parser/lib/index';
import perfy from 'perfy';

const PERF_LABEL = 'perf';

// RefParser.dereference(path.resolve(__dirname, './test/fixtures/cd.json'))
RefParser.dereference('http://api-gateway/api/v2/swagger.json')
.then(
	(cdSwagger) => {
		console.log('Start');
		perfy.start(PERF_LABEL);
		// swaggerToSchema({ swagger: cdSwagger, createResolver: createFakerResolver });
		swaggerToSchema({ swagger: cdSwagger, createResolver: createHttpResolver });


				console.log('End');
				// console.log(JSON.stringify(result.data.__schema.types.length, null, 2));
				console.log(perfy.end(PERF_LABEL).time);
				process.exit();
	}
);
