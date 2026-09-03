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
    expect(visibleCount).toBeGreaterThanOrEqual(6);
    expect(visibleCount).toBeLessThanOrEqual(8);
    expect(advanced?.defaultCollapsed).toBe(true);
    expect(advanced?.items.length).toBeGreaterThan(0);
    // Hub Présences unique (pas Appel + Absences séparés)
    const hrefs = day1.flatMap((s) => s.items.map((i) => i.href));
    expect(hrefs).toContain('/attendance');
    expect(hrefs).not.toContain('/absences');
    expect(hrefs).toContain('/admissions/admin');
    expect(hrefs).toContain('/finance');
    expect(hrefs).not.toContain('/classes');
    expect(hrefs).not.toContain('/teachers');
    expect(hrefs).not.toContain('/grades');
    const advancedHrefs = advanced?.items.map((i) => i.href) ?? [];
    expect(advancedHrefs).toContain('/classes');
    expect(advancedHrefs).toContain('/teachers');
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
          '/follow-up',
        ])
      );
      expect(advancedHrefs).not.toContain('/teacher-exercises');
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
    expect(mobileBottomNavForRole('accountant')).not.toBeNull();
    expect(mobileBottomNavForRole('group_owner')).not.toBeNull();
  });

  it('Comptable : barre du bas = Accueil · Finances · Élèves · Documents · Plus', () => {
    const items = mobileBottomNavForRole('accountant');
    expect(items).toHaveLength(5);
    expect(items![0]).toMatchObject({ kind: 'link', href: '/dashboard' });
    expect(items![1]).toMatchObject({ kind: 'link', href: '/finance' });
    expect(items![2]).toMatchObject({ kind: 'link', href: '/students' });
    expect(items![3]).toMatchObject({ kind: 'link', href: '/documents' });
    expect(items![4]).toMatchObject({ kind: 'more' });
  });

  it('Groupe scolaire : barre du bas = Accueil · Établissements · Messages · Support · Plus', () => {
    const items = mobileBottomNavForRole('group_owner');
    expect(items).toHaveLength(5);
    expect(items![0]).toMatchObject({ kind: 'link', href: '/dashboard' });
    expect(items![1]).toMatchObject({ kind: 'link', href: '/institutions' });
    expect(items![2]).toMatchObject({ kind: 'link', href: '/messages' });
    expect(items![3]).toMatchObject({ kind: 'link', href: '/support' });
    expect(items![4]).toMatchObject({ kind: 'more' });
  });

  it('Équipe CaddyNote : barre du bas = Console · Établissements · Profil · Plus', () => {
    const items = mobileBottomNavForRole('admin');
    expect(items).toHaveLength(4);
    expect(items![0]).toMatchObject({ kind: 'link', href: '/super-admin' });
    expect(items![1]).toMatchObject({ kind: 'link', href: '/institutions' });
    expect(items![2]).toMatchObject({ kind: 'link', href: '/profile' });
    expect(items![3]).toMatchObject({ kind: 'more' });
  });

  it('Équipe CaddyNote : MainLayout allégé (console + établissements + compte)', () => {
    const hrefs = navSectionsForRole('admin').flatMap((s) => s.items.map((i) => i.href));
    expect(hrefs).toEqual(['/super-admin', '/institutions', '/profile', '/settings']);
    expect(hrefs).not.toContain('/users');
    expect(hrefs).not.toContain('/students');
    expect(hrefs).not.toContain('/finance');
  });

  it('isNavHrefActive reste vrai sur /finance/* et /services/*', () => {
    expect(isNavHrefActive('/finance/collect', '/finance')).toBe(true);
    expect(isNavHrefActive('/finance/configure', '/finance')).toBe(true);
    expect(isNavHrefActive('/services/transport', '/services')).toBe(true);
    expect(isNavHrefActive('/services', '/services')).toBe(true);
  });

  it('isNavHrefActive gère dashboard et préfixes', () => {
    expect(isNavHrefActive('/dashboard', '/dashboard')).toBe(true);
    expect(isNavHrefActive('/grades/edit', '/grades')).toBe(true);
    expect(isNavHrefActive('/messages', '/grades')).toBe(false);
    expect(isNavHrefActive('/absences', '/attendance')).toBe(false);
    expect(isNavHrefActive('/attendance', '/attendance')).toBe(true);
    expect(isNavHrefActive('/absences', '/absences')).toBe(true);
    expect(isNavHrefActive('/my-children', '/my-children')).toBe(true);
    // Hub unique : reste actif même sur les onglets finance / services
    expect(isNavHrefActive('/my-children', '/my-children', '?tab=finance')).toBe(true);
    expect(isNavHrefActive('/my-children', '/my-children', '?tab=services')).toBe(true);
    // Anciens deep-links ?tab= : encore matchables si présents ailleurs
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
      expect.arrayContaining([
        '/subjects',
        '/documents',
        '/teachers',
        '/users',
        '/communications',
        '/calendar',
      ])
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

  it('Parent : barre du bas mobile = Accueil · Suivi · Messages · Menu', () => {
    const items = mobileBottomNavForRole('parent');
    expect(items).toHaveLength(4);
    expect(items![0]).toMatchObject({ kind: 'link', href: '/dashboard' });
    expect(items![1]).toMatchObject({ kind: 'link', href: '/my-children' });
    expect(items![2]).toMatchObject({ kind: 'link', href: '/messages' });
    expect(items![3]).toMatchObject({ kind: 'more' });
    expect(items!.some((i) => i.kind === 'link' && i.href === '/notifications')).toBe(false);
    for (const item of items!) {
      expect(i18n.t(item.titleKey, { ns: 'nav' })).not.toBe(item.titleKey);
    }
  });

  it('Parent : sidebar = un seul hub Mes enfants (pas de raccourcis finance/services)', () => {
    const hrefs = navSectionsForRole('parent').flatMap((s) => s.items.map((i) => i.href));
    expect(hrefs).toContain('/my-children');
    expect(hrefs).not.toContain('/my-children?tab=finance');
    expect(hrefs).not.toContain('/my-children?tab=services');
    expect(hrefs.filter((h) => h.startsWith('/my-children'))).toHaveLength(1);
  });

  it('Élève : barre du bas mobile = Accueil · Suivi · Messages · Menu', () => {
    const items = mobileBottomNavForRole('student');
    expect(items).toHaveLength(4);
    expect(items![0]).toMatchObject({ kind: 'link', href: '/dashboard' });
    expect(items![1]).toMatchObject({ kind: 'link', href: '/my-suivi' });
    expect(items![2]).toMatchObject({ kind: 'link', href: '/messages' });
    expect(items![3]).toMatchObject({ kind: 'more' });
    expect(items!.some((i) => i.kind === 'link' && i.href === '/notifications')).toBe(false);
    for (const item of items!) {
      expect(i18n.t(item.titleKey, { ns: 'nav' })).not.toBe(item.titleKey);
    }
  });

  it('Élève : Accueil et Suivi distincts ; avancé + Support sous Menu', () => {
    const sections = navSectionsForRole('student');
    const day1 = sections.filter((s) => !s.collapsible);
    const journey = sections.find((s) => s.labelKey === 'sections.journey');
    const account = sections.find((s) => s.labelKey === 'sections.account');
    const advanced = sections.find((s) => s.collapsible);

    const visibleCount = day1.reduce((n, s) => n + s.items.length, 0);
    expect(visibleCount).toBeLessThanOrEqual(6);
    expect(advanced?.defaultCollapsed).toBe(true);

    const journeyHrefs = journey?.items.map((i) => i.href) ?? [];
    expect(journeyHrefs).toEqual(['/dashboard', '/my-suivi', '/messages']);

    const accountHrefs = account?.items.map((i) => i.href) ?? [];
    expect(accountHrefs).toContain('/profile');
    expect(accountHrefs).toContain('/settings');
    expect(accountHrefs).toContain('/support');

    const day1Hrefs = day1.flatMap((s) => s.items.map((i) => i.href));
    expect(day1Hrefs).not.toContain('/exercises');
    expect(day1Hrefs).not.toContain('/signatures');
    expect(day1Hrefs).not.toContain('/communications');
    expect(day1Hrefs).not.toContain('/calendar');

    const advancedHrefs = advanced?.items.map((i) => i.href) ?? [];
    expect(advancedHrefs).toEqual(
      expect.arrayContaining([
        '/calendar',
        '/my-courses',
        '/my-grades',
        '/my-absences',
        '/assignments',
        '/signatures',
      ])
    );
    expect(advancedHrefs).not.toContain('/exercises');
    expect(advancedHrefs).not.toContain('/communications');
    expect(advancedHrefs).not.toContain('/support');
  });
});
