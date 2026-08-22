/**
 * IAM-001 : rôles auto-assignables via POST /auth/register public.
 * Les rôles privilégiés (admin, school_admin, teacher, …) passent par
 * invitation / POST /users — sauf en NODE_ENV=test (fixtures) ou avec
 * CADDYNOTE_ALLOW_PRIVILEGED_REGISTER=true (jamais en production).
 */

export const PUBLIC_SELF_REGISTER_ROLES = ['student', 'parent'] as const;
export type PublicSelfRegisterRole = (typeof PUBLIC_SELF_REGISTER_ROLES)[number];

const PUBLIC_SET = new Set<string>(PUBLIC_SELF_REGISTER_ROLES);

export const isPublicSelfRegisterRole = (role: string): role is PublicSelfRegisterRole =>
  PUBLIC_SET.has(role);

/** Autorise admin/school_admin/teacher uniquement pour fixtures ou bootstrap explicite. */
export const allowPrivilegedSelfRegister = (): boolean =>
  process.env.NODE_ENV === 'test' ||
  process.env.CADDYNOTE_ALLOW_PRIVILEGED_REGISTER === 'true' ||
  process.env.CADDYNOTE_ALLOW_PRIVILEGED_REGISTER === '1';

export const canSelfAssignRole = (role: string): boolean => {
  if (isPublicSelfRegisterRole(role)) return true;
  return allowPrivilegedSelfRegister();
};
