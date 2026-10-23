import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEMO_HOSPITALS } from '@medora/shared/logic/demoHospitals';
import { buildKbDocuments } from '@medora/shared/logic/kb';
import { seedHospitalId } from '../../scripts/seed-id';

const root = resolve(__dirname, '../../shared/data/kb');

describe('shared/data/kb', () => {
  it('matches what `npm run kb` generates, so the files uploaded to the knowledge base are current', () => {
    for (const doc of buildKbDocuments(DEMO_HOSPITALS, seedHospitalId)) {
      const file = resolve(root, doc.path);
      expect(existsSync(file)).toBe(true);
      expect(readFileSync(file, 'utf8')).toBe(doc.text);
      expect(JSON.parse(readFileSync(`${file}.metadata.json`, 'utf8'))).toEqual(doc.metadata);
    }
  });
});
