#!/usr/bin/env node
// @ts-check
// Creates the synthetic demo accounts in this sandbox's Cognito user pool (task 5.3).
// Safe to run again: existing users get the same password, hospital and groups.
//
// Usage: MEDORA_TEST_PASSWORD='…' node scripts/create-test-users.mjs
// The password is never stored in the repo; share it with the team out of band.
// Cost: Cognito is free for the first 10,000 monthly active users.
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';

import { loadOutputs } from './lib/aws.mjs';
import { passwordProblems, TEST_USERS } from './lib/demo.mjs';

const password = process.env.MEDORA_TEST_PASSWORD;
const problems = passwordProblems(password);
if (problems.length) {
  console.error(`MEDORA_TEST_PASSWORD needs: ${problems.join(', ')}.`);
  process.exit(1);
}

const outputs = loadOutputs();
const { user_pool_id: poolId, aws_region: region } = outputs.auth ?? {};
if (!poolId) throw new Error('amplify_outputs.json has no auth section.');
const cognito = new CognitoIdentityProviderClient({ region });

for (const user of TEST_USERS) {
  const attributes = [
    { Name: 'email', Value: user.email },
    { Name: 'email_verified', Value: 'true' },
    ...(user.hospitalId ? [{ Name: 'custom:hospitalId', Value: user.hospitalId }] : []),
  ];
  try {
    // SUPPRESS: no invitation email is sent.
    await cognito.send(
      new AdminCreateUserCommand({ UserPoolId: poolId, Username: user.email, UserAttributes: attributes, MessageAction: 'SUPPRESS' }),
    );
  } catch (error) {
    if (/** @type {any} */ (error).name !== 'UsernameExistsException') throw error;
    await cognito.send(new AdminUpdateUserAttributesCommand({ UserPoolId: poolId, Username: user.email, UserAttributes: attributes }));
  }
  await cognito.send(new AdminSetUserPasswordCommand({ UserPoolId: poolId, Username: user.email, Password: password, Permanent: true }));
  for (const group of user.groups) {
    await cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: poolId, Username: user.email, GroupName: group }));
  }
  console.log(`ok  ${user.email.padEnd(24)} ${user.role}`);
}
console.log(`\n${TEST_USERS.length} test users ready in ${poolId}.`);
