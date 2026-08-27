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
  AlertTriangle,
  CalendarOff,
  ScrollText,
  MoreHorizontal,
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
      // Accueil · Présences · Notes · Cahier · Plus (messages dans la sidebar)
      return [
        { kind: 'link', titleKey: 'bottomNav.home', href: '/dashboard', icon: LayoutDashboard },
        {
          kind: 'link',
          titleKey: 'items.attendance',
          href: '/teacher-attendance',
          icon: ClipboardCheck,
        },
        { kind: 'link', titleKey: 'items.notes', href: '/grades', icon: GraduationCap },
        { kind: 'link', titleKey: 'items.teaching', href: '/teaching', icon: School },
        { kind: 'more', titleKey: 'bottomNav.more', icon: MoreHorizontal },
      ];
    case 'school_admin':
      // Accueil · Élèves · Présences · Finances · Plus (messages / admissions en sidebar + tuiles)
      return [
        { kind: 'link', titleKey: 'bottomNav.home', href: '/dashboard', icon: LayoutDashboard },
        { kind: 'link', titleKey: 'items.students', href: '/students', icon: Users },
        {
          kind: 'link',
          titleKey: 'items.attendance',
          href: '/attendance',
          icon: ClipboardCheck,
        },
        { kind: 'link', titleKey: 'items.finance', href: '/finance', icon: Receipt },
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
      // Accueil · Enfants · Finances · Messages · Plus
      return [
        { kind: 'link', titleKey: 'bottomNav.home', href: '/dashboard', icon: Home },
        {
          kind: 'link',
          titleKey: 'bottomNav.children',
          href: '/my-children',
          icon: Users,
        },
        {
          kind: 'link',
          titleKey: 'items.finance',
          href: '/my-children?tab=finance',
          icon: CreditCard,
        },
        { kind: 'link', titleKey: 'items.messages', href: '/messages', icon: MessageSquare },
        { kind: 'more', titleKey: 'bottomNav.more', icon: MoreHorizontal },
      ];
    case 'student':
      // Accueil · Notes · Devoirs · Messages · Plus
      return [
        { kind: 'link', titleKey: 'bottomNav.home', href: '/dashboard', icon: Home },
        { kind: 'link', titleKey: 'items.myGrades', href: '/my-grades', icon: GraduationCap },
        { kind: 'link', titleKey: 'items.assignments', href: '/assignments', icon: FileText },
        { kind: 'link', titleKey: 'items.messages', href: '/messages', icon: MessageSquare },
        { kind: 'more', titleKey: 'bottomNav.more', icon: MoreHorizontal },
      ];
    case 'secretary':
      // Accueil · Élèves · Présences · Messages · Plus
      return [
        { kind: 'link', titleKey: 'bottomNav.home', href: '/dashboard', icon: LayoutDashboard },
        { kind: 'link', titleKey: 'items.students', href: '/students', icon: Users },
        {
          kind: 'link',
          titleKey: 'items.attendance',
          href: '/attendance',
          icon: ClipboardCheck,
        },
        { kind: 'link', titleKey: 'items.messages', href: '/messages', icon: MessageSquare },
        { kind: 'more', titleKey: 'bottomNav.more', icon: MoreHorizontal },
      ];
    case 'supervisor':
      // Accueil · Présences · Absences · Messages · Plus
      return [
        { kind: 'link', titleKey: 'bottomNav.home', href: '/dashboard', icon: LayoutDashboard },
        {
          kind: 'link',
          titleKey: 'items.call',
          href: '/attendance',
          icon: ClipboardCheck,
        },
        {
          kind: 'link',
          titleKey: 'items.absences',
          href: '/absences',
          icon: AlertTriangle,
        },
        { kind: 'link', titleKey: 'items.messages', href: '/messages', icon: MessageSquare },
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

  // Espace parent : actif hors onglets finance / services (gérés par href avec ?tab=)
  if (base === '/my-children') {
    if (pathname !== '/my-children' && !pathname.startsWith('/my-children/')) return false;
    const tab = current.get('tab');
    if (tab === 'finance' || tab === 'services') return false;
    return true;
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
      // Jour 1 : ≤ ~10 entrées. Admissions / Finance remontées ; Notes & Utilisateurs sous Plus.
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
          ],
        },
        {
          labelKey: 'sections.management',
          items: [
            { titleKey: 'items.classes', href: '/classes', icon: GraduationCap },
            { titleKey: 'items.teachers', href: '/teachers', icon: Users },
            { titleKey: 'items.finance', href: '/finance', icon: Receipt },
            { titleKey: 'items.settings', href: '/settings', icon: Settings },
          ],
        },
        {
          labelKey: 'sections.advanced',
          collapsible: true,
          defaultCollapsed: true,
          items: [
            { titleKey: 'items.grades', href: '/grades', icon: GraduationCap },
            { titleKey: 'items.users', href: '/users', icon: UserCog },
            { titleKey: 'items.calendar', href: '/calendar', icon: Calendar },
            { titleKey: 'items.availability', href: '/teacher-availability', icon: CalendarOff },
            { titleKey: 'items.followUp', href: '/follow-up', icon: HeartHandshake },
            { titleKey: 'items.communications', href: '/communications', icon: Megaphone },
            { titleKey: 'items.documents', href: '/documents', icon: FileText },
            { titleKey: 'items.subjects', href: '/subjects', icon: BookOpen },
            { titleKey: 'items.services', href: '/services', icon: Bus },
            { titleKey: 'items.exports', href: '/exports', icon: Download },
            { titleKey: 'items.auditLog', href: '/audit-log', icon: ScrollText },
            { titleKey: 'items.support', href: '/support', icon: LifeBuoy },
          ],
        },
      ];

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
            { titleKey: 'items.exercises', href: '/teacher-exercises', icon: PenTool },
            { titleKey: 'items.studentFollowUp', href: '/follow-up', icon: HeartHandshake },
          ],
        },
      ];

    case 'secretary':
      return [
        {
          labelKey: 'sections.secretariat',
          items: [
            { titleKey: 'items.overview', href: '/dashboard', icon: LayoutDashboard },
            { titleKey: 'items.students', href: '/students', icon: Users },
            { titleKey: 'items.classes', href: '/classes', icon: GraduationCap },
            { titleKey: 'items.subjects', href: '/subjects', icon: BookOpen },
            { titleKey: 'items.call', href: '/attendance', icon: ClipboardCheck },
            { titleKey: 'items.absences', href: '/absences', icon: AlertTriangle },
            { titleKey: 'items.admissions', href: '/admissions/admin', icon: School },
            { titleKey: 'items.documents', href: '/documents', icon: FileText },
            { titleKey: 'items.users', href: '/users', icon: UserCog },
            { titleKey: 'items.messages', href: '/messages', icon: MessageSquare },
            { titleKey: 'items.communications', href: '/communications', icon: Megaphone },
          ],
        },
        {
          labelKey: 'sections.account',
          items: [
            { titleKey: 'items.calendar', href: '/calendar', icon: Calendar },
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
      return [
        {
          labelKey: 'sections.life',
          items: [
            { titleKey: 'items.overview', href: '/dashboard', icon: LayoutDashboard },
            { titleKey: 'items.call', href: '/attendance', icon: ClipboardCheck },
            { titleKey: 'items.absences', href: '/absences', icon: AlertTriangle },
            { titleKey: 'items.students', href: '/students', icon: Users },
            { titleKey: 'items.followUp', href: '/follow-up', icon: HeartHandshake },
            { titleKey: 'items.messages', href: '/messages', icon: MessageSquare },
          ],
        },
        {
          labelKey: 'sections.account',
          items: [
            { titleKey: 'items.calendar', href: '/calendar', icon: Calendar },
            { titleKey: 'items.support', href: '/support', icon: LifeBuoy },
            { titleKey: 'items.settings', href: '/settings', icon: Settings },
          ],
        },
      ];

    case 'student':
      // Jour 1 : parcours scolaire. Signatures / exercices sous « Plus ».
      return [
        {
          labelKey: 'sections.journey',
          items: [
            { titleKey: 'items.dashboard', href: '/dashboard', icon: Home },
            { titleKey: 'items.calendar', href: '/calendar', icon: Calendar },
            { titleKey: 'items.myCourses', href: '/my-courses', icon: BookOpen },
            { titleKey: 'items.myGrades', href: '/my-grades', icon: GraduationCap },
            { titleKey: 'items.myAbsences', href: '/my-absences', icon: ClipboardCheck },
            { titleKey: 'items.assignments', href: '/assignments', icon: FileText },
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
        {
          labelKey: 'sections.advanced',
          collapsible: true,
          defaultCollapsed: true,
          items: [
            { titleKey: 'items.exercises', href: '/exercises', icon: PenTool },
            { titleKey: 'items.signatures', href: '/signatures', icon: PenTool },
            { titleKey: 'items.communications', href: '/communications', icon: Megaphone },
            { titleKey: 'items.support', href: '/support', icon: LifeBuoy },
          ],
        },
      ];

    case 'parent':
      return [
        {
          labelKey: 'sections.family',
          items: [
            { titleKey: 'items.overview', href: '/dashboard', icon: LayoutDashboard },
            { titleKey: 'items.parentSpace', href: '/my-children', icon: Home },
            { titleKey: 'items.finance', href: '/my-children?tab=finance', icon: CreditCard },
            { titleKey: 'items.services', href: '/my-children?tab=services', icon: Bus },
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
            { titleKey: 'items.users', href: '/users', icon: UserCog },
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
