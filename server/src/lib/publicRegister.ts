/**
 * IAM-001 — inscription publique (POST /auth/register).
 *
 * Modèle type Pronote : aucun rôle n’est auto-créable en public.
 * Les comptes élève / parent / enseignant / direction sont provisionnés
 * par l’établissement (`POST /users`, admissions, import), puis liés
 * (ex. responsables ↔ élève).
 *
 * Exception : NODE_ENV=test (fixtures). Le flag
 * CADDYNOTE_ALLOW_PRIVILEGED_REGISTER est ignoré en staging/production.
 */
import { isHardenedRuntime } from './deployment.js';
import { isTestMode } from './testMode.js';

/** Historiquement student/parent — vidé volontairement (alignement Pronote). */
export const PUBLIC_SELF_REGISTER_ROLES = [] as const;
export type PublicSelfRegisterRole = never;

const PUBLIC_SET = new Set<string>(PUBLIC_SELF_REGISTER_ROLES);

export const isPublicSelfRegisterRole = (role: string): role is string => PUBLIC_SET.has(role);

/** Autorise tout rôle via /auth/register uniquement pour fixtures (jamais en durci). */
export const allowPrivilegedSelfRegister = (): boolean => {
  if (process.env.NODE_ENV === 'test' || isTestMode()) return true;
  if (isHardenedRuntime()) return false;
  return (
    process.env.CADDYNOTE_ALLOW_PRIVILEGED_REGISTER === 'true' ||
    process.env.CADDYNOTE_ALLOW_PRIVILEGED_REGISTER === '1'
  );
};

export const canSelfAssignRole = (_role: string): boolean => allowPrivilegedSelfRegister();
