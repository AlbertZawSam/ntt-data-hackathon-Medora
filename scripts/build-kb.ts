/**
 * Writes the knowledge base documents to shared/data/kb/ (task 23, requirement 14.1): one bilingual
 * document per hospital department plus the metadata file Bedrock reads next to it. Synthetic data only.
 * The hospital ids are the ones `npm run seed` creates, so retrieval results match the agent's hospitals.
 *
 *   npm run kb        (offline; no AWS calls)
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DEMO_HOSPITALS } from '@medora/shared/logic/demoHospitals';
import { buildKbDocuments } from '@medora/shared/logic/kb';
import { seedHospitalId } from './seed-id';

// Run from the repository root, like every other command.
const root = resolve('shared/data/kb');
rmSync(root, { recursive: true, force: true });
for (const doc of buildKbDocuments(DEMO_HOSPITALS, seedHospitalId)) {
  const file = resolve(root, doc.path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, doc.text);
  writeFileSync(`${file}.metadata.json`, `${JSON.stringify(doc.metadata, null, 2)}\n`);
  console.log(doc.path);
}
