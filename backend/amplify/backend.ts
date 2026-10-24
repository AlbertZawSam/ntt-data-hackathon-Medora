import { defineBackend } from '@aws-amplify/backend';
import { Names, RemovalPolicy, Stack, Tags } from 'aws-cdk-lib';
import { CfnDataSource, CfnGuardrail, CfnKnowledgeBase } from 'aws-cdk-lib/aws-bedrock';
import {
  AccountRecovery,
  CfnUserPoolGroup,
  ClientAttributes,
  Mfa,
  StringAttribute,
  UserPool,
} from 'aws-cdk-lib/aws-cognito';
import { PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { CfnAPIKey } from 'aws-cdk-lib/aws-location';
import { CfnIndex, CfnVectorBucket } from 'aws-cdk-lib/aws-s3vectors';
import { auth } from './auth/resource';
import { postConfirmation } from './auth/post-confirmation/resource';
import { data } from './data/resource';
import { adminSettings } from './functions/admin-settings/resource';
import { agentRunner } from './functions/agent-runner/resource';
import { careActions } from './functions/care-actions/resource';
import { referralActions } from './functions/referral-actions/resource';
import { specialistActions } from './functions/specialist-actions/resource';
import { findCare } from './functions/find-care/resource';
import { inviteStaff } from './functions/invite-staff/resource';
import { mapConfig } from './functions/map-config/resource';
import { patientUnderstand } from './functions/patient-understand/resource';
import { registerHospital } from './functions/register-hospital/resource';
import { routePath } from './functions/route-path/resource';
import { searchPlaces } from './functions/search-places/resource';
import { updateStatus } from './functions/update-status/resource';

const backend = defineBackend({ auth, postConfirmation, data, agentRunner, adminSettings, careActions, referralActions, specialistActions, findCare, inviteStaff, mapConfig, patientUnderstand, registerHospital, routePath, searchPlaces, updateStatus });

// Tag every resource so Cost Explorer shows spend per stage (AGENTS.md section 5).
const app = backend.stack.node.root;
Tags.of(app).add('project', 'medora');
Tags.of(app).add('stage', process.env.AWS_BRANCH === 'demo' ? 'demo' : 'dev');

// The app may only write these attributes; hospital and approval are set by the backend,
// so nobody can approve themselves or claim another hospital.
const { cfnUserPoolClient } = backend.auth.resources.cfnResources;
cfnUserPoolClient.writeAttributes = ['email', 'custom:role'];
// Sign-in errors never reveal whether an email is registered (Requirement 1.6).
cfnUserPoolClient.preventUserExistenceErrors = 'ENABLED';

// Amazon Nova on Bedrock (AGENTS.md 4a): Amazon's own models only, direct in-region model IDs.
// Nova Lite understands patient descriptions and runs the agent while developing; Nova Pro runs the
// referral agent on the demo stage. Paid per token only; nothing is billed while idle.
const MODEL_ID_FAST = 'amazon.nova-lite-v1:0';
const MODEL_ID_STRONG = 'amazon.nova-pro-v1:0';

// One guardrail on every model call (AGENTS.md 4b.7, requirement 12.8). It stops answers that
// diagnose or advise treatment (checked on the model's output only, so patients can still describe
// symptoms), blocks prompt attacks in what users write, and masks phone numbers and emails.
// No idle cost; charged per text unit checked. It lives next to the functions that use it.
const aiStack = Stack.of(backend.patientUnderstand.resources.lambda);
const blockedMessage = 'Medora can\'t help with that. In an emergency, call 1669. / Medora ช่วยเรื่องนี้ไม่ได้ กรณีฉุกเฉินโทร 1669';
const guardrail = new CfnGuardrail(aiStack, 'MedoraGuardrail', {
  name: Names.uniqueResourceName(aiStack, { maxLength: 50, separator: '-' }).replace(/[^0-9a-zA-Z_-]/g, ''),
  description: 'Medora: no diagnosis or treatment advice; prompt-attack filter; masks phone numbers and emails.',
  blockedInputMessaging: blockedMessage,
  blockedOutputsMessaging: blockedMessage,
  topicPolicyConfig: {
    topicsConfig: [
      {
        name: 'diagnosis-or-treatment-advice',
        type: 'DENY',
        definition:
          'Telling a person what medical condition or illness they have, or recommending treatments, medicines, doses, tests or home remedies.',
        examples: [
          'You probably have appendicitis.',
          'Take 500 mg of paracetamol every six hours.',
          'This sounds like a stroke, give aspirin now.',
          'คุณน่าจะเป็นไส้ติ่งอักเสบ',
        ],
        inputEnabled: false,
        outputEnabled: true,
      },
    ],
  },
  contentPolicyConfig: {
    filtersConfig: [{ type: 'PROMPT_ATTACK', inputStrength: 'MEDIUM', outputStrength: 'NONE' }],
  },
  sensitiveInformationPolicyConfig: {
    piiEntitiesConfig: [
      { type: 'PHONE', action: 'ANONYMIZE' },
      { type: 'EMAIL', action: 'ANONYMIZE' },
    ],
  },
});

// The agent's own guardrail, attached to every Converse call it makes (AGENTS.md 4b.7): it screens
// the case, tool results and staff notes for prompt attacks. It has no "no diagnosis" rule, because
// Nova's private <thinking> names conditions while it picks a pathway; instead every update and reason
// the agent stores is checked with the full guardrail above before anyone sees it (agent-runner).
const agentGuardrail = new CfnGuardrail(aiStack, 'MedoraAgentGuardrail', {
  name: Names.uniqueResourceName(aiStack, { maxLength: 44, separator: '-' }).replace(/[^0-9a-zA-Z_-]/g, '') + '-agent',
  description: 'Medora referral agent: prompt-attack filter on every model call.',
  blockedInputMessaging: blockedMessage,
  blockedOutputsMessaging: blockedMessage,
  contentPolicyConfig: {
    filtersConfig: [{ type: 'PROMPT_ATTACK', inputStrength: 'MEDIUM', outputStrength: 'NONE' }],
  },
});

// Each function may call only the models it uses and only its guardrails (AGENTS.md 4b.3).
const modelArn = (id: string): string => `arn:aws:bedrock:${aiStack.region}::foundation-model/${id}`;

backend.patientUnderstand.addEnvironment('MODEL_ID_FAST', MODEL_ID_FAST);
backend.patientUnderstand.addEnvironment('GUARDRAIL_ID', guardrail.attrGuardrailId);
backend.patientUnderstand.addEnvironment('GUARDRAIL_VERSION', 'DRAFT');
backend.patientUnderstand.resources.lambda.addToRolePolicy(new PolicyStatement({ actions: ['bedrock:InvokeModel'], resources: [modelArn(MODEL_ID_FAST)] }));
backend.patientUnderstand.resources.lambda.addToRolePolicy(new PolicyStatement({ actions: ['bedrock:ApplyGuardrail'], resources: [guardrail.attrGuardrailArn] }));

backend.agentRunner.addEnvironment('MODEL_ID_FAST', MODEL_ID_FAST);
backend.agentRunner.addEnvironment('MODEL_ID_STRONG', MODEL_ID_STRONG);
backend.agentRunner.addEnvironment('GUARDRAIL_ID', guardrail.attrGuardrailId);
backend.agentRunner.addEnvironment('GUARDRAIL_VERSION', 'DRAFT');
backend.agentRunner.addEnvironment('AGENT_GUARDRAIL_ID', agentGuardrail.attrGuardrailId);
// Demo replies (task 21): seeded demo hospitals answer referrals after 8 seconds with preset replies.
// Only the synthetic hospitals from scripts/seed.ts are affected. Set MEDORA_DEMO_REPLIES=false to switch off.
backend.agentRunner.addEnvironment('DEMO_REPLIES', process.env.MEDORA_DEMO_REPLIES === 'false' ? 'false' : 'true');
backend.agentRunner.resources.lambda.addToRolePolicy(
  new PolicyStatement({ actions: ['bedrock:InvokeModel'], resources: [modelArn(MODEL_ID_FAST), modelArn(MODEL_ID_STRONG)] }),
);
backend.agentRunner.resources.lambda.addToRolePolicy(
  new PolicyStatement({ actions: ['bedrock:ApplyGuardrail'], resources: [guardrail.attrGuardrailArn, agentGuardrail.attrGuardrailArn] }),
);
// Real drive times (Amazon Location Routes v2): one action, on the one default data provider, never `*`. Nothing
// is billed while idle; each referral or patient search asks for a handful of origin-destination pairs. If it fails, the agent
// uses the offline drive-time estimate.
// find-care gets the same single permission, for a patient's search (only a rounded position is sent).
for (const fn of [backend.agentRunner, backend.findCare]) {
  fn.resources.lambda.addToRolePolicy(
    new PolicyStatement({ actions: ['geo-routes:CalculateRouteMatrix'], resources: [`arn:aws:geo-routes:${aiStack.region}::provider/default`] }),
  );
}
// find-care's Bedrock permissions: the team lead approved attaching them by default (2026-10-24), because an
// unflagged deploy would otherwise remove them without anyone noticing. Set MEDORA_ATTACH_BEDROCK_IAM=false to
// leave them off. The statements name the Nova Lite ARN and this stack's guardrail, never `*`. Without them
// find-care uses its keyword fallback. Cost: nothing while idle; Nova Lite is a fraction of a cent per search.
if (process.env.MEDORA_ATTACH_BEDROCK_IAM !== 'false') {
  backend.findCare.resources.lambda.addToRolePolicy(new PolicyStatement({ actions: ['bedrock:InvokeModel'], resources: [modelArn(MODEL_ID_FAST)] }));
  backend.findCare.resources.lambda.addToRolePolicy(new PolicyStatement({ actions: ['bedrock:ApplyGuardrail'], resources: [guardrail.attrGuardrailArn] }));
}

// Knowledge base (task 23, requirements 14.1 to 14.3). On by default: a deploy without it would delete the
// stack and the indexed documents, so the sandbox keeps it unless MEDORA_ENABLE_KB=false is set. After a new
// deploy the bucket is empty: run `npm run upload-kb`. Without a knowledge base the agent uses registered
// hospital profiles and says so in the trace. Cost: S3 Vectors and S3 have no hourly charge (cents per month
// for these 25 small documents); Titan Text Embeddings V2 is paid per token at ingestion and per search.
let knowledgeBaseOutput: Record<string, string> | undefined;
if (process.env.MEDORA_ENABLE_KB !== 'false') {
  const kbStack = backend.createStack('knowledge-base');
  const EMBEDDING_MODEL_ID = 'amazon.titan-embed-text-v2:0';
  const isDemoStage = process.env.AWS_BRANCH === 'demo';
  const embeddingArn = `arn:aws:bedrock:${kbStack.region}::foundation-model/${EMBEDDING_MODEL_ID}`;

  // Private source bucket (AGENTS.md 4b.4): block public access, TLS only, AWS-managed encryption.
  const docsBucket = new Bucket(kbStack, 'KbDocs', {
    blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    enforceSSL: true,
    encryption: BucketEncryption.S3_MANAGED,
    // Sandboxes are deleted every day, so they empty and remove the bucket; the demo stage keeps it.
    removalPolicy: isDemoStage ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    autoDeleteObjects: !isDemoStage,
  });
  const vectorBucket = new CfnVectorBucket(kbStack, 'KbVectors', {
    encryptionConfiguration: { sseType: 'AES256' },
  });
  // Titan V2 makes 1024 float32 numbers per document. Bedrock keeps the text in AMAZON_BEDROCK_TEXT, which
  // is too large to filter on, so it must be non-filterable (and can't be changed after creation).
  const vectorIndex = new CfnIndex(kbStack, 'KbIndex', {
    vectorBucketArn: vectorBucket.attrVectorBucketArn,
    dataType: 'float32',
    dimension: 1024,
    distanceMetric: 'cosine',
    metadataConfiguration: { nonFilterableMetadataKeys: ['AMAZON_BEDROCK_TEXT'] },
  });

  const kbRole = new Role(kbStack, 'KbRole', {
    assumedBy: new ServicePrincipal('bedrock.amazonaws.com', {
      conditions: {
        StringEquals: { 'aws:SourceAccount': kbStack.account },
        // Any knowledge base in this account: the role can't name its own knowledge base without a circular dependency.
        ArnLike: { 'aws:SourceArn': `arn:aws:bedrock:${kbStack.region}:${kbStack.account}:knowledge-base/*` },
      },
    }),
  });
  kbRole.addToPolicy(new PolicyStatement({ actions: ['bedrock:InvokeModel'], resources: [embeddingArn] }));
  // The account condition stops the role from being used to read a bucket in another account.
  const ownAccount = { StringEquals: { 'aws:ResourceAccount': kbStack.account } };
  kbRole.addToPolicy(new PolicyStatement({ actions: ['s3:ListBucket'], resources: [docsBucket.bucketArn], conditions: ownAccount }));
  kbRole.addToPolicy(new PolicyStatement({ actions: ['s3:GetObject'], resources: [docsBucket.arnForObjects('*')], conditions: ownAccount }));
  kbRole.addToPolicy(
    new PolicyStatement({
      actions: ['s3vectors:PutVectors', 's3vectors:GetVectors', 's3vectors:DeleteVectors', 's3vectors:QueryVectors', 's3vectors:GetIndex'],
      resources: [vectorIndex.attrIndexArn],
    }),
  );

  const knowledgeBase = new CfnKnowledgeBase(kbStack, 'KnowledgeBase', {
    name: Names.uniqueResourceName(kbStack, { maxLength: 60, separator: '-' }).replace(/[^0-9a-zA-Z_-]/g, ''),
    description: 'Medora: registered capability of each hospital department (synthetic data), English and Thai.',
    roleArn: kbRole.roleArn,
    knowledgeBaseConfiguration: {
      type: 'VECTOR',
      vectorKnowledgeBaseConfiguration: {
        embeddingModelArn: embeddingArn,
        embeddingModelConfiguration: { bedrockEmbeddingModelConfiguration: { dimensions: 1024, embeddingDataType: 'FLOAT32' } },
      },
    },
    storageConfiguration: {
      type: 'S3_VECTORS',
      s3VectorsConfiguration: { indexArn: vectorIndex.attrIndexArn },
    },
  });
  // The role's policy must exist before Bedrock validates access to the index.
  knowledgeBase.node.addDependency(kbRole);
  const dataSource = new CfnDataSource(kbStack, 'KbDataSource', {
    knowledgeBaseId: knowledgeBase.attrKnowledgeBaseId,
    name: 'hospital-capabilities',
    dataSourceConfiguration: { type: 'S3', s3Configuration: { bucketArn: docsBucket.bucketArn } },
    // One document per department is already small: no chunking (requirement 14.1).
    vectorIngestionConfiguration: { chunkingConfiguration: { chunkingStrategy: 'NONE' } },
  });

  // The agent may only search this one knowledge base (AGENTS.md 4b.3).
  backend.agentRunner.addEnvironment('KB_ID', knowledgeBase.attrKnowledgeBaseId);
  backend.agentRunner.resources.lambda.addToRolePolicy(
    new PolicyStatement({ actions: ['bedrock:Retrieve'], resources: [knowledgeBase.attrKnowledgeBaseArn] }),
  );
  knowledgeBaseOutput = {
    knowledgeBaseId: knowledgeBase.attrKnowledgeBaseId,
    dataSourceId: dataSource.attrDataSourceId,
    docsBucket: docsBucket.bucketName,
    region: kbStack.region,
  };
}

// The real map (Amazon Location Maps v2). A map API key that can only fetch tiles from the default provider: keys are
// built for use in the browser, and this one reads nothing else. CloudFormation cannot output a key's value, so the
// map-config Lambda reads it with DescribeKey on this one key. No idle cost; billed per map tile request. forceDelete lets
// `npm run sandbox:delete` remove the key. If anything here fails the app draws its offline map.
const mapsStack = backend.createStack('maps');
const mapKeyName = `medora-maps-${Names.uniqueResourceName(mapsStack, { maxLength: 80, separator: '-' })}`.replace(/[^0-9a-zA-Z_.-]/g, '');
// Optional: MEDORA_MAP_REFERERS="https://app.example.com/*,http://localhost:*/*" lets only those web addresses use the
// key (the phone apps send no address, and they draw the offline map). Unset, any address may use it, which is fine
// for a demo because the key can only fetch tiles; set it before the apps are public.
const mapReferers = (process.env.MEDORA_MAP_REFERERS ?? '').split(',').map((entry) => entry.trim()).filter(Boolean);
const mapKey = new CfnAPIKey(mapsStack, 'MapKey', {
  keyName: mapKeyName,
  description: 'Medora map tiles for the apps (read-only).',
  noExpiry: true,
  forceDelete: true,
  restrictions: {
    allowActions: ['geo-maps:GetTile'],
    allowResources: [`arn:aws:geo-maps:${mapsStack.region}::provider/default`],
    ...(mapReferers.length ? { allowReferers: mapReferers } : {}),
  },
});
backend.mapConfig.addEnvironment('MAP_KEY_NAME', mapKeyName);
backend.mapConfig.resources.lambda.addToRolePolicy(new PolicyStatement({ actions: ['geo:DescribeKey'], resources: [mapKey.attrKeyArn] }));

// search-places may only run Amazon Location text search, on the one default data provider (AGENTS.md 4b.3).
// Cost: nothing while idle; billed per search request.
backend.searchPlaces.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['geo-places:SearchText'],
    resources: [`arn:aws:geo-places:${Stack.of(backend.searchPlaces.resources.lambda).region}::provider/default`],
  }),
);

// route-path may only calculate a route, on the one default data provider (AGENTS.md 4b.3).
// Cost: nothing while idle; billed per route request (the app asks once per pair of points it draws).
backend.routePath.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['geo-routes:CalculateRoutes'],
    resources: [`arn:aws:geo-routes:${Stack.of(backend.routePath.resources.lambda).region}::provider/default`],
  }),
);

// Staff pool (docs/roles.md, AGENTS.md section 4b): hospital accounts only, by invitation, with
// authenticator-app (TOTP) MFA required and no SMS. The default Amplify pool above stays the
// public pool for patients. Cost: no charge while idle; TOTP MFA is free.
const staffStack = backend.createStack('staff-auth');
const staffPool = new UserPool(staffStack, 'StaffPool', {
  userPoolName: `medora-staff-${staffStack.stackName}`,
  selfSignUpEnabled: false,
  signInAliases: { email: true },
  signInCaseSensitive: false,
  autoVerify: { email: true },
  mfa: Mfa.REQUIRED,
  mfaSecondFactor: { otp: true, sms: false },
  accountRecovery: AccountRecovery.EMAIL_ONLY,
  passwordPolicy: { minLength: 12, requireLowercase: true, requireUppercase: true, requireDigits: true, requireSymbols: true },
  customAttributes: {
    hospitalId: new StringAttribute({ mutable: true, maxLen: 64 }),
    unit: new StringAttribute({ mutable: true, maxLen: 16 }),
  },
  // Sandboxes are deleted every day; keep real staff accounts if the demo stage stack is ever removed.
  removalPolicy: process.env.AWS_BRANCH === 'demo' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
});
for (const groupName of ['admins', 'hospital_staff', 'doctors']) {
  new CfnUserPoolGroup(staffStack, `Group-${groupName}`, { userPoolId: staffPool.userPoolId, groupName });
}
// Users can read hospitalId and unit into their ID token but never write them; only admins set
// them (through invite-staff), so nobody can move hospitals or take over another unit.
const staffClient = staffPool.addClient('StaffApp', {
  generateSecret: false,
  authFlows: { userSrp: true },
  preventUserExistenceErrors: true,
  readAttributes: new ClientAttributes().withStandardAttributes({ email: true }).withCustomAttributes('hospitalId', 'unit'),
  // Nothing is writable by the user: not hospitalId, unit or even the login email.
  writeAttributes: new ClientAttributes(),
});

// Register the staff pool next to the public pool as an AppSync sign-in provider.
const graphqlApi = backend.data.resources.cfnResources.cfnGraphqlApi;
const existingProviders = Array.isArray(graphqlApi.additionalAuthenticationProviders)
  ? graphqlApi.additionalAuthenticationProviders
  : [];
graphqlApi.additionalAuthenticationProviders = [
  ...existingProviders,
  {
    authenticationType: 'AMAZON_COGNITO_USER_POOLS',
    userPoolConfig: {
      userPoolId: staffPool.userPoolId,
      awsRegion: staffStack.region,
      appIdClientRegex: staffClient.userPoolClientId,
    },
  },
];

// invite-staff may only manage users of the staff pool, and nothing else.
backend.inviteStaff.addEnvironment('STAFF_USER_POOL_ID', staffPool.userPoolId);
backend.inviteStaff.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['cognito-idp:AdminCreateUser', 'cognito-idp:AdminAddUserToGroup'],
    resources: [staffPool.userPoolArn],
  }),
);

backend.adminSettings.addEnvironment('STAFF_USER_POOL_ID', staffPool.userPoolId);
backend.referralActions.addEnvironment('STAFF_USER_POOL_ID', staffPool.userPoolId);
backend.specialistActions.addEnvironment('STAFF_USER_POOL_ID', staffPool.userPoolId);
backend.specialistActions.addEnvironment('PUBLIC_USER_POOL_ID', backend.auth.resources.userPool.userPoolId);

// update-status only accepts staff-pool tokens; it needs the pool id to check them and no IAM of its own.
backend.updateStatus.addEnvironment('STAFF_USER_POOL_ID', staffPool.userPoolId);

// care-actions checks patient tokens against the public pool and staff tokens against the staff pool;
// it has no IAM of its own beyond its data access.
backend.careActions.addEnvironment('PUBLIC_USER_POOL_ID', backend.auth.resources.userPool.userPoolId);
backend.careActions.addEnvironment('STAFF_USER_POOL_ID', staffPool.userPoolId);

// find-care reads its model ids from the environment (AGENTS.md 4a); agent-runner's are set with its
// guardrails above.
// Demo switch (task 21): simulated hospital replies, off unless DEMO_REPLIES=true is set for the demo stage.
if (process.env.DEMO_REPLIES === 'true') backend.agentRunner.addEnvironment('DEMO_REPLIES', 'true');
backend.findCare.addEnvironment('MODEL_ID_FAST', MODEL_ID_FAST);
backend.findCare.addEnvironment('GUARDRAIL_ID', guardrail.attrGuardrailId);
backend.findCare.addEnvironment('GUARDRAIL_VERSION', 'DRAFT');

// register-hospital gets one Cognito action on the staff pool only. IAM can't narrow it to one
// attribute, so the guarantee that it writes only custom:hospitalId lives in the handler. The first
// admin is created in the staff pool by scripts/create-first-admin.mjs, already in the `admins` group.
backend.registerHospital.addEnvironment('STAFF_USER_POOL_ID', staffPool.userPoolId);
backend.registerHospital.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['cognito-idp:AdminUpdateUserAttributes'],
    resources: [staffPool.userPoolArn],
  }),
);

// The hospital app reads these to sign in against the staff pool.
backend.addOutput({
  custom: {
    staffAuth: {
      userPoolId: staffPool.userPoolId,
      userPoolClientId: staffClient.userPoolClientId,
      region: staffStack.region,
    },
    ...(knowledgeBaseOutput ? { knowledgeBase: knowledgeBaseOutput } : {}),
  },
});
