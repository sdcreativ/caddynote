import { describe, it, expect } from 'vitest';
import i18n from '@/i18n/config';
import {
  navSectionsForRole,
  roleLabel,
  mobileBottomNavForRole,
  isNavHrefActive,
  type AppRole,
} from './navConfig';

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
    expect(hrefs).toContain('/admissions/admin');
    expect(hrefs).toContain('/finance');
    expect(hrefs).toContain('/classes');
    expect(hrefs).toContain('/teachers');
    expect(hrefs).not.toContain('/grades');
    const advancedHrefs = advanced?.items.map((i) => i.href) ?? [];
    expect(advancedHrefs).toContain('/grades');
    expect(advancedHrefs).toContain('/users');
    expect(advancedHrefs).toContain('/communications');
    expect(advancedHrefs).not.toContain('/admissions/admin');
    expect(advancedHrefs).not.toContain('/finance');
    // Allégés : disponibilités, exports / audit → Paramètres ; EDT → Vue d’ensemble
    expect(advancedHrefs).not.toContain('/teacher-availability');
    expect(advancedHrefs).not.toContain('/exports');
    expect(advancedHrefs).not.toContain('/audit-log');
    expect(advancedHrefs).not.toContain('/calendar');
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

  it('Enseignant : barre du bas mobile = Accueil · Présences · Notes · Cahier · Plus', () => {
    for (const role of ['teacher', 'head_teacher'] as const) {
      const items = mobileBottomNavForRole(role);
      expect(items).toHaveLength(5);
      expect(items![0]).toMatchObject({ kind: 'link', href: '/dashboard' });
      expect(items![1]).toMatchObject({ kind: 'link', href: '/teacher-attendance' });
      expect(items![2]).toMatchObject({ kind: 'link', href: '/grades' });
      expect(items![3]).toMatchObject({ kind: 'link', href: '/teaching' });
      expect(items![4]).toMatchObject({ kind: 'more' });
      for (const item of items!) {
        expect(i18n.t(item.titleKey, { ns: 'nav' })).not.toBe(item.titleKey);
      }
    }
    expect(mobileBottomNavForRole('parent')).not.toBeNull();
    expect(mobileBottomNavForRole('student')).not.toBeNull();
    expect(mobileBottomNavForRole('school_admin')).not.toBeNull();
    expect(mobileBottomNavForRole('secretary')).not.toBeNull();
    expect(mobileBottomNavForRole('supervisor')).not.toBeNull();
    expect(mobileBottomNavForRole('accountant')).toBeNull();
  });

  it('Équipe CaddyNote : barre du bas = Accueil · Établissements · Console · Support · Plus', () => {
    const items = mobileBottomNavForRole('admin');
    expect(items).toHaveLength(5);
    expect(items![0]).toMatchObject({ kind: 'link', href: '/dashboard' });
    expect(items![1]).toMatchObject({ kind: 'link', href: '/institutions' });
    expect(items![2]).toMatchObject({ kind: 'link', href: '/super-admin' });
    expect(items![3]).toMatchObject({ kind: 'link', href: '/super-admin/support-ops' });
    expect(items![4]).toMatchObject({ kind: 'more' });
  });

  it('isNavHrefActive gère dashboard et préfixes', () => {
    expect(isNavHrefActive('/dashboard', '/dashboard')).toBe(true);
    expect(isNavHrefActive('/grades/edit', '/grades')).toBe(true);
    expect(isNavHrefActive('/messages', '/grades')).toBe(false);
    expect(isNavHrefActive('/absences', '/attendance')).toBe(false);
    expect(isNavHrefActive('/attendance', '/attendance')).toBe(true);
    expect(isNavHrefActive('/absences', '/absences')).toBe(true);
    expect(isNavHrefActive('/my-children', '/my-children')).toBe(true);
    expect(isNavHrefActive('/my-children', '/my-children', '?tab=finance')).toBe(false);
    expect(isNavHrefActive('/my-children', '/my-children?tab=finance', '?tab=finance')).toBe(true);
    expect(isNavHrefActive('/my-children', '/my-children?tab=finance', '')).toBe(false);
  });

  it('Direction : barre du bas mobile = Accueil · Élèves · Présences · Finances · Plus', () => {
    const items = mobileBottomNavForRole('school_admin');
    expect(items).toHaveLength(5);
    expect(items![0]).toMatchObject({ kind: 'link', href: '/dashboard' });
    expect(items![1]).toMatchObject({ kind: 'link', href: '/students' });
    expect(items![2]).toMatchObject({ kind: 'link', href: '/attendance' });
    expect(items![3]).toMatchObject({ kind: 'link', href: '/finance' });
    expect(items![4]).toMatchObject({ kind: 'more' });
    for (const item of items!) {
      expect(i18n.t(item.titleKey, { ns: 'nav' })).not.toBe(item.titleKey);
    }
  });

  it('Secrétariat : barre du bas mobile = Accueil · Élèves · Présences · Messages · Plus', () => {
    const items = mobileBottomNavForRole('secretary');
    expect(items).toHaveLength(5);
    expect(items![0]).toMatchObject({ kind: 'link', href: '/dashboard' });
    expect(items![1]).toMatchObject({ kind: 'link', href: '/students' });
    expect(items![2]).toMatchObject({ kind: 'link', href: '/attendance' });
    expect(items![3]).toMatchObject({ kind: 'link', href: '/messages' });
    expect(items![4]).toMatchObject({ kind: 'more' });
    for (const item of items!) {
      expect(i18n.t(item.titleKey, { ns: 'nav' })).not.toBe(item.titleKey);
    }
  });

  it('Vie scolaire : barre du bas mobile = Accueil · Présences · Élèves · Messages · Plus', () => {
    const items = mobileBottomNavForRole('supervisor');
    expect(items).toHaveLength(5);
    expect(items![0]).toMatchObject({ kind: 'link', href: '/dashboard' });
    expect(items![1]).toMatchObject({ kind: 'link', href: '/attendance' });
    expect(items![2]).toMatchObject({ kind: 'link', href: '/students' });
    expect(items![3]).toMatchObject({ kind: 'link', href: '/messages' });
    expect(items![4]).toMatchObject({ kind: 'more' });
    for (const item of items!) {
      expect(i18n.t(item.titleKey, { ns: 'nav' })).not.toBe(item.titleKey);
    }
  });

  it('Secrétariat : menu jour 1 allégé (+ section Plus)', () => {
    const sections = navSectionsForRole('secretary');
    const day1 = sections.filter((s) => !s.collapsible);
    const advanced = sections.find((s) => s.collapsible);
    const visibleCount = day1.reduce((n, s) => n + s.items.length, 0);
    expect(visibleCount).toBeLessThanOrEqual(8);
    expect(advanced?.defaultCollapsed).toBe(true);
    const hrefs = day1.flatMap((s) => s.items.map((i) => i.href));
    expect(hrefs).toContain('/attendance');
    expect(hrefs).not.toContain('/absences');
    expect(hrefs).toContain('/admissions/admin');
    expect(hrefs).toContain('/messages');
    expect(hrefs).not.toContain('/subjects');
    expect(hrefs).not.toContain('/users');
    const advancedHrefs = advanced?.items.map((i) => i.href) ?? [];
    expect(advancedHrefs).toEqual(
      expect.arrayContaining(['/subjects', '/documents', '/users', '/communications', '/calendar'])
    );
  });

  it('Vie scolaire : hub Présences unique, pas Appel + Absences', () => {
    const sections = navSectionsForRole('supervisor');
    const hrefs = sections.flatMap((s) => s.items.map((i) => i.href));
    expect(hrefs).toContain('/attendance');
    expect(hrefs).not.toContain('/absences');
    expect(hrefs).toContain('/follow-up');
    expect(hrefs).not.toContain('/calendar');
  });

  it('Comptable : menu déjà compact (pas de Plus dense)', () => {
    const sections = navSectionsForRole('accountant');
    const hrefs = sections.flatMap((s) => s.items.map((i) => i.href));
    expect(hrefs).toEqual(
      expect.arrayContaining(['/dashboard', '/finance', '/students', '/documents', '/settings'])
    );
    expect(sections.find((s) => s.collapsible)).toBeUndefined();
  });

  it('Parent : barre du bas mobile = Accueil · Enfants · Finances · Messages · Plus', () => {
    const items = mobileBottomNavForRole('parent');
    expect(items).toHaveLength(5);
    expect(items![0]).toMatchObject({ kind: 'link', href: '/dashboard' });
    expect(items![1]).toMatchObject({ kind: 'link', href: '/my-children' });
    expect(items![2]).toMatchObject({ kind: 'link', href: '/my-children?tab=finance' });
    expect(items![3]).toMatchObject({ kind: 'link', href: '/messages' });
    expect(items![4]).toMatchObject({ kind: 'more' });
    for (const item of items!) {
      expect(i18n.t(item.titleKey, { ns: 'nav' })).not.toBe(item.titleKey);
    }
  });

  it('Élève : barre du bas mobile = Accueil · Notes · Devoirs · Messages · Plus', () => {
    const items = mobileBottomNavForRole('student');
    expect(items).toHaveLength(5);
    expect(items![0]).toMatchObject({ kind: 'link', href: '/dashboard' });
    expect(items![1]).toMatchObject({ kind: 'link', href: '/my-grades' });
    expect(items![2]).toMatchObject({ kind: 'link', href: '/assignments' });
    expect(items![3]).toMatchObject({ kind: 'link', href: '/messages' });
    expect(items![4]).toMatchObject({ kind: 'more' });
    for (const item of items!) {
      expect(i18n.t(item.titleKey, { ns: 'nav' })).not.toBe(item.titleKey);
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
