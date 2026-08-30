import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { CaddyNoteLogo } from '@/components/brand/CaddyNoteLogo';
import { InstitutionBrand } from '@/components/brand/InstitutionBrand';
import { brandTaglineForRole } from '@/lib/brand';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { useStrkInstitutions } from '@/hooks/useStrkInstitutions';
import { useEstablishmentDashboardContext } from '@/hooks/useEstablishmentDashboardContext';
import { useTranslation } from 'react-i18next';
import {
  navSectionsForRole,
  roleLabel,
  isSchoolShellRole,
  filterNavSectionsForUser,
  type NavItemConfig,
} from '@/lib/navConfig';
import { Building2, ChevronDown, X, MoreHorizontal, LogOut, User, Settings } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface StrkSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || 'U';

function NavButton({
  item,
  active,
  badge,
  label,
  onNavigate,
}: {
  item: NavItemConfig;
  active: boolean;
  badge?: number;
  label: string;
  onNavigate: (href: string) => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onNavigate(item.href)}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors',
        active ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      )}
    >
      <Icon className={cn('h-5 w-5 shrink-0', active ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600')} aria-hidden />
      <span className="flex-1 truncate">{label}</span>
      {badge != null && badge > 0 && (
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[11px] font-semibold',
            active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
          )}
        >
          {badge > 999 ? '999+' : badge}
        </span>
      )}
    </button>
  );
}

function RoleNavBody({
  onNavigate,
  institutionName,
  studentCount,
  alertCount,
  showInstitutionChip,
  showProUpsell,
}: {
  onNavigate: (href: string) => void;
  institutionName: string;
  studentCount?: number;
  alertCount?: number;
  showInstitutionChip: boolean;
  showProUpsell: boolean;
}) {
  const location = useLocation();
  const { user, logout } = useStrkAuth();
  const { t } = useTranslation('nav');
  const sections = filterNavSectionsForUser(navSectionsForRole(user?.role), user?.institutionId);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Auto-expand « Plus » when the current route lives in an advanced section.
  useEffect(() => {
    const path = location.pathname;
    const advanced = sections.find((section) => section.collapsible);
    if (!advanced) return;
    const advancedHasActive = advanced.items.some((item) => {
      const href = item.href.split('?')[0];
      return path === href || path.startsWith(`${href}/`);
    });
    if (advancedHasActive) setAdvancedOpen(true);
    // Intentionally only react to path; sections are role-stable for a session.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid loop on new sections[] each render
  }, [location.pathname]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Erreur lors de la déconnexion:', error);
    }
  };
  const badgeFor = (item: NavItemConfig) => {
    if (item.badgeKey === 'students') return studentCount || undefined;
    if (item.badgeKey === 'alerts') return alertCount || undefined;
    return undefined;
  };

  const isActive = (href: string) => {
    const path = href.split('?')[0];
    // Hub Présences Direction/secrétariat : /attendance + /absences
    if (path === '/attendance') {
      return (
        location.pathname === '/attendance' ||
        location.pathname.startsWith('/attendance/') ||
        location.pathname === '/absences' ||
        location.pathname.startsWith('/absences/')
      );
    }
    // Hub Présences enseignant : /teacher-attendance + /absences
    if (path === '/teacher-attendance') {
      return (
        location.pathname === '/teacher-attendance' ||
        location.pathname.startsWith('/teacher-attendance/') ||
        location.pathname === '/absences' ||
        location.pathname.startsWith('/absences/')
      );
    }
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  return (
    <>
      {showInstitutionChip && (
        <div className="px-4 pt-3">
          <button
            type="button"
            onClick={() =>
              onNavigate(user?.role === 'school_admin' ? '/settings' : '/dashboard')
            }
            className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm">
              <Building2 className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-slate-400">{t('institution')}</p>
              <p className="truncate text-sm font-semibold text-slate-900">{institutionName || t('institution')}</p>
            </div>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </button>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-3 py-5" aria-label={t('sidebarNav')}>
        {sections.map((section) => {
          const collapsed = Boolean(section.collapsible) && !advancedOpen;
          return (
            <div key={section.labelKey} className="mb-5">
              {section.collapsible ? (
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((v) => !v)}
                  aria-expanded={advancedOpen}
                  className="mb-2 flex w-full items-center justify-between px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 hover:text-slate-600"
                >
                  <span>{t(section.labelKey)}</span>
                  <ChevronDown
                    className={cn('h-3.5 w-3.5 transition-transform', advancedOpen && 'rotate-180')}
                    aria-hidden
                  />
                </button>
              ) : (
                <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {t(section.labelKey)}
                </p>
              )}
              {!collapsed && (
                <div className="space-y-0.5">
                  {section.items.map((item) => (
                    <NavButton
                      key={`${item.href}-${item.titleKey}`}
                      item={item}
                      label={t(item.titleKey)}
                      active={isActive(item.href)}
                      badge={badgeFor(item)}
                      onNavigate={onNavigate}
                    />
                  ))}
                </div>
              )}
              {section.collapsible && collapsed && (
                <p className="px-3 text-xs text-slate-400">{t('advancedToggle')}</p>
              )}
            </div>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3 border-t border-slate-100 p-4">
        {showProUpsell && (
          <div className="rounded-2xl bg-paterne p-4 text-white">
            <p className="font-display text-sm font-semibold">{t('proTitle')}</p>
            <p className="mt-1 text-xs text-white/70">{t('proBody')}</p>
            <button
              type="button"
              onClick={() => onNavigate('/subscription')}
              className="mt-3 w-full rounded-xl bg-white px-3 py-2 text-sm font-semibold text-paterne transition-colors hover:bg-slate-100"
            >
              {t('proCta')}
            </button>
          </div>
        )}

        <div className="flex items-center gap-3 rounded-2xl px-1 py-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
            {initials(user?.name || 'U')}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{user?.name}</p>
            <p className="truncate text-xs text-slate-500">{roleLabel(user?.role)}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label={t('accountMenu')}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-56 rounded-xl">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="truncate">{user?.name}</span>
                  <span className="truncate text-xs font-normal text-slate-500">{user?.email}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onNavigate('/profile')}>
                <User className="mr-2 h-4 w-4" />
                {t('profile')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onNavigate('/settings')}>
                <Settings className="mr-2 h-4 w-4" />
                {t('settings')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => void handleLogout()}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                {t('logout')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </>
  );
}

/** Nav établissement — lit le provider dashboard (badges). */
function SchoolRoleNav({
  onNavigate,
  institutionName,
}: {
  onNavigate: (href: string) => void;
  institutionName: string;
}) {
  const { user } = useStrkAuth();
  const { plan } = useSubscription();
  const dash = useEstablishmentDashboardContext();
  // Upsell abonnement : réservé à la direction (pas enseignant / vie scolaire).
  const isDirection = user?.role === 'admin' || user?.role === 'school_admin';
  const showProUpsell =
    isDirection &&
    (!plan || /free|essai|trial|starter/i.test(plan.name || '') || plan.is_trial);
  return (
    <RoleNavBody
      onNavigate={onNavigate}
      institutionName={institutionName}
      studentCount={dash.studentCount}
      alertCount={dash.alertCount}
      showInstitutionChip
      showProUpsell={!!showProUpsell}
    />
  );
}

function SimpleRoleNav({ onNavigate }: { onNavigate: (href: string) => void }) {
  return (
    <RoleNavBody
      onNavigate={onNavigate}
      institutionName=""
      showInstitutionChip={false}
      showProUpsell={false}
    />
  );
}

const StrkSidebar: React.FC<StrkSidebarProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { user } = useStrkAuth();
  const { getInstitutionById, institutions } = useStrkInstitutions();
  const [institutionName, setInstitutionName] = useState('');
  const [institutionLogo, setInstitutionLogo] = useState<string | null>(null);
  const { t } = useTranslation('nav');

  const isSchoolShell = isSchoolShellRole(user?.role);

  useEffect(() => {
    if (!user?.institutionId) return;
    const apply = (inst: { name?: string; logo?: string | null } | null) => {
      if (inst?.name) setInstitutionName(inst.name);
      setInstitutionLogo(inst?.logo ?? null);
    };
    const fromList = institutions.find((i) => i.id === user.institutionId);
    if (fromList) {
      apply(fromList);
    } else {
      void getInstitutionById(user.institutionId).then(apply);
    }

    const onUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string; name?: string; logo?: string | null }>).detail;
      if (!detail?.id || detail.id !== user.institutionId) return;
      apply(detail);
    };
    window.addEventListener('strk:institution-updated', onUpdated);
    return () => window.removeEventListener('strk:institution-updated', onUpdated);
  }, [user?.institutionId, getInstitutionById, institutions]);

  const go = (href: string) => {
    if (window.innerWidth < 1024) onClose();
    navigate(href);
  };

  return (
    <>
      {isOpen && <div className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={onClose} />}

      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-full w-[272px] flex-col border-r border-slate-200/80 bg-white transition-transform duration-300 ease-in-out lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-5">
          {isSchoolShell && institutionName ? (
            <InstitutionBrand
              name={institutionName}
              logoKey={institutionLogo}
              to="/dashboard"
              size={36}
              aria-label={t('logoHome')}
              onClick={() => window.innerWidth < 1024 && onClose()}
            />
          ) : (
            <CaddyNoteLogo
              to="/dashboard"
              size={36}
              tagline={brandTaglineForRole(user?.role)}
              className="[&_.font-display]:text-base [&_.font-display]:font-semibold"
              aria-label={t('logoHome')}
              onClick={() => window.innerWidth < 1024 && onClose()}
            />
          )}
          <Button variant="ghost" size="icon" onClick={onClose} className="lg:hidden" aria-label={t('closeMenu')}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {isSchoolShell ? (
          <SchoolRoleNav onNavigate={go} institutionName={institutionName} />
        ) : (
          <SimpleRoleNav onNavigate={go} />
        )}
      </aside>
    </>
  );
};

export default StrkSidebar;
