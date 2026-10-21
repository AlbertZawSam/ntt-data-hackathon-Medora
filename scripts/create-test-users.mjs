#!/usr/bin/env node
/**
 * Creates the demo hospital accounts in the staff user pool, for one hospital that an admin has
 * already registered in the app (docs/roles.md, "Seed and test users").
 *
 *   node scripts/create-test-users.mjs <hospitalId> [--profile <aws-profile>]
 *
 * Reads the staff pool id from frontend/amplify_outputs.json. Run it yourself with your own AWS
 * credentials; it only calls cognito-idp:AdminCreateUser and AdminAddUserToGroup on that pool, sends
 * no email and prints each account's one-time temporary password once. On first sign-in each
 * person sets a new password and an authenticator app (TOTP is required). Synthetic data only.
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
const hospitalId = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--profile');
const profile = args.includes('--profile') ? args[args.indexOf('--profile') + 1] : process.env.AWS_PROFILE;
if (!hospitalId || !/^H-[0-9a-f]{16}$/.test(hospitalId)) {
  console.error('Usage: node scripts/create-test-users.mjs <hospitalId> [--profile <aws-profile>]');
  console.error('The hospital id looks like H-0123456789abcdef; the registered admin sees it in their token.');
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

const slug = hospitalId.slice(2, 8);
const ACCOUNTS = [
  { email: `admin.${slug}@medora.demo`, group: 'admins' },
  { email: `ward.${slug}@medora.demo`, group: 'hospital_staff', unit: 'ward' },
  { email: `icu.${slug}@medora.demo`, group: 'hospital_staff', unit: 'icu' },
  { email: `nicu.${slug}@medora.demo`, group: 'hospital_staff', unit: 'nicu' },
  { email: `er.${slug}@medora.demo`, group: 'hospital_staff', unit: 'er' },
  { email: `radiology.${slug}@medora.demo`, group: 'hospital_staff', unit: 'radiology' },
  { email: `cathlab.${slug}@medora.demo`, group: 'hospital_staff', unit: 'cathlab' },
  { email: `doctor.${slug}@medora.demo`, group: 'doctors' },
];

/** 16 characters with upper, lower, digit and symbol, which satisfies the pool's 12-character policy. */
function temporaryPassword() {
  const pick = (chars) => chars[randomInt(chars.length)];
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!#$%*+-=?'];
  const all = sets.join('');
  const chars = sets.map(pick);
  while (chars.length < 16) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

const client = new CognitoIdentityProviderClient({
  region: staff.region,
  ...(profile ? { credentials: fromIni({ profile }) } : {}),
});

for (const account of ACCOUNTS) {
  const password = temporaryPassword();
  try {
    await client.send(
      new AdminCreateUserCommand({
        UserPoolId: staff.userPoolId,
        Username: account.email,
        TemporaryPassword: password,
        MessageAction: 'SUPPRESS',
        UserAttributes: [
          { Name: 'email', Value: account.email },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'custom:hospitalId', Value: hospitalId },
          ...(account.unit ? [{ Name: 'custom:unit', Value: account.unit }] : []),
        ],
      }),
    );
    await client.send(new AdminAddUserToGroupCommand({ UserPoolId: staff.userPoolId, Username: account.email, GroupName: account.group }));
    console.log(`${account.email.padEnd(40)} ${account.group.padEnd(15)} ${(account.unit ?? '').padEnd(10)} ${password}`);
  } catch (error) {
    console.log(`${account.email.padEnd(40)} skipped: ${error.name}`);
  }
}
