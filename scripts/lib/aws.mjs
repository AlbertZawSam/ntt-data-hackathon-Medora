// @ts-check
// Finds this sandbox's AWS resources from amplify_outputs.json. Read-only lookups.
import { AppSyncClient, paginateListGraphqlApis } from '@aws-sdk/client-appsync';
import { DynamoDBClient, paginateListTables } from '@aws-sdk/client-dynamodb';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OUTPUTS = resolve(import.meta.dirname, '../../amplify_outputs.json');

export function loadOutputs() {
  if (!existsSync(OUTPUTS)) {
    throw new Error('amplify_outputs.json not found. Deploy first: npx ampx sandbox --outputs-out-dir .');
  }
  return JSON.parse(readFileSync(OUTPUTS, 'utf8'));
}

/**
 * DynamoDB table names for the given models in this sandbox. Amplify names them
 * <Model>-<apiId>-NONE, and teammates' sandboxes share the account, so the API id
 * from this sandbox's GraphQL URL picks the right ones.
 * @param {any} outputs
 * @param {string[]} models
 * @returns {Promise<{ region: string; tables: Record<string, string> }>}
 */
export async function findTables(outputs, models) {
  const region = outputs.data?.aws_region;
  const url = outputs.data?.url;
  if (!region || !url) throw new Error('amplify_outputs.json has no data section. Deploy the data models (task 6.1) first.');

  let apiId;
  for await (const page of paginateListGraphqlApis({ client: new AppSyncClient({ region }) }, {})) {
    apiId = page.graphqlApis?.find((api) => api.uris?.GRAPHQL === url)?.apiId ?? apiId;
  }
  if (!apiId) throw new Error(`No AppSync API in ${region} matches ${url}.`);

  const names = [];
  for await (const page of paginateListTables({ client: new DynamoDBClient({ region }) }, {})) names.push(...(page.TableNames ?? []));

  /** @type {Record<string, string>} */
  const tables = {};
  for (const model of models) {
    const name = `${model}-${apiId}-NONE`;
    if (!names.includes(name)) throw new Error(`Table ${name} not found. Is the sandbox fully deployed?`);
    tables[model] = name;
  }
  return { region, tables };
}
