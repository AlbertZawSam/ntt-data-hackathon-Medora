/**
 * The only client-side layer that talks to AppSync data. It keeps one `observeQuery`
 * subscription per readable model and exposes an immutable snapshot to AppProvider.
 * No records are seeded or fabricated: an empty snapshot means the sandbox is empty.
 */
import { generateClient } from 'aws-amplify/data';
import type {
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
  };
  mutations: {
    startReferral: (input: { referralId: string }) => Promise<{ errors?: unknown[] }>;
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
  isSynced: false,
});

type SnapshotKey = Exclude<keyof DataSnapshot, 'isSynced'>;
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
        this.snapshot = { ...this.snapshot, [key]: items, isSynced: this.received === this.expected } as DataSnapshot;
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

/** Creates the referral record then invokes the bounded, asynchronous coordinator. */
export async function startReferral(
  session: Session,
  input: { text: string; onsetMin?: number; lang: 'en' | 'th' },
): Promise<string> {
  if (!session.hospitalId) throw new DataServiceError('Doctor hospital is unavailable.');
  const created = await client.models.Referral.create({
    fromHospitalId: session.hospitalId,
    ownerId: session.userId,
    text: input.text.trim(),
    onsetMin: input.onsetMin,
    lang: input.lang,
    status: 'running',
    mode: 'ai',
    requestIds: [],
    startedAtMs: Date.now(),
  });
  ensureData(created, 'Create referral');
  if (!created.data) throw new DataServiceError('Create referral failed.');
  const invoked = await client.mutations.startReferral({ referralId: created.data.id });
  ensureData(invoked, 'Start referral');
  return created.data.id;
}

export async function writeActivity(input: Omit<Activity, 'id' | 'createdAt'>): Promise<void> {
  const result = await client.models.Activity.create(input);
  ensureData(result, 'Write activity');
}
