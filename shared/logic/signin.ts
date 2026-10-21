/**
 * Sign-in steps shared by the app and its tests: what the screen must show next after Amazon
 * Cognito answers. Staff accounts set their own password, then set up and use an authenticator app.
 * Requirements: 1.2, 1.5, 18.3
 */

export type SignInNext = 'done' | 'newPassword' | 'verify' | 'totpSetup' | 'totpCode';

/** Which user pool a person signs in to: patients, doctors and new admins use the public pool. */
export type PoolKind = 'public' | 'staff';

/** Maps a Cognito sign-in step to the screen to show, or `undefined` for a step the app doesn't support. */
export function signInStepToNext(step: string): SignInNext | undefined {
  switch (step) {
    case 'DONE':
      return 'done';
    case 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED':
      return 'newPassword';
    case 'CONFIRM_SIGN_UP':
      return 'verify';
    case 'CONTINUE_SIGN_IN_WITH_TOTP_SETUP':
      return 'totpSetup';
    case 'CONFIRM_SIGN_IN_WITH_TOTP_CODE':
      return 'totpCode';
    default:
      return undefined;
  }
}

/** Authenticator codes are exactly six digits; spaces typed for readability are ignored. */
export function cleanTotpCode(input: string): string | null {
  const digits = input.replace(/\s+/g, '');
  return /^\d{6}$/.test(digits) ? digits : null;
}
