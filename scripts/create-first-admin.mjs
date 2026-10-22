#!/usr/bin/env node
/**
 * Creates the first admin of a hospital in the invite-only staff pool, with no hospital yet.
 *
 *   node scripts/create-first-admin.mjs <email> [--profile <aws-profile>]
 *
 * The admin signs in under "Hospital staff sign in", sets a password and an authenticator app (TOTP is
 * required), then registers the hospital on the Hospital Setup screen. That sets their hospital id.
 * After that they invite unit staff and doctors in the app, or you run scripts/create-test-users.mjs.
 * Reads the staff pool id from frontend/amplify_outputs.json. Run it yourself with your own AWS
 * credentials: it only calls cognito-idp:AdminCreateUser and AdminAddUserToGroup on that pool, sends no
 * email and prints the one-time temporary password once. Synthetic data only.
 */
import { randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import { fromIni } from '@aws-sdk/credential-providers';

const args = process.argv.slice(2);
const email = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--profile')?.trim().toLowerCase();
const profile = args.includes('--profile') ? args[args.indexOf('--profile') + 1] : process.env.AWS_PROFILE;
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: node scripts/create-first-admin.mjs <email> [--profile <aws-profile>]');
  process.exit(1);
}

const outputs = JSON.parse(readFileSync(resolve(dirname(process.argv[1]), '..', 'frontend', 'amplify_outputs.json'), 'utf8'));
const staff = outputs.custom?.staffAuth;
if (!staff) {
  console.error('No staff pool in frontend/amplify_outputs.json. Run `npm run sandbox` first.');
  process.exit(1);
}
if (staff.region !== 'us-east-1') {
  console.error(`Refusing to run in ${staff.region}: this project deploys to us-east-1 only.`);
  process.exit(1);
}

/** 16 characters with upper, lower, digit and symbol, which satisfies the pool's 12-character policy. */
function temporaryPassword() {
  const pick = (chars) => chars[randomInt(chars.length)];
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!#$%*+-='];
  const all = sets.join('');
  const chars = sets.map(pick);
  while (chars.length < 16) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

const client = new CognitoIdentityProviderClient({ region: staff.region, ...(profile ? { credentials: fromIni({ profile }) } : {}) });
const password = temporaryPassword();
await client.send(
  new AdminCreateUserCommand({
    UserPoolId: staff.userPoolId,
    Username: email,
    TemporaryPassword: password,
    MessageAction: 'SUPPRESS',
    UserAttributes: [
      { Name: 'email', Value: email },
      { Name: 'email_verified', Value: 'true' },
    ],
  }),
);
await client.send(new AdminAddUserToGroupCommand({ UserPoolId: staff.userPoolId, Username: email, GroupName: 'admins' }));
console.log(`${email}  admins  temporary password: ${password}`);
console.log('Sign in under "Hospital staff sign in", set your password and authenticator, then register the hospital.');
