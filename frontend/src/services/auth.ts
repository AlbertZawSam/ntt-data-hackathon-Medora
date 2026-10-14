/**
 * Sign-up, sign-in and session, wrapping Amplify Auth (Amazon Cognito).
 * Requirements: 1.1, 1.2, 1.4, 1.6, 18.3
 */
import {
  confirmSignIn,
  confirmSignUp,
  fetchAuthSession,
  resendSignUpCode,
  signIn as amplifySignIn,
  signOut as amplifySignOut,
  signUp as amplifySignUp,
} from 'aws-amplify/auth';
import type { StringKey } from '../i18n/t';
import { sessionFromClaims, type Session, type SignUpRole } from '@medora/shared/logic/session';
import { backendConfigured } from './amplify';

/** What the sign-in screen must do next. */
export type SignInNext = 'done' | 'newPassword' | 'verify';

/** An auth failure with a translated message key that never says whether an email exists. */
export class AuthError extends Error {
  constructor(
    readonly messageKey: StringKey,
    cause?: unknown,
  ) {
    super(messageKey);
    this.name = 'AuthError';
    this.cause = cause;
  }
}

function toAuthError(err: unknown, fallback: StringKey): AuthError {
  if (!backendConfigured) return new AuthError('auth.error.noBackend', err);
  const name = err instanceof Error ? err.name : '';
  const keys: Record<string, StringKey> = {
    InvalidPasswordException: 'auth.error.password',
    CodeMismatchException: 'auth.error.code',
    ExpiredCodeException: 'auth.error.codeExpired',
    LimitExceededException: 'auth.error.tooMany',
    TooManyRequestsException: 'auth.error.tooMany',
    TooManyFailedAttemptsException: 'auth.error.tooMany',
    NetworkError: 'auth.error.network',
  };
  return new AuthError(keys[name] ?? fallback, err);
}

const clean = (email: string): string => email.trim().toLowerCase();

export async function signUp(email: string, password: string, role: SignUpRole): Promise<void> {
  try {
    await amplifySignUp({
      username: clean(email),
      password,
      options: { userAttributes: { email: clean(email), 'custom:role': role } },
    });
  } catch (err) {
    // An already-registered email gets the same message as any other failure.
    throw toAuthError(err, 'signUp.error.generic');
  }
}

export async function confirmCode(email: string, code: string): Promise<void> {
  try {
    await confirmSignUp({ username: clean(email), confirmationCode: code.trim() });
  } catch (err) {
    throw toAuthError(err, 'auth.error.code');
  }
}

export async function resendCode(email: string): Promise<void> {
  try {
    await resendSignUpCode({ username: clean(email) });
  } catch (err) {
    throw toAuthError(err, 'auth.error.generic');
  }
}

export async function signIn(email: string, password: string): Promise<SignInNext> {
  try {
    const { nextStep } = await amplifySignIn({ username: clean(email), password });
    return stepToNext(nextStep.signInStep);
  } catch (err) {
    throw toAuthError(err, 'signIn.errorGeneric');
  }
}

/** Invited staff set their own password on first sign-in. */
export async function setNewPassword(password: string): Promise<SignInNext> {
  try {
    const { nextStep } = await confirmSignIn({ challengeResponse: password });
    return stepToNext(nextStep.signInStep);
  } catch (err) {
    throw toAuthError(err, 'auth.error.generic');
  }
}

function stepToNext(step: string): SignInNext {
  if (step === 'DONE') return 'done';
  if (step === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') return 'newPassword';
  if (step === 'CONFIRM_SIGN_UP') return 'verify';
  // MFA and other challenges are off for the MVP.
  throw new AuthError('signIn.errorGeneric');
}

export async function signOut(): Promise<void> {
  await amplifySignOut();
}

/**
 * The signed-in user's session, or null. Pass `refresh` after the backend changes the user's
 * groups or attributes (e.g. after registering a hospital) to get a new ID token.
 */
export async function getSession(refresh = false): Promise<Session | null> {
  try {
    const { tokens } = await fetchAuthSession({ forceRefresh: refresh });
    return tokens?.idToken ? sessionFromClaims(tokens.idToken.payload) : null;
  } catch {
    return null;
  }
}
