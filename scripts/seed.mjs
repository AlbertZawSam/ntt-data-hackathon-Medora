#!/usr/bin/env node
// @ts-check
// Writes the starting status of the 10 synthetic hospitals (task 6.2) into this sandbox.
// Safe to run again: each hospital's row is replaced with the seeded status.
//
// Usage: node scripts/seed.mjs
// Cost: 10 DynamoDB writes, a fraction of a cent.
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { findTables, loadOutputs } from './lib/aws.mjs';
import { seedItems } from './lib/demo.mjs';

const { hospitals } = JSON.parse(readFileSync(resolve(import.meta.dirname, '../data/hospitals.json'), 'utf8'));
const { region, tables } = await findTables(loadOutputs(), ['HospitalStatus']);
const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

const items = seedItems(hospitals, Date.now());
// BatchWrite takes at most 25 items per call.
for (let i = 0; i < items.length; i += 25) {
  let requests = { [tables.HospitalStatus]: items.slice(i, i + 25).map((Item) => ({ PutRequest: { Item } })) };
  while (Object.keys(requests).length) {
    const result = await db.send(new BatchWriteCommand({ RequestItems: requests }));
    requests = /** @type {any} */ (result.UnprocessedItems ?? {});
  }
}
console.log(`Seeded ${items.length} hospitals into ${tables.HospitalStatus}.`);
