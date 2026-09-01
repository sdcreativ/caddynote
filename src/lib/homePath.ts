import type { StrkUserRole } from '@/types/strk';

/** Accueil post-login / redirection par rôle. */
export const homePathForRole = (role: StrkUserRole | string | null | undefined): string => {
  if (role === 'student') return '/my-suivi';
  return '/dashboard';
};
