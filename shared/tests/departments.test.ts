import { DEMO_HOSPITALS, demoStatus } from '../logic/demoHospitals';
import { isDepartment, openDepartments, suggestedDepartment } from '../logic/departments';
import { openStatus } from './generators';

describe('departments', () => {
  it('lists only departments the hospital has open', () => {
    const status = openStatus({ depts: { ed: 'open', cardio: 'open', ortho: 'diverting' } });
    expect(openDepartments(status)).toEqual(['cardiology']);
  });

  it('suggests Obstetrics for pregnancy and Surgery for injuries, nothing otherwise', () => {
    expect(suggestedDepartment('maternity')).toBe('obstetrics');
    expect(suggestedDepartment('injury')).toBe('surgery');
    expect(suggestedDepartment('general')).toBeUndefined();
    expect(isDepartment('cardiology')).toBe(true);
    expect(isDepartment('ward')).toBe(false);
  });

  it('gives the two demo hospitals all three departments, and they wait for staff to accept', () => {
    for (const key of ['rama9', 'chaophraya']) {
      const hospital = DEMO_HOSPITALS.find((h) => h.key === key)!;
      expect(openDepartments(demoStatus(hospital, Date.now()))).toEqual(['cardiology', 'surgery', 'obstetrics']);
      expect(hospital.status.rules.visit).toBe(false);
    }
  });
});
