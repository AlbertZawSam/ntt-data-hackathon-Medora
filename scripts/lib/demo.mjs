// @ts-check
// Pure demo data for the setup scripts, kept separate so tests/unit can check it without AWS.

/**
 * @typedef {{ email: string; groups: string[]; hospitalId?: string; role: string }} TestUser
 */

// Synthetic accounts (task 5.3). example.com is reserved, so these can never reach a real inbox.
/** @type {TestUser[]} */
export const TEST_USERS = [
  { email: 'patient@example.com', groups: ['patients'], role: 'patient' },
  { email: 'staff.h02@example.com', groups: ['hospital_staff', 'admins'], hospitalId: 'H02', role: 'staff + admin, H02' },
  { email: 'staff.h03@example.com', groups: ['hospital_staff', 'admins'], hospitalId: 'H03', role: 'staff + admin, H03' },
  { email: 'staff.h07@example.com', groups: ['hospital_staff'], hospitalId: 'H07', role: 'staff, H07' },
  { email: 'doctor.h04@example.com', groups: ['doctors'], hospitalId: 'H04', role: 'doctor, H04' },
];

// Cognito's default policy in Amplify: 8+ characters with upper, lower, digit and symbol.
// Returns what is missing, or an empty list when the password is acceptable.
/** @param {string | undefined} password */
export function passwordProblems(password) {
  if (!password) return ['set MEDORA_TEST_PASSWORD'];
  const problems = [];
  if (password.length < 8) problems.push('at least 8 characters');
  if (!/[a-z]/.test(password)) problems.push('a lowercase letter');
  if (!/[A-Z]/.test(password)) problems.push('an uppercase letter');
  if (!/[0-9]/.test(password)) problems.push('a digit');
  if (!/[^A-Za-z0-9]/.test(password)) problems.push('a symbol');
  return problems;
}

/**
 * HospitalStatus rows for DynamoDB (task 6.2), one per hospital. The seeded age in minutes
 * becomes a real updatedAt, so a hospital seeded as stale still shows "may be outdated".
 * status is stored as a JSON string, as AppSync stores AWSJSON fields.
 * @param {{ id: string; status: Record<string, unknown> & { ageMin?: number } }[]} hospitals
 * @param {number} nowMs
 */
export function seedItems(hospitals, nowMs) {
  const iso = new Date(nowMs).toISOString();
  return hospitals.map(({ id, status }) => {
    const { ageMin = 0, ...rest } = status;
    return {
      hospitalId: id,
      status: JSON.stringify({ ...rest, updatedAt: nowMs - ageMin * 60_000 }),
      __typename: 'HospitalStatus',
      createdAt: iso,
      updatedAt: iso,
    };
  });
}

// Tables cleared by reset-demo (task 6.2). Hospital status, devices and the activity log stay.
export const RESET_MODELS = ['CareRequest', 'Message', 'Referral', 'TraceStep'];
