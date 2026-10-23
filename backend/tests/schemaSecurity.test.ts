/**
 * Security tests (task 26) over the data schema and the staff pool as written in code: a patient can't
 * read operational data, hospital accounts can't write status or requests directly, and staff sign-in
 * requires an authenticator code. They read the source files, so they run with no AWS account.
 * Requirements: 1.4, 1.6, 18.3
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (file: string): string => readFileSync(join(__dirname, '..', 'amplify', file), 'utf8');
const schemaSource = read('data/resource.ts');
const backendSource = read('backend.ts');

/** The text of one model's definition, from its name up to the next top-level entry. */
function modelBlock(name: string): string {
  const start = schemaSource.search(new RegExp(`^  ${name}: a\\s*\\n\\s*\\.model`, 'm'));
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = schemaSource.slice(start + 10);
  const next = rest.search(/^  \w+: a\s*$/m);
  return next < 0 ? schemaSource.slice(start) : schemaSource.slice(start, start + 10 + next);
}

const authRules = (block: string): string[] => block.slice(block.indexOf('.authorization')).split('\n').filter((l) => l.includes('allow.'));
const MODELS = ['HospitalProfile', 'HospitalStatus', 'Specialist', 'CareRequest', 'Reservation', 'Message', 'Referral', 'TraceStep', 'Transfer', 'Activity', 'Device'];

describe('data schema', () => {
  it('has no public, guest or any-signed-in-user access on any model', () => {
    for (const m of MODELS) {
      const rules = authRules(modelBlock(m)).join('\n');
      expect(rules).not.toMatch(/publicApiKey|allow\.guest|allow\.authenticated|allow\.groups\(|allow\.custom/);
    }
  });

  it('gives the patients group no access to any model, so a patient account reads no operational data', () => {
    for (const m of MODELS) expect(authRules(modelBlock(m)).join('\n')).not.toMatch(/group\('patients'\)/);
  });

  it('ties every model rule to the signed-in user or their own hospital', () => {
    for (const m of MODELS) {
      for (const rule of authRules(modelBlock(m))) {
        expect(rule).toMatch(/ownerDefinedIn|ownersDefinedIn/);
        expect(rule).toMatch(/identityClaim\('(sub|custom:hospitalId)'\)/);
      }
    }
  });

  it.each(['HospitalProfile', 'HospitalStatus', 'Specialist', 'CareRequest', 'Reservation', 'Message', 'Referral', 'TraceStep', 'Transfer'])(
    'lets clients only read %s (changes go through Lambdas that check the role and hospital)',
    (m) => {
      for (const rule of authRules(modelBlock(m))) expect(rule).toContain(".to(['read'])");
    },
  );

  it('lets the audit log be read by the hospital, added to only by its owner, and never edited or deleted', () => {
    const rules = authRules(modelBlock('Activity'));
    expect(rules.find((r) => r.includes("'sub'"))).toContain(".to(['create', 'read'])");
    expect(rules.find((r) => r.includes('custom:hospitalId'))).toContain(".to(['read'])");
  });

  it('puts every custom mutation and query behind a group', () => {
    const custom = [...schemaSource.matchAll(/^  (\w+): a\s*\n\s*\.(mutation|query)\(\)([\s\S]*?)\.handler\(/gm)];
    expect(custom.length).toBeGreaterThanOrEqual(15);
    for (const [, name, , body] of custom) {
      expect({ name, grouped: /allow\.group\('(patients|hospital_staff|doctors|admins)'\)/.test(body) }).toEqual({ name, grouped: true });
    }
  });

  it('keeps hospital-only actions away from the patients group, and patient-only actions away from staff', () => {
    const body = (name: string): string => schemaSource.match(new RegExp(`^  ${name}: a[\\s\\S]*?\\.handler\\(`, 'm'))?.[0] ?? '';
    for (const name of ['answerRequest', 'updateStatus', 'openReferral', 'decideReferral', 'startReferral', 'setAutoAcceptRules', 'saveSpecialist', 'removeSpecialist', 'inviteStaff', 'registerHospital']) {
      expect({ name, patients: body(name).includes("group('patients')") }).toEqual({ name, patients: false });
    }
    for (const name of ['submitRequest', 'cancelRequest', 'findCare', 'findSpecialists', 'bookSpecialist']) {
      expect({ name, staff: /group\('(hospital_staff|doctors|admins)'\)/.test(body(name)) }).toEqual({ name, staff: false });
    }
  });
});

describe('staff pool', () => {
  it('is invite only', () => {
    expect(backendSource).toMatch(/selfSignUpEnabled: false/);
  });

  it('requires an authenticator code (TOTP) and never SMS', () => {
    expect(backendSource).toMatch(/mfa: Mfa\.REQUIRED/);
    expect(backendSource).toMatch(/mfaSecondFactor: \{ otp: true, sms: false \}/);
  });

  it("can't have hospital or unit written by the user: the staff app client writes no attributes", () => {
    expect(backendSource).toMatch(/writeAttributes: new ClientAttributes\(\)/);
  });

  it('lets the public pool client write only the email and the (ignored) sign-up role', () => {
    expect(backendSource).toMatch(/writeAttributes = \['email', 'custom:role'\]/);
    expect(backendSource).not.toMatch(/writeAttributes[^\n]*custom:(hospitalId|unit|approved)/);
  });

  it('does not reveal whether an email has an account', () => {
    expect(backendSource).toMatch(/preventUserExistenceErrors = 'ENABLED'/);
    expect(backendSource).toMatch(/preventUserExistenceErrors: true/);
  });
});
