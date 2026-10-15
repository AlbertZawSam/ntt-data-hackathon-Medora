// Shared types for src/logic. No React Native imports: Lambda functions use these too.

// Text stored for readers in either language.
export type Bi = { en: string; th: string };

export type LatLng = { lat: number; lng: number };

// A searchable place: built-in landmarks, or a result from Amazon Location.
export type Place = LatLng & { id: string; name: Bi; aliases?: string[] };

export type DeptState = 'open' | 'diverting';

export type HospitalStatus = {
  beds: number;
  nicu: number;
  // Minutes since staff last confirmed, as seeded. Live rows carry updatedAt instead.
  ageMin?: number;
  // Epoch milliseconds of the last confirmation.
  updatedAt?: number;
  // Staff flagged the data as unclear.
  conflict: boolean;
  // A department missing from the map doesn't exist at this hospital.
  depts: Record<string, DeptState>;
  equip: Record<string, boolean>;
  oncall: Record<string, boolean>;
  rules: {
    visit?: boolean;
    stroke?: boolean;
    stemi?: boolean;
    preterm?: boolean;
    peds?: boolean;
    minBeds: number;
  };
};

export type Specialist = {
  name: string;
  specialty: string;
  languages: string[];
  namePublic: boolean;
  slots: { day: string; time: string }[];
};

export type Hospital = LatLng & {
  id: string;
  name: Bi;
  totalBeds: number;
  nicuTotal: number;
  typicalWaitMin: number;
  status: HospitalStatus;
  specialists: Specialist[];
};

export type PathwayKey = 'stroke' | 'stemi' | 'preterm' | 'peds' | 'maternity' | 'injury' | 'general';

export type Pathway = {
  urgent: boolean;
  departments: string[];
  equipment: string[];
  onDuty: string[];
  needsBed: boolean;
  needsNicu: boolean;
  // Treatment window from symptom onset; null when there's no fixed window.
  windowMin: number | null;
  prepMin: number;
  // Department that earns a small bonus when open, such as ortho for injuries.
  prefer?: string;
  name: Bi;
};

export type Scoring = {
  waitWeight: number;
  stalePenalty: number;
  unclearPenalty: number;
  lowBedPenalty: number;
  preferBonus: number;
  staleAfterMin: number;
};

export type RedFlagRule = {
  key: string;
  label: Bi;
  patterns: string[];
};

// Backend records (design.md "Data models"). Times ending in Ms are epoch milliseconds.

export type RequestType = 'visit' | 'referral' | 'booking';

// waiting → accepted | declined | no_reply (45 s, Requirement 6.4); a waiting or accepted request
// can be cancelled by the patient, withdrawn when the agent recommends another hospital, or completed.
export type RequestStatus = 'waiting' | 'accepted' | 'declined' | 'no_reply' | 'cancelled' | 'withdrawn' | 'completed';

// Requirement 10.2.
export type DeclineReason = 'no_bed' | 'specialist_busy' | 'equipment_down' | 'diverting';

// Requirement 6.1.
export type ArrivalMode = 'car' | 'taxi' | 'ambulance' | 'walking';

export type CareRequest = {
  id: string;
  type: RequestType;
  hospitalId: string;
  ownerId: string;
  needKey: PathwayKey;
  etaMin: number;
  status: RequestStatus;
  // Accepted by an auto-accept rule rather than by staff.
  auto: boolean;
  reason?: DeclineReason;
  // Staff note for the agent and the requester, up to 200 characters.
  note?: string;
  // Until when staff can undo an automatic acceptance (60 s).
  overrideUntil?: number;
  patient?: { name?: string; phone?: string; mode: ArrivalMode; description: string };
  fromHospitalId?: string;
  referralId?: string;
  slot?: { day: string; time: string };
  doctorName?: string;
  createdAtMs: number;
};

export type Message = {
  id: string;
  requestId: string;
  from: 'patient' | 'hospital';
  // A quick reply is stored as a key so each side reads it in its own language;
  // otherwise free text of up to 300 characters.
  key?: string;
  text?: string;
  createdAtMs: number;
};

export type ReferralStatus = 'running' | 'awaiting' | 'confirmed' | 'set_aside' | 'failed';

export type Referral = {
  id: string;
  fromHospitalId: string;
  ownerId: string;
  text: string;
  onsetMin?: number;
  lang: 'en' | 'th';
  pathway?: PathwayKey;
  status: ReferralStatus;
  // 'rules' is the rule-based backup path.
  mode: 'ai' | 'rules';
  chosenId?: string;
  etaMin?: number;
  why?: Bi;
  // Decision table rows; shape set by the agent-runner task.
  rows?: unknown[];
  requestIds?: string[];
  startedAtMs: number;
  recommendedAtMs?: number;
};

export type TraceStep = {
  id: string;
  referralId: string;
  n: number;
  // Such as a tool name or "reasoning"; the set is fixed by the agent-runner task.
  kind: string;
  title: Bi;
  detail?: Bi;
};

export type Transfer = {
  id: string;
  referralId: string;
  fromHospitalId: string;
  toHospitalId: string;
  startedAt: number;
  etaMin: number;
  status: 'en_route' | 'arrived';
};

export type Activity = {
  id: string;
  at: number;
  actor: Bi;
  text: Bi;
};
