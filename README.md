# `swagger-graphql-schema`

> ⚠️ Work in Progress, please use at your own risk and report bugs.

Generates graphql schema from Swagger/OpenAPI spec file. Provides GraphQL resolver factories for http and faker.

## TODOs

- [x] Support for Swagger 2.x
- [x] Parse interfaces
- [x] Parse unions
- [x] Fetch fields recursively
- [ ] Create complex example and write docs `x-links`
- [ ] Write docs for options
- [ ] Write docs for resolver factory options
- [ ] Cache same requests in one query
- [ ] Support for OpenAPI 3.x

# Installation

	$ yarn add https://github.com/brabeji/swagger-graphql-schema.git#a9882cdf79ebe520d3e85756d9e4e4706881562a

# Example

Having this simple swaggerfile:

```yaml
swagger: '2'
host: example.com
schemes:
  - https
basePath: /api
definitions:
  Node:
    title: Node # assigns name to resulting type.
    # Generally all object schemas and schemas containing allOf or anyOf should have a title to avoid errors.
    type: object
    # Either GraphQLObjectType, GraphQLInputObjectType or GraphQLInterfaceType is be generated from object schema.
    # Which exact type is generated depends on where the schema is referenced. Explanation is below.
    properties:
      id:
        type: string
        format: uuid # "uuid" and "uniqueId" formats will result into GraphQLID
        readOnly: true
    required:
      - id # makes field non-nullable
  Tag:
    title: Tag
    type: object
    properties:
      name:
        type: string
        format: uniqueId
    required:
      - name
  Post:
    title: Some descriptive title
    x-typeName: Post # when present, x-typeName takes precendence over title in specifying name of type
    allOf:
      - $ref: '#/definitions/Node' # GraphQLInterfaceType is generated when object schema is encountered under allOf
      # Referencing Node schema both inside and outside of allOf will result in duplicate type name error.
      # Either choose a schema to be an interface or object type. Do not nest interfaces using allOf or anyOf
      # as that doesn't conform to GraphQL interfaces structure - this may be solved by flattening allOf in future.
      - type: object
        properties:
          title:
            type: string
          authorEmail:
            type: string
            format: email # email (graphql-scalars), json (graphql-type-json) TODO: date, time, date-time (graphql-iso-date)
          status:
            type: string
            # title: PostStatus
            enum: # add enum from GraphQLEnumType. The type will by default be named Post_status unless a different name is specified by title.
              - PUBLISHED
              - DELETED
          tags:
            type: array
            items:
              $ref: '#/definitions/Tag'
paths:
  /search:
    get:
      operationId: search # this operation (GET /search) will turn into a query named "search"
      parameters:
        - in: query # the query will have non-nullable String argument named "query"
          name: q
          type: string
          required: true
      responses:
        200:
          schema:
            type: array # generates GraphQLList
            items:
              # Generates GraphQLUnionType
              title: SearchResultItem # assigns SearchResultItem as a name to the union type
              anyOf: # specifies that SearchResultItem is union of different types.
                # anyOf is invalid in Swagger 2.0 but will be specified in OpenAPI 3.x, see readme TODOs
                - $ref: '#/definitions/Post'
                - $ref: '#/definitions/Tag'
  /posts:
    post:
      operationId: createPost # this operation (POST /posts) will turn into a mutation named "createPost"
      parameters:
        - in: body
          name: input
          schema:
            $ref: '#/definitions/Post'
            # Referencing object type in body parameter schema generates GraphQLInputObjectType with "Input" appended to
            # original name, "PostInput" in this case. readOnly properties are removed.
            # Post_tagsInput
      responses:
        200:
          schema:
            $ref: '#/definitions/Post' # Using same schema for parameter and response conforms to some REST recommendations and isn't required.
            # Generally, this can be something completely different than Post.
```

Convert it to graphql schema:

```javascript
import RefParser from 'json-schema-ref-parser';
import swaggerToSchema, { dereferenceLocalAbsoluteJsonPointers } from 'swagger-graphql-schema';
import createHttpResolver from 'swagger-graphql-schema/lib/createHttpResolver';
// OR import createFakerResolver from 'swagger-graphql-schema/lib/createFakerResolver';
import { printSchema } from 'graphql';

RefParser
	// swagger-graphql-schema accepts possibly cyclic js object without json pointers
	// so your yaml file should be bundled with json-schema-ref-parser and
	// then dereferenced using built-in utility function.
	// Dereferencing using json-schema-ref-parser's dereference() is slow
	// for large schemas
	.bundle(path.resolve(__dirname, './examples/simple/swagger.yml'))
	.then(
		(bundledSwagger) => {
			const schema = swaggerToSchema(
				{
					schema: dereferenceLocalAbsoluteJsonPointers(bundledSwagger),
					createResolver: createHttpResolver,
					// createResolver: createFakerResolver, for json-schema-faker data
				}
			);
			console.log(printSchema(schema));
		}
	);
```

Outputs:

```graphql
scalar EmailAddress

type Mutation {
  createPost(input: PostInput): Post
}

interface Node {
  id: ID!
}

type Post implements Node {
  id: ID!
  title: String
  authorEmail: EmailAddress
  status: Post_status
  tags: [Tag]
}

enum Post_status {
  PUBLISHED
  DELETED
}

input Post_tagsInput {
  name: ID
}

input PostInput {
  title: String
  authorEmail: EmailAddress
  status: Post_status
  tags: [Post_tagsInput]
}

type Query {
  search(q: String!): [SearchResultItem]
}

union SearchResultItem = Post | Tag

type Tag {
  name: ID!
}
```

# Resolving fields

When creating schema, `swagger-graphql-schema` calls `createResolver` to obtain field resolver.

Parsed information about http request (swagger assumes http), input and output json schemas are passed to `createResolver`.

At this time, two resolver factories are included

- `createHttpResolver` - makes http call based on `schemes`, `host`, `basePath` and operation as defined in swaggerfile
- `createFakerResolver` - deterministic result of `json-schema-faker`

# License

MIT
