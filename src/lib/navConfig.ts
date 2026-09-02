/**
 * Configuration de navigation par rôle — source unique pour StrkSidebar.
 * Les libellés sont des clés i18n (`nav` namespace), pas du français en dur.
 *
 * Présence / absences (SPA) — pas de route serveur `/attendance` :
 * - `/attendance` — hub appel (direction / secrétariat / vie scolaire) ; les
 *   enseignants y sont redirigés vers `/teacher-attendance`.
 * - `/teacher-attendance` — appel enseignant (cours / QR / offline).
 * - `/absences` — suivi & justificatifs ; `/my-absences` côté élève.
 * - `/signatures` — émargement électronique (distinct de l’appel).
 * Persistance : `POST /absences` (+ bulk + `clientId` offline) et `/signatures`.
 * Voir `docs/PRESENCE.md`.
 */
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Users,
  ClipboardCheck,
  BookOpen,
  GraduationCap,
  Receipt,
  MessageSquare,
  Calendar,
  Settings,
  Building2,
  LifeBuoy,
  FileText,
  Bus,
  UserCog,
  CreditCard,
  PenTool,
  Home,
  User,
  Megaphone,
  HeartHandshake,
  Download,
  School,
  Shield,
  ScrollText,
  MoreHorizontal,
  Bell,
  BarChart3,
  Menu,
} from 'lucide-react';
import i18n from '@/i18n/config';

export type AppRole =
  | 'admin'
  | 'school_admin'
  | 'teacher'
  | 'head_teacher'
  | 'student'
  | 'parent'
  | 'secretary'
  | 'accountant'
  | 'supervisor'
  | 'group_owner';

export type NavItemConfig = {
  titleKey: string;
  href: string;
  icon: LucideIcon;
  /** Badge optionnel (clé dashboard) */
  badgeKey?: 'students' | 'alerts';
  /**
   * Module lié à un établissement (tenant). Masqué pour les comptes sans
   * `institutionId` (ex. super admin plateforme) — évite les 403 « Permissions
   * insuffisantes » sur finance / documents / communications, etc.
   */
  requiresInstitution?: boolean;
};

export type NavSection = {
  labelKey: string;
  items: NavItemConfig[];
  /**
   * Section repliée par défaut (« Plus » / avancé) — disclosure progressive
   * pour alléger le menu Direction jour 1 sans supprimer les routes.
   */
  collapsible?: boolean;
  defaultCollapsed?: boolean;
};

/** Rôles qui utilisent le shell établissement (provider dashboard). */
export const SCHOOL_SHELL_ROLES: AppRole[] = [
  'school_admin',
  'teacher',
  'head_teacher',
  'secretary',
  'accountant',
  'supervisor',
];

export function isSchoolShellRole(role: string | null | undefined): boolean {
  return SCHOOL_SHELL_ROLES.includes(role as AppRole);
}

/** Filtre les entrées de nav selon le contexte établissement de l'utilisateur. */
export function filterNavSectionsForUser(
  sections: NavSection[],
  institutionId: string | null | undefined
): NavSection[] {
  const hasInstitution = Boolean(institutionId);
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.requiresInstitution || hasInstitution),
    }))
    .filter((section) => section.items.length > 0);
}

const ROLE_I18N: Record<string, string> = {
  school_admin: 'roles.schoolAdmin',
  teacher: 'roles.teacher',
  head_teacher: 'roles.headTeacher',
  student: 'roles.student',
  parent: 'roles.parent',
  secretary: 'roles.secretary',
  accountant: 'roles.accountant',
  supervisor: 'roles.supervisor',
  group_owner: 'roles.groupOwner',
  admin: 'roles.admin',
};

export function roleLabel(role: string | null | undefined): string {
  return i18n.t(ROLE_I18N[role ?? ''] ?? 'roles.user', { ns: 'nav' });
}

/** Entrée de la barre du bas (mobile) — ≤ 5 slots. */
export type MobileBottomNavItem =
  | {
      kind: 'link';
      titleKey: string;
      href: string;
      icon: LucideIcon;
    }
  | {
      kind: 'more';
      titleKey: string;
      icon: LucideIcon;
    };

/**
 * Navigation mobile prioritaire par rôle.
 * Retourne `null` si le rôle n’a pas encore de barre du bas dédiée.
 */
export function mobileBottomNavForRole(
  role: string | null | undefined
): MobileBottomNavItem[] | null {
  switch (role) {
    case 'teacher':
    case 'head_teacher':
      // Accueil · Appel · Notes · Cahier · Plus
      return [
        { kind: 'link', titleKey: 'bottomNav.home', href: '/dashboard', icon: LayoutDashboard },
        {
          kind: 'link',
          titleKey: 'bottomNav.call',
          href: '/teacher-attendance',
          icon: ClipboardCheck,
        },
        { kind: 'link', titleKey: 'bottomNav.notes', href: '/grades', icon: GraduationCap },
        { kind: 'link', titleKey: 'bottomNav.teaching', href: '/teaching', icon: School },
        { kind: 'more', titleKey: 'bottomNav.more', icon: MoreHorizontal },
      ];
    case 'school_admin':
      // Accueil · Élèves · Appel · Finances · Plus
      return [
        { kind: 'link', titleKey: 'bottomNav.home', href: '/dashboard', icon: LayoutDashboard },
        { kind: 'link', titleKey: 'bottomNav.students', href: '/students', icon: Users },
        {
          kind: 'link',
          titleKey: 'bottomNav.call',
          href: '/attendance',
          icon: ClipboardCheck,
        },
        { kind: 'link', titleKey: 'bottomNav.finance', href: '/finance', icon: Receipt },
        { kind: 'more', titleKey: 'bottomNav.more', icon: MoreHorizontal },
      ];
    case 'admin':
      // Accueil · Établissements · Console · Support ops · Plus
      return [
        { kind: 'link', titleKey: 'bottomNav.home', href: '/dashboard', icon: LayoutDashboard },
        { kind: 'link', titleKey: 'items.institutions', href: '/institutions', icon: Building2 },
        { kind: 'link', titleKey: 'items.platformConsole', href: '/super-admin', icon: Shield },
        { kind: 'link', titleKey: 'items.support', href: '/super-admin/support-ops', icon: LifeBuoy },
        { kind: 'more', titleKey: 'bottomNav.more', icon: MoreHorizontal },
      ];
    case 'parent':
      // Accueil · Suivi · Messages · Menu (notifications = cloche header)
      return [
        { kind: 'link', titleKey: 'bottomNav.home', href: '/dashboard', icon: Home },
        {
          kind: 'link',
          titleKey: 'bottomNav.suivi',
          href: '/my-children',
          icon: BarChart3,
        },
        { kind: 'link', titleKey: 'bottomNav.messagesLong', href: '/messages', icon: MessageSquare },
        { kind: 'more', titleKey: 'bottomNav.menu', icon: Menu },
      ];
    case 'student':
      // Accueil · Suivi · Messages · Menu (notifications = cloche header)
      return [
        { kind: 'link', titleKey: 'bottomNav.home', href: '/dashboard', icon: Home },
        { kind: 'link', titleKey: 'bottomNav.suivi', href: '/my-suivi', icon: BarChart3 },
        { kind: 'link', titleKey: 'bottomNav.messagesLong', href: '/messages', icon: MessageSquare },
        { kind: 'more', titleKey: 'bottomNav.menu', icon: Menu },
      ];
    case 'secretary':
      // Accueil · Élèves · Appel · Messages · Plus
      return [
        { kind: 'link', titleKey: 'bottomNav.home', href: '/dashboard', icon: LayoutDashboard },
        { kind: 'link', titleKey: 'bottomNav.students', href: '/students', icon: Users },
        {
          kind: 'link',
          titleKey: 'bottomNav.call',
          href: '/attendance',
          icon: ClipboardCheck,
        },
        { kind: 'link', titleKey: 'bottomNav.messages', href: '/messages', icon: MessageSquare },
        { kind: 'more', titleKey: 'bottomNav.more', icon: MoreHorizontal },
      ];
    case 'supervisor':
      // Accueil · Appel · Élèves · Messages · Plus
      return [
        { kind: 'link', titleKey: 'bottomNav.home', href: '/dashboard', icon: LayoutDashboard },
        {
          kind: 'link',
          titleKey: 'bottomNav.call',
          href: '/attendance',
          icon: ClipboardCheck,
        },
        { kind: 'link', titleKey: 'bottomNav.students', href: '/students', icon: Users },
        { kind: 'link', titleKey: 'bottomNav.messages', href: '/messages', icon: MessageSquare },
        { kind: 'more', titleKey: 'bottomNav.more', icon: MoreHorizontal },
      ];
    case 'accountant':
      // Accueil · Finances · Élèves · Documents · Plus
      return [
        { kind: 'link', titleKey: 'bottomNav.home', href: '/dashboard', icon: LayoutDashboard },
        { kind: 'link', titleKey: 'bottomNav.finance', href: '/finance', icon: Receipt },
        { kind: 'link', titleKey: 'bottomNav.students', href: '/students', icon: Users },
        { kind: 'link', titleKey: 'items.documents', href: '/documents', icon: FileText },
        { kind: 'more', titleKey: 'bottomNav.more', icon: MoreHorizontal },
      ];
    case 'group_owner':
      // Accueil · Établissements · Messages · Support · Plus
      return [
        { kind: 'link', titleKey: 'bottomNav.home', href: '/dashboard', icon: LayoutDashboard },
        { kind: 'link', titleKey: 'items.institutions', href: '/institutions', icon: Building2 },
        { kind: 'link', titleKey: 'bottomNav.messages', href: '/messages', icon: MessageSquare },
        { kind: 'link', titleKey: 'items.support', href: '/support', icon: LifeBuoy },
        { kind: 'more', titleKey: 'bottomNav.more', icon: MoreHorizontal },
      ];
    default:
      return null;
  }
}

/** Indique si un chemin correspond à une entrée de nav (préfixe inclus). */
export function isNavHrefActive(pathname: string, href: string, search = ''): boolean {
  const [pathPart, queryPart] = href.split('?');
  const base = pathPart;
  const current = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);

  if (queryPart) {
    if (pathname !== base && !pathname.startsWith(`${base}/`)) return false;
    const required = new URLSearchParams(queryPart);
    for (const [key, value] of required.entries()) {
      if (current.get(key) !== value) return false;
    }
    return true;
  }

  if (base === '/dashboard') return pathname === '/dashboard' || pathname === '/';

  // Espace parent : un seul hub — actif sur toute la page (y compris ?tab=finance|services).
  if (base === '/my-children') {
    return pathname === '/my-children' || pathname.startsWith('/my-children/');
  }

  // Hub Présences (appel) — distinct de /absences (justificatifs / suivi)
  if (base === '/attendance') {
    return pathname === '/attendance' || pathname.startsWith('/attendance/');
  }
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function navSectionsForRole(role: string | null | undefined): NavSection[] {
  switch (role) {
    case 'school_admin':
      // Jour 1 : ≤ ~7–8. Classes / enseignants / notes / campagnes sous Plus.
      return [
        {
          labelKey: 'sections.workspace',
          items: [
            { titleKey: 'items.overview', href: '/dashboard', icon: LayoutDashboard },
            { titleKey: 'items.students', href: '/students', icon: Users, badgeKey: 'students' },
            // Hub Présences (Appel | Justificatifs) — routes /attendance + /absences
            { titleKey: 'items.attendance', href: '/attendance', icon: ClipboardCheck, badgeKey: 'alerts' },
            { titleKey: 'items.admissions', href: '/admissions/admin', icon: School },
            { titleKey: 'items.messages', href: '/messages', icon: MessageSquare },
            { titleKey: 'items.finance', href: '/finance', icon: Receipt },
            { titleKey: 'items.settings', href: '/settings', icon: Settings },
          ],
        },
        {
          labelKey: 'sections.advanced',
          collapsible: true,
          defaultCollapsed: true,
          items: [
            { titleKey: 'items.classes', href: '/classes', icon: GraduationCap },
            { titleKey: 'items.teachers', href: '/teachers', icon: Users },
            { titleKey: 'items.grades', href: '/grades', icon: GraduationCap },
            { titleKey: 'items.users', href: '/users', icon: UserCog }, // Comptes & accès (login), pas le dossier élève/enseignant
            // Emploi du temps : accès via Vue d’ensemble (résumé + tuile), pas une 2ᵉ entrée nav.
            { titleKey: 'items.followUp', href: '/follow-up', icon: HeartHandshake },
            { titleKey: 'items.communications', href: '/communications', icon: Megaphone },
            { titleKey: 'items.documents', href: '/documents', icon: FileText },
            { titleKey: 'items.subjects', href: '/subjects', icon: BookOpen },
            { titleKey: 'items.services', href: '/services', icon: Bus },
            { titleKey: 'items.support', href: '/support', icon: LifeBuoy },
          ],
        },
      ];
      // Disponibilités / exports / audit / EDT menu : hors Plus Direction.

    case 'teacher':
    case 'head_teacher':
      // Jour 1 : boucle métier (appel, notes, cours, messages). Le reste sous « Plus ».
      return [
        {
          labelKey: 'sections.workspace',
          items: [
            { titleKey: 'items.overview', href: '/dashboard', icon: LayoutDashboard },
            // Hub Présences enseignant : Appel | Justificatifs
            { titleKey: 'items.attendance', href: '/teacher-attendance', icon: ClipboardCheck },
            { titleKey: 'items.notes', href: '/grades', icon: GraduationCap },
            { titleKey: 'items.teaching', href: '/teaching', icon: School },
            { titleKey: 'items.messages', href: '/messages', icon: MessageSquare },
          ],
        },
        {
          labelKey: 'sections.management',
          items: [
            { titleKey: 'items.calendar', href: '/calendar', icon: Calendar },
            { titleKey: 'items.settings', href: '/settings', icon: Settings },
          ],
        },
        {
          labelKey: 'sections.advanced',
          collapsible: true,
          defaultCollapsed: true,
          items: [
            { titleKey: 'items.assignments', href: '/teacher-assignments', icon: BookOpen },
            { titleKey: 'items.studentFollowUp', href: '/follow-up', icon: HeartHandshake },
          ],
        },
      ];

    case 'secretary':
      // Jour 1 allégé ; matières / docs / utilisateurs / campagnes sous Plus.
      return [
        {
          labelKey: 'sections.secretariat',
          items: [
            { titleKey: 'items.overview', href: '/dashboard', icon: LayoutDashboard },
            { titleKey: 'items.students', href: '/students', icon: Users },
            { titleKey: 'items.attendance', href: '/attendance', icon: ClipboardCheck },
            { titleKey: 'items.admissions', href: '/admissions/admin', icon: School },
            { titleKey: 'items.messages', href: '/messages', icon: MessageSquare },
            { titleKey: 'items.classes', href: '/classes', icon: GraduationCap },
          ],
        },
        {
          labelKey: 'sections.advanced',
          collapsible: true,
          defaultCollapsed: true,
          items: [
            { titleKey: 'items.subjects', href: '/subjects', icon: BookOpen },
            { titleKey: 'items.documents', href: '/documents', icon: FileText },
            { titleKey: 'items.users', href: '/users', icon: UserCog }, // Comptes & accès (login), pas le dossier élève/enseignant
            { titleKey: 'items.communications', href: '/communications', icon: Megaphone },
            { titleKey: 'items.calendar', href: '/calendar', icon: Calendar },
          ],
        },
        {
          labelKey: 'sections.account',
          items: [
            { titleKey: 'items.support', href: '/support', icon: LifeBuoy },
            { titleKey: 'items.settings', href: '/settings', icon: Settings },
          ],
        },
      ];

    case 'accountant':
      return [
        {
          labelKey: 'sections.accounting',
          items: [
            { titleKey: 'items.overview', href: '/dashboard', icon: LayoutDashboard },
            { titleKey: 'items.finance', href: '/finance', icon: Receipt },
            { titleKey: 'items.students', href: '/students', icon: Users },
            { titleKey: 'items.documents', href: '/documents', icon: FileText },
          ],
        },
        {
          labelKey: 'sections.account',
          items: [
            { titleKey: 'items.support', href: '/support', icon: LifeBuoy },
            { titleKey: 'items.settings', href: '/settings', icon: Settings },
          ],
        },
      ];

    case 'supervisor':
      // Hub Présences unique (comme Direction) ; pas Appel + Absences séparés.
      return [
        {
          labelKey: 'sections.life',
          items: [
            { titleKey: 'items.overview', href: '/dashboard', icon: LayoutDashboard },
            { titleKey: 'items.attendance', href: '/attendance', icon: ClipboardCheck },
            { titleKey: 'items.students', href: '/students', icon: Users },
            { titleKey: 'items.followUp', href: '/follow-up', icon: HeartHandshake },
            { titleKey: 'items.messages', href: '/messages', icon: MessageSquare },
          ],
        },
        {
          labelKey: 'sections.account',
          items: [
            { titleKey: 'items.support', href: '/support', icon: LifeBuoy },
            { titleKey: 'items.settings', href: '/settings', icon: Settings },
          ],
        },
      ];

    case 'student':
      // Accueil ≠ Suivi (écrans distincts). Jour 1 allégé ; scolaire + avancé sous Plus.
      // Support uniquement dans Compte (Menu / profil), pas dans le parcours jour 1.
      return [
        {
          labelKey: 'sections.journey',
          items: [
            { titleKey: 'items.home', href: '/dashboard', icon: Home },
            { titleKey: 'items.mySuivi', href: '/my-suivi', icon: BarChart3 },
            { titleKey: 'items.messages', href: '/messages', icon: MessageSquare },
          ],
        },
        {
          labelKey: 'sections.account',
          items: [
            { titleKey: 'items.profile', href: '/profile', icon: User },
            { titleKey: 'items.settings', href: '/settings', icon: Settings },
            { titleKey: 'items.support', href: '/support', icon: LifeBuoy },
          ],
        },
        {
          labelKey: 'sections.advanced',
          collapsible: true,
          defaultCollapsed: true,
          items: [
            { titleKey: 'items.calendar', href: '/calendar', icon: Calendar },
            { titleKey: 'items.myCourses', href: '/my-courses', icon: BookOpen },
            { titleKey: 'items.myGrades', href: '/my-grades', icon: GraduationCap },
            { titleKey: 'items.myAbsences', href: '/my-absences', icon: ClipboardCheck },
            { titleKey: 'items.assignments', href: '/assignments', icon: FileText },
            { titleKey: 'items.signatures', href: '/signatures', icon: PenTool },
          ],
        },
      ];

    case 'parent':
      // Un seul hub « Mes enfants » (onglets finance/services dedans) — pas 3 entrées vers la même page.
      return [
        {
          labelKey: 'sections.family',
          items: [
            { titleKey: 'items.overview', href: '/dashboard', icon: LayoutDashboard },
            { titleKey: 'items.parentSpace', href: '/my-children', icon: Home },
            { titleKey: 'items.calendar', href: '/calendar', icon: Calendar },
            { titleKey: 'items.messages', href: '/messages', icon: MessageSquare },
          ],
        },
        {
          labelKey: 'sections.account',
          items: [
            { titleKey: 'items.profile', href: '/profile', icon: User },
            { titleKey: 'items.settings', href: '/settings', icon: Settings },
          ],
        },
      ];

    case 'admin':
      return [
        {
          labelKey: 'sections.spaces',
          items: [
            { titleKey: 'items.platformConsole', href: '/super-admin', icon: Shield },
            { titleKey: 'items.businessSteering', href: '/dashboard', icon: LayoutDashboard },
          ],
        },
        {
          labelKey: 'sections.steering',
          items: [
            { titleKey: 'items.institutions', href: '/institutions', icon: Building2 },
            { titleKey: 'items.users', href: '/users', icon: UserCog }, // Comptes & accès (login), pas le dossier élève/enseignant
            { titleKey: 'items.students', href: '/students', icon: Users, requiresInstitution: true },
            { titleKey: 'items.finance', href: '/finance', icon: Receipt, requiresInstitution: true },
            { titleKey: 'items.documents', href: '/documents', icon: FileText, requiresInstitution: true },
            { titleKey: 'items.communications', href: '/communications', icon: Megaphone, requiresInstitution: true },
            { titleKey: 'items.messages', href: '/messages', icon: MessageSquare },
            { titleKey: 'items.exports', href: '/exports', icon: Download, requiresInstitution: true },
            { titleKey: 'items.services', href: '/services', icon: Bus },
          ],
        },
        {
          labelKey: 'sections.account',
          items: [
            { titleKey: 'items.plansCatalog', href: '/subscription', icon: CreditCard },
            { titleKey: 'items.support', href: '/support', icon: LifeBuoy },
            { titleKey: 'items.auditLog', href: '/audit-log', icon: ScrollText },
            { titleKey: 'items.profile', href: '/profile', icon: User },
            { titleKey: 'items.settings', href: '/settings', icon: Settings },
          ],
        },
      ];

    case 'group_owner':
      return [
        {
          labelKey: 'sections.steering',
          items: [
            { titleKey: 'items.dashboard', href: '/dashboard', icon: LayoutDashboard },
            { titleKey: 'items.institutions', href: '/institutions', icon: Building2 },
            { titleKey: 'items.messages', href: '/messages', icon: MessageSquare },
          ],
        },
        {
          labelKey: 'sections.account',
          items: [
            { titleKey: 'items.support', href: '/support', icon: LifeBuoy },
            { titleKey: 'items.profile', href: '/profile', icon: User },
            { titleKey: 'items.settings', href: '/settings', icon: Settings },
          ],
        },
      ];

    default:
      return [
        {
          labelKey: 'sections.navigation',
          items: [
            { titleKey: 'items.dashboard', href: '/dashboard', icon: Home },
            { titleKey: 'items.profile', href: '/profile', icon: User },
            { titleKey: 'items.settings', href: '/settings', icon: Settings },
          ],
        },
      ];
  }
}
