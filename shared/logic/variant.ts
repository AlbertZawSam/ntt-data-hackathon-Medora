/**
 * The two apps in one codebase: Medora for people seeking care (`patient`) and Medora for Hospitals
 * (`hospital`). The variant decides which sign-in options show and which roles may use the app, so the
 * patient app never shows hospital screens (AGENTS.md 4b.2). The server still enforces every right.
 * Pure TypeScript. Requirements: 1.1, 1.6
 */
import { canOpen, type Session } from './session';
import type { PoolKind } from './signin';

/** `all` is for development only: both apps' screens in one build. Release builds set `patient` or `hospital`. */
export type AppVariant = 'patient' | 'hospital' | 'all';

export function parseVariant(raw: unknown): AppVariant {
  return raw === 'hospital' || raw === 'patient' ? raw : 'all';
}

export interface VariantPolicy {
  /** The pool the sign-in screen starts with. */
  defaultPool: PoolKind;
  showSignUp: boolean;
  /** Whether the "Hospital staff? Sign in here" and "Back to sign in" switches show. */
  showPoolSwitch: boolean;
}

export function variantPolicy(variant: AppVariant): VariantPolicy {
  switch (variant) {
    case 'hospital':
      return { defaultPool: 'staff', showSignUp: false, showPoolSwitch: false };
    case 'patient':
      return { defaultPool: 'public', showSignUp: true, showPoolSwitch: false };
    case 'all':
      return { defaultPool: 'public', showSignUp: true, showPoolSwitch: true };
  }
}

/** The patient app is for patients only; the hospital app is for staff, doctors and admins only. */
export function roleAllowedInVariant(variant: AppVariant, session: Session): boolean {
  if (variant === 'all') return true;
  const isPatient = canOpen(session, 'patient');
  return variant === 'patient' ? isPatient : !isPatient;
}
