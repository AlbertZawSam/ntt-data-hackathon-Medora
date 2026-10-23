import { DEMO_HOSPITALS } from '../logic/demoHospitals';
import { buildKbDocuments } from '../logic/kb';

const docs = buildKbDocuments(DEMO_HOSPITALS, (key) => `id-${key}`);

describe('knowledge base documents', () => {
  it('has one document per hospital department, with the hospital id and department as metadata', () => {
    const expected = DEMO_HOSPITALS.flatMap((h) => h.departments.map((d) => `${h.key}/${d}.md`));
    expect(docs.map((d) => d.path)).toEqual(expected);
    for (const doc of docs) {
      const { hospitalId, hospitalKey, department } = doc.metadata.metadataAttributes;
      expect(hospitalId).toBe(`id-${hospitalKey}`);
      expect(doc.path).toBe(`${hospitalKey}/${department}.md`);
    }
  });

  it('is bilingual, so Thai and mixed Thai-English questions can match', () => {
    for (const doc of docs) {
      expect(doc.text).toMatch(/[฀-๿]/);
      expect(doc.text).toMatch(/[A-Za-z]{4}/);
    }
  });

  it('names stroke care only for hospitals with neurology and a CT scanner', () => {
    const stroke = (key: string) => docs.find((d) => d.path === `${key}/neuro.md`)?.text ?? '';
    expect(stroke('rama9')).toContain('stroke care');
    // Siam Central has neurology and CT too; Lat Phrao has both; none of the neuro-less hospitals has a document.
    expect(docs.some((d) => d.path === 'thonburi/neuro.md')).toBe(false);
  });

  it('states registered capability only and never live counts', () => {
    for (const doc of docs) {
      expect(doc.text).toContain('registered capability only');
      expect(doc.text).not.toMatch(/\b(free|ready) beds?\b/i);
    }
  });
});
