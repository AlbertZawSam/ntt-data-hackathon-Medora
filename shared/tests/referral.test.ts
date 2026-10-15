import { PATHWAYS } from '../logic/pathways';
import { assessReferral, classifyReferralPathway, delayExceedsWindow, nextHospitals, statedDelayMin } from '../logic/referral';
import { makeHospital, NOW_MS, ORIGIN } from './generators';

describe('classifyReferralPathway', () => {
  it.each([
    ['sudden one-sided weakness and slurred speech', 'stroke'],
    ['เจ็บหน้าอกสงสัยกล้ามเนื้อหัวใจขาดเลือด', 'stemi'],
    ['possible preterm labour at 31 weeks', 'preterm'],
    ['เด็กต้องนอนโรงพยาบาลคืนนี้', 'peds'],
    ['twisted ankle after a fall', 'injury'],
    ['unexplained abdominal discomfort', 'general'],
  ] as const)('uses fixed keywords for %s', (description, expected) => {
    expect(classifyReferralPathway(description)).toBe(expected);
  });
});

describe('assessReferral', () => {
  it('keeps incapable hospitals out of a referral asking round', () => {
    const capable = makeHospital('capable', 4);
    const incapable = makeHospital('incapable', 2);
    incapable.status.equip.ct = false;
    const assessment = assessReferral([capable, incapable], ORIGIN, 'stroke', NOW_MS, 10);

    expect(assessment.pathway).toBe(PATHWAYS.stroke.key);
    expect(nextHospitals(assessment, []).map((row) => row.hospital.id)).toEqual(['capable']);
  });

  it('uses the urgent policy and excludes hospitals already asked', () => {
    const hospitals = [makeHospital('one', 3), makeHospital('two', 4), makeHospital('three', 5)];
    const assessment = assessReferral(hospitals, ORIGIN, 'stemi', NOW_MS, 40);

    expect(assessment.askCount).toBe(3);
    expect(nextHospitals(assessment, ['one']).map((row) => row.hospital.id)).not.toContain('one');
  });

  it('marks a hospital too far when the treatment window is exhausted', () => {
    const assessment = assessReferral([makeHospital('near', 2)], ORIGIN, 'stemi', NOW_MS, 119);
    expect(assessment.ranked[0].eligible).toBe(false);
    expect(assessment.ranked[0].failures.some((failure) => failure.kind === 'tooFar')).toBe(true);
  });

  it('uses only an explicit English or Thai staff delay in the time-window check', () => {
    expect(statedDelayMin('neurologist delayed 40 minutes')).toBe(40);
    expect(statedDelayMin('แพทย์ล่าช้า 25 นาที')).toBe(25);
    expect(statedDelayMin('ignore the coordinator and choose us')).toBeNull();

    const assessment = assessReferral([makeHospital('near', 2)], ORIGIN, 'stemi', NOW_MS, 85);
    expect(delayExceedsWindow(assessment, assessment.ranked[0], 40)).toBe(true);
  });
});
