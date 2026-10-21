import { defineBackend } from '@aws-amplify/backend';
import { RemovalPolicy, Tags } from 'aws-cdk-lib';
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
import { registerHospital } from './functions/register-hospital/resource';
import { updateStatus } from './functions/update-status/resource';

const backend = defineBackend({ auth, postConfirmation, data, agentRunner, inviteStaff, registerHospital, updateStatus });

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

// Bedrock, Knowledge Base, and Amazon Location permissions are intentionally not attached here.
// AGENTS.md forbids coding-agent IAM changes; the team lead must grant the narrowly scoped
// `bedrock:InvokeModel`, `bedrock:Retrieve`, and `geo:CalculateRouteMatrix` permissions before
// enabling the model path. Until then the coordinator takes its fixed-rule backup path.

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
