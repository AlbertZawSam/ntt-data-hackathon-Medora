/**
 * The only client-side layer that talks to AppSync data. It keeps one `observeQuery`
 * subscription per readable model and exposes an immutable snapshot to AppProvider.
 * No records are seeded or fabricated: an empty snapshot means the sandbox is empty.
 */
import { generateClient } from 'aws-amplify/data';
import type { Reservation } from '@medora/shared/logic/reservations';
import type { PublicSpecialist, Slot } from '@medora/shared/logic/specialists';
import type { ArrivalMode, PublicHospital, QuickReplyKey } from '@medora/shared/logic/care';
import { parseFoundPlaces, type FoundPlace } from '@medora/shared/logic/placeSearch';
import { SET_ASIDE_REASONS, type SetAsideReason } from '@medora/shared/logic/referral';
import type {
  AutoAcceptRules,
  NeedKey,
  Activity,
  Bi,
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
import type { ReferralTarget } from '@medora/shared/logic/directReferral';
import type { HospitalInput } from '@medora/shared/logic/hospital';
import { parsePublicEntry, type PublicEntry } from '@medora/shared/logic/publicDirectory';
import type { UnderstandResult } from '@medora/shared/logic/understand';
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
    PublicDirectory: Model<{ id: string; hospitalId: string; entry: unknown }>;
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
    referPatient: (input: { requestId: string; toHospitalId: string; department?: string }) => Promise<{ data?: string | null; errors?: unknown[] }>;
    decideReferral: (input: { referralId: string; decision: string; reason?: string }) => Promise<{ data?: string | null; errors?: unknown[] }>;
    arriveTransfer: (input: { transferId: string }) => Promise<{ data?: string | null; errors?: unknown[] }>;
    saveSpecialist: (input: { id?: string; name: string; specialty: string; languages: string[]; namePublic: boolean; slots: string }) => Promise<{ data?: string | null; errors?: unknown[] }>;
    removeSpecialist: (input: { id: string }) => Promise<{ data?: string | null; errors?: unknown[] }>;
    bookSpecialist: (input: { specialistId: string; slotId: string; name?: string; phone?: string }) => Promise<{ data?: string | null; errors?: unknown[] }>;
    setAutoAcceptRules: (input: { rules: string }) => Promise<{ data?: string | null; errors?: unknown[] }>;
    inviteStaff: (input: { email: string; group: string; unit?: string }) => Promise<{ data?: string | null; errors?: unknown[] }>;
  };
  queries: {
    referralTargets: () => Promise<{ data?: string | null; errors?: unknown[] }>;
    understandNeed: (input: { text: string; lang?: string }) => Promise<{ data?: unknown; errors?: unknown[] }>;
    findSpecialists: (input: { lat: number; lng: number; specialty?: string; language?: string }) => Promise<{ data?: string | null; errors?: unknown[] }>;
    findCare: (input: { description: string; lat: number; lng: number }) => Promise<{ data?: string | null; errors?: unknown[] }>;
    searchPlaces: (input: { query: string; lang?: string }) => Promise<{ data?: string | null; errors?: unknown[] }>;
    mapConfig: () => Promise<{ data?: string | null; errors?: unknown[] }>;
  };
}

const client = generateClient() as unknown as Client;

export interface DataSnapshot {
  hospitalProfiles: HospitalProfile[];
  hospitalStatuses: Array<{ id: string; hospitalId: string; status: HospitalStatus }>;
  /** Public labels for every registered hospital (no counts or faults); what patients rank. */
  publicDirectory: PublicEntry[];
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
  publicDirectory: [],
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

    // No client filters: every model's AppSync owner rules already return only the caller's own rows
    // or their hospital's, and AppSync rejects a subscription whose filter repeats a field the owner
    // rule also filters on ("same fieldName multiple time"), which silently stopped live updates.
    this.observe('careRequests', client.models.CareRequest);
    this.observe('messages', client.models.Message);
    this.observe('referrals', client.models.Referral);
    this.observe('transfers', client.models.Transfer);
    this.observe('activities', client.models.Activity);
    this.observe('devices', client.models.Device);
    // Every signed-in user sees the public labels; changes by staff arrive live (requirement 9.2).
    this.observe('publicDirectory', client.models.PublicDirectory, undefined, (items) =>
      items.flatMap((row) => {
        const entry = parsePublicEntry((row as { entry?: unknown }).entry);
        return entry ? [entry] : [];
      }),
    );

    // Exact status data is hospital-only. Public availability is deliberately supplied by a
    // separate labelled query rather than leaking beds, equipment faults, or staff rosters.
    if (session.hospitalId) {
      this.observe('hospitalProfiles', client.models.HospitalProfile);
      this.observe('specialists', client.models.Specialist);
      this.observe('hospitalStatuses', client.models.HospitalStatus);
      this.observe('traceSteps', client.models.TraceStep);
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

  private observe<T extends RecordWithId>(
    key: SnapshotKey,
    model: ObservableModel,
    filter?: Record<string, unknown>,
    map: (items: RecordWithId[]) => unknown[] = (items) => parseJsonFields(key, items),
  ): void {
    this.expected += 1;
    let first = true;
    const subscription = model.observeQuery({ filter }).subscribe({
      next: ({ items }) => {
        if (first) {
          first = false;
          this.received += 1;
        }
        this.snapshot = { ...this.snapshot, [key]: map(items), isSynced: this.received === this.expected } as DataSnapshot;
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

/** Doctors: the other hospitals they can refer to, nearest first, with the public details only. */
export async function referralTargets(): Promise<ReferralTarget[]> {
  const result = await client.queries.referralTargets();
  ensureData(result, 'Referral targets');
  return result.data ? (JSON.parse(result.data) as ReferralTarget[]) : [];
}

/** Doctors: refer a patient of their hospital to a hospital and department they chose; returns the referral id. */
export async function referPatient(input: { requestId: string; toHospitalId: string; department?: string }): Promise<string> {
  const result = await client.mutations.referPatient({ requestId: input.requestId, toHospitalId: input.toHospitalId, ...(input.department ? { department: input.department } : {}) });
  // The server refuses a second referral of a patient whose first is still open: say so plainly.
  if (JSON.stringify(result.errors ?? []).includes('already-referred')) throw new DataServiceError('already-referred');
  ensureData(result, 'Refer patient');
  if (!result.data) throw new DataServiceError('Refer patient failed.');
  return result.data;
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

export { SET_ASIDE_REASONS, type SetAsideReason };

function ownAwaiting(session: Session, referral: Referral): string {
  if (referral.ownerId !== session.userId || referral.status !== 'awaiting' || !referral.chosenId) {
    throw new DataServiceError('Referral is not awaiting this doctor.');
  }
  return referral.chosenId;
}

/**
 * The doctor confirms the agent's recommendation (requirement 13.2). The server checks the doctor owns
 * the referral and that the chosen hospital accepted, then confirms it and starts the transfer, readable
 * by both hospitals; the app cannot write these records itself. The ambulance crew's SMS link is simulated.
 */
export async function confirmReferral(session: Session, referral: Referral): Promise<void> {
  ownAwaiting(session, referral);
  ensureData(await client.mutations.decideReferral({ referralId: referral.id, decision: 'confirm' }), 'Confirm referral');
}

/**
 * The doctor sets the recommendation aside with a reason ("Not this one"). The server closes the referral
 * and withdraws the chosen hospital's accepted request, so its bed is not held; the server logs the reason.
 */
export async function setAsideReferral(session: Session, referral: Referral, reason: SetAsideReason): Promise<void> {
  ownAwaiting(session, referral);
  ensureData(await client.mutations.decideReferral({ referralId: referral.id, decision: 'set_aside', reason }), 'Set aside referral');
}

/** Marks a simulated transfer as arrived (requirement 13.3). The server checks the doctor owns the transfer. */
export async function markTransferArrived(transfer: Transfer): Promise<void> {
  ensureData(await client.mutations.arriveTransfer({ transferId: transfer.id }), 'Mark transfer arrived');
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

/**
 * Safety gate layer 2 and the type of care (Find care). The phone has already run layer 1. Returns
 * null when the backend can't be reached; the caller then uses the on-device keyword rules.
 */
export async function understandNeed(text: string, lang: 'en' | 'th'): Promise<UnderstandResult | null> {
  if (!backendConfigured) return null;
  try {
    const result = await client.queries.understandNeed({ text, lang });
    if (result.errors?.length || result.data === undefined || result.data === null) return null;
    // AWSJSON may arrive as a JSON string (once or, from older handlers, twice encoded) or as an object.
    let value: unknown = result.data;
    for (let i = 0; i < 2 && typeof value === 'string'; i += 1) value = JSON.parse(value);
    return typeof value === 'object' && value !== null && typeof (value as { emergency?: unknown }).emergency === 'boolean'
      ? (value as UnderstandResult)
      : null;
  } catch {
    return null;
  }
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

/**
 * More places than the built-in list, from Amazon Location (requirement 3.2). Only the typed text is sent. The
 * built-in list works without this, so any failure simply gives no extra places.
 */
export async function searchPlacesRemote(query: string, lang: 'en' | 'th'): Promise<FoundPlace[]> {
  try {
    const result = await client.queries.searchPlaces({ query, lang });
    if (result.errors?.length || !result.data) return [];
    return parseFoundPlaces(JSON.parse(result.data) as unknown);
  } catch {
    return [];
  }
}

let mapStyle: Promise<string | null> | undefined;

/**
 * The address of the real map (Amazon Location tiles), or null when it is not available, in which case the web app
 * draws its simple offline map. Asked once per visit: the answer does not change. Any failure gives null.
 */
export function fetchMapStyleUrl(): Promise<string | null> {
  mapStyle ??= (async () => {
    try {
      const result = await client.queries.mapConfig();
      if (result.errors?.length || !result.data) return null;
      const url = (JSON.parse(result.data) as { styleUrl?: unknown }).styleUrl;
      return typeof url === 'string' && url.startsWith('https://') ? url : null;
    } catch {
      return null;
    }
  })();
  return mapStyle.then((url) => {
    if (url === null) mapStyle = undefined; // ask again next time: a failure should not stick for the whole visit
    return url;
  });
}

export interface NewRequest {
  hospitalId: string;
  needKey: NeedKey;
  etaMin: number;
  mode: ArrivalMode;
  name?: string;
  phone?: string;
  description: string;
  /** A department the hospital has open; only that department's staff can answer the request. */
  department?: string;
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
