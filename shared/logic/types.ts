// Shared TypeScript types — no React Native imports, so Lambda functions can use them.

/** Bilingual text stored in data (hospital names, reasons, activity entries). */
export interface Bi {
  en: string;
  th: string;
}

/** What the patient-facing classifier returns (Find care). */
export type NeedKey = 'maternity' | 'child' | 'injury' | 'general';

export type PathwayKey =
  | 'stroke'
  | 'stemi'
  | 'preterm'
  | 'peds'
  | 'maternity'
  | 'injury'
  | 'general';

/** One entry of `data/pathways.json`. */
export interface Pathway {
  key: PathwayKey;
  urgent: boolean;
  /** Every listed department must be open. */
  departments: string[];
  /** Every listed equipment item must be working. */
  equipment: string[];
  /** Every listed doctor role must be on duty. */
  onDuty: string[];
  needsBed: boolean;
  needsNicu: boolean;
  /** Treatment window from symptom onset; null when the pathway has none. */
  windowMin: number | null;
  /** Minutes the receiving hospital needs to get ready. */
  prepMin: number;
  /** Department that earns a small bonus when open (e.g. ortho for injury). */
  prefer?: string;
  name: Bi;
}

/** Scoring weights from `data/pathways.json`. */
export interface ScoringWeights {
  waitWeight: number;
  stalePenalty: number;
  unclearPenalty: number;
  lowBedPenalty: number;
  preferBonus: number;
  staleAfterMin: number;
}

export type DeptState = 'open' | 'diverting';

/** What an auto-accept rule can target: a pathway, or a patient walk-in visit. */
export type RuleTarget = PathwayKey | 'visit';

/** Admin-set auto-accept rules: one switch per target plus a shared minimum of free beds. */
export type AutoAcceptRules = Partial<Record<RuleTarget, boolean>> & { minBeds: number };

export interface HospitalStatus {
  /** Ready general beds as entered by the ward unit; reserved beds are counted separately. */
  beds: number;
  nicu: number;
  /** Beds held for accepted requests that haven't arrived yet (released after 2 hours). */
  reservedBeds?: number;
  /** NICU cots held for accepted requests. */
  reservedNicu?: number;
  /** Ready ICU beds as entered by the ICU unit. */
  icu?: number;
  /** Cath lab busy with a case, free in about this many minutes (cleared when it is ready or down). */
  cathlabBusyMin?: number;
  /** Optional note (up to 100 characters) the owning unit left with its last change, by item id. */
  notes?: Record<string, string>;
  /** Which unit last changed each item, and when. Freshness labels read this. */
  meta?: Record<string, { unit: string; at: string }>;
  depts: Record<string, DeptState>;
  /** true = working */
  equip: Record<string, boolean>;
  /** true = on duty */
  oncall: Record<string, boolean>;
  rules: AutoAcceptRules;
  /** Staff marked the data as unclear or conflicting. */
  conflict: boolean;
  /** When staff last confirmed this status (ISO timestamp). */
  updatedAt: string;
}

/** The fields ranking needs about one registered hospital. */
export interface RankableHospital {
  id: string;
  name: Bi;
  lat: number;
  lng: number;
  typicalWaitMin: number;
  status: HospitalStatus;
}

/** Why a hospital can't help; `item` names the department, equipment or role. */
export type Failure =
  | { kind: 'dept'; item: string }
  | { kind: 'equip'; item: string }
  | { kind: 'onDuty'; item: string }
  | { kind: 'beds' }
  | { kind: 'nicu' }
  | { kind: 'tooFar' };

export interface RankedHospital {
  hospital: RankableHospital;
  driveMin: number;
  distanceKm: number;
  /** Lower is better; Infinity when the hospital can't help. */
  score: number;
  /** Data older than the stale threshold. */
  stale: boolean;
  failures: Failure[];
  eligible: boolean;
}

export type CareRequestStatus =
  | 'waiting'
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'no_reply'
  | 'completed';

export type CareRequestType = 'visit' | 'referral' | 'booking';

export interface CareRequest {
  id: string;
  type: CareRequestType;
  hospitalId: string;
  ownerId: string;
  needKey: string;
  etaMin: number;
  status: CareRequestStatus;
  auto: boolean;
  reason?: string;
  note?: string;
  overrideUntil?: number;
  patient: {
    name?: string;
    phone?: string;
    mode: 'car' | 'taxi' | 'ambulance' | 'walking';
    description: string;
  };
  fromHospitalId?: string;
  referralId?: string;
  slot?: { day: string; time: string };
  doctorName?: string;
  createdAtMs: number;
}

export interface Message {
  id: string;
  requestId: string;
  ownerId: string;
  hospitalId: string;
  from: 'patient' | 'hospital';
  key?: string;
  text?: string;
  createdAtMs: number;
}

export type ReferralStatus =
  | 'running'
  | 'awaiting'
  | 'confirmed'
  | 'set_aside'
  | 'failed';

export interface Referral {
  id: string;
  fromHospitalId: string;
  ownerId: string;
  text: string;
  onsetMin?: number;
  lang: 'en' | 'th';
  pathway?: string;
  status: ReferralStatus;
  mode: 'ai' | 'rules';
  chosenId?: string;
  chosenName?: Bi;
  etaMin?: number;
  /** Bilingual recommendation or no-placement explanation. */
  why?: Bi;
  /** Sanitised decision rows for the doctor UI, never raw status data. */
  rows?: unknown[];
  requestIds: string[];
  startedAtMs: number;
  recommendationEn?: string;
  recommendationTh?: string;
  recommendedAtMs?: number;
  elapsedSec?: number;
  /** @deprecated use startedAtMs for referrals. */
  createdAtMs?: number;
}

export interface TraceStep {
  id: string;
  referralId: string;
  /** Hospital that owns this doctor-only trace. */
  hospitalId: string;
  n: number;
  kind: string;
  title: Bi;
  detail: Bi;
}

export type TransferStatus = 'in_progress' | 'arrived' | 'cancelled';

/** A confirmed transfer, as stored (the `Transfer` model); tracking is simulated in the demo. */
export interface Transfer {
  id: string;
  referralId: string;
  /** Sending and receiving hospital, so staff of both can read it. */
  hospitalIds: string[];
  fromHospitalId: string;
  toHospitalId: string;
  ownerId: string;
  /** Milliseconds since the epoch. */
  startedAt: number;
  etaMin: number;
  status: TransferStatus;
}

export interface Activity {
  id: string;
  hospitalId?: string;
  ownerId?: string;
  actor: Bi;
  text: Bi;
  createdAt: string; // ISO UTC
}

export interface Device {
  id: string;
  userId: string;
  token: string;
  platform: 'ios' | 'android';
  endpointArn: string;
  updatedAt: string;
}

export interface HospitalProfile {
  id: string;
  hospitalId: string;
  name: Bi;
  lat: number;
  lng: number;
  totalBeds: number;
  nicuTotal: number;
  typicalWaitMin: number;
  departments: string[];
  equipment: string[];
  createdAt?: string;
}

export interface Specialist {
  id: string;
  hospitalId: string;
  nameEn: string;
  specialty: string;
  languages: string[];
  namePublic: boolean;
  slots: Slot[];
  createdAt: string;
}

export interface Slot {
  id: string;
  day: string;
  time: string;
  booked: boolean;
}
