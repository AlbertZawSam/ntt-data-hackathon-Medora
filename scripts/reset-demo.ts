/**
 * Clears the test activity from YOUR sandbox so the screens start clean for a demo or recording:
 * every patient request, doctor referral, agent trace step, transfer, message, bed hold and activity
 * entry. Hospitals, specialists and accounts are kept; run `npm run seed` afterwards to reset the
 * hospitals' status and the specialists' slots.
 *
 *   npm run reset-demo -- --yes
 *
 * Reads the API from frontend/amplify_outputs.json, so it only touches the sandbox you deployed, and
 * refuses any region but us-east-1. It deletes data, so it never runs without --yes. Synthetic data only.
 * Cost: one scan and a few batch deletes per table, well under one US cent.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { AppSyncClient, ListTagsForResourceCommand, paginateListGraphqlApis } from '@aws-sdk/client-appsync';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DynamoDBDocumentClient, paginateScan } from '@aws-sdk/lib-dynamodb';

const REGION = 'us-east-1';
/** The tables that hold test activity. Hospitals, statuses, the public directory, specialists and devices stay. */
const TABLES = ['CareRequest', 'Referral', 'TraceStep', 'Transfer', 'Message', 'Reservation', 'Activity'];

/** The sandbox's API id. Refuses anything that isn't a personal Amplify sandbox (never the shared demo). */
async function findSandboxApiId(url: string): Promise<string> {
  const appsync = new AppSyncClient({ region: REGION });
  for await (const page of paginateListGraphqlApis({ client: appsync }, {})) {
    const api = page.graphqlApis?.find((a) => a.uris?.GRAPHQL === url);
    if (api?.apiId && api.arn) {
      const { tags } = await appsync.send(new ListTagsForResourceCommand({ resourceArn: api.arn }));
      if (tags?.['amplify:deployment-type'] !== 'sandbox') throw new Error('This API is not a personal sandbox (for example the shared demo). Nothing was deleted.');
      return api.apiId;
    }
  }
  throw new Error('The API in frontend/amplify_outputs.json was not found. Is your sandbox running?');
}

async function main(): Promise<void> {
  if (!process.argv.includes('--yes')) {
    console.log('This deletes every request, referral, transfer, message and activity entry in your sandbox.');
    console.log('Run it again with --yes to go ahead:  npm run reset-demo -- --yes');
    return;
  }
  const root = resolve(dirname(process.argv[1]), '..');
  const outputs = JSON.parse(readFileSync(resolve(root, 'frontend', 'amplify_outputs.json'), 'utf8')) as { data?: { url?: string; aws_region?: string } };
  if (!outputs.data?.url) throw new Error('No API in frontend/amplify_outputs.json. Run `npm run sandbox` first.');
  if (outputs.data.aws_region !== REGION) throw new Error(`Refusing to touch ${outputs.data.aws_region}: this project uses ${REGION} only.`);
  const apiId = await findSandboxApiId(outputs.data.url);
  console.log(`Sandbox API ${apiId} (${REGION})\n`);
  const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

  let leftover = 0;
  for (const model of TABLES) {
    const table = `${model}-${apiId}-NONE`;
    const ids: string[] = [];
    for await (const page of paginateScan({ client: db }, { TableName: table, ProjectionExpression: 'id' })) {
      for (const item of page.Items ?? []) ids.push(String(item.id));
    }
    for (let i = 0; i < ids.length; i += 25) {
      const batch = ids.slice(i, i + 25).map((id) => ({ DeleteRequest: { Key: { id } } }));
      let pending: typeof batch | undefined = batch;
      for (let attempt = 0; pending && pending.length > 0 && attempt < 5; attempt += 1) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 200 * 2 ** attempt));
        const result = await db.send(new BatchWriteCommand({ RequestItems: { [table]: pending } }));
        pending = result.UnprocessedItems?.[table] as typeof batch | undefined;
      }
      if (pending && pending.length > 0) leftover += pending.length;
    }
    console.log(`${model.padEnd(12)} cleared ${ids.length}`);
  }
  if (leftover > 0) {
    console.error(`\n${leftover} rows could not be deleted (throttled). Run it again.`);
    process.exit(1);
  }
  console.log('\nDone. Now run `npm run seed` to reset the hospitals and specialists, then refresh the app.');
}

main().catch((error: unknown) => {
  console.error(`Reset failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
