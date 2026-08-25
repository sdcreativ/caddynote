import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  UserCheck,
  AlertCircle,
  GraduationCap,
  BookOpen,
  MessageSquare,
  Calendar,
  Users,
  ChevronRight,
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

type LoadState = 'idle' | 'loading' | 'ready' | 'error' | 'empty';

type TeacherDashboardHomeProps = {
  userName: string;
  role: string;
  metrics: DashboardMetrics | null;
  metricsState: LoadState;
  totalStudents: number;
};

const kpiValue = (state: LoadState, value: string | number | null | undefined, emptyLabel = '0') => {
  if (state === 'loading' || state === 'idle') return '…';
  if (state === 'error') return '—';
  if (value == null) return emptyLabel;
  return value;
};

/**
 * Accueil enseignant — cockpit deux clics :
 * À traiter → Pulsation (KPI) → CTA appel + raccourcis.
 */
const TeacherDashboardHome = ({
  userName,
  role,
  metrics,
  metricsState,
  totalStudents,
}: TeacherDashboardHomeProps) => {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();

  const absenceCount =
    metricsState === 'ready' || metricsState === 'empty' ? Number(metrics?.absences ?? 0) : 0;
  const hasAbsencesToHandle = metricsState === 'ready' && absenceCount > 0;

  const attendanceDisplay =
    metricsState === 'loading' || metricsState === 'idle'
      ? '…'
      : metrics?.attendanceRate == null
        ? '—'
        : `${metrics.attendanceRate.toFixed(1)} %`;

  const studentsDisplay = String(kpiValue(metricsState, metrics?.students ?? totalStudents));
  const absencesDisplay = String(kpiValue(metricsState, metrics?.absences ?? '—', '—'));

  const dateLabel = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="space-y-6 py-4 animate-fade-in md:space-y-8 md:py-6">
      <header className="space-y-1.5">
        <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-tight md:text-3xl">
          {t('hello', { name: userName })}
        </h1>
        <p className="text-base text-slate-600 md:text-slate-500">
          {roleLabel(role)} • {dateLabel}
        </p>
      </header>

      {/* Q1 — À traiter */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              {t('alerts.section')}
            </p>
            <h2 className="mt-1 font-display text-lg font-semibold text-slate-900">
              {t('alerts.recent')}{' '}
              <span className="text-slate-400">({hasAbsencesToHandle ? 1 : 0})</span>
            </h2>
          </div>
          {hasAbsencesToHandle ? (
            <Button asChild size="sm">
              <Link to="/absences">{t('teacherMobile.absencesCta')}</Link>
            </Button>
          ) : null}
        </div>

        {hasAbsencesToHandle ? (
          <ul className="mt-4 divide-y divide-slate-100">
            <li>
              <Link
                to="/absences"
                className="group flex items-center gap-3 py-3.5 transition-colors hover:bg-slate-50/80"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700">
                  <AlertCircle className="h-5 w-5" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {t('teacherMobile.absencesToHandle', { count: absenceCount })}
                  </p>
                  <p className="truncate text-sm text-slate-500">{t('stats.absences')}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300 transition-colors group-hover:text-slate-500" />
              </Link>
            </li>
          </ul>
        ) : (
          <p className="mt-4 text-sm text-slate-500">{t('alerts.emptyTitle')}</p>
        )}
      </section>

      {/* Q2 — Pulsation */}
      <div className="grid grid-cols-2 gap-3 md:hidden">
        <MobileCompactStat title={t('stats.students')} value={studentsDisplay} tone="blue" />
        <MobileCompactStat
          title={t('stats.attendance')}
          value={attendanceDisplay}
          tone="emerald"
          hint={
            metrics?.attendanceRate == null && metricsState === 'ready'
              ? t('empty.noAttendanceData')
              : undefined
          }
        />
        <MobileCompactStat title={t('stats.absences')} value={absencesDisplay} tone="rose" />
      </div>

      <div className="hidden gap-4 md:grid md:grid-cols-3">
        <StatCard
          title={t('stats.students')}
          value={studentsDisplay}
          description={metricsState === 'error' ? t('empty.metricsUnavailable') : undefined}
          icon={<Users className="h-5 w-5" />}
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

      {/* Q3 — Deux clics : CTA primaire + raccourcis */}
      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          {t('teacherMobile.shortcutsTitle')}
        </p>
        <MobilePrimaryCta
          label={t('quickActions.takeAttendance')}
          icon={<UserCheck aria-hidden />}
          onClick={() => navigate('/teacher-attendance')}
        />
        <p className="sr-only">{t('teacherMobile.primaryCtaHint')}</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MobileQuickTile
            label={t('quickActions.grades')}
            icon={<GraduationCap aria-hidden />}
            onClick={() => navigate('/grades')}
            className="md:min-h-[5.5rem]"
          />
          <MobileQuickTile
            label={t('quickActions.teaching')}
            icon={<BookOpen aria-hidden />}
            onClick={() => navigate('/teaching')}
            className="md:min-h-[5.5rem]"
          />
          <MobileQuickTile
            label={t('quickActions.messages')}
            icon={<MessageSquare aria-hidden />}
            onClick={() => navigate('/messages')}
            className="md:min-h-[5.5rem]"
          />
          <MobileQuickTile
            label={t('quickActions.calendar')}
            icon={<Calendar aria-hidden />}
            onClick={() => navigate('/calendar')}
            className="md:min-h-[5.5rem]"
          />
        </div>
      </div>
    </div>
  );
};

export default TeacherDashboardHome;
