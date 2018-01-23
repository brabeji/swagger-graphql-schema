import path from 'path';
import express from 'express';
import createMockServer from './createMockServer';

const swaggerUri = path.resolve(__dirname, '../test/fixtures/api.yml');
const port = process.env.PORT || 3000;

const app = express();

createMockServer({ swaggerUri }).then(
	(mockServer) => {

		app.use(mockServer);
		app.listen(
			port,
			() => {
				console.log(`Server listening on port ${port}`);
			}
		);
	}
);

// shut down server
function shutdown() {
	process.exit();
}

// quit on ctrl-c when running docker in terminal
process.on('SIGINT', shutdown);

// quit properly on docker stop
process.on('SIGTERM', shutdown);
