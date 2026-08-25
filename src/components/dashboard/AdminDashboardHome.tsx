import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  School,
  Users,
  UserCheck,
  AlertCircle,
  Award,
  Shield,
  Building2,
  UserCog,
  FileText,
  Download,
  Receipt,
  Bus,
  MessageSquare,
  Megaphone,
  ScrollText,
  LifeBuoy,
  CreditCard,
} from 'lucide-react';
import StatCard from '@/components/dashboard/StatCard';
import {
  MobileCompactStat,
  MobilePrimaryCta,
  MobileQuickTile,
} from '@/components/dashboard/MobileActionPrimitives';
import { Button } from '@/components/ui/button';
import { roleLabel } from '@/lib/navConfig';
import type { DashboardMetrics } from '@/services/strkAnalyticsService';
import type { ReactNode } from 'react';

type LoadState = 'idle' | 'loading' | 'ready' | 'error' | 'empty';

type AdminDashboardHomeProps = {
  userName: string;
  metrics: DashboardMetrics | null;
  metricsState: LoadState;
  totalInstitutions: number;
  totalStudents: number;
  totalTeachers: number;
};

type RoleModule = {
  labelKey: string;
  href: string;
  icon: ReactNode;
};

type RoleGroup = {
  id: string;
  titleKey: string;
  hintKey: string;
  modules: RoleModule[];
};

const kpiValue = (state: LoadState, value: string | number | null | undefined, emptyLabel = '0') => {
  if (state === 'loading' || state === 'idle') return '…';
  if (state === 'error') return '—';
  if (value == null) return emptyLabel;
  return value;
};

const ROLE_GROUPS: RoleGroup[] = [
  {
    id: 'platform',
    titleKey: 'teamCockpit.roles.platform',
    hintKey: 'teamCockpit.roles.platformHint',
    modules: [
      { labelKey: 'teamCockpit.modules.console', href: '/super-admin', icon: <Shield aria-hidden /> },
      { labelKey: 'quickActions.institutions', href: '/institutions', icon: <Building2 aria-hidden /> },
      { labelKey: 'teamCockpit.modules.users', href: '/users', icon: <UserCog aria-hidden /> },
      { labelKey: 'teamCockpit.modules.audit', href: '/audit-log', icon: <ScrollText aria-hidden /> },
    ],
  },
  {
    id: 'direction',
    titleKey: 'teamCockpit.roles.direction',
    hintKey: 'teamCockpit.roles.directionHint',
    modules: [
      { labelKey: 'quickActions.students', href: '/students', icon: <Users aria-hidden /> },
      { labelKey: 'quickActions.documents', href: '/documents', icon: <FileText aria-hidden /> },
      { labelKey: 'teamCockpit.modules.exports', href: '/exports', icon: <Download aria-hidden /> },
    ],
  },
  {
    id: 'finance',
    titleKey: 'teamCockpit.roles.finance',
    hintKey: 'teamCockpit.roles.financeHint',
    modules: [
      { labelKey: 'quickActions.finance', href: '/finance', icon: <Receipt aria-hidden /> },
      { labelKey: 'quickActions.services', href: '/services', icon: <Bus aria-hidden /> },
      { labelKey: 'teamCockpit.modules.plans', href: '/subscription', icon: <CreditCard aria-hidden /> },
    ],
  },
  {
    id: 'familyTeaching',
    titleKey: 'teamCockpit.roles.familyTeaching',
    hintKey: 'teamCockpit.roles.familyTeachingHint',
    modules: [
      { labelKey: 'quickActions.messages', href: '/messages', icon: <MessageSquare aria-hidden /> },
      { labelKey: 'teamCockpit.modules.communications', href: '/communications', icon: <Megaphone aria-hidden /> },
      { labelKey: 'teamCockpit.modules.support', href: '/support', icon: <LifeBuoy aria-hidden /> },
    ],
  },
];

/**
 * Accueil Équipe CaddyNote (admin plateforme) —
 * pulsation multi-établissements + fonctionnalités groupées par rôle métier.
 */
const AdminDashboardHome = ({
  userName,
  metrics,
  metricsState,
  totalInstitutions,
  totalStudents,
  totalTeachers,
}: AdminDashboardHomeProps) => {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();

  const dateLabel = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const attendanceDisplay =
    metricsState === 'loading' || metricsState === 'idle'
      ? '…'
      : metrics?.attendanceRate == null
        ? '—'
        : `${metrics.attendanceRate.toFixed(1)} %`;

  const institutionsDisplay = String(
    kpiValue(metricsState, metrics?.totalInstitutions ?? totalInstitutions)
  );
  const studentsDisplay = String(kpiValue(metricsState, metrics?.students ?? totalStudents));
  const teachersDisplay = String(kpiValue(metricsState, metrics?.teachers ?? totalTeachers));
  const absencesDisplay = String(kpiValue(metricsState, metrics?.absences ?? '—', '—'));

  const hasMetricsIssue = metricsState === 'error';

  return (
    <div className="space-y-6 py-4 animate-fade-in md:space-y-8 md:py-6">
      <header className="space-y-1.5">
        <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-tight md:text-3xl">
          {t('hello', { name: userName })}
        </h1>
        <p className="text-base text-slate-600 md:text-slate-500">
          {roleLabel('admin')} • {dateLabel}
        </p>
        <p className="text-sm text-slate-500">{t('roleHints.admin')}</p>
      </header>

      {/* Q1 — À traiter / ops plateforme */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              {t('alerts.section')}
            </p>
            <h2 className="mt-1 font-display text-lg font-semibold text-slate-900">
              {t('teamCockpit.toHandleTitle')}
            </h2>
          </div>
          <Button asChild size="sm">
            <Link to="/super-admin">{t('spaces.toPlatformConsole')}</Link>
          </Button>
        </div>
        {hasMetricsIssue ? (
          <p className="mt-4 text-sm text-rose-600">{t('empty.metricsUnavailable')}</p>
        ) : (
          <p className="mt-4 text-sm text-slate-500">{t('teamCockpit.toHandleEmpty')}</p>
        )}
        <p className="mt-2 text-sm text-slate-500">{t('spaces.businessHint')}</p>
      </section>

      {/* Q2 — Pulsation plateforme */}
      <div className="grid grid-cols-2 gap-3 md:hidden">
        <MobileCompactStat title={t('stats.institutions')} value={institutionsDisplay} tone="blue" />
        <MobileCompactStat title={t('stats.students')} value={studentsDisplay} tone="emerald" />
        <MobileCompactStat title={t('stats.teachers')} value={teachersDisplay} tone="violet" />
        <MobileCompactStat title={t('stats.attendance')} value={attendanceDisplay} tone="amber" />
      </div>

      <div className="hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title={t('stats.institutions')}
          value={institutionsDisplay}
          description={metricsState === 'error' ? t('empty.metricsUnavailable') : undefined}
          icon={<School className="h-5 w-5" />}
          color="blue"
        />
        <StatCard
          title={t('stats.students')}
          value={studentsDisplay}
          description={metricsState === 'error' ? t('empty.metricsUnavailable') : undefined}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          title={t('stats.teachers')}
          value={teachersDisplay}
          icon={<Award className="h-5 w-5" />}
          color="purple"
        />
        <StatCard
          title={t('stats.attendance')}
          value={attendanceDisplay}
          description={
            metrics?.attendanceRate == null && metricsState === 'ready'
              ? t('empty.noAttendanceData')
              : undefined
          }
          icon={<UserCheck className="h-5 w-5" />}
          color="green"
        />
        <StatCard
          title={t('stats.absences')}
          value={absencesDisplay}
          icon={<AlertCircle className="h-5 w-5" />}
          color="red"
        />
      </div>

      {/* Q3 — CTA + fonctionnalités par rôle */}
      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          {t('teamCockpit.shortcutsTitle')}
        </p>
        <MobilePrimaryCta
          label={t('spaces.toPlatformConsole')}
          icon={<Shield aria-hidden />}
          onClick={() => navigate('/super-admin')}
        />
        <p className="sr-only">{t('teamCockpit.primaryCtaHint')}</p>
      </div>

      <div className="space-y-8">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-900">
            {t('teamCockpit.byRoleTitle')}
          </h2>
          <p className="mt-1 text-sm text-slate-500">{t('teamCockpit.byRoleHint')}</p>
        </div>

        {ROLE_GROUPS.map((group) => (
          <section key={group.id} className="space-y-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                {t(group.titleKey)}
              </p>
              <p className="mt-1 text-sm text-slate-500">{t(group.hintKey)}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {group.modules.map((mod) => (
                <MobileQuickTile
                  key={mod.href}
                  label={t(mod.labelKey)}
                  icon={mod.icon}
                  onClick={() => navigate(mod.href)}
                  className="md:min-h-[5.5rem]"
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

export default AdminDashboardHome;
