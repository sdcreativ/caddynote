import i18n from '@/i18n/config';

/** Identité visuelle CaddyNote — constantes partagées. */
export const BRAND = {
  name: 'CaddyNote',
  navy: '#0B1F3A',
  blue: '#1D70D8',
  markLight: '/logo-cn-light.png',
  markDark: '/logo-cn.png',
  taglinePublic: 'Une solution éducative',
  taglineTeam: 'Équipe CaddyNote',
} as const;

/** Sous-titre du logo selon le rôle connecté (tous les dashboards). */
export function brandTaglineForRole(role: string | null | undefined): string {
  const key =
    role === 'school_admin'
      ? 'taglines.schoolAdmin'
      : role === 'teacher' || role === 'head_teacher'
        ? 'taglines.teacher'
        : role === 'student'
          ? 'taglines.student'
          : role === 'parent'
            ? 'taglines.parent'
            : role === 'secretary'
              ? 'taglines.secretary'
              : role === 'accountant'
                ? 'taglines.accountant'
                : role === 'supervisor'
                  ? 'taglines.supervisor'
                  : role === 'group_owner'
                    ? 'taglines.groupOwner'
                    : role === 'admin'
                      ? 'taglines.admin'
                      : 'taglines.connected';
  return i18n.t(key, { ns: 'nav' });
}
