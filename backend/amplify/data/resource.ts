import { a, defineData, type ClientSchema } from '@aws-amplify/backend';
import { agentRunner } from '../functions/agent-runner/resource';

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
    .authorization((allow) => [
      allow.ownerDefinedIn('hospitalId').identityClaim('custom:hospitalId'),
    ]),

  HospitalStatus: a
    .model({
      hospitalId: a.string().required(),
      /** The shared HospitalStatus shape, including its staff-confirmed updatedAt. */
      status: a.json().required(),
    })
    .secondaryIndexes((index) => [index('hospitalId')])
    .authorization((allow) => [
      allow.ownerDefinedIn('hospitalId').identityClaim('custom:hospitalId'),
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
    .authorization((allow) => [
      allow.ownerDefinedIn('hospitalId').identityClaim('custom:hospitalId'),
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
      createdAtMs: a.integer().required(),
    })
    .secondaryIndexes((index) => [
      index('hospitalId').sortKeys(['createdAtMs']),
      index('ownerId').sortKeys(['createdAtMs']),
      index('referralId').sortKeys(['createdAtMs']),
    ])
    .authorization((allow) => [
      allow.ownerDefinedIn('ownerId').identityClaim('sub'),
      allow.ownerDefinedIn('hospitalId').identityClaim('custom:hospitalId'),
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
    .authorization((allow) => [
      allow.ownerDefinedIn('ownerId').identityClaim('sub'),
      allow.ownerDefinedIn('hospitalId').identityClaim('custom:hospitalId'),
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
    .authorization((allow) => [
      allow.ownerDefinedIn('ownerId').identityClaim('sub'),
      allow.ownerDefinedIn('hospitalId').identityClaim('custom:hospitalId'),
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
}).authorization((allow) => [allow.resource(agentRunner).to(['query', 'mutate'])]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({ schema, authorizationModes: { defaultAuthorizationMode: 'userPool' } });
