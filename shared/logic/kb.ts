/**
 * Knowledge base documents (requirement 14.1): one bilingual document per hospital department, built
 * from the synthetic hospital data and the pathway rules, so the agent's choices can cite a source.
 * Pure: `scripts/build-kb.ts` writes the files to `shared/data/kb/` and a test checks they match.
 * The documents describe registered capability only; live beds, equipment and doctors come from status.
 */
import { PATHWAYS, PATHWAY_KEYS } from './pathways';
import type { DemoHospital } from './demoHospitals';
import type { Bi } from './types';

const DEPARTMENTS: Record<string, Bi> = {
  ed: { en: 'Emergency department', th: 'ห้องฉุกเฉิน' },
  neuro: { en: 'Neurology', th: 'ประสาทวิทยา' },
  cardio: { en: 'Cardiology', th: 'อายุรกรรมหัวใจ' },
  pediatrics: { en: 'Pediatrics', th: 'กุมารเวชศาสตร์' },
  ortho: { en: 'Orthopedics', th: 'ศัลยกรรมกระดูกและข้อ' },
  obstetrics: { en: 'Obstetrics', th: 'สูติกรรม' },
};

const EQUIPMENT: Record<string, Bi> = {
  ct: { en: 'CT scanner', th: 'เครื่อง CT' },
  mri: { en: 'MRI scanner', th: 'เครื่อง MRI' },
  cathlab: { en: 'cath lab', th: 'ห้องสวนหัวใจ' },
};

export interface KbDocument {
  /** Path under `shared/data/kb/`, for example `rama9/neuro.md`. */
  path: string;
  text: string;
  /** Bedrock metadata sidecar (`<path>.metadata.json`): lets retrieval return the hospital and department. */
  metadata: { metadataAttributes: { hospitalId: string; hospitalKey: string; department: string } };
}

const label = (table: Record<string, Bi>, key: string): Bi => table[key] ?? { en: key, th: key };
const list = (items: Bi[], lang: 'en' | 'th'): string => items.map((item) => item[lang]).join(lang === 'en' ? ', ' : ' ');

/** Pathways whose registered departments and equipment this hospital has, and that use `department`. */
function supportedPathways(hospital: DemoHospital, department: string): Bi[] {
  return PATHWAY_KEYS.map((key) => PATHWAYS[key])
    .filter((p) => p.departments.includes(department))
    .filter((p) => p.departments.every((d) => hospital.departments.includes(d)) && p.equipment.every((e) => hospital.equipment.includes(e)))
    .map((p) => p.name);
}

export function buildKbDocuments(hospitals: readonly DemoHospital[], idFor: (key: string) => string): KbDocument[] {
  return hospitals.flatMap((hospital) =>
    hospital.departments.map((department): KbDocument => {
      const dept = label(DEPARTMENTS, department);
      const equipment = hospital.equipment.map((e) => label(EQUIPMENT, e));
      const pathways = supportedPathways(hospital, department);
      const careEn = pathways.length ? list(pathways, 'en') : 'general care in this department';
      const careTh = pathways.length ? list(pathways, 'th') : 'การดูแลทั่วไปในแผนกนี้';
      const text = [
        `# ${hospital.name.en}: ${dept.en} / ${hospital.name.th}: ${dept.th}`,
        '',
        `${hospital.name.en} has a ${dept.en.toLowerCase()} department registered.`,
        `Equipment on site: ${equipment.length ? list(equipment, 'en') : 'none registered'}.`,
        `Care this hospital can support when the department is open and staffed: ${careEn}.`,
        `Typical emergency department wait: about ${hospital.typicalWaitMin} minutes. Location: ${hospital.lat}, ${hospital.lng}.`,
        'This document lists registered capability only. Whether a bed, device or doctor is available now comes from live status.',
        '',
        `${hospital.name.th} มีแผนก${dept.th}ที่ลงทะเบียนไว้`,
        `อุปกรณ์ในโรงพยาบาล: ${equipment.length ? list(equipment, 'th') : 'ไม่มีที่ลงทะเบียน'}`,
        `การดูแลที่โรงพยาบาลรองรับได้เมื่อแผนกเปิดและมีบุคลากร: ${careTh}`,
        `เวลารอห้องฉุกเฉินโดยทั่วไปประมาณ ${hospital.typicalWaitMin} นาที`,
        'เอกสารนี้ระบุเฉพาะความสามารถที่ลงทะเบียนไว้ ส่วนเตียง อุปกรณ์ และแพทย์ที่พร้อมในตอนนี้ดูจากสถานะสด',
        '',
      ].join('\n');
      return {
        path: `${hospital.key}/${department}.md`,
        text,
        metadata: { metadataAttributes: { hospitalId: idFor(hospital.key), hospitalKey: hospital.key, department } },
      };
    }),
  );
}
