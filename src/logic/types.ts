// Shared types for src/logic. No React Native imports: Lambda functions use these too.

// Text stored for readers in either language.
export type Bi = { en: string; th: string };

export type LatLng = { lat: number; lng: number };

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
