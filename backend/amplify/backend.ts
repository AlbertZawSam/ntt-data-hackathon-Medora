import { defineBackend } from '@aws-amplify/backend';
import { Names, RemovalPolicy, Stack, Tags } from 'aws-cdk-lib';
import { CfnGuardrail } from 'aws-cdk-lib/aws-bedrock';
import {
  AccountRecovery,
  CfnUserPoolGroup,
  ClientAttributes,
  Mfa,
  StringAttribute,
  UserPool,
} from 'aws-cdk-lib/aws-cognito';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { auth } from './auth/resource';
import { postConfirmation } from './auth/post-confirmation/resource';
import { data } from './data/resource';
import { agentRunner } from './functions/agent-runner/resource';
import { inviteStaff } from './functions/invite-staff/resource';
import { patientUnderstand } from './functions/patient-understand/resource';
import { registerHospital } from './functions/register-hospital/resource';
import { updateStatus } from './functions/update-status/resource';

const backend = defineBackend({ auth, postConfirmation, data, agentRunner, inviteStaff, patientUnderstand, registerHospital, updateStatus });

// Tag every resource so Cost Explorer shows spend per stage (AGENTS.md section 5).
const app = backend.stack.node.root;
Tags.of(app).add('project', 'medora');
Tags.of(app).add('stage', process.env.AWS_BRANCH === 'demo' ? 'demo' : 'dev');

// The app may only write these attributes; hospital and approval are set by the backend,
// so nobody can approve themselves or claim another hospital.
const { cfnUserPoolClient } = backend.auth.resources.cfnResources;
cfnUserPoolClient.writeAttributes = ['email', 'custom:role', 'custom:requestedHospitalId'];
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
backend.agentRunner.resources.lambda.addToRolePolicy(
  new PolicyStatement({ actions: ['bedrock:InvokeModel'], resources: [modelArn(MODEL_ID_FAST), modelArn(MODEL_ID_STRONG)] }),
);
backend.agentRunner.resources.lambda.addToRolePolicy(
  new PolicyStatement({ actions: ['bedrock:ApplyGuardrail'], resources: [guardrail.attrGuardrailArn, agentGuardrail.attrGuardrailArn] }),
);
// The knowledge base (bedrock:Retrieve) and Amazon Location route matrix are not set up yet; until
// they are, the agent uses registered hospital profiles and the on-device drive-time estimate.

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

// update-status only accepts staff-pool tokens; it needs the pool id to check them and no IAM of its own.
backend.updateStatus.addEnvironment('STAFF_USER_POOL_ID', staffPool.userPoolId);

// register-hospital gets one Cognito action on the public pool only. IAM can't narrow it to one
// attribute, so the guarantee that it writes only custom:hospitalId lives in the handler.
// The `admins` group is already assigned at sign-up, so it needs no group permission.
backend.registerHospital.addEnvironment('PUBLIC_USER_POOL_ID', backend.auth.resources.userPool.userPoolId);
backend.registerHospital.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['cognito-idp:AdminUpdateUserAttributes'],
    resources: [backend.auth.resources.userPool.userPoolArn],
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
  },
});
