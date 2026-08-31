import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Users,
  Building2,
  Server,
  BarChart3,
  Shield,
  Settings,
  CreditCard,
  Bell,
  LogOut,
  User,
  Plus,
  Briefcase,
  GraduationCap,
  School,
  Activity,
  ScrollText,
  Megaphone,
  Headphones,
  UserCog,
  KeyRound,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CaddyNoteLogo } from '@/components/brand/CaddyNoteLogo';
import { BRAND } from '@/lib/brand';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { usePlatformPermissions } from '@/hooks/usePlatformPermissions';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SuperAdminSidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  onCreateClass?: () => void;
  /** Demandes de démo en file contact (badge Support ops). */
  demoRequestCount?: number;
  /** Drawer mobile : ouvert / fermé. Toujours visible ≥ lg. */
  isOpen: boolean;
  onClose: () => void;
}

type NavItemDef = {
  titleKey: string;
  hintKey?: string;
  icon: LucideIcon;
  value: string;
};

type NavGroupDef = {
  labelKey: string;
  items: NavItemDef[];
};

const NAV_GROUPS: NavGroupDef[] = [
  {
    labelKey: 'groups.pilotage',
    items: [{ titleKey: 'items.overview', hintKey: 'items.overviewHint', icon: LayoutDashboard, value: 'overview' }],
  },
  {
    labelKey: 'groups.referentiel',
    items: [
      { titleKey: 'items.users', hintKey: 'items.usersHint', icon: Users, value: 'users' },
      { titleKey: 'items.advancedUsers', hintKey: 'items.advancedUsersHint', icon: UserCog, value: 'advanced-users' },
      { titleKey: 'items.institutions', icon: Building2, value: 'institutions' },
      { titleKey: 'items.teachers', icon: GraduationCap, value: 'teachers' },
      { titleKey: 'items.students', icon: School, value: 'students' },
      { titleKey: 'items.classes', icon: Building2, value: 'classes' },
    ],
  },
  {
    labelKey: 'groups.supervision',
    items: [
      { titleKey: 'items.system', hintKey: 'items.systemHint', icon: Server, value: 'system' },
      { titleKey: 'items.logs', hintKey: 'items.logsHint', icon: ScrollText, value: 'logs' },
      { titleKey: 'items.observability', hintKey: 'items.observabilityHint', icon: Activity, value: 'observability' },
    ],
  },
  {
    labelKey: 'groups.analyse',
    items: [
      { titleKey: 'items.analytics', icon: BarChart3, value: 'analytics' },
      { titleKey: 'items.businessKpis', icon: BarChart3, value: 'business-kpis' },
    ],
  },
  {
    labelKey: 'groups.conformite',
    items: [
      { titleKey: 'items.security', hintKey: 'items.securityHint', icon: Shield, value: 'security' },
      { titleKey: 'items.securityCompliance', icon: Shield, value: 'security-compliance' },
      { titleKey: 'items.habilitations', hintKey: 'items.habilitationsHint', icon: KeyRound, value: 'habilitations' },
    ],
  },
  {
    labelKey: 'groups.exploitation',
    items: [
      { titleKey: 'items.subscriptions', icon: CreditCard, value: 'subscriptions' },
      { titleKey: 'items.communicationTools', icon: Megaphone, value: 'communication-tools' },
      { titleKey: 'items.supportOps', hintKey: 'items.supportOpsHint', icon: Headphones, value: 'support-ops' },
      { titleKey: 'items.notifications', hintKey: 'items.notificationsHint', icon: Bell, value: 'notifications' },
      { titleKey: 'items.settings', hintKey: 'items.settingsHint', icon: Settings, value: 'settings' },
    ],
  },
];

const SuperAdminSidebar = ({
  activeSection,
  onSectionChange,
  onCreateClass,
  demoRequestCount = 0,
  isOpen,
  onClose,
}: SuperAdminSidebarProps) => {
  const { t } = useTranslation('superAdmin');
  const { user, logout } = useStrkAuth();
  const { canSeeSection } = usePlatformPermissions();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Erreur lors de la déconnexion:', error);
    }
  };

  const selectSection = (section: string) => {
    onSectionChange(section);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      onClose();
    }
  };

  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => canSeeSection(item.value)),
  })).filter((group) => group.items.length > 0);

  return (
    <>
      {isOpen ? (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col border-r border-slate-200/80 bg-white transition-transform duration-300 ease-in-out lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        aria-label={t('navAria')}
      >
        <div className="shrink-0 border-b border-slate-100 px-5 pb-4 pt-5">
          <div className="flex items-start justify-between gap-2">
            <CaddyNoteLogo
              to="/super-admin"
              size={36}
              tagline={BRAND.taglineTeam}
              className="min-w-0 [&_.font-display]:text-base [&_.font-display]:font-semibold"
              aria-label={t('logoAria')}
              onClick={() => {
                if (typeof window !== 'undefined' && window.innerWidth < 1024) onClose();
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="shrink-0 lg:hidden"
              aria-label={t('closeMenu')}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50/90 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              {t('spaces')}
            </p>
            <p className="mt-1 hidden text-[11px] font-medium text-slate-500 sm:block">{t('hereLabel')}</p>
            <p className="text-sm font-semibold text-slate-900">{t('console')}</p>
            <p className="mt-1 hidden text-xs leading-snug text-slate-500 sm:block">{t('consoleHint')}</p>
            <Link
              to="/dashboard"
              onClick={() => {
                if (typeof window !== 'undefined' && window.innerWidth < 1024) onClose();
              }}
              className="mt-3 flex w-full flex-col gap-0.5 rounded-xl bg-white px-3 py-2.5 text-left shadow-sm ring-1 ring-slate-200/80 transition hover:bg-slate-50"
            >
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#1D70D8]">
                <Briefcase className="h-4 w-4 shrink-0" aria-hidden />
                {t('businessPilotage')}
              </span>
              <span className="hidden pl-6 text-xs leading-snug text-slate-500 sm:block">
                {t('businessPilotageHint')}
              </span>
            </Link>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto overscroll-contain px-3 py-4" aria-label={t('sectionsAria')}>
          {visibleGroups.map((group) => (
            <div key={group.labelKey} className="mb-5">
              <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                {t(group.labelKey)}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = activeSection === item.value;
                  const Icon = item.icon;
                  const title = t(item.titleKey);
                  const hint = item.hintKey ? t(item.hintKey) : title;
                  return (
                    <li key={item.value} className="flex items-center gap-1">
                      <button
                        type="button"
                        title={hint}
                        onClick={() => selectSection(item.value)}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'group flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors',
                          active
                            ? 'bg-blue-50 text-blue-700'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        )}
                      >
                        <Icon
                          className={cn(
                            'h-4 w-4 shrink-0',
                            active ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'
                          )}
                          aria-hidden
                        />
                        <span className="truncate">{title}</span>
                        {item.value === 'support-ops' && demoRequestCount > 0 ? (
                          <span className="ml-auto shrink-0 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">
                            {demoRequestCount > 99 ? '99+' : demoRequestCount}
                          </span>
                        ) : null}
                      </button>
                      {item.value === 'classes' && onCreateClass && (
                        <button
                          type="button"
                          onClick={onCreateClass}
                          className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                          title={t('addClass')}
                          aria-label={t('addClass')}
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-slate-100 p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1D70D8] text-xs font-semibold text-white">
              <User className="h-4 w-4" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{user?.email || 'Super Admin'}</p>
              <p className="truncate text-xs text-slate-500">{t('roleLabel')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            {t('logout')}
          </button>
        </div>
      </aside>
    </>
  );
};

export default SuperAdminSidebar;
