import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { dayGreetingKey } from '@/lib/dayGreeting';
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
  ChevronRight,
  Headphones,
  KeyRound,
  BarChart3,
  Snowflake,
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
import {
  fetchPlatformOpsQueue,
  type PlatformOpsItem,
} from '@/services/strkOpsService';
import type { ReactNode } from 'react';

type LoadState = 'idle' | 'loading' | 'ready' | 'error' | 'empty';

type AdminDashboardHomeProps = {
  userName: string;
  metrics: DashboardMetrics | null;
  metricsState: LoadState;
  totalInstitutions: number;
  totalStudents: number;
  totalTeachers: number;
  /** Si présent, affiche aussi les raccourcis métier établissement. */
  institutionId?: string | null;
};

type Shortcut = {
  labelKey: string;
  href: string;
  icon: ReactNode;
};

const kpiValue = (state: LoadState, value: string | number | null | undefined, emptyLabel = '0') => {
  if (state === 'loading' || state === 'idle') return '…';
  if (state === 'error') return '—';
  if (value == null) return emptyLabel;
  return value;
};

const PLATFORM_OPS: Shortcut[] = [
  { labelKey: 'teamCockpit.modules.console', href: '/super-admin', icon: <Shield aria-hidden /> },
  { labelKey: 'quickActions.institutions', href: '/institutions', icon: <Building2 aria-hidden /> },
  {
    labelKey: 'teamCockpit.modules.subscriptionsOps',
    href: '/super-admin/subscriptions',
    icon: <CreditCard aria-hidden />,
  },
  { labelKey: 'teamCockpit.modules.users', href: '/users', icon: <UserCog aria-hidden /> },
  {
    labelKey: 'teamCockpit.modules.supportOps',
    href: '/super-admin/support-ops',
    icon: <Headphones aria-hidden />,
  },
  { labelKey: 'teamCockpit.modules.audit', href: '/audit-log', icon: <ScrollText aria-hidden /> },
  {
    labelKey: 'teamCockpit.modules.habilitations',
    href: '/super-admin/habilitations',
    icon: <KeyRound aria-hidden />,
  },
  {
    labelKey: 'teamCockpit.modules.analytics',
    href: '/super-admin/analytics',
    icon: <BarChart3 aria-hidden />,
  },
];

const INSTITUTION_SHORTCUTS: Shortcut[] = [
  { labelKey: 'quickActions.students', href: '/students', icon: <Users aria-hidden /> },
  { labelKey: 'quickActions.finance', href: '/finance', icon: <Receipt aria-hidden /> },
  { labelKey: 'quickActions.documents', href: '/documents', icon: <FileText aria-hidden /> },
  {
    labelKey: 'teamCockpit.modules.communications',
    href: '/communications',
    icon: <Megaphone aria-hidden />,
  },
  { labelKey: 'teamCockpit.modules.exports', href: '/exports', icon: <Download aria-hidden /> },
  { labelKey: 'quickActions.messages', href: '/messages', icon: <MessageSquare aria-hidden /> },
  { labelKey: 'quickActions.services', href: '/services', icon: <Bus aria-hidden /> },
  {
    labelKey: 'teamCockpit.modules.plansCatalog',
    href: '/subscription',
    icon: <CreditCard aria-hidden />,
  },
];

const opsIcon = (kind: PlatformOpsItem['kind']) => {
  if (kind === 'ticket') return <LifeBuoy className="h-5 w-5" aria-hidden />;
  if (kind === 'dunning') return <CreditCard className="h-5 w-5" aria-hidden />;
  if (kind === 'frozen') return <Snowflake className="h-5 w-5" aria-hidden />;
  if (kind === 'security') return <Shield className="h-5 w-5" aria-hidden />;
  return <Megaphone className="h-5 w-5" aria-hidden />;
};

const opsTone = (kind: PlatformOpsItem['kind']) => {
  if (kind === 'ticket') return 'bg-sky-100 text-sky-800';
  if (kind === 'dunning') return 'bg-amber-100 text-amber-800';
  if (kind === 'frozen') return 'bg-rose-100 text-rose-700';
  if (kind === 'security') return 'bg-violet-100 text-violet-800';
  return 'bg-orange-100 text-orange-800';
};

/**
 * Accueil Équipe CaddyNote — cockpit ops 1–2 clics :
 * À traiter → KPI → CTA + raccourcis plateforme (+ métier si institution liée).
 */
const AdminDashboardHome = ({
  userName,
  metrics,
  metricsState,
  totalInstitutions,
  totalStudents,
  totalTeachers,
  institutionId,
}: AdminDashboardHomeProps) => {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();
  const [opsItems, setOpsItems] = useState<PlatformOpsItem[]>([]);
  const [opsLoading, setOpsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setOpsLoading(true);
    void (async () => {
      const items = await fetchPlatformOpsQueue();
      if (!cancelled) {
        setOpsItems(items);
        setOpsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
  const primaryHref = opsItems[0]?.href ?? '/super-admin';
  const primaryLabel = opsItems[0]
    ? t('teamCockpit.primaryCtaUrgent')
    : t('spaces.toPlatformConsole');

  return (
    <div className="space-y-6 py-4 animate-fade-in md:space-y-8 md:py-6">
      <header className="space-y-1.5">
        <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-tight md:text-3xl">
          {t(dayGreetingKey(), { name: userName })}
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
              {t('teamCockpit.toHandleTitle')}{' '}
              <span className="text-slate-400">({opsLoading ? '…' : opsItems.length})</span>
            </h2>
          </div>
          <Button asChild size="sm">
            <Link to={primaryHref}>
              {opsItems[0] ? t('alerts.primaryCta') : t('spaces.toPlatformConsole')}
            </Link>
          </Button>
        </div>

        {hasMetricsIssue ? (
          <p className="mt-4 text-sm text-rose-600">{t('empty.metricsUnavailable')}</p>
        ) : null}

        {!opsLoading && opsItems.length > 0 ? (
          <ul className="mt-4 divide-y divide-slate-100">
            {opsItems.slice(0, 5).map((item) => (
              <li key={item.id}>
                <Link
                  to={item.href}
                  className="group flex items-center gap-3 py-3.5 transition-colors hover:bg-slate-50/80"
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${opsTone(item.kind)}`}
                  >
                    {opsIcon(item.kind)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{item.title}</p>
                    {item.detail ? (
                      <p className="truncate text-sm text-slate-500">{item.detail}</p>
                    ) : null}
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 transition-colors group-hover:text-slate-500" />
                </Link>
              </li>
            ))}
          </ul>
        ) : !opsLoading ? (
          <p className="mt-4 text-sm text-slate-500">{t('teamCockpit.toHandleEmpty')}</p>
        ) : (
          <p className="mt-4 text-sm text-slate-400">{t('teamCockpit.toHandleLoading')}</p>
        )}
      </section>

      {/* Q2 — Pulsation plateforme */}
      <div className="grid grid-cols-2 gap-3 md:hidden">
        <MobileCompactStat
          title={t('stats.institutions')}
          value={institutionsDisplay}
          tone="blue"
          onClick={() => navigate('/institutions')}
        />
        <MobileCompactStat
          title={t('stats.students')}
          value={studentsDisplay}
          tone="emerald"
          onClick={() => navigate('/users')}
        />
        <MobileCompactStat
          title={t('stats.teachers')}
          value={teachersDisplay}
          tone="violet"
          onClick={() => navigate('/users')}
        />
        <MobileCompactStat
          title={t('stats.attendance')}
          value={attendanceDisplay}
          tone="amber"
          onClick={() => navigate('/super-admin/analytics')}
        />
      </div>

      <div className="hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title={t('stats.institutions')}
          value={institutionsDisplay}
          description={metricsState === 'error' ? t('empty.metricsUnavailable') : undefined}
          icon={<School className="h-5 w-5" />}
          color="blue"
          onClick={() => navigate('/institutions')}
        />
        <StatCard
          title={t('stats.students')}
          value={studentsDisplay}
          description={metricsState === 'error' ? t('empty.metricsUnavailable') : undefined}
          icon={<Users className="h-5 w-5" />}
          onClick={() => navigate('/users')}
        />
        <StatCard
          title={t('stats.teachers')}
          value={teachersDisplay}
          icon={<Award className="h-5 w-5" />}
          color="purple"
          onClick={() => navigate('/users')}
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
          onClick={() => navigate('/super-admin/analytics')}
        />
        <StatCard
          title={t('stats.absences')}
          value={absencesDisplay}
          icon={<AlertCircle className="h-5 w-5" />}
          color="red"
          onClick={() => navigate('/super-admin/observability')}
        />
      </div>

      {/* Q3 — CTA + ops plateforme */}
      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          {t('teamCockpit.shortcutsTitle')}
        </p>
        <MobilePrimaryCta
          label={primaryLabel}
          icon={<Shield aria-hidden />}
          onClick={() => navigate(primaryHref)}
        />
        {!opsItems[0] ? (
          <p className="text-xs text-slate-500">{t('spaces.toPlatformConsoleHint')}</p>
        ) : (
          <p className="sr-only">{t('teamCockpit.primaryCtaHint')}</p>
        )}

        <div>
          <p className="mb-2 text-sm font-medium text-slate-600">{t('teamCockpit.opsRowTitle')}</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {PLATFORM_OPS.map((mod) => (
              <MobileQuickTile
                key={mod.href}
                label={t(mod.labelKey)}
                icon={mod.icon}
                onClick={() => navigate(mod.href)}
                className="md:min-h-[5.5rem]"
              />
            ))}
          </div>
        </div>

        {institutionId ? (
          <div className="pt-2">
            <p className="mb-1 text-sm font-medium text-slate-600">
              {t('teamCockpit.institutionRowTitle')}
            </p>
            <p className="mb-2 text-xs text-slate-500">{t('teamCockpit.institutionRowHint')}</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {INSTITUTION_SHORTCUTS.map((mod) => (
                <MobileQuickTile
                  key={mod.href}
                  label={t(mod.labelKey)}
                  icon={mod.icon}
                  onClick={() => navigate(mod.href)}
                  className="md:min-h-[5.5rem]"
                />
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">{t('teamCockpit.noInstitutionHint')}</p>
        )}
      </div>
    </div>
  );
};

export default AdminDashboardHome;
