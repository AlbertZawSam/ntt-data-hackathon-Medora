/**
 * Synthetic specialists for the demo hospitals, so Find a specialist has results right after
 * `npm run seed`. Names are made up (team data set, 18 Nov 2026). Each doctor keeps a weekly clinic
 * ("Mon, Wed, Fri 09:00–12:00"); seeding turns it into open slots for the next seven Bangkok days, which
 * the specialist page shows again as weekly hours. Pure TypeScript, used by scripts/seed.ts and the tests.
 * Requirements: 8.1 to 8.6, 17.1
 */
import type { Slot, SpecialistInput, Specialty } from './specialists';

/** Weekly clinic hours: weekdays 0 = Monday … 6 = Sunday, HH:MM start and end. */
export interface Clinic {
  weekdays: number[];
  start: string;
  end: string;
}

interface DemoSpecialist {
  hospitalKey: string;
  name: string;
  specialty: Specialty;
  languages: string[];
  namePublic: boolean;
  clinic: Clinic;
}

const PEOPLE: DemoSpecialist[] = [
  { hospitalKey: 'krungthep', name: 'Dr. Thanakorn Srisawat', specialty: 'neurology', languages: ['th', 'en'], namePublic: true, clinic: { weekdays: [0, 2, 4], start: '09:00', end: '12:00' } },
  { hospitalKey: 'krungthep', name: 'Dr. Pimchanok Rungroj', specialty: 'neurology', languages: ['th'], namePublic: true, clinic: { weekdays: [1, 3], start: '13:00', end: '16:00' } },
  { hospitalKey: 'krungthep', name: 'Dr. Surachai Boonmee', specialty: 'cardiology', languages: ['th', 'en'], namePublic: true, clinic: { weekdays: [0, 3], start: '09:00', end: '12:00' } },
  { hospitalKey: 'krungthep', name: 'Dr. Kanokwan Phongsai', specialty: 'cardiology', languages: ['th', 'en'], namePublic: true, clinic: { weekdays: [1, 4], start: '13:00', end: '16:00' } },
  { hospitalKey: 'krungthep', name: 'Dr. Apinya Chaiyasit', specialty: 'obstetrics', languages: ['th', 'en'], namePublic: true, clinic: { weekdays: [0, 2], start: '13:00', end: '16:00' } },
  { hospitalKey: 'krungthep', name: 'Dr. Worawit Jantarat', specialty: 'pediatrics', languages: ['th'], namePublic: true, clinic: { weekdays: [1, 3], start: '09:00', end: '12:00' } },
  { hospitalKey: 'krungthep', name: 'Dr. Chatchai Meesuk', specialty: 'orthopedics', languages: ['th', 'en'], namePublic: false, clinic: { weekdays: [2, 4], start: '09:00', end: '12:00' } },
  { hospitalKey: 'krungthep', name: 'Dr. Nattaya Wongsakul', specialty: 'general', languages: ['th', 'en'], namePublic: true, clinic: { weekdays: [0, 1, 2, 3, 4], start: '08:00', end: '16:00' } },
  { hospitalKey: 'sathorn', name: 'Dr. Pongsak Thanarat', specialty: 'cardiology', languages: ['th', 'en'], namePublic: true, clinic: { weekdays: [0, 2, 4], start: '09:00', end: '12:00' } },
  { hospitalKey: 'sathorn', name: 'Dr. Orawan Sukjai', specialty: 'cardiology', languages: ['th', 'en'], namePublic: true, clinic: { weekdays: [1, 3], start: '09:00', end: '12:00' } },
  { hospitalKey: 'sathorn', name: 'Dr. Kriangkrai Pattanapong', specialty: 'cardiology', languages: ['th'], namePublic: true, clinic: { weekdays: [0, 3], start: '13:00', end: '16:00' } },
  { hospitalKey: 'sathorn', name: 'Dr. Jiraporn Limsakul', specialty: 'cardiology', languages: ['th', 'en'], namePublic: false, clinic: { weekdays: [2, 5], start: '09:00', end: '12:00' } },
  { hospitalKey: 'sathorn', name: 'Dr. Anucha Kaewmanee', specialty: 'general', languages: ['th'], namePublic: true, clinic: { weekdays: [0, 1, 2, 3, 4], start: '08:00', end: '16:00' } },
  { hospitalKey: 'phranakhon', name: 'Dr. Sasithorn Phetcharat', specialty: 'obstetrics', languages: ['th', 'en'], namePublic: true, clinic: { weekdays: [0, 2, 4], start: '09:00', end: '12:00' } },
  { hospitalKey: 'phranakhon', name: 'Dr. Wilaiwan Homchan', specialty: 'obstetrics', languages: ['th'], namePublic: true, clinic: { weekdays: [1, 3, 5], start: '09:00', end: '12:00' } },
  { hospitalKey: 'phranakhon', name: 'Dr. Ratchanee Inthawong', specialty: 'obstetrics', languages: ['th', 'en'], namePublic: true, clinic: { weekdays: [0, 3], start: '13:00', end: '16:00' } },
  { hospitalKey: 'phranakhon', name: 'Dr. Thawatchai Noisri', specialty: 'pediatrics', languages: ['th', 'en'], namePublic: true, clinic: { weekdays: [1, 4], start: '09:00', end: '12:00' } },
  { hospitalKey: 'phranakhon', name: 'Dr. Benjamas Kongkaew', specialty: 'pediatrics', languages: ['th'], namePublic: true, clinic: { weekdays: [0, 2, 4], start: '13:00', end: '16:00' } },
  { hospitalKey: 'phranakhon', name: 'Dr. Supaporn Ruangsri', specialty: 'pediatrics', languages: ['th', 'en'], namePublic: false, clinic: { weekdays: [1, 3], start: '13:00', end: '16:00' } },
  { hospitalKey: 'bangkapi', name: 'Dr. Wichai Panyasiri', specialty: 'orthopedics', languages: ['th', 'en'], namePublic: true, clinic: { weekdays: [0, 2, 4], start: '09:00', end: '12:00' } },
  { hospitalKey: 'bangkapi', name: 'Dr. Sompong Duangkaew', specialty: 'orthopedics', languages: ['th'], namePublic: true, clinic: { weekdays: [1, 3], start: '09:00', end: '12:00' } },
  { hospitalKey: 'bangkapi', name: 'Dr. Nuttapong Sirichai', specialty: 'orthopedics', languages: ['th', 'en'], namePublic: true, clinic: { weekdays: [0, 3], start: '13:00', end: '16:00' } },
  { hospitalKey: 'bangkapi', name: 'Dr. Patcharin Yodrak', specialty: 'orthopedics', languages: ['th', 'en'], namePublic: true, clinic: { weekdays: [2, 5], start: '13:00', end: '16:00' } },
  { hospitalKey: 'bangkapi', name: 'Dr. Ekachai Thongsuk', specialty: 'general', languages: ['th'], namePublic: true, clinic: { weekdays: [0, 1, 2, 3, 4], start: '08:00', end: '16:00' } },
  { hospitalKey: 'ratchada', name: 'Dr. Siriwan Ketkaew', specialty: 'neurology', languages: ['th', 'en'], namePublic: true, clinic: { weekdays: [0, 2, 4], start: '09:00', end: '12:00' } },
  { hospitalKey: 'ratchada', name: 'Dr. Prasit Chaowalit', specialty: 'neurology', languages: ['th'], namePublic: true, clinic: { weekdays: [1, 3], start: '09:00', end: '12:00' } },
  { hospitalKey: 'ratchada', name: 'Dr. Areerat Somboon', specialty: 'neurology', languages: ['th', 'en'], namePublic: true, clinic: { weekdays: [0, 3], start: '13:00', end: '16:00' } },
  { hospitalKey: 'ratchada', name: 'Dr. Kittipong Wiriyakul', specialty: 'neurology', languages: ['th', 'en'], namePublic: false, clinic: { weekdays: [2, 4], start: '13:00', end: '16:00' } },
  { hospitalKey: 'ratchada', name: 'Dr. Lalita Sangthong', specialty: 'general', languages: ['th', 'en'], namePublic: true, clinic: { weekdays: [0, 1, 2, 3, 4], start: '08:00', end: '16:00' } },
  { hospitalKey: 'sukhumvit', name: 'Dr. Peeraya Vongsakul', specialty: 'cardiology', languages: ['th', 'en'], namePublic: true, clinic: { weekdays: [0, 2, 4], start: '09:00', end: '12:00' } },
  { hospitalKey: 'sukhumvit', name: 'Dr. Thanawat Leelapun', specialty: 'orthopedics', languages: ['th', 'en'], namePublic: true, clinic: { weekdays: [1, 3], start: '09:00', end: '12:00' } },
  { hospitalKey: 'sukhumvit', name: 'Dr. Natcha Pisitkul', specialty: 'obstetrics', languages: ['th', 'en'], namePublic: true, clinic: { weekdays: [0, 3], start: '13:00', end: '16:00' } },
  { hospitalKey: 'sukhumvit', name: 'Dr. Varunee Charoenphon', specialty: 'pediatrics', languages: ['th', 'en'], namePublic: true, clinic: { weekdays: [1, 4, 5], start: '09:00', end: '12:00' } },
  { hospitalKey: 'sukhumvit', name: 'Dr. Krit Tantiwong', specialty: 'general', languages: ['th', 'en'], namePublic: true, clinic: { weekdays: [0, 1, 2, 3, 4, 5], start: '08:00', end: '17:00' } },
  { hospitalKey: 'sukhumvit', name: 'Dr. Sirinapa Aksorn', specialty: 'general', languages: ['th', 'en'], namePublic: true, clinic: { weekdays: [0, 1, 2, 3, 4], start: '08:00', end: '16:00' } },
  { hospitalKey: 'thonglo', name: 'Dr. Chutima Phromma', specialty: 'pediatrics', languages: ['th', 'en'], namePublic: true, clinic: { weekdays: [0, 2, 4], start: '09:00', end: '12:00' } },
  { hospitalKey: 'thonglo', name: 'Dr. Narongsak Buakaew', specialty: 'pediatrics', languages: ['th'], namePublic: true, clinic: { weekdays: [1, 3], start: '09:00', end: '12:00' } },
  { hospitalKey: 'thonglo', name: 'Dr. Jutamas Saelim', specialty: 'pediatrics', languages: ['th', 'en'], namePublic: true, clinic: { weekdays: [0, 3], start: '13:00', end: '16:00' } },
  { hospitalKey: 'thonglo', name: 'Dr. Phattharaphon Kamon', specialty: 'pediatrics', languages: ['th'], namePublic: false, clinic: { weekdays: [2, 5], start: '13:00', end: '16:00' } },
  { hospitalKey: 'bangkhae', name: 'Dr. Kamolwan Sriprasert', specialty: 'obstetrics', languages: ['th'], namePublic: true, clinic: { weekdays: [0, 2, 4], start: '09:00', end: '12:00' } },
  { hospitalKey: 'bangkhae', name: 'Dr. Duangjai Maneerat', specialty: 'obstetrics', languages: ['th'], namePublic: true, clinic: { weekdays: [1, 3, 5], start: '09:00', end: '12:00' } },
  { hospitalKey: 'minburi', name: 'Dr. Somsak Rattanakorn', specialty: 'cardiology', languages: ['th'], namePublic: true, clinic: { weekdays: [1, 3], start: '09:00', end: '12:00' } },
  { hospitalKey: 'minburi', name: 'Dr. Pornthip Saengchan', specialty: 'obstetrics', languages: ['th'], namePublic: true, clinic: { weekdays: [0, 2, 4], start: '09:00', end: '12:00' } },
  { hospitalKey: 'minburi', name: 'Dr. Sakchai Poonsawat', specialty: 'orthopedics', languages: ['th'], namePublic: true, clinic: { weekdays: [0, 3], start: '13:00', end: '16:00' } },
  { hospitalKey: 'minburi', name: 'Dr. Yupin Thammasorn', specialty: 'general', languages: ['th', 'en'], namePublic: true, clinic: { weekdays: [0, 1, 2, 3, 4], start: '08:00', end: '16:00' } },
  { hospitalKey: 'nonthaburi', name: 'Dr. Manop Khamsing', specialty: 'orthopedics', languages: ['th'], namePublic: true, clinic: { weekdays: [1, 3], start: '09:00', end: '12:00' } },
  { hospitalKey: 'nonthaburi', name: 'Dr. Rungnapa Siriwat', specialty: 'pediatrics', languages: ['th'], namePublic: true, clinic: { weekdays: [0, 2], start: '09:00', end: '12:00' } },
  { hospitalKey: 'nonthaburi', name: 'Dr. Prayoon Jaidee', specialty: 'general', languages: ['th'], namePublic: true, clinic: { weekdays: [0, 1, 2, 3, 4], start: '08:00', end: '16:00' } },
];

const BANGKOK_OFFSET_MS = 7 * 60 * 60_000;
/** An admin may save at most 60 slots per specialist (specialists.ts), so long clinics use one-hour appointments. */
const MAX_SLOTS = 60;

const toMin = (time: string): number => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const toTime = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Open slots for a weekly clinic on the next seven Bangkok days (tomorrow onwards), none booked. */
export function clinicSlots(clinic: Clinic, nowMs: number): Slot[] {
  const days: string[] = [];
  for (let d = 1; d <= 7; d += 1) {
    const date = new Date(nowMs + BANGKOK_OFFSET_MS + d * 86_400_000);
    if (clinic.weekdays.includes((date.getUTCDay() + 6) % 7)) days.push(date.toISOString().slice(0, 10));
  }
  const span = toMin(clinic.end) - toMin(clinic.start);
  const step = (span / 30) * days.length <= MAX_SLOTS ? 30 : 60;
  const slots: Slot[] = [];
  for (const day of days) {
    for (let m = toMin(clinic.start); m + step <= toMin(clinic.end); m += step) {
      const time = toTime(m);
      slots.push({ id: `${day.replace(/-/g, '')}${time.replace(':', '')}`, day, time, booked: false });
    }
  }
  return slots;
}

/** Every demo specialist as admin input, with fresh slots from `nowMs`. */
export function demoSpecialists(nowMs: number): Array<{ hospitalKey: string; input: SpecialistInput }> {
  return PEOPLE.map(({ hospitalKey, clinic, ...person }) => ({ hospitalKey, input: { ...person, slots: clinicSlots(clinic, nowMs) } }));
}
