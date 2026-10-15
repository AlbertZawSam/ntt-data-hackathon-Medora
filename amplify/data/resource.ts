import { a, defineData, type ClientSchema } from '@aws-amplify/backend';

// Data models from design.md "Data models"; shapes match src/logic/types.ts.
// DynamoDB on-demand: no cost while idle. Secondary indexes add no idle cost either.
//
// Authorization: the design allows any signed-in user for the demo. The rules that
// protect safety are tighter already (AGENTS.md section 4):
// - only hospital staff change hospital status (rule 2: never the agent or a patient);
// - only doctors create a transfer (rule 2: only a doctor confirms a transfer);
// - the activity log can be added to and read, never edited or deleted.
// Before a pilot: owner rules on requests and messages, and staff limited to their own hospital.

const staff = ['hospital_staff', 'admins'];

const schema = a.schema({
  PathwayKey: a.enum(['stroke', 'stemi', 'preterm', 'peds', 'maternity', 'injury', 'general']),
  RequestType: a.enum(['visit', 'referral', 'booking']),
  RequestStatus: a.enum(['waiting', 'accepted', 'declined', 'no_reply', 'cancelled', 'withdrawn', 'completed']),
  DeclineReason: a.enum(['no_bed', 'specialist_busy', 'equipment_down', 'diverting']),
  MessageFrom: a.enum(['patient', 'hospital']),
  ReferralStatus: a.enum(['running', 'awaiting', 'confirmed', 'set_aside', 'failed']),
  ReferralMode: a.enum(['ai', 'rules']),
  Lang: a.enum(['en', 'th']),
  TransferStatus: a.enum(['en_route', 'arrived']),

  // One row per hospital. status holds beds, nicu, depts, equip, oncall, rules, conflict, updatedAt.
  HospitalStatus: a
    .model({
      hospitalId: a.id().required(),
      status: a.json().required(),
    })
    .identifier(['hospitalId'])
    .authorization((allow) => [
      allow.authenticated().to(['read']),
      allow.groups(staff).to(['create', 'read', 'update']),
    ]),

  CareRequest: a
    .model({
      type: a.ref('RequestType').required(),
      hospitalId: a.id().required(),
      ownerId: a.string().required(),
      needKey: a.ref('PathwayKey').required(),
      etaMin: a.integer().required(),
      status: a.ref('RequestStatus').required(),
      // Accepted by an auto-accept rule rather than by staff.
      auto: a.boolean().required(),
      reason: a.ref('DeclineReason'),
      // Staff note, up to 200 characters. Data for the agent, never instructions (safety rule 5).
      note: a.string(),
      // Until when staff can undo an automatic acceptance (60 s), epoch ms.
      overrideUntil: a.float(),
      // { name?, phone?, mode, description }
      patient: a.json(),
      fromHospitalId: a.id(),
      referralId: a.id(),
      // { day, time }
      slot: a.json(),
      doctorName: a.string(),
      createdAtMs: a.float().required(),
    })
    .secondaryIndexes((index) => [
      index('hospitalId').sortKeys(['createdAtMs']).queryField('requestsByHospital'),
      index('ownerId').sortKeys(['createdAtMs']).queryField('requestsByOwner'),
      index('referralId').queryField('requestsByReferral'),
    ])
    .authorization((allow) => [allow.authenticated()]),

  Message: a
    .model({
      requestId: a.id().required(),
      from: a.ref('MessageFrom').required(),
      // A quick reply is a key, so each side reads it in its own language; otherwise text up to 300 characters.
      key: a.string(),
      text: a.string(),
      createdAtMs: a.float().required(),
    })
    .secondaryIndexes((index) => [index('requestId').sortKeys(['createdAtMs']).queryField('messagesByRequest')])
    .authorization((allow) => [allow.authenticated().to(['create', 'read'])]),

  Referral: a
    .model({
      fromHospitalId: a.id().required(),
      ownerId: a.string().required(),
      text: a.string().required(),
      onsetMin: a.integer(),
      lang: a.ref('Lang').required(),
      pathway: a.ref('PathwayKey'),
      status: a.ref('ReferralStatus').required(),
      mode: a.ref('ReferralMode').required(),
      chosenId: a.id(),
      etaMin: a.integer(),
      // { en, th }
      why: a.json(),
      rows: a.json(),
      requestIds: a.json(),
      startedAtMs: a.float().required(),
      recommendedAtMs: a.float(),
    })
    .secondaryIndexes((index) => [index('fromHospitalId').sortKeys(['startedAtMs']).queryField('referralsByHospital')])
    .authorization((allow) => [allow.authenticated()]),

  // The doctor's live view of what the agent did, step by step.
  TraceStep: a
    .model({
      referralId: a.id().required(),
      n: a.integer().required(),
      kind: a.string().required(),
      // { en, th }
      title: a.json().required(),
      detail: a.json(),
    })
    .secondaryIndexes((index) => [index('referralId').sortKeys(['n']).queryField('traceByReferral')])
    .authorization((allow) => [allow.authenticated().to(['create', 'read'])]),

  Transfer: a
    .model({
      referralId: a.id().required(),
      fromHospitalId: a.id().required(),
      toHospitalId: a.id().required(),
      startedAt: a.float().required(),
      etaMin: a.integer().required(),
      status: a.ref('TransferStatus').required(),
    })
    .authorization((allow) => [
      allow.authenticated().to(['read']),
      allow.groups(['doctors']).to(['create', 'read', 'update']),
      // The receiving hospital marks the patient as arrived.
      allow.groups(staff).to(['read', 'update']),
    ]),

  // Audit trail: every safety check, agent step and human action, in English and Thai.
  Activity: a
    .model({
      at: a.float().required(),
      // { en, th }
      actor: a.json().required(),
      text: a.json().required(),
    })
    .authorization((allow) => [allow.authenticated().to(['create', 'read'])]),

  // Push targets for the notify function. Each user manages only their own devices.
  Device: a
    .model({
      userId: a.string().required(),
      hospitalId: a.id(),
      endpointArn: a.string().required(),
      onDuty: a.boolean().required(),
    })
    .secondaryIndexes((index) => [index('hospitalId').queryField('devicesByHospital')])
    .authorization((allow) => [allow.owner()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
