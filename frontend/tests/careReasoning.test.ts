import type { PublicHospital } from '@medora/shared/logic/care';
import { careReasoning } from '../src/i18n/careReasoning';
import { translate, type Lang, type Params, type StringKey } from '../src/i18n/t';

const tFor = (lang: Lang) => (key: StringKey, params?: Params) => translate(lang, key, params);
const hospital = (id: string, en: string, th: string, driveMin: number, label: PublicHospital['label']): PublicHospital => ({
  id,
  name: { en, th },
  lat: 13.7,
  lng: 100.5,
  driveMin,
  distanceKm: driveMin / 2,
  label,
});
// As Find care returns them: hospitals that can help first, then the ones that can't.
const hospitals = [
  hospital('chaophraya', "Chao Phraya Central Hospital", 'โรงพยาบาลเจ้าพระยาเซ็นทรัล', 12, 'available'),
  hospital('pathumwan', 'Pathum Wan Medical Center', 'ศูนย์การแพทย์ปทุมวัน', 9, 'limited'),
  hospital('asok', 'Asok Medical Clinic', 'คลินิกเวชกรรมอโศก', 5, 'notAvailable'),
];

describe('Find care AI reasoning', () => {
  it('walks through the safety check, the AI category, the hospitals checked and the best match', () => {
    const steps = careReasoning(tFor('en'), 'en', { need: 'child', aiUsed: true, summary: { en: 'A child with a high fever.', th: 'เด็กมีไข้สูง' }, hospitals });
    expect(steps.map((s) => s.id)).toEqual(['safety', 'understood', 'checked', 'order', 'best', 'you']);
    expect(steps[0].detail).toContain('fixed safety rules, not AI');
    expect(steps[1].detail).toBe('The AI (Amazon Nova) read it as: Child. A child with a high fever.');
    expect(steps[2].title).toBe('Checked 3 hospitals near you');
    expect(steps[2].detail).toContain('2 can help with this now; 1 can');
    expect(steps[4].title).toBe("Best match: Chao Phraya Central Hospital");
    // The closer hospital that can't help is named, with no reason beyond "can't take this case right now".
    expect(steps[4].detail).toContain('Closer, but can');
    expect(steps[4].detail).toContain('Asok Medical Clinic');
    expect(steps.at(-1)?.detail).toContain('the hospital decides');
  });

  it('says when keywords chose the category, or when the text was not a health problem', () => {
    expect(careReasoning(tFor('en'), 'en', { need: 'injury', aiUsed: false, hospitals })[1].detail).toBe("The AI wasn't available, so keywords matched it as: Injury.");
    expect(careReasoning(tFor('en'), 'en', { need: 'general', aiUsed: true, unclear: true, hospitals })[1].detail).toContain("didn't read as a health problem");
  });

  it('points to 1669 when no hospital can help', () => {
    const steps = careReasoning(tFor('en'), 'en', { need: 'general', aiUsed: true, hospitals: [hospitals[2]] });
    expect(steps.find((s) => s.id === 'best')).toMatchObject({ state: 'error', detail: 'If this is an emergency, call 1669.' });
  });

  it('reads in Thai with Thai hospital names', () => {
    const steps = careReasoning(tFor('th'), 'th', { need: 'child', aiUsed: true, hospitals });
    expect(steps[2].title).toBe('ตรวจสอบโรงพยาบาลใกล้คุณ 3 แห่ง');
    expect(steps[4].title).toBe('เหมาะที่สุด: โรงพยาบาลเจ้าพระยาเซ็นทรัล');
    expect(steps[4].detail).toContain('คลินิกเวชกรรมอโศก');
  });
});

import { careProgress, PROGRESS_STEP_MS } from '../src/i18n/careReasoning';

describe('Find care live reasoning while searching', () => {
  it('shows the phone emergency check as done and lights up the server steps one by one, never as done', () => {
    const at = (ms: number) => careProgress(tFor('en'), ms).map((s) => s.state);
    expect(at(0)).toEqual(['done', 'active', 'pending', 'pending']);
    expect(at(PROGRESS_STEP_MS)).toEqual(['done', 'active', 'active', 'pending']);
    expect(at(10 * PROGRESS_STEP_MS)).toEqual(['done', 'active', 'active', 'active']);
    expect(careProgress(tFor('en'), 0)[0].detail).toContain('on your phone');
    expect(careProgress(tFor('th'), 0)[1].title).toBe('กำลังอ่านอาการที่คุณเล่า');
  });
});
