import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import type { AppSyncIdentityCognito, AppSyncResolverEvent } from 'aws-lambda';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { callerFromClaims, canManageHospital } from '@medora/shared/logic/access';
import { isInBangkok } from '@medora/shared/logic/places';
import { GROUPS } from '@medora/shared/logic/session';
import {
  bookSlot,
  listSpecialists,
  validateSpecialistInput,
  type SpecialistRecord,
} from '@medora/shared/logic/specialists';
import type { Bi } from '@medora/shared/logic/types';

type Rec = Record<string, unknown>;
type Result<T> = { data: T | null; errors?: unknown[] };
interface Model<T> {
  get(i: { id: string }): Promise<Result<T>>;
  list(i: Rec): Promise<{ data: T[]; errors?: unknown[] }>;
  create(i: Rec): Promise<Result<T>>;
  update(i: Rec): Promise<Result<T>>;
  delete(i: { id: string }): Promise<Result<T>>;
}
type SpecialistRow = Omit<SpecialistRecord, 'slots'> & { slots: unknown };
interface Client {
  models: {
    Specialist: Model<SpecialistRow>;
    HospitalProfile: Model<{ id: string; hospitalId: string; name: unknown; lat: number; lng: number }>;
    CareRequest: Model<{ id: string }>;
    Activity: Model<{ id: string }>;
  };
}

async function dataClient(): Promise<Client> {
  const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(process.env as never);
  Amplify.configure(resourceConfig, libraryOptions);
  return generateClient() as unknown as Client;
}

const parse = <T>(v: unknown): T => (typeof v === 'string' ? (JSON.parse(v) as T) : (v as T));
const must = <T>(r: Result<T>, what: string): T => {
  if (r.errors?.length || !r.data) {
    console.error(`specialist-actions: ${what} failed`); // ids only, never names
    throw new Error(what);
  }
  return r.data;
};

function admin(event: AppSyncResolverEvent<Rec>): { hospitalId: string; sub: string } {
  const identity = event.identity as AppSyncIdentityCognito | null | undefined;
  const caller = callerFromClaims(identity?.claims as Rec | undefined, process.env.STAFF_USER_POOL_ID);
  if (!caller?.hospitalId || !canManageHospital(caller, caller.hospitalId) || typeof identity?.sub !== 'string') throw new Error('not-admin');
  return { hospitalId: caller.hospitalId, sub: identity.sub };
}

function patientId(event: AppSyncResolverEvent<Rec>): string {
  const identity = event.identity as AppSyncIdentityCognito | null | undefined;
  const claims = identity?.claims as Rec | undefined;
  const groups = claims?.['cognito:groups'];
  const iss = claims?.iss;
  const poolId = process.env.PUBLIC_USER_POOL_ID;
  if (!poolId || typeof iss !== 'string' || !iss.endsWith(`/${poolId}`) || !Array.isArray(groups) || !groups.includes(GROUPS.patients) || typeof identity?.sub !== 'string') {
    throw new Error('not-patient');
  }
  return identity.sub;
}

async function log(client: Client, hospitalId: string, ownerId: string, actor: Bi, en: string, th: string): Promise<void> {
  const r = await client.models.Activity.create({ hospitalId, ownerId, at: new Date().toISOString(), actor: JSON.stringify(actor), text: JSON.stringify({ en, th }) });
  if (r.errors?.length) console.error('specialist-actions: activity log failed');
}

/** Admin: create or replace one specialist of their own hospital (the hospital comes from the token). */
async function saveSpecialist(client: Client, event: AppSyncResolverEvent<Rec>): Promise<string> {
  const me = admin(event);
  const a = event.arguments;
  const checked = validateSpecialistInput({
    name: a.name, specialty: a.specialty, languages: a.languages, namePublic: a.namePublic, slots: parse<unknown>(a.slots),
  });
  if (!checked.ok) throw new Error(`bad-${checked.issue}`);
  const body = { ...checked.value, slots: JSON.stringify(checked.value.slots) };
  let id: string;
  if (typeof a.id === 'string' && a.id) {
    const existing = must(await client.models.Specialist.get({ id: a.id }), 'no-specialist');
    if (existing.hospitalId !== me.hospitalId) throw new Error('not-admin'); // never another hospital's
    id = must(await client.models.Specialist.update({ id: a.id, ...body }), 'save-failed').id;
  } else {
    id = must(await client.models.Specialist.create({ hospitalId: me.hospitalId, ...body }), 'save-failed').id;
  }
  await log(client, me.hospitalId, me.sub, { en: 'Admin', th: 'ผู้ดูแล' }, `Specialist ${id} saved`, `บันทึกแพทย์เฉพาะทาง ${id}`);
  return id;
}

async function deleteSpecialist(client: Client, event: AppSyncResolverEvent<Rec>): Promise<string> {
  const me = admin(event);
  const existing = must(await client.models.Specialist.get({ id: String(event.arguments.id) }), 'no-specialist');
  if (existing.hospitalId !== me.hospitalId) throw new Error('not-admin');
  await client.models.Specialist.delete({ id: existing.id });
  await log(client, me.hospitalId, me.sub, { en: 'Admin', th: 'ผู้ดูแล' }, `Specialist ${existing.id} deleted`, `ลบแพทย์เฉพาะทาง ${existing.id}`);
  return 'ok';
}

async function loadHospitals(client: Client): Promise<Map<string, { name: Bi; lat: number; lng: number }>> {
  const profiles = await client.models.HospitalProfile.list({ limit: 1000 });
  if (profiles.errors?.length) throw new Error('data-unavailable');
  return new Map(profiles.data.map((p) => [p.hospitalId, { name: parse<Bi>(p.name), lat: p.lat, lng: p.lng }]));
}

/** Patients: specialists with an open slot, nearest first then soonest, as a public view. */
async function findSpecialists(client: Client, event: AppSyncResolverEvent<Rec>): Promise<string> {
  patientId(event);
  const { lat, lng, specialty, language } = event.arguments;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !isInBangkok({ lat, lng })) throw new Error('bad-location');
  const rows = await client.models.Specialist.list({ limit: 1000 });
  if (rows.errors?.length) throw new Error('data-unavailable');
  const records: SpecialistRecord[] = rows.data.map((r) => ({ ...r, slots: parse(r.slots) ?? [] }));
  const list = listSpecialists(
    records,
    await loadHospitals(client),
    { lat, lng },
    { specialty: typeof specialty === 'string' ? specialty : undefined, language: typeof language === 'string' ? language : undefined },
    Date.now(),
  );
  return JSON.stringify(list.slice(0, 50));
}

/** Patients: instant booking. The slot is locked, then a booking request is recorded for the hospital. */
async function bookSpecialist(client: Client, event: AppSyncResolverEvent<Rec>): Promise<string> {
  const ownerId = patientId(event);
  const { specialistId, slotId, name, phone } = event.arguments;
  const row = must(await client.models.Specialist.get({ id: String(specialistId) }), 'no-specialist');
  const slots = parse<SpecialistRecord['slots']>(row.slots) ?? [];
  const booked = bookSlot(slots, String(slotId), Date.now());
  if (!booked.ok) throw new Error(booked.reason);

  // Re-read right before the write so two patients can't take the same slot.
  const fresh = must(await client.models.Specialist.get({ id: row.id }), 'no-specialist');
  if (parse<SpecialistRecord['slots']>(fresh.slots).find((s) => s.id === booked.slot.id)?.booked) throw new Error('taken');
  must(await client.models.Specialist.update({ id: row.id, slots: JSON.stringify(booked.slots) }), 'save-failed');

  const profile = await client.models.HospitalProfile.get({ id: row.hospitalId });
  const request = must(
    await client.models.CareRequest.create({
      type: 'booking',
      hospitalId: row.hospitalId,
      ownerId,
      needKey: row.specialty,
      etaMin: 0,
      status: 'accepted',
      auto: true,
      reason: 'booked_slot',
      patient: JSON.stringify({
        ...(typeof name === 'string' && name.trim() ? { name: name.trim().slice(0, 80) } : {}),
        ...(typeof phone === 'string' && /^[+0-9 ()-]{6,20}$/.test(phone.trim()) ? { phone: phone.trim() } : {}),
        mode: 'car',
        description: `Booking: ${row.specialty}`,
      }),
      slot: JSON.stringify({ day: booked.slot.day, time: booked.slot.time }),
      doctorName: row.name, // revealed to the patient only now that they have booked
      hospitalName: profile.data ? (typeof profile.data.name === 'string' ? profile.data.name : JSON.stringify(profile.data.name)) : undefined,
      createdAtMs: Date.now(),
    }),
    'booking-failed',
  );
  await log(client, row.hospitalId, ownerId, { en: 'Patient', th: 'ผู้ป่วย' }, `Booking ${request.id}`, `จองคิว ${request.id}`);
  console.info('specialist-actions book ok');
  return request.id;
}

export const handler = async (event: AppSyncResolverEvent<Rec>): Promise<string> => {
  const client = await dataClient();
  switch (event.info.fieldName) {
    case 'saveSpecialist':
      return saveSpecialist(client, event);
    case 'deleteSpecialist':
      return deleteSpecialist(client, event);
    case 'findSpecialists':
      return findSpecialists(client, event);
    case 'bookSpecialist':
      return bookSpecialist(client, event);
    default:
      throw new Error('unknown-action');
  }
};
