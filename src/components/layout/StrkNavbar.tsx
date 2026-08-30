import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { useEstablishmentDashboardContext } from '@/hooks/useEstablishmentDashboardContext';
import { Button } from '@/components/ui/button';
import { CaddyNoteLogo } from '@/components/brand/CaddyNoteLogo';
import { InstitutionBrand } from '@/components/brand/InstitutionBrand';
import { useTranslation } from 'react-i18next';
import { isSchoolShellRole } from '@/lib/navConfig';
import { useStrkInstitutions } from '@/hooks/useStrkInstitutions';
import {
  Bell,
  LogOut,
  Settings,
  Menu,
  Search,
  MessageSquare,
  User,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { SuperAdminNotificationsBell } from '@/components/admin/SuperAdminNotificationsBell';

interface StrkNavbarProps {
  onToggleSidebar?: () => void;
}

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || 'U';

const StrkNavbar: React.FC<StrkNavbarProps> = ({ onToggleSidebar }) => {
  const { user, logout } = useStrkAuth();
  const { t } = useTranslation('nav');
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const { getInstitutionById, institutions } = useStrkInstitutions();
  const [institutionName, setInstitutionName] = useState('');
  const [institutionLogo, setInstitutionLogo] = useState<string | null>(null);
  const isSchoolShell = isSchoolShellRole(user?.role);

  useEffect(() => {
    if (!isSchoolShell || !user?.institutionId) return;
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
  }, [isSchoolShell, user?.institutionId, getInstitutionById, institutions]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Erreur lors de la déconnexion:', error);
    }
  };

  const role = user?.role;
  const isTeacher = role === 'teacher' || role === 'head_teacher';
  const isStudent = role === 'student';
  const isPlatformInstitutionsRole = role === 'admin' || role === 'group_owner';
  // Appel ≠ absences ≠ signatures (voir docs/PRESENCE.md / navConfig).
  const callHref = isTeacher ? '/teacher-attendance' : '/attendance';
  const absencesHref = isStudent ? '/my-absences' : '/absences';

  const searchTargets = [
    ...(!isStudent
      ? [
          { titleKey: 'items.students' as const, href: '/students' },
          { titleKey: 'items.call' as const, href: callHref },
          { titleKey: 'items.absences' as const, href: absencesHref },
        ]
      : [
          { titleKey: 'items.myAbsences' as const, href: '/my-absences' },
          { titleKey: 'items.signatures' as const, href: '/signatures' },
        ]),
    { titleKey: 'items.calendar' as const, href: '/calendar' },
    { titleKey: 'items.finance' as const, href: '/finance' },
    { titleKey: 'items.messages' as const, href: '/messages' },
    { titleKey: 'items.grades' as const, href: isStudent ? '/my-grades' : '/grades' },
    { titleKey: 'items.documents' as const, href: '/documents' },
    { titleKey: 'items.settings' as const, href: '/settings' },
    ...(isPlatformInstitutionsRole
      ? [{ titleKey: 'items.institutions' as const, href: '/institutions' }]
      : []),
  ];

  return (
    <header className="sticky top-0 z-30 w-full border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <div className="relative flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <div className="z-10 flex shrink-0 items-center gap-3">
          <Button
            size="icon"
            variant="ghost"
            className="lg:hidden text-slate-600"
            onClick={onToggleSidebar}
            type="button"
            aria-label={t('openMenu')}
          >
            <Menu className="h-5 w-5" />
          </Button>

          {isSchoolShell && institutionName ? (
            <InstitutionBrand
              name={institutionName}
              logoKey={institutionLogo}
              to="/dashboard"
              size={28}
              className="lg:hidden shrink-0 [&_.font-display]:text-sm"
              aria-label={t('logoHome')}
            />
          ) : (
            <CaddyNoteLogo
              to="/dashboard"
              size={28}
              withWordmark
              tagline={null}
              linkClassName="lg:hidden shrink-0"
              className="[&_.font-display]:text-sm"
              aria-label={t('logoHome')}
            />
          )}
        </div>

        <div className="pointer-events-none absolute inset-x-0 flex justify-center px-16 sm:px-24 lg:px-32">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="pointer-events-auto flex h-11 w-full max-w-xl min-w-0 items-center gap-3 rounded-full border border-slate-200 bg-slate-50 px-4 text-left text-sm text-slate-500 transition-colors hover:border-slate-300 hover:bg-white"
          >
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="truncate">{t('searchPlaceholder')}</span>
            <kbd className="ml-auto hidden shrink-0 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 sm:inline-block">
              ⌘K
            </kbd>
          </button>
        </div>

        <div className="z-10 ml-auto flex items-center gap-1 sm:gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full text-slate-600"
            aria-label={t('messages')}
            onClick={() => navigate('/messages')}
          >
            <MessageSquare className="h-5 w-5" />
          </Button>

          {isSchoolShell ? (
            <SchoolNotifications />
          ) : user?.role === 'admin' ? (
            <SuperAdminNotificationsBell
              variant="icon"
              onOpenSupportOps={() => navigate('/super-admin/support-ops')}
            />
          ) : (
            <Button variant="ghost" size="icon" className="rounded-full text-slate-600" aria-label={t('notifications')}>
              <Bell className="h-5 w-5" />
            </Button>
          )}

          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="relative h-11 rounded-full px-1.5"
                  aria-label={t('accountMenu')}
                >
                  <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-blue-600 text-xs font-semibold text-white">
                    {user.profileImage ? (
                      <img src={user.profileImage} alt="" className="h-9 w-9 object-cover" />
                    ) : (
                      initials(user.name ?? user.email ?? '?')
                    )}
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-2xl">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span>{user.name ?? user.email}</span>
                    <span className="text-xs font-normal text-slate-500">{user.email}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/profile">
                    <User className="mr-2 h-4 w-4" />
                    {t('profile')}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/settings">
                    <Settings className="mr-2 h-4 w-4" />
                    {t('settings')}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  {t('logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
        <CommandInput placeholder={t('searchCommandPlaceholder')} />
        <CommandList>
          <CommandEmpty>{t('searchEmpty')}</CommandEmpty>
          <CommandGroup heading={t('searchPages')}>
            {searchTargets.map((item) => (
              <CommandItem
                key={item.href}
                value={t(item.titleKey)}
                onSelect={() => {
                  setSearchOpen(false);
                  navigate(item.href);
                }}
              >
                {t(item.titleKey)}
              </CommandItem>
            ))}
          </CommandGroup>
          {isSchoolShell && <SchoolSearchAlerts onPick={() => setSearchOpen(false)} />}
        </CommandList>
      </CommandDialog>
    </header>
  );
};

function SchoolNotifications() {
  const navigate = useNavigate();
  const { t } = useTranslation('nav');
  const dash = useEstablishmentDashboardContext();
  const notifications = dash.alerts.slice(0, 5);
  const unread = notifications.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-full text-slate-600"
          aria-label={unread > 0 ? t('notificationsCount', { count: unread }) : t('notifications')}
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 rounded-2xl p-2">
        <DropdownMenuLabel className="px-2 py-1.5 text-base font-semibold">{t('notifications')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-slate-500">{t('notificationsEmpty')}</p>
        ) : (
          notifications.map((n) => (
            <DropdownMenuItem
              key={n.id}
              className="cursor-pointer rounded-xl px-2 py-2.5"
              onClick={() => navigate(n.href)}
            >
              <div
                className={cn(
                  'mr-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                  n.kind === 'lateness'
                    ? 'bg-orange-100 text-orange-700'
                    : n.kind === 'payment'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-rose-100 text-rose-700'
                )}
              >
                {initials(n.studentName)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{n.studentName}</p>
                <p className="truncate text-xs text-slate-500">{n.label}</p>
              </div>
              <span className="ml-2 shrink-0 text-[10px] text-slate-400">
                {formatDistanceToNow(new Date(n.createdAt), { addSuffix: false, locale: fr })}
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SchoolSearchAlerts({ onPick }: { onPick: () => void }) {
  const navigate = useNavigate();
  const { t } = useTranslation('nav');
  const dash = useEstablishmentDashboardContext();
  if (dash.alerts.length === 0) return null;
  return (
    <CommandGroup heading={t('searchAlerts')}>
      {dash.alerts.slice(0, 6).map((a) => (
        <CommandItem
          key={a.id}
          value={`${a.studentName} ${a.label}`}
          onSelect={() => {
            onPick();
            navigate(a.href);
          }}
        >
          {a.studentName} — {a.label}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

export default StrkNavbar;
