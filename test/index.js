import test from 'tape';
import path from 'path';
import RefParser from 'json-schema-ref-parser';
import { GraphQLSchema, execute } from 'graphql';
import gql from 'graphql-tag';
import { startsWith } from 'lodash';
import perfy from 'perfy';
import swaggerToSchema from '../src/index';
import v1swaggerToSchema from '../src/v1-index';
import createFakerResolver from '../src/createFakerResolver';
import traverse from 'traverse';
import traverse2 from '../src/traverse';

let gqlSchema;

test.only('it produces graphql schema', (t) => {
	t.plan(1);
	return RefParser.dereference(path.resolve(__dirname, './fixtures/swagger.json'))
	.then(
		(swagger) => {
			try {
				gqlSchema = swaggerToSchema({ swagger, createResolver: createFakerResolver });
			} catch (error) {
				t.error(error, 'swaggerToSchema thrown');
				return;
			}

			t.assert(gqlSchema instanceof GraphQLSchema, 'Result is GraphQLSchema');

			// console.log(gqlSchema);

			// t.end();

			return execute(
				gqlSchema,
				// gql`
				//  query TagSearchResults($q: String) {
				//    tagSearchResults(q: $q) {
				//      tags {
				//        name
				//      }
				//    }
				//    search(q: $q) {
				//      ... on Post {
				//        title
				//        tags {
				//          name
				//        }
				//        foo
				//      }
				//      ... on Tag {
				//        name
				//      }
				//      ... on Category {
				//        title
				//        tags {
				//          name
				//        }
				//      }
				//    }
				//  }
				// `,
				// gql`
				//  query A {
				//    #					  __schema {
				//    #					    types {
				//    #					      name
				//    #					      ofType {
				//    #					        name
				//    #					      }
				//    #					    }
				//    #					  }
				//    __type(name: "BikeInput") {
				//      name
				//      kind
				//    }
				//    mutationType: __type(name: "Mutation") {
				//      fields {
				//        name
				//        #					      type {name ofType {name}}
				//        args {name type {name ofType {name}}}
				//      }
				//    }
				//  }
				// `,
				// gql`
				//  mutation A($input: CreateCarListingPayloadInput!) {
				//    createCarListing(input: $input) {
				//      product {
				//        id
				//      }
				//    }
				//  }
				// `,
				gql`
                  query A {
                    a:__type(name: "ItemStatus") {
                      name
                      kind
                    }
                    b:__type(name: "RealEstate") {
                      name
                      kind
                    }
                  }
				`,
				// gql`
				//  query A {
				//    posts {
				//      id
				//      title
				//      __typename
				//    }
				//    search {
				//      id
				//      ... on Post {
				//        title
				//        typeName
				//      }
				//      __typename
				//    }
				//  }
				// `,
				{},
				{},
				{
					input: { product: { id: "fsbadhj", description: "fbdshag" } },
					// input: {
					// 	title: 'AAA',
					// 	code: 'AAA',
					// 	features: [
					// 		{
					// 			description: 'dnsbhj',
					// 		},
					// 	],
					// },
				},
			);

		}
	)
	.then(
		(result) => {

			console.log(JSON.stringify(result, null, 2));
			// console.log(JSON.stringify(result.data.mutationType.fields.filter(({ name }) => name === 'createCar'), null, 2));
			// console.log(JSON.stringify(result.data.__schema.types.length, null, 2));
			// console.log(JSON.stringify(result.data.__schema.types.filter(({ name, kind }) => !startsWith(name, '__') && kind === 'INPUT_OBJECT'), null, 2));
			t.end();
		},
	)
	.catch(
		(error) => {
			// t.fail('Could not dereference api spec');
			t.fail(error);
			t.end();
		},
	);
});

test('it conforms to older version', (t) => {
	let cdGqlSchema;
	const V1_PERF_LABEL = 'v1perf';
	const PERF_LABEL = 'perf';
	t.plan(2);
	return RefParser.dereference(path.resolve(__dirname, './fixtures/cd.json'))
		.then(
			(cdSwagger) => {
				try {
					perfy.start(PERF_LABEL);
					cdGqlSchema = swaggerToSchema({ swagger: cdSwagger, createResolver: createFakerResolver });
					console.log(perfy.end(PERF_LABEL).time);
				} catch (error) {
					t.error(error, 'swaggerToSchema thrown');
					return;
				}

				t.assert(cdGqlSchema instanceof GraphQLSchema, 'Result is GraphQLSchema');

				try {
					perfy.start(V1_PERF_LABEL);
					cdGqlSchema = v1swaggerToSchema(cdSwagger);
					console.log(perfy.end(V1_PERF_LABEL).time);
				} catch (error) {
					t.error(error, 'swaggerToSchema thrown');
					return;
				}

				t.assert(cdGqlSchema instanceof GraphQLSchema, 'Result is GraphQLSchema');
			}
		)
});

test('it traverses', (t) => {
	let count;
	let limit = 3;
	return RefParser.dereference(path.resolve(__dirname, './fixtures/api.yml'))
		.then(
			(sw) => {
				const IMPLS = [traverse, traverse2];
				IMPLS.forEach(
					(impl, idx) => {
						count = 0;
						const implName = `${idx}`;
						console.log('------------------------------');
						console.log(implName);
						perfy.start(implName);
						impl(sw).forEach(
							(node, context) => {
								count++;
								if (count < limit) {
									console.log('---------');
									console.log(context);
									console.log('--');
									console.log(node);
								}
							}
						);
						console.log(perfy.end(implName).time);
						console.log('>>>', count);
					}
				);
				t.end();
			}
		);

});

test('it traverses and handles circular references', (t) => {
	// t.plan(1);
	return RefParser
		.dereference(path.resolve(__dirname, './fixtures/api.yml'))
		.then(
			(swagger) => {
				try {
					gqlSchema = swaggerToSchema({ swagger, createResolver: createFakerResolver });
				} catch (error) {
					t.error(error, 'swaggerToSchema thrown');
					return;
				}

				t.assert(gqlSchema instanceof GraphQLSchema, 'Result is GraphQLSchema');
				t.end();
			}
		).catch(
			(error) => {
				console.log('ERR', error);
			}
		);
});
