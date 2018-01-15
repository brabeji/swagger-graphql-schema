import { get as g } from 'lodash';
import path from 'path';
import fs from 'fs';
import RefParser from 'json-schema-ref-parser';
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import graphqlHTTP from 'express-graphql';
import uriTemplates from 'uri-templates';
import swaggerToSchema from '../src/index';
import createFakerResolver from '../src/createFakerResolver';
import stripBasePath from './stripBasePath';

const app = express();

// const swaggerPath = path.resolve(__dirname, '../test/fixtures/cd.json');
const swaggerPath = path.resolve(__dirname, '../test/fixtures/api.yml');
const port = process.env.PORT || 3000;

RefParser.dereference(swaggerPath).then(
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
							let operation = swagger.paths[endpointPath][req.method];
							if (!operation) {
								operation = swagger.paths[endpointPath][req.method.toLowerCase()];
							}
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

				const { operation: { operationId }, params } = apiOperation;

				try {
					const resolver = require(`./handlers/${operationId}`);
					res.send(resolver());
				} catch (error) {
					res.sendStatus(404, 'Handler not found');
				}
			},
		);

		app.listen(
			port,
			function () {

				console.log(`Server listening on port ${port}`);

				// app.get(
				// 	'/swagger.json',
				// 	(req, res, next) => {
				// 		RefParser.bundle(swaggerPath).then((bundledSwagger) => {
				// 			res.send(bundledSwagger);
				// 		}).catch(next)
				// 	}
				// );

			}
		);
	},
);

// shut down server
function shutdown() {
	process.exit();
}

// quit on ctrl-c when running docker in terminal
process.on('SIGINT', shutdown);

// quit properly on docker stop
process.on('SIGTERM', shutdown);
