#!/usr/bin/env node
// @ts-check
// Clears demo activity from this sandbox (task 6.2): requests, messages, referrals and
// agent trace steps. Hospital status, devices and the activity log are kept; run
// scripts/seed.mjs to put hospital status back to the start.
//
// Deletes data, not AWS resources. Asks for --yes so it never runs by accident.
// Usage: node scripts/reset-demo.mjs --yes
// Cost: one read and one write per deleted row, a fraction of a cent for a demo.
import { DescribeTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DynamoDBDocumentClient, paginateScan } from '@aws-sdk/lib-dynamodb';

import { findTables, loadOutputs } from './lib/aws.mjs';
import { RESET_MODELS } from './lib/demo.mjs';

const { region, tables } = await findTables(loadOutputs(), RESET_MODELS);

if (!process.argv.includes('--yes')) {
  console.log('This deletes every row in:');
  for (const name of Object.values(tables)) console.log(`  ${name}`);
  console.log('\nRun again with --yes to continue.');
  process.exit(0);
}

const raw = new DynamoDBClient({ region });
const db = DynamoDBDocumentClient.from(raw);

for (const [model, table] of Object.entries(tables)) {
  const { Table } = await raw.send(new DescribeTableCommand({ TableName: table }));
  const keyNames = (Table?.KeySchema ?? []).map((k) => /** @type {string} */ (k.AttributeName));
  let deleted = 0;
  for await (const page of paginateScan({ client: db }, { TableName: table, ProjectionExpression: keyNames.join(', ') })) {
    const keys = page.Items ?? [];
    for (let i = 0; i < keys.length; i += 25) {
      let requests = { [table]: keys.slice(i, i + 25).map((Key) => ({ DeleteRequest: { Key } })) };
      while (Object.keys(requests).length) {
        const result = await db.send(new BatchWriteCommand({ RequestItems: requests }));
        requests = /** @type {any} */ (result.UnprocessedItems ?? {});
      }
    }
    deleted += keys.length;
  }
  console.log(`ok  ${model.padEnd(12)} ${deleted} deleted`);
}
