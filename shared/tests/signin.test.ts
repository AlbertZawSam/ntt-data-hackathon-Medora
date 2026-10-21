import { cleanTotpCode, signInStepToNext } from '../logic/signin';

describe('signInStepToNext', () => {
  it.each([
    ['DONE', 'done'],
    ['CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED', 'newPassword'],
    ['CONFIRM_SIGN_UP', 'verify'],
    ['CONTINUE_SIGN_IN_WITH_TOTP_SETUP', 'totpSetup'],
    ['CONFIRM_SIGN_IN_WITH_TOTP_CODE', 'totpCode'],
  ])('maps %s to %s', (step, next) => {
    expect(signInStepToNext(step)).toBe(next);
  });

  it('refuses steps the app does not support, such as SMS codes', () => {
    expect(signInStepToNext('CONFIRM_SIGN_IN_WITH_SMS_CODE')).toBeUndefined();
    expect(signInStepToNext('')).toBeUndefined();
  });
});

describe('cleanTotpCode', () => {
  it('accepts six digits, with or without spaces', () => {
    expect(cleanTotpCode('123456')).toBe('123456');
    expect(cleanTotpCode(' 123 456 ')).toBe('123456');
  });

  it('rejects anything else', () => {
    for (const bad of ['', '12345', '1234567', '12345a', '12-456']) expect(cleanTotpCode(bad)).toBeNull();
  });
});
