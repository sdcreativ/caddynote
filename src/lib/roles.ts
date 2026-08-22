import type { StrkUserRole } from '@/types/strk';

/**
 * Familles de rôles — miroir de `server/src/lib/authz.ts`.
 * L’API reste la source de vérité ; ces listes ne servent qu’à ne pas
 * bloquer (ou ouvrir) une page avant l’appel réseau. Les garder identiques.
 */
export const DIRECTION_ROLES: readonly StrkUserRole[] = ['admin', 'school_admin'];
export const SECRETARIAT_ROLES: readonly StrkUserRole[] = ['admin', 'school_admin', 'secretary'];
export const FINANCE_ROLES: readonly StrkUserRole[] = ['admin', 'school_admin', 'accountant'];
export const TEACHING_ROLES: readonly StrkUserRole[] = ['admin', 'school_admin', 'teacher', 'head_teacher'];
export const SUPERVISION_ROLES: readonly StrkUserRole[] = [
  'admin',
  'school_admin',
  'teacher',
  'head_teacher',
  'supervisor',
];
export const INSTITUTION_STAFF_ROLES: readonly StrkUserRole[] = [
  'admin',
  'school_admin',
  'teacher',
  'head_teacher',
  'secretary',
  'accountant',
  'supervisor',
];

/** Hub appel / présence (`/attendance`) — pas les enseignants (→ `/teacher-attendance`). */
export const ATTENDANCE_HUB_ROLES: readonly StrkUserRole[] = [
  'admin',
  'school_admin',
  'secretary',
  'supervisor',
];

/** `GET /reports/export` : admin, school_admin, teacher (+ chef d’établissement). */
export const EXPORT_ROLES: readonly StrkUserRole[] = ['admin', 'school_admin', 'teacher', 'head_teacher'];

export const hasAnyRole = (
  role: StrkUserRole | null | undefined,
  allowed: readonly StrkUserRole[]
): boolean => !!role && allowed.includes(role);
