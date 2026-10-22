import { a, defineData, type ClientSchema } from '@aws-amplify/backend';
import { adminSettings } from '../functions/admin-settings/resource';
import { agentRunner } from '../functions/agent-runner/resource';
import { careActions } from '../functions/care-actions/resource';
import { findCare } from '../functions/find-care/resource';
import { inviteStaff } from '../functions/invite-staff/resource';
import { registerHospital } from '../functions/register-hospital/resource';
import { updateStatus } from '../functions/update-status/resource';

/**
 * AppSync/DynamoDB data contract. Hospital-scoped rules compare `hospitalId` with the
 * signed-in user's `custom:hospitalId` claim; patients never receive raw status rows.
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
      overrideUntil: a.integer(),
      patient: a.json().required(),
      fromHospitalId: a.string(),
      referralId: a.string(),
      slot: a.json(),
      doctorName: a.string(),
      /** Bilingual hospital name copied at request time, so patients never read hospital profiles. */
      hospitalName: a.json(),
      createdAtMs: a.integer().required(),
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

  Message: a
    .model({
      requestId: a.string().required(),
      ownerId: a.string().required(),
      hospitalId: a.string().required(),
      from: a.string().required(),
      key: a.string(),
      text: a.string(),
      createdAtMs: a.integer().required(),
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
      chosenId: a.string(),
      chosenName: a.json(),
      etaMin: a.integer(),
      why: a.json(),
      rows: a.json(),
      requestIds: a.string().array().required(),
      startedAtMs: a.integer().required(),
      recommendedAtMs: a.integer(),
      elapsedSec: a.integer(),
    })
    .secondaryIndexes((index) => [
      index('ownerId').sortKeys(['startedAtMs']),
      index('fromHospitalId').sortKeys(['startedAtMs']),
    ])
    .authorization((allow) => [
      allow.ownerDefinedIn('ownerId').identityClaim('sub'),
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
      startedAt: a.integer().required(),
      etaMin: a.integer().required(),
      status: a.string().required(),
    })
    .secondaryIndexes((index) => [index('referralId')])
    .authorization((allow) => [
      allow.ownerDefinedIn('ownerId').identityClaim('sub'),
      allow.ownersDefinedIn('hospitalIds').identityClaim('custom:hospitalId'),
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
    .authorization((allow) => [allow.group('hospital_staff')])
    .handler(a.handler.function(careActions)),

  /** The patient or the request's hospital staff send a quick reply (key) or short text. */
  sendMessage: a
    .mutation()
    .arguments({ requestId: a.id().required(), key: a.string(), text: a.string() })
    .returns(a.string())
    .authorization((allow) => [allow.group('patients'), allow.group('hospital_staff')])
    .handler(a.handler.function(careActions)),

  /** Admins set their hospital's auto-accept rules (a minimum of free beds and one switch per target). */
  setAutoAcceptRules: a
    .mutation()
    .arguments({ rules: a.json().required() })
    .returns(a.string())
    .authorization((allow) => [allow.group('admins')])
    .handler(a.handler.function(adminSettings)),

  /** Emergency check (layer 2), intake agent and ranking: hospitals as simple labels only. */
  findCare: a
    .query()
    .arguments({ description: a.string().required(), lat: a.float().required(), lng: a.float().required() })
    .returns(a.string())
    .authorization((allow) => [allow.group('patients')])
    .handler(a.handler.function(findCare)),
}).authorization((allow) => [
  allow.resource(adminSettings).to(['query', 'mutate']),
  allow.resource(careActions).to(['query', 'mutate']),
  allow.resource(findCare).to(['query']),
  allow.resource(agentRunner).to(['query', 'mutate']),
  allow.resource(registerHospital).to(['mutate']),
  allow.resource(updateStatus).to(['query', 'mutate']),
]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({ schema, authorizationModes: { defaultAuthorizationMode: 'userPool' } });
