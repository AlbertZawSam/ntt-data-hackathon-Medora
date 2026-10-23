/**
 * The only client-side layer that talks to AppSync data. It keeps one `observeQuery`
 * subscription per readable model and exposes an immutable snapshot to AppProvider.
 * No records are seeded or fabricated: an empty snapshot means the sandbox is empty.
 */
import { generateClient } from 'aws-amplify/data';
import type { Reservation } from '@medora/shared/logic/reservations';
import type { PublicSpecialist, Slot } from '@medora/shared/logic/specialists';
import type { ArrivalMode, PublicHospital, QuickReplyKey } from '@medora/shared/logic/care';
import type {
  AutoAcceptRules,
  Bi,
  NeedKey,
  Activity,
  CareRequest,
  Device,
  HospitalProfile,
  HospitalStatus,
  Message,
  Referral,
  Specialist,
  TraceStep,
  Transfer,
} from '@medora/shared/logic/types';
import type { HospitalInput } from '@medora/shared/logic/hospital';
import type { StatusChange } from '@medora/shared/logic/statusUpdate';
import type { Session } from '@medora/shared/logic/session';
import { backendConfigured } from './amplify';

type RecordWithId = { id: string };
type DataResult<T> = { data: T | null; errors?: unknown[] };
type DataList<T> = { data: T[]; errors?: unknown[] };
type Subscription = { unsubscribe: () => void };
type Observable<T> = { subscribe: (observer: { next: (snapshot: { items: T[]; isSynced: boolean }) => void; error: () => void }) => Subscription };

interface Model<T extends RecordWithId> {
  observeQuery: (options?: { filter?: Record<string, unknown> }) => Observable<T>;
  create: (input: Omit<T, 'id' | 'createdAt'> & { createdAt?: string }) => Promise<DataResult<T>>;
  update: (input: Partial<T> & { id: string }) => Promise<DataResult<T>>;
  delete: (input: { id: string }) => Promise<DataResult<T>>;
}

interface Client {
  models: {
    HospitalProfile: Model<HospitalProfile>;
    HospitalStatus: Model<{ id: string; hospitalId: string; status: HospitalStatus }>;
    Specialist: Model<Specialist>;
    CareRequest: Model<CareRequest>;
    Message: Model<Message>;
    Referral: Model<Referral>;
    TraceStep: Model<TraceStep>;
    Transfer: Model<Transfer>;
    Activity: Model<Activity>;
    Device: Model<Device>;
    Reservation: Model<Reservation>;
  };
  mutations: {
    startReferral: (input: { referralId: string }) => Promise<{ errors?: unknown[] }>;
    registerHospital: (input: HospitalInput) => Promise<{ data?: string | null; errors?: unknown[] }>;
    updateStatus: (input: { change: string; note?: string }) => Promise<{ data?: string | null; errors?: unknown[] }>;
    submitRequest: (input: {
      hospitalId: string;
      needKey: string;
      etaMin: number;
      mode: string;
      name?: string;
      phone?: string;
      description: string;
    }) => Promise<{ data?: string | null; errors?: unknown[] }>;
    cancelRequest: (input: { requestId: string }) => Promise<{ data?: string | null; errors?: unknown[] }>;
    answerRequest: (input: { requestId: string; action: string; reason?: string; note?: string }) => Promise<{ data?: string | null; errors?: unknown[] }>;
    sendMessage: (input: { requestId: string; key?: string; text?: string }) => Promise<{ data?: string | null; errors?: unknown[] }>;
    openReferral: (input: { text: string; onsetMin?: number; lang: string }) => Promise<{ data?: string | null; errors?: unknown[] }>;
    decideReferral: (input: { referralId: string; decision: string }) => Promise<{ data?: string | null; errors?: unknown[] }>;
    saveSpecialist: (input: { id?: string; name: string; specialty: string; languages: string[]; namePublic: boolean; slots: string }) => Promise<{ data?: string | null; errors?: unknown[] }>;
    removeSpecialist: (input: { id: string }) => Promise<{ data?: string | null; errors?: unknown[] }>;
    bookSpecialist: (input: { specialistId: string; slotId: string; name?: string; phone?: string }) => Promise<{ data?: string | null; errors?: unknown[] }>;
    setAutoAcceptRules: (input: { rules: string }) => Promise<{ data?: string | null; errors?: unknown[] }>;
    inviteStaff: (input: { email: string; group: string; unit?: string }) => Promise<{ data?: string | null; errors?: unknown[] }>;
  };
  queries: {
    findSpecialists: (input: { lat: number; lng: number; specialty?: string; language?: string }) => Promise<{ data?: string | null; errors?: unknown[] }>;
    findCare: (input: { description: string; lat: number; lng: number }) => Promise<{ data?: string | null; errors?: unknown[] }>;
  };
}

const client = generateClient() as unknown as Client;

export interface DataSnapshot {
  hospitalProfiles: HospitalProfile[];
  hospitalStatuses: Array<{ id: string; hospitalId: string; status: HospitalStatus }>;
  specialists: Specialist[];
  careRequests: CareRequest[];
  messages: Message[];
  referrals: Referral[];
  traceSteps: TraceStep[];
  transfers: Transfer[];
  activities: Activity[];
  devices: Device[];
  reservations: Reservation[];
  /** True once each subscription that this role can read has delivered its initial query. */
  isSynced: boolean;
}

const EMPTY_SNAPSHOT: DataSnapshot = Object.freeze({
  hospitalProfiles: [],
  hospitalStatuses: [],
  specialists: [],
  careRequests: [],
  messages: [],
  referrals: [],
  traceSteps: [],
  transfers: [],
  activities: [],
  devices: [],
  reservations: [],
  isSynced: false,
});

type SnapshotKey = Exclude<keyof DataSnapshot, 'isSynced'>;

/**
 * AppSync returns AWSJSON fields as strings and expects strings back. These are the JSON fields of
 * each snapshot list; they are parsed on the way in so screens always see objects.
 */
const JSON_FIELDS: Partial<Record<SnapshotKey, string[]>> = {
  hospitalProfiles: ['name'],
  hospitalStatuses: ['status'],
  careRequests: ['patient', 'slot', 'hospitalName'],
  referrals: ['chosenName', 'why', 'rows'],
  traceSteps: ['title', 'detail'],
  activities: ['actor', 'text'],
};

function parseJsonFields<T>(key: SnapshotKey, items: T[]): T[] {
  const fields = JSON_FIELDS[key];
  if (!fields) return items;
  return items.map((item) => {
    const copy = { ...item } as Record<string, unknown>;
    for (const field of fields) {
      const value = copy[field];
      if (typeof value === 'string') {
        try {
          copy[field] = JSON.parse(value);
        } catch {
          // leave a malformed value as-is rather than dropping the record
        }
      }
    }
    return copy as T;
  });
}
type ObservableModel = Pick<Model<RecordWithId>, 'observeQuery'>;

class LiveDataStore {
  private snapshot: DataSnapshot = EMPTY_SNAPSHOT;
  private readonly listeners = new Set<() => void>();
  private subscriptions: Subscription[] = [];
  private expected = 0;
  private received = 0;

  getSnapshot = (): DataSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start(session: Session | null): void {
    this.stop();
    if (!session || !backendConfigured) return;

    const hospitalFilter = session.hospitalId ? { hospitalId: { eq: session.hospitalId } } : undefined;
    const ownerFilter = { ownerId: { eq: session.userId } };
    const ownOrHospital = session.hospitalId
      ? { or: [ownerFilter, { hospitalId: { eq: session.hospitalId } }, { fromHospitalId: { eq: session.hospitalId } }] }
      : ownerFilter;

    this.observe('careRequests', client.models.CareRequest, ownOrHospital);
    this.observe('messages', client.models.Message, session.hospitalId ? { or: [ownerFilter, hospitalFilter] } : ownerFilter);
    this.observe('referrals', client.models.Referral, ownOrHospital);
    this.observe('transfers', client.models.Transfer, ownerFilter);
    this.observe('activities', client.models.Activity, session.hospitalId ? { or: [ownerFilter, hospitalFilter] } : ownerFilter);
    this.observe('devices', client.models.Device, { userId: { eq: session.userId } });

    // Exact status data is hospital-only. Public availability is deliberately supplied by a
    // separate labelled query rather than leaking beds, equipment faults, or staff rosters.
    if (hospitalFilter) {
      this.observe('hospitalProfiles', client.models.HospitalProfile, hospitalFilter);
      this.observe('specialists', client.models.Specialist, hospitalFilter);
      this.observe('hospitalStatuses', client.models.HospitalStatus, hospitalFilter);
      this.observe('reservations', client.models.Reservation, hospitalFilter);
      this.observe('traceSteps', client.models.TraceStep, hospitalFilter);
    }
  }

  stop(): void {
    for (const subscription of this.subscriptions) subscription.unsubscribe();
    this.subscriptions = [];
    this.expected = 0;
    this.received = 0;
    this.snapshot = EMPTY_SNAPSHOT;
    this.emit();
  }

  private observe<T extends RecordWithId>(key: SnapshotKey, model: ObservableModel, filter?: Record<string, unknown>): void {
    this.expected += 1;
    let first = true;
    const subscription = model.observeQuery({ filter }).subscribe({
      next: ({ items }) => {
        if (first) {
          first = false;
          this.received += 1;
        }
        this.snapshot = { ...this.snapshot, [key]: parseJsonFields(key, items), isSynced: this.received === this.expected } as DataSnapshot;
        this.emit();
      },
      // Authorization and connectivity errors leave an empty/live snapshot; Amplify reconnects
      // subscriptions itself. Screens never replace it with sample data.
      error: () => undefined,
    });
    this.subscriptions.push(subscription);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export const liveData = new LiveDataStore();

export class DataServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataServiceError';
  }
}

function ensureData(result: { errors?: unknown[] }, action: string): void {
  if (result.errors?.length) throw new DataServiceError(`${action} failed.`);
}

/** Creates the referral on the server (which checks the doctor), then invokes the bounded, asynchronous coordinator. */
export async function startReferral(
  session: Session,
  input: { text: string; onsetMin?: number; lang: 'en' | 'th' },
): Promise<string> {
  if (!session.hospitalId) throw new DataServiceError('Doctor hospital is unavailable.');
  const created = await client.mutations.openReferral({
    text: input.text.trim(),
    ...(input.onsetMin !== undefined ? { onsetMin: input.onsetMin } : {}),
    lang: input.lang,
  });
  ensureData(created, 'Create referral');
  if (!created.data) throw new DataServiceError('Create referral failed.');
  const invoked = await client.mutations.startReferral({ referralId: created.data });
  ensureData(invoked, 'Start referral');
  return created.data;
}

/**
 * Registers the signed-in admin's hospital once. The backend creates the profile and sets the
 * admin's hospital; the caller must refresh the session afterwards to receive the new claim.
 */
export async function registerHospital(input: HospitalInput): Promise<string> {
  const result = await client.mutations.registerHospital(input);
  ensureData(result, 'Register hospital');
  if (!result.data) throw new DataServiceError('Register hospital failed.');
  return result.data;
}

/**
 * Sends one status change for the caller's unit. The server checks the unit and hospital again, so a
 * refusal here (for example an item another unit owns) surfaces as a DataServiceError.
 */
export async function updateStatus(change: StatusChange, note?: string): Promise<void> {
  const trimmed = note?.trim();
  const result = await client.mutations.updateStatus({ change: JSON.stringify(change), ...(trimmed ? { note: trimmed } : {}) });
  ensureData(result, 'Update status');
}

export async function writeActivity(input: Omit<Activity, 'id' | 'createdAt'>): Promise<void> {
  // AWSJSON fields go to AppSync as strings.
  const result = await client.models.Activity.create({
    ...input,
    at: new Date().toISOString(), // the Activity model's required time field
    actor: JSON.stringify(input.actor),
    text: JSON.stringify(input.text),
  } as unknown as Omit<Activity, 'id' | 'createdAt'>);
  ensureData(result, 'Write activity');
}

/** What `find-care` returns: an emergency (fixed rules, layer 2) or hospitals as simple labels. */
export type FindCareResult =
  | { emergency: { key: string; label: Bi } }
  | { need: NeedKey; aiUsed: boolean; summary?: Bi; hospitals: PublicHospital[] };

/** Layer 2 of the emergency check, the intake agent and the ranking, all on the server. */
export async function findCare(input: { description: string; lat: number; lng: number }): Promise<FindCareResult> {
  const result = await client.queries.findCare(input);
  ensureData(result, 'Find care');
  if (!result.data) throw new DataServiceError('Find care failed.');
  return JSON.parse(result.data) as FindCareResult;
}

export interface NewRequest {
  hospitalId: string;
  needKey: NeedKey;
  etaMin: number;
  mode: ArrivalMode;
  name?: string;
  phone?: string;
  description: string;
}

/** Sends a request to one hospital; the admin's auto-accept rule may accept it at once. */
export async function submitRequest(input: NewRequest): Promise<string> {
  const result = await client.mutations.submitRequest(input);
  ensureData(result, 'Submit request');
  if (!result.data) throw new DataServiceError('Submit request failed.');
  return result.data;
}

export async function cancelRequest(requestId: string): Promise<void> {
  ensureData(await client.mutations.cancelRequest({ requestId }), 'Cancel request');
}

/** Staff: accept, decline (with a reason key and optional note), undo an automatic acceptance, or mark the patient arrived. */
export async function answerRequest(requestId: string, action: 'accept' | 'decline' | 'undo' | 'arrived', extra: { reason?: string; note?: string } = {}): Promise<void> {
  ensureData(await client.mutations.answerRequest({ requestId, action, ...extra }), 'Answer request');
}

/** A quick reply is sent as a key so each side reads it in their own language. */
export async function sendMessage(requestId: string, message: { key: QuickReplyKey } | { text: string }): Promise<void> {
  ensureData(await client.mutations.sendMessage({ requestId, ...message }), 'Send message');
}

/** Admin: invite staff, a doctor or another admin into the admin's own hospital. */
export async function inviteStaff(input: { email: string; group: string; unit?: string }): Promise<void> {
  ensureData(await client.mutations.inviteStaff(input), 'Invite staff');
}

/** Doctor: confirm the recommended transfer. The server checks the doctor owns it and the hospital accepted. */
export async function confirmReferral(referral: Referral): Promise<void> {
  ensureData(await client.mutations.decideReferral({ referralId: referral.id, decision: 'confirm' }), 'Confirm referral');
}

export async function setAsideReferral(referralId: string): Promise<void> {
  ensureData(await client.mutations.decideReferral({ referralId, decision: 'set_aside' }), 'Set aside referral');
}

/** Admin: save the hospital's auto-accept rules. The server checks the admin's hospital and the rule shape. */
export async function setAutoAcceptRules(rules: AutoAcceptRules): Promise<void> {
  ensureData(await client.mutations.setAutoAcceptRules({ rules: JSON.stringify(rules) }), 'Save rules');
}

/** Patients: specialists with an open slot, nearest first then soonest, names only where shared. */
export async function findSpecialists(input: { lat: number; lng: number; specialty?: string; language?: string }): Promise<PublicSpecialist[]> {
  const result = await client.queries.findSpecialists(input);
  ensureData(result, 'Find specialists');
  if (!result.data) throw new DataServiceError('Find specialists failed.');
  return JSON.parse(result.data) as PublicSpecialist[];
}

/** Patients: instant booking; returns the booking request id. */
export async function bookSpecialist(input: { specialistId: string; slotId: string; name?: string; phone?: string }): Promise<string> {
  const result = await client.mutations.bookSpecialist(input);
  ensureData(result, 'Book specialist');
  if (!result.data) throw new DataServiceError('Book specialist failed.');
  return result.data;
}

/** Admin: create (no id) or replace one specialist of the admin's own hospital. */
export async function saveSpecialist(input: { id?: string; name: string; specialty: string; languages: string[]; namePublic: boolean; slots: Slot[] }): Promise<void> {
  ensureData(await client.mutations.saveSpecialist({ ...input, slots: JSON.stringify(input.slots) }), 'Save specialist');
}

export async function removeSpecialist(id: string): Promise<void> {
  ensureData(await client.mutations.removeSpecialist({ id }), 'Delete specialist');
}
