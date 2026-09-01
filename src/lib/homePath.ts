import type { StrkUserRole } from '@/types/strk';

/** Accueil post-login / redirection par rôle. */
export const homePathForRole = (_role: StrkUserRole | string | null | undefined): string =>
  '/dashboard';
