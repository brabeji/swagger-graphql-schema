import { isObject } from 'lodash';
import RefParser from 'json-schema-ref-parser';
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import graphqlHTTP from 'express-graphql';
import uriTemplates from 'uri-templates';
import swaggerToSchema from '../src/index';
import createFakerResolver from '../src/createFakerResolver';
import stripBasePath from './stripBasePath';

import jsf from 'json-schema-faker';
import uuid from 'uuid/v1';
import seedrandom from 'seedrandom';

const RANDOM_SEED = '2h33g4vbrnifo8rik';
const getGenerateUUID = (random) => () => {
	const v1options = {
		node: [0x01, 0x23, 0x45, 0x67, 0x89, 0xab],
		clockseq: random(),
		msecs: random() * 10000000,
		nsecs: random() * 1000
	};
	return uuid(v1options);
};

export default ({ swaggerUri, handlersDirectoryPath }) => {
	return new Promise(
		(resolve) => {
			const app = express();
			app.set('json spaces', 2);

			RefParser.dereference(swaggerUri).then(
				(swagger) => {
					const gqlSchema = swaggerToSchema({ swagger, createResolver: createFakerResolver });

					app.use(
						// express.static(path.resolve(__dirname, '../spec')),
						bodyParser.json({ limit: '50mb' }),
						cors(),
					);

					app.use(
						'/graphql',
						graphqlHTTP({
							schema: gqlSchema,
							graphiql: true
						})
					);

					app.use(
						(req, res, next) => {
							const requestEndpointPath = stripBasePath(swagger, req.originalUrl);
							const apiOperation = Object.keys(swagger.paths).reduce(
								(acc, endpointPath) => {
									if (acc) {
										return acc;
									}
									const params = uriTemplates(`${endpointPath}{?query*}`).fromUri(requestEndpointPath);
									// console.log(endpointPath, requestEndpointPath, params);
									if (params) {
										const operation = swagger.paths[endpointPath][req.method.toLowerCase()];
										if (operation) {
											return {
												operation,
												params,
											}
										}
									}
								},
								undefined,
							);
							if (!apiOperation) {
								return next();
							}

							const { operation: { operationId } } = apiOperation;
							const random = seedrandom(RANDOM_SEED);
							jsf.format('uuid', getGenerateUUID(random));
							jsf.format('uniqueId', getGenerateUUID(random));
							jsf.option({ random });

							try {
								let resolver = require(`${handlersDirectoryPath}/${operationId}`).default;
								Promise.resolve(
									resolver({ ...apiOperation, faker: jsf }),
								).then(
									(response) => {
										res.send(response);
									},
								);
							} catch (error) {
								res.sendStatus(404);
							}
						},
					);

					resolve(app);

				},
			);
		},
	)
}
