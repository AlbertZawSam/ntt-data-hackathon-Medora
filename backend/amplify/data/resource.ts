import { a, defineData, type ClientSchema } from '@aws-amplify/backend';
import { adminSettings } from '../functions/admin-settings/resource';
import { agentRunner } from '../functions/agent-runner/resource';
import { careActions } from '../functions/care-actions/resource';
import { referralActions } from '../functions/referral-actions/resource';
import { specialistActions } from '../functions/specialist-actions/resource';
import { findCare } from '../functions/find-care/resource';
import { mapConfig } from '../functions/map-config/resource';
import { routePath } from '../functions/route-path/resource';
import { searchPlaces } from '../functions/search-places/resource';
import { inviteStaff } from '../functions/invite-staff/resource';
import { patientUnderstand } from '../functions/patient-understand/resource';
import { registerHospital } from '../functions/register-hospital/resource';
import { updateStatus } from '../functions/update-status/resource';

/**
 * AppSync/DynamoDB data contract. Hospital-scoped rules compare `hospitalId` with the
 * signed-in user's `custom:hospitalId` claim; patients never receive raw status rows.
 *
 * Millisecond timestamps (`...Ms`, `overrideUntil`, `startedAt`) are Float, not Int: GraphQL Int is
 * 32-bit and can't hold a time in milliseconds; a Float holds it exactly.
 *
 * DynamoDB remains on-demand and AppSync has no hourly idle charge. Both are charged
 * per operation/storage only. The referral Lambda is granted the minimum data access it
 * needs to coordinate doctor-started referrals.
 */
const schema = a.schema({
  HospitalProfile: a
    .model({
      hospitalId: a.string().required(),
      name: a.json().required(),
      lat: a.float().required(),
      lng: a.float().required(),
      totalBeds: a.integer().required(),
      nicuTotal: a.integer().required(),
      typicalWaitMin: a.integer().required(),
      departments: a.string().array().required(),
      equipment: a.string().array().required(),
    })
    .secondaryIndexes((index) => [index('hospitalId')])
    // Clients only read their own hospital's profile. It is created by `register-hospital`; admin
    // edits will go through a Lambda that checks the `admins` group (docs/roles.md), because an
    // owner rule alone would let nurses and doctors of the hospital change it.
    .authorization((allow) => [
      allow.ownerDefinedIn('hospitalId').identityClaim('custom:hospitalId').to(['read']),
    ]),

  HospitalStatus: a
    .model({
      hospitalId: a.string().required(),
      /** The shared HospitalStatus shape, including its staff-confirmed updatedAt. */
      status: a.json().required(),
    })
    .secondaryIndexes((index) => [index('hospitalId')])
    // Clients only read. Every change goes through `updateStatus`, which checks the caller's unit,
    // so a nurse can't write another unit's items (docs/roles.md). The first row is created by
    // `register-hospital`.
    .authorization((allow) => [
      allow.ownerDefinedIn('hospitalId').identityClaim('custom:hospitalId').to(['read']),
    ]),

  /**
   * What people seeking care may see about a hospital: simple labels per type of care and how fresh
   * the data is (shared/logic/publicDirectory.ts), never bed counts, equipment faults or rosters.
   * Derived from HospitalStatus by `update-status` and `register-hospital`; any signed-in user reads
   * it, nobody writes it from the app. Requirements: 5.6, 9.2, 18.3
   */
  PublicDirectory: a
    .model({
      hospitalId: a.string().required(),
      entry: a.json().required(),
    })
    .authorization((allow) => [allow.authenticated().to(['read'])]),

  Specialist: a
    .model({
      hospitalId: a.string().required(),
      name: a.string().required(),
      specialty: a.string().required(),
      languages: a.string().array().required(),
      namePublic: a.boolean().required(),
      slots: a.json().required(),
    })
    .secondaryIndexes((index) => [index('hospitalId').sortKeys(['specialty'])])
    // Clients only read. Admin changes will go through a Lambda that checks the admin's own hospital
    // (a plain group rule isn't scoped to one hospital), so no client can edit specialists today.
    .authorization((allow) => [
      allow.ownerDefinedIn('hospitalId').identityClaim('custom:hospitalId').to(['read']),
    ]),

  CareRequest: a
    .model({
      type: a.string().required(),
      hospitalId: a.string().required(),
      ownerId: a.string().required(),
      needKey: a.string().required(),
      etaMin: a.integer().required(),
      status: a.string().required(),
      auto: a.boolean().required(),
      reason: a.string(),
      note: a.string(),
      overrideUntil: a.float(),
      patient: a.json().required(),
      fromHospitalId: a.string(),
      referralId: a.string(),
      // On the patient's own request: where their doctor referred them and how far it got (Lambdas write it).
      referredTo: a.json(),
      /** Cardiology, surgery or obstetrics: only that department's staff may answer it (care-actions); hospital staff can still read it. */
      department: a.string(),
      slot: a.json(),
      doctorName: a.string(),
      /** Bilingual hospital name copied at request time, so patients never read hospital profiles. */
      hospitalName: a.json(),
      acceptedAtMs: a.float(),
      couldTreat: a.boolean(),
      createdAtMs: a.float().required(),
    })
    .secondaryIndexes((index) => [
      index('hospitalId').sortKeys(['createdAtMs']),
      index('ownerId').sortKeys(['createdAtMs']),
      index('referralId').sortKeys(['createdAtMs']),
    ])
    // Clients only read. Creating a request, accepting, declining, undoing and cancelling go through
    // `care-actions`, so nobody can accept their own request or change another hospital's.
    .authorization((allow) => [
      allow.ownerDefinedIn('ownerId').identityClaim('sub').to(['read']),
      allow.ownerDefinedIn('hospitalId').identityClaim('custom:hospitalId').to(['read']),
    ]),

  Reservation: a
    .model({
      requestId: a.string().required(),
      hospitalId: a.string().required(),
      kind: a.string().required(),
      state: a.string().required(),
      createdAtMs: a.float().required(),
      // Milliseconds since 1970 don't fit AppSync's 32-bit Int, so timestamps are floats.
      expiresAtMs: a.float().required(),
    })
    .secondaryIndexes((index) => [index('hospitalId'), index('requestId')])
    // A held bed is promised to an accepted patient. Staff of the hospital read it; only `care-actions`
    // writes it, and a hold expires by itself after two hours.
    .authorization((allow) => [
      allow.ownerDefinedIn('hospitalId').identityClaim('custom:hospitalId').to(['read']),
    ]),

  Message: a
    .model({
      requestId: a.string().required(),
      ownerId: a.string().required(),
      hospitalId: a.string().required(),
      from: a.string().required(),
      key: a.string(),
      text: a.string(),
      createdAtMs: a.float().required(),
    })
    .secondaryIndexes((index) => [index('requestId').sortKeys(['createdAtMs'])])
    // Clients only read; `sendMessage` decides the sender from the caller's token.
    .authorization((allow) => [
      allow.ownerDefinedIn('ownerId').identityClaim('sub').to(['read']),
      allow.ownerDefinedIn('hospitalId').identityClaim('custom:hospitalId').to(['read']),
    ]),

  Referral: a
    .model({
      fromHospitalId: a.string().required(),
      ownerId: a.string().required(),
      text: a.string().required(),
      onsetMin: a.integer(),
      lang: a.string().required(),
      pathway: a.string(),
      status: a.string().required(),
      mode: a.string().required(),
      /** Direct referrals: the patient's request this referral was made from (one open referral per patient). */
      sourceRequestId: a.string(),
      chosenId: a.string(),
      chosenName: a.json(),
      etaMin: a.integer(),
      why: a.json(),
      rows: a.json(),
      requestIds: a.string().array().required(),
      startedAtMs: a.float().required(),
      recommendedAtMs: a.float(),
      elapsedSec: a.integer(),
    })
    .secondaryIndexes((index) => [
      index('ownerId').sortKeys(['startedAtMs']),
      index('fromHospitalId').sortKeys(['startedAtMs']),
    ])
    // Clients only read. `openReferral` and `decideReferral` check the doctor, the hospital and the
    // accepting hospital, so a referral's status and chosen hospital can't be edited from the app.
    .authorization((allow) => [
      allow.ownerDefinedIn('ownerId').identityClaim('sub').to(['read']),
      allow.ownerDefinedIn('fromHospitalId').identityClaim('custom:hospitalId').to(['read']),
    ]),

  TraceStep: a
    .model({
      referralId: a.string().required(),
      hospitalId: a.string().required(),
      n: a.integer().required(),
      kind: a.string().required(),
      title: a.json().required(),
      detail: a.json().required(),
    })
    .secondaryIndexes((index) => [index('referralId').sortKeys(['n'])])
    .authorization((allow) => [
      allow.ownerDefinedIn('hospitalId').identityClaim('custom:hospitalId').to(['read']),
    ]),

  Transfer: a
    .model({
      referralId: a.string().required(),
      hospitalIds: a.string().array().required(),
      fromHospitalId: a.string().required(),
      toHospitalId: a.string().required(),
      ownerId: a.string().required(),
      startedAt: a.float().required(),
      etaMin: a.integer().required(),
      status: a.string().required(),
    })
    .secondaryIndexes((index) => [index('referralId')])
    // Clients only read; transfers are created by `decideReferral`.
    .authorization((allow) => [
      allow.ownerDefinedIn('ownerId').identityClaim('sub').to(['read']),
      allow.ownersDefinedIn('hospitalIds').identityClaim('custom:hospitalId').to(['read']),
    ]),

  Activity: a
    .model({
      hospitalId: a.string(),
      ownerId: a.string(),
      at: a.string().required(),
      actor: a.json().required(),
      text: a.json().required(),
    })
    .secondaryIndexes((index) => [
      index('hospitalId').sortKeys(['at']),
      index('ownerId').sortKeys(['at']),
    ])
    // Hospital members only read the log. The owner can add and read their own entries (the phone's
    // emergency-check log); nobody edits or deletes. Lambdas write the rest.
    .authorization((allow) => [
      allow.ownerDefinedIn('ownerId').identityClaim('sub').to(['create', 'read']),
      allow.ownerDefinedIn('hospitalId').identityClaim('custom:hospitalId').to(['read']),
    ]),

  Device: a
    .model({
      userId: a.string().required(),
      hospitalId: a.string(),
      endpointArn: a.string().required(),
      onDuty: a.boolean().required(),
    })
    .secondaryIndexes((index) => [index('hospitalId')])
    .authorization((allow) => [
      allow.ownerDefinedIn('userId').identityClaim('sub'),
    ]),

  /** Starts a doctor-owned referral in the background; the UI observes Referral and TraceStep. */
  startReferral: a
    .mutation()
    .arguments({ referralId: a.id().required() })
    .authorization((allow) => [allow.group('doctors')])
    .handler(a.handler.function(agentRunner).async()),

  /**
   * Safety gate layer 2 and patient understanding (Find care). The handler runs the fixed red-flag
   * rules before any model call, then asks Nova Lite for the type of care, falling back to keyword
   * rules. Returns a small JSON result; it stores nothing. Requirements: 4.5, 5.1
   */
  understandNeed: a
    .query()
    .arguments({ text: a.string().required(), lang: a.string() })
    .returns(a.json())
    .authorization((allow) => [allow.group('patients')])
    .handler(a.handler.function(patientUnderstand)),

  /**
   * An admin of the staff pool invites staff (with one unit), doctors or admins into their own
   * hospital. The handler also checks the token comes from the staff pool (docs/roles.md).
   */
  inviteStaff: a
    .mutation()
    .arguments({ email: a.string().required(), group: a.string().required(), unit: a.string() })
    .returns(a.string())
    .authorization((allow) => [allow.group('admins')])
    .handler(a.handler.function(inviteStaff)),

  /**
   * A new admin registers their hospital once. The handler checks the caller is an admin of the
   * public pool with no hospital yet, creates the profile and sets `custom:hospitalId`.
   */
  registerHospital: a
    .mutation()
    .arguments({
      nameEn: a.string().required(),
      nameTh: a.string().required(),
      lat: a.float().required(),
      lng: a.float().required(),
      totalBeds: a.integer().required(),
      nicuTotal: a.integer().required(),
    })
    .returns(a.string())
    .authorization((allow) => [allow.group('admins')])
    .handler(a.handler.function(registerHospital)),

  /**
   * Unit staff change one status item their unit owns, or confirm "Still correct?". The handler
   * checks the staff-pool token, the hospital and the unit before writing.
   */
  updateStatus: a
    .mutation()
    .arguments({ change: a.json().required(), note: a.string() })
    .returns(a.string())
    .authorization((allow) => [allow.group('hospital_staff')])
    .handler(a.handler.function(updateStatus)),

  /** A patient sends a request to one hospital; the admin's auto-accept rule may accept it at once. */
  submitRequest: a
    .mutation()
    .arguments({
      hospitalId: a.string().required(),
      needKey: a.string().required(),
      etaMin: a.integer().required(),
      mode: a.string().required(),
      name: a.string(),
      phone: a.string(),
      description: a.string().required(),
      department: a.string(),
    })
    .returns(a.string())
    .authorization((allow) => [allow.group('patients')])
    .handler(a.handler.function(careActions)),

  cancelRequest: a
    .mutation()
    .arguments({ requestId: a.id().required() })
    .returns(a.string())
    .authorization((allow) => [allow.group('patients')])
    .handler(a.handler.function(careActions)),

  /** Unit staff accept, decline (with a reason and optional note) or undo an automatic acceptance. */
  answerRequest: a
    .mutation()
    .arguments({ requestId: a.id().required(), action: a.string().required(), reason: a.string(), note: a.string() })
    .returns(a.string())
    // Doctors may answer only doctor referrals to their hospital (care-actions checks canAnswerRequest).
    .authorization((allow) => [allow.group('hospital_staff'), allow.group('doctors')])
    .handler(a.handler.function(careActions)),

  /** The patient or the request's hospital staff send a quick reply (key) or short text. */
  sendMessage: a
    .mutation()
    .arguments({ requestId: a.id().required(), key: a.string(), text: a.string() })
    .returns(a.string())
    .authorization((allow) => [allow.group('patients'), allow.group('hospital_staff')])
    .handler(a.handler.function(careActions)),

  /** Doctors: the other hospitals they can refer to, nearest first, with the public details only. */
  referralTargets: a
    .query()
    .returns(a.string())
    .authorization((allow) => [allow.group('doctors')])
    .handler(a.handler.function(referralActions)),

  /** Doctors: refer a patient of their hospital to a hospital and department they choose. */
  referPatient: a
    .mutation()
    .arguments({ requestId: a.string().required(), toHospitalId: a.string().required(), department: a.string() })
    .returns(a.string())
    .authorization((allow) => [allow.group('doctors')])
    .handler(a.handler.function(referralActions)),

  /** A doctor starts a referral for their own hospital; the agent is started separately by `startReferral`. */
  openReferral: a
    .mutation()
    .arguments({ text: a.string().required(), onsetMin: a.integer(), lang: a.string().required() })
    .returns(a.string())
    .authorization((allow) => [allow.group('doctors')])
    .handler(a.handler.function(referralActions)),

  /** Only the owning doctor confirms (to an accepting hospital) or sets aside; creates the transfer. */
  decideReferral: a
    .mutation()
    .arguments({ referralId: a.id().required(), decision: a.string().required(), reason: a.string() })
    .returns(a.string())
    .authorization((allow) => [allow.group('doctors')])
    .handler(a.handler.function(referralActions)),

  /** Only the doctor who owns a transfer marks it arrived (simulated tracking in the demo). */
  arriveTransfer: a
    .mutation()
    .arguments({ transferId: a.id().required() })
    .returns(a.string())
    .authorization((allow) => [allow.group('doctors')])
    .handler(a.handler.function(referralActions)),

  /** An admin creates or replaces one specialist (with clinic slots) of their own hospital. */
  saveSpecialist: a
    .mutation()
    .arguments({
      id: a.id(),
      name: a.string().required(),
      specialty: a.string().required(),
      languages: a.string().array().required(),
      namePublic: a.boolean().required(),
      slots: a.json().required(),
    })
    .returns(a.string())
    .authorization((allow) => [allow.group('admins')])
    .handler(a.handler.function(specialistActions)),

  removeSpecialist: a
    .mutation()
    .arguments({ id: a.id().required() })
    .returns(a.string())
    .authorization((allow) => [allow.group('admins')])
    .handler(a.handler.function(specialistActions)),

  /** Patients search specialists: nearest hospital first, then soonest slot; names shown only if shared. */
  findSpecialists: a
    .query()
    .arguments({ lat: a.float().required(), lng: a.float().required(), specialty: a.string(), language: a.string() })
    .returns(a.string())
    .authorization((allow) => [allow.group('patients')])
    .handler(a.handler.function(specialistActions)),

  /** Instant booking of one slot; returns the booking request id. */
  bookSpecialist: a
    .mutation()
    .arguments({ specialistId: a.id().required(), slotId: a.string().required(), name: a.string(), phone: a.string() })
    .returns(a.string())
    .authorization((allow) => [allow.group('patients')])
    .handler(a.handler.function(specialistActions)),

  /** Admins set their hospital's auto-accept rules (a minimum of free beds and one switch per target). */
  setAutoAcceptRules: a
    .mutation()
    .arguments({ rules: a.json().required() })
    .returns(a.string())
    .authorization((allow) => [allow.group('admins')])
    .handler(a.handler.function(adminSettings)),

  /**
   * The address of the real map for the app (Amazon Location tiles, read-only key). Every signed-in role draws maps,
   * so all four groups may ask. Returns `{ styleUrl }`, with `null` when the map is not available (the app then
   * draws its offline map).
   */
  mapConfig: a
    .query()
    .returns(a.string())
    .authorization((allow) => [allow.group('patients'), allow.group('hospital_staff'), allow.group('doctors'), allow.group('admins')])
    .handler(a.handler.function(mapConfig)),

  /**
   * Place suggestions for the location picker (requirement 3.2): Amazon Location text search inside Bangkok.
   * Patients only; only the typed text is sent, never their position (requirement 3.6).
   */
  searchPlaces: a
    .query()
    .arguments({ query: a.string().required(), lang: a.string() })
    .returns(a.string())
    .authorization((allow) => [allow.group('patients')])
    .handler(a.handler.function(searchPlaces)),

  /**
   * The road route between two points, for the line on the map. Any signed-in role; only two positions are sent, and
   * the handler refuses points outside Bangkok.
   */
  routePath: a
    .query()
    .arguments({ fromLat: a.float().required(), fromLng: a.float().required(), toLat: a.float().required(), toLng: a.float().required() })
    .returns(a.string())
    .authorization((allow) => [allow.group('patients'), allow.group('hospital_staff'), allow.group('doctors'), allow.group('admins')])
    .handler(a.handler.function(routePath)),

  /** Emergency check (layer 2), intake agent and ranking: hospitals as simple labels only. */
  findCare: a
    .query()
    // `need` is set only when the app refreshes results it already has: the care type is known, so no model call.
    .arguments({ description: a.string().required(), lat: a.float().required(), lng: a.float().required(), need: a.string() })
    .returns(a.string())
    .authorization((allow) => [allow.group('patients')])
    .handler(a.handler.function(findCare)),
}).authorization((allow) => [
  allow.resource(adminSettings).to(['query', 'mutate']),
  allow.resource(referralActions).to(['query', 'mutate']),
  allow.resource(specialistActions).to(['query', 'mutate']),
  allow.resource(careActions).to(['query', 'mutate']),
  allow.resource(findCare).to(['query']),
  allow.resource(agentRunner).to(['query', 'mutate']),
  allow.resource(registerHospital).to(['mutate']),
  allow.resource(updateStatus).to(['query', 'mutate']),
]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({ schema, authorizationModes: { defaultAuthorizationMode: 'userPool' } });
