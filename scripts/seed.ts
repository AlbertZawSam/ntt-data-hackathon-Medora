/**
 * Loads the synthetic demo hospitals from shared/data/hospitals.json into your own sandbox
 * (task 5.3). Running it again resets those hospitals to their starting status, which is also how
 * to reset the demo. Hospitals registered in the app are never touched.
 *
 *   npm run seed            (uses your current AWS credentials; run `aws sso login` first)
 *
 * Reads the API from frontend/amplify_outputs.json, so it writes only to the sandbox you deployed.
 * Writes three tables per hospital (HospitalProfile, HospitalStatus, PublicDirectory) and a few made-up
 * specialists with clinic slots for the next three days. Synthetic data only.
 * Cost: about 33 DynamoDB writes per run, well under one US cent.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { AppSyncClient, paginateListGraphqlApis } from '@aws-sdk/client-appsync';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { DEMO_HOSPITALS, demoStatus } from '@medora/shared/logic/demoHospitals';
import { demoSpecialists } from '@medora/shared/logic/demoSpecialists';
import { publicEntry } from '@medora/shared/logic/publicDirectory';
import { seedHospitalId, seedSpecialistId } from './seed-id';

const REGION = 'us-east-1';

async function findApiId(url: string): Promise<string> {
  const appsync = new AppSyncClient({ region: REGION });
  for await (const page of paginateListGraphqlApis({ client: appsync }, {})) {
    const api = page.graphqlApis?.find((a) => a.uris?.GRAPHQL === url);
    if (api?.apiId) return api.apiId;
  }
  throw new Error('The API in frontend/amplify_outputs.json was not found. Is your sandbox running?');
}

async function main(): Promise<void> {
  const root = resolve(dirname(process.argv[1]), '..');
  const outputs = JSON.parse(readFileSync(resolve(root, 'frontend', 'amplify_outputs.json'), 'utf8')) as {
    data?: { url?: string; aws_region?: string };
  };
  if (!outputs.data?.url) throw new Error('No API in frontend/amplify_outputs.json. Run `npm run sandbox` first.');
  if (outputs.data.aws_region !== REGION) throw new Error(`Refusing to seed ${outputs.data.aws_region}: this project uses ${REGION} only.`);

  const apiId = await findApiId(outputs.data.url);
  const table = (model: string): string => `${model}-${apiId}-NONE`;
  const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), { marshallOptions: { removeUndefinedValues: true } });
  const now = Date.now();
  const stamp = new Date(now).toISOString();
  const put = (model: string, item: Record<string, unknown>): Promise<unknown> =>
    db.send(new PutCommand({ TableName: table(model), Item: { ...item, __typename: model, createdAt: stamp, updatedAt: stamp } }));

  console.log(`Seeding ${DEMO_HOSPITALS.length} synthetic hospitals into API ${apiId} (${REGION})\n`);
  for (const hospital of DEMO_HOSPITALS) {
    const hospitalId = seedHospitalId(hospital.key);
    const status = demoStatus(hospital, now);
    const profile = {
      hospitalId,
      name: hospital.name,
      lat: hospital.lat,
      lng: hospital.lng,
      totalBeds: hospital.totalBeds,
      nicuTotal: hospital.nicuTotal,
      typicalWaitMin: hospital.typicalWaitMin,
      departments: hospital.departments,
      equipment: hospital.equipment,
    };
    // The record id is the hospital id, as register-hospital does; update-status finds rows by it.
    // AWSJSON fields are stored as maps, the way AppSync stores them.
    await put('HospitalProfile', { id: hospitalId, ...profile });
    await put('HospitalStatus', { id: hospitalId, hospitalId, status });
    await put('PublicDirectory', { id: hospitalId, hospitalId, entry: publicEntry(profile, status) });
    console.log(`${hospitalId}  ${hospital.name.en}`);
  }
  // Specialists for Find a specialist; AWSJSON slots are stored as a list, as for the other seeded fields.
  const specialists = demoSpecialists(now);
  for (const { hospitalKey, input } of specialists) {
    await put('Specialist', { id: seedSpecialistId(hospitalKey, input.name), hospitalId: seedHospitalId(hospitalKey), ...input });
  }
  console.log(`\n${specialists.length} specialists with clinic slots for the next three days.`);
  console.log('\nDone. Run it again any time to reset these hospitals to their starting status.');
  console.log('Test accounts with a login page: npm run test-logins -- <hospital id above>');
}

main().catch((error: unknown) => {
  console.error(`Seeding failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
