import { openapi } from '../lib/openapi';

const methods = new Set(['delete', 'get', 'patch', 'post', 'put']);
const schemas = await openapi.getSchemas();
const documents = Object.values(schemas);

if (documents.length !== 1) {
  throw new Error(
    `Expected one OpenAPI document, received ${documents.length}`,
  );
}

const document = documents[0]?.bundled;
if (!document) throw new Error('OpenAPI document was not loaded');

let operations = 0;
for (const pathItem of Object.values(document.paths ?? {})) {
  if (!pathItem || typeof pathItem !== 'object') continue;
  operations += Object.keys(pathItem).filter((key) => methods.has(key)).length;
}

const webhooks = Object.keys(document.webhooks ?? {}).length;
const source = await openapi.staticSource({
  baseDir: 'api-reference',
  groupBy: 'tag',
  meta: false,
});
const expectedPages = operations + webhooks;

if (source.files.length !== expectedPages) {
  throw new Error(
    `Expected ${expectedPages} generated API pages, received ${source.files.length}`,
  );
}

console.log(
  `Verified ${operations} API operations and ${webhooks} webhook page`,
);
