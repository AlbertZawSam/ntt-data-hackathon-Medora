import { DEMO_HOSPITALS } from '../logic/demoHospitals';
import { buildKbDocuments, kbTraceDetail } from '../logic/kb';

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

describe('kbTraceDetail', () => {
  const names: Record<string, { en: string; th: string }> = { H1: { en: 'Rama Nine', th: 'พระรามเก้า' }, H2: { en: 'Siam', th: 'สยาม' } };
  const nameOf = (id: string) => names[id];

  it('lists the matching hospitals and source documents in both languages', () => {
    const detail = kbTraceDetail(
      [
        { hospitalId: 'H1', source: 's3://bucket-1/rama9/neuro.md' },
        { hospitalId: 'H1', source: 's3://bucket-1/rama9/neuro.md' },
        { hospitalId: 'H2', source: 's3://bucket-1/siam/neuro.md' },
      ],
      nameOf,
    );
    expect(detail.en).toBe('2 source document(s): Rama Nine (rama9/neuro.md), Siam (siam/neuro.md).');
    expect(detail.th).toContain('พระรามเก้า (rama9/neuro.md)');
  });

  it('says so when no knowledge base is set up, and when nothing matches', () => {
    expect(kbTraceDetail([{ hospitalId: 'H1', source: 'hospital-profile' }], nameOf).en).toContain('No knowledge base is set up');
    expect(kbTraceDetail([], nameOf).en).toBe('No matching source found.');
  });

  it('shows at most a few documents and says there are more', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ hospitalId: 'H1', source: `s3://b/rama9/d${i}.md` }));
    const detail = kbTraceDetail(many, nameOf, 3);
    expect(detail.en).toContain('6 source document(s)');
    expect(detail.en).toContain('and more');
    expect(detail.en).not.toContain('d3.md');
  });
});
