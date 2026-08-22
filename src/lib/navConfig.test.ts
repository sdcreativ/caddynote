import { describe, it, expect } from 'vitest';
import i18n from '@/i18n/config';
import { navSectionsForRole, roleLabel, type AppRole } from './navConfig';

const ROLES: AppRole[] = [
  'admin',
  'school_admin',
  'teacher',
  'head_teacher',
  'student',
  'parent',
  'secretary',
  'accountant',
  'supervisor',
  'group_owner',
];

describe('navConfig (NFR-009)', () => {
  it('résout chaque clé de menu en français, pas en clé brute', () => {
    for (const role of ROLES) {
      for (const section of navSectionsForRole(role)) {
        expect(i18n.t(section.labelKey, { ns: 'nav' })).not.toBe(section.labelKey);
        for (const item of section.items) {
          expect(i18n.t(item.titleKey, { ns: 'nav' })).not.toBe(item.titleKey);
        }
      }
    }
  });

  it('traduit les libellés de rôle', () => {
    expect(roleLabel('secretary')).toBe('Secrétariat');
    expect(roleLabel('accountant')).toBe('Comptabilité');
    expect(roleLabel('unknown')).toBe('Utilisateur');
  });
});
