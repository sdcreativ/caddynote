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

export function navSectionsForRole(role: string | null | undefined): NavSection[] {
  switch (role) {
    case 'school_admin':
      return [
        {
          labelKey: 'sections.workspace',
          items: [
            { titleKey: 'items.overview', href: '/dashboard', icon: LayoutDashboard },
            { titleKey: 'items.students', href: '/students', icon: Users, badgeKey: 'students' },
            { titleKey: 'items.call', href: '/attendance', icon: ClipboardCheck },
            { titleKey: 'items.absences', href: '/absences', icon: AlertTriangle, badgeKey: 'alerts' },
            { titleKey: 'items.grades', href: '/grades', icon: GraduationCap },
            { titleKey: 'items.documents', href: '/documents', icon: FileText },
            { titleKey: 'items.finance', href: '/finance', icon: Receipt },
            { titleKey: 'items.admissions', href: '/admissions/admin', icon: School },
            { titleKey: 'items.followUp', href: '/follow-up', icon: HeartHandshake },
            { titleKey: 'items.communications', href: '/communications', icon: Megaphone },
            { titleKey: 'items.messages', href: '/messages', icon: MessageSquare },
            { titleKey: 'items.availability', href: '/teacher-availability', icon: CalendarOff },
          ],
        },
        {
          labelKey: 'sections.management',
          items: [
            { titleKey: 'items.calendar', href: '/calendar', icon: Calendar },
            { titleKey: 'items.classes', href: '/classes', icon: GraduationCap },
            { titleKey: 'items.subjects', href: '/subjects', icon: BookOpen },
            { titleKey: 'items.teachers', href: '/teachers', icon: Users },
            { titleKey: 'items.users', href: '/users', icon: UserCog },
            { titleKey: 'items.exports', href: '/exports', icon: Download },
            { titleKey: 'items.services', href: '/services', icon: Bus },
            { titleKey: 'items.support', href: '/support', icon: LifeBuoy },
            { titleKey: 'items.auditLog', href: '/audit-log', icon: ScrollText },
            { titleKey: 'items.settings', href: '/settings', icon: Settings },
          ],
        },
      ];

    case 'teacher':
    case 'head_teacher':
      return [
        {
          labelKey: 'sections.workspace',
          items: [
            { titleKey: 'items.overview', href: '/dashboard', icon: LayoutDashboard },
            { titleKey: 'items.call', href: '/teacher-attendance', icon: ClipboardCheck },
            { titleKey: 'items.absences', href: '/absences', icon: AlertTriangle },
            { titleKey: 'items.notes', href: '/grades', icon: GraduationCap },
            { titleKey: 'items.assignments', href: '/teacher-assignments', icon: BookOpen },
            { titleKey: 'items.exercises', href: '/teacher-exercises', icon: PenTool },
            { titleKey: 'items.teaching', href: '/teaching', icon: School },
            { titleKey: 'items.availability', href: '/teacher-availability', icon: CalendarOff },
            { titleKey: 'items.studentFollowUp', href: '/follow-up', icon: HeartHandshake },
            { titleKey: 'items.communications', href: '/communications', icon: Megaphone },
            { titleKey: 'items.messages', href: '/messages', icon: MessageSquare },
          ],
        },
        {
          labelKey: 'sections.management',
          items: [
            { titleKey: 'items.calendar', href: '/calendar', icon: Calendar },
            { titleKey: 'items.documents', href: '/documents', icon: FileText },
            { titleKey: 'items.exports', href: '/exports', icon: Download },
            { titleKey: 'items.support', href: '/support', icon: LifeBuoy },
            { titleKey: 'items.settings', href: '/settings', icon: Settings },
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
      return [
        {
          labelKey: 'sections.journey',
          items: [
            { titleKey: 'items.dashboard', href: '/dashboard', icon: Home },
            { titleKey: 'items.myCourses', href: '/my-courses', icon: BookOpen },
            { titleKey: 'items.myGrades', href: '/my-grades', icon: GraduationCap },
            { titleKey: 'items.myAbsences', href: '/my-absences', icon: ClipboardCheck },
            { titleKey: 'items.assignments', href: '/assignments', icon: FileText },
            { titleKey: 'items.exercises', href: '/exercises', icon: PenTool },
            { titleKey: 'items.signatures', href: '/signatures', icon: PenTool },
            { titleKey: 'items.calendar', href: '/calendar', icon: Calendar },
            { titleKey: 'items.messages', href: '/messages', icon: MessageSquare },
          ],
        },
        {
          labelKey: 'sections.account',
          items: [
            { titleKey: 'items.profile', href: '/profile', icon: User },
            { titleKey: 'items.support', href: '/support', icon: LifeBuoy },
            { titleKey: 'items.settings', href: '/settings', icon: Settings },
          ],
        },
      ];

    case 'parent':
      return [
        {
          labelKey: 'sections.family',
          items: [
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
            { titleKey: 'items.support', href: '/support', icon: LifeBuoy },
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
