import { ApiError } from '@/lib/apiClient';

/** Codes middleware IAM (hors `/auth`) — attendus pendant le dialog MDP / MFA. */
export const AUTH_GATE_CODES = ['password_change_required', 'mfa_setup_required'] as const;

export type AuthGateCode = (typeof AUTH_GATE_CODES)[number];

export const isAuthGateError = (error: unknown): error is ApiError =>
  error instanceof ApiError &&
  typeof error.code === 'string' &&
  (AUTH_GATE_CODES as readonly string[]).includes(error.code);

/** Textes d’erreur API (au cas où le code n’est pas propagé jusqu’au toast). */
const GATE_MESSAGE_SNIPPETS = [
  'Changez votre mot de passe provisoire',
  'Activez la double authentification',
  'password_change_required',
  'mfa_setup_required',
] as const;

export const isAuthGateToastDescription = (description: unknown): boolean => {
  if (typeof description !== 'string') return false;
  return GATE_MESSAGE_SNIPPETS.some((s) => description.includes(s));
};
