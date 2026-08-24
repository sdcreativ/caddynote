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

  it('Direction : menu jour 1 ≤ ~10 entrées visibles (+ section Plus collapsible)', () => {
    const sections = navSectionsForRole('school_admin');
    const day1 = sections.filter((s) => !s.collapsible);
    const advanced = sections.find((s) => s.collapsible);
    const visibleCount = day1.reduce((n, s) => n + s.items.length, 0);
    expect(visibleCount).toBeLessThanOrEqual(10);
    expect(visibleCount).toBeGreaterThanOrEqual(8);
    expect(advanced?.defaultCollapsed).toBe(true);
    expect(advanced?.items.length).toBeGreaterThan(0);
    // Hub Présences unique (pas Appel + Absences séparés)
    const hrefs = day1.flatMap((s) => s.items.map((i) => i.href));
    expect(hrefs).toContain('/attendance');
    expect(hrefs).not.toContain('/absences');
    expect(hrefs).toContain('/classes');
    expect(hrefs).toContain('/teachers');
  });

  it('Enseignant : menu jour 1 allégé (+ section Plus)', () => {
    for (const role of ['teacher', 'head_teacher'] as const) {
      const sections = navSectionsForRole(role);
      const day1 = sections.filter((s) => !s.collapsible);
      const advanced = sections.find((s) => s.collapsible);
      const visibleCount = day1.reduce((n, s) => n + s.items.length, 0);
      expect(visibleCount).toBeLessThanOrEqual(8);
      expect(advanced?.defaultCollapsed).toBe(true);
      const hrefs = day1.flatMap((s) => s.items.map((i) => i.href));
      expect(hrefs).toContain('/teacher-attendance');
      expect(hrefs).toContain('/grades');
      expect(hrefs).toContain('/teaching');
      expect(hrefs).toContain('/messages');
      expect(hrefs).not.toContain('/absences');
      expect(hrefs).not.toContain('/teacher-assignments');
      expect(hrefs).not.toContain('/teacher-exercises');
      expect(hrefs).not.toContain('/teacher-availability');
      const advancedHrefs = advanced?.items.map((i) => i.href) ?? [];
      expect(advancedHrefs).toEqual(
        expect.arrayContaining([
          '/teacher-assignments',
          '/teacher-exercises',
          '/follow-up',
        ])
      );
      expect(advancedHrefs).not.toContain('/teacher-availability');
      expect(advancedHrefs).not.toContain('/communications');
      expect(advancedHrefs).not.toContain('/documents');
      expect(advancedHrefs).not.toContain('/exports');
      expect(advancedHrefs).not.toContain('/support');
    }
  });

  it('Élève : menu jour 1 allégé (+ section Plus)', () => {
    const sections = navSectionsForRole('student');
    const day1 = sections.filter((s) => !s.collapsible);
    const advanced = sections.find((s) => s.collapsible);
    const visibleCount = day1.reduce((n, s) => n + s.items.length, 0);
    expect(visibleCount).toBeLessThanOrEqual(10);
    expect(advanced?.defaultCollapsed).toBe(true);
    const hrefs = day1.flatMap((s) => s.items.map((i) => i.href));
    expect(hrefs).toContain('/dashboard');
    expect(hrefs).toContain('/calendar');
    expect(hrefs).toContain('/my-courses');
    expect(hrefs).toContain('/my-grades');
    expect(hrefs).toContain('/my-absences');
    expect(hrefs).toContain('/assignments');
    expect(hrefs).toContain('/messages');
    expect(hrefs).not.toContain('/exercises');
    expect(hrefs).not.toContain('/signatures');
    expect(advanced?.items.map((i) => i.href)).toEqual(
      expect.arrayContaining(['/exercises', '/signatures', '/communications'])
    );
  });
});
