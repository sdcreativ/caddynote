import { useEffect, useState } from 'react';
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
  ClipboardCheck,
} from 'lucide-react';
import StatCard from '@/components/dashboard/StatCard';
import {
  MobileCompactStat,
  MobilePrimaryCta,
  MobileQuickTile,
} from '@/components/dashboard/MobileActionPrimitives';
import { Button } from '@/components/ui/button';
import { roleLabel } from '@/lib/navConfig';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { useStrkCourses } from '@/hooks/useStrkCourses';
import type { DashboardMetrics } from '@/services/strkAnalyticsService';
import {
  fetchUpcomingAttendanceCalls,
  type UpcomingAttendanceCall,
} from '@/services/strkAttendanceService';

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

const POLL_MS = 60_000;
const URGENT_CALL_MINUTES = 10;

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
  const { user } = useStrkAuth();
  const { courses, loadCoursesByTeacher } = useStrkCourses();
  const [upcomingCalls, setUpcomingCalls] = useState<UpcomingAttendanceCall[]>([]);

  useEffect(() => {
    if (user?.id && (user.role === 'teacher' || user.role === 'head_teacher')) {
      void loadCoursesByTeacher(user.id);
    }
  }, [user, loadCoursesByTeacher]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const calls = await fetchUpcomingAttendanceCalls(URGENT_CALL_MINUTES);
      if (!cancelled) setUpcomingCalls(calls);
    };
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const absenceCount =
    metricsState === 'ready' || metricsState === 'empty' ? Number(metrics?.absences ?? 0) : 0;
  const hasAbsencesToHandle = metricsState === 'ready' && absenceCount > 0;
  const hasCallReminders = upcomingCalls.length > 0;
  const toHandleCount = (hasAbsencesToHandle ? 1 : 0) + upcomingCalls.length;

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

  const callHref = (courseId: string) =>
    `/teacher-attendance?course=${encodeURIComponent(courseId)}`;

  const notebookHref = (courseId: string) => `/courses/${encodeURIComponent(courseId)}#cahier`;

  /** Créneaux urgents, sinon 1–2 cours du catalogue pour éviter un hub vide. */
  const nextCourseActions =
    upcomingCalls.length > 0
      ? upcomingCalls.slice(0, 2).map((call) => ({
          id: call.courseId,
          name: call.courseName,
          callTo: callHref(call.courseId),
          notebookTo: notebookHref(call.courseId),
        }))
      : courses.slice(0, 2).map((course) => ({
          id: course.id,
          name: course.name,
          callTo: callHref(course.id),
          notebookTo: notebookHref(course.id),
        }));

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
              <span className="text-slate-400">({toHandleCount})</span>
            </h2>
          </div>
          {hasCallReminders ? (
            <Button asChild size="sm">
              <Link to={callHref(upcomingCalls[0].courseId)}>{t('quickActions.takeAttendance')}</Link>
            </Button>
          ) : hasAbsencesToHandle ? (
            <Button asChild size="sm">
              <Link to="/absences">{t('teacherMobile.absencesCta')}</Link>
            </Button>
          ) : null}
        </div>

        {toHandleCount > 0 ? (
          <ul className="mt-4 divide-y divide-slate-100">
            {upcomingCalls.map((call) => (
              <li key={`${call.courseId}-${call.startTime}`}>
                <Link
                  to={callHref(call.courseId)}
                  className="group flex items-center gap-3 py-3.5 transition-colors hover:bg-slate-50/80"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800">
                    <ClipboardCheck className="h-5 w-5" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {t('teacherMobile.callInMinutes', {
                        minutes: call.minutesUntilStart,
                        course: call.courseName,
                      })}
                    </p>
                    <p className="truncate text-sm text-slate-500">
                      {t('teacherMobile.callSlotHint', {
                        time: call.startTime,
                        className: call.className || t('teacherMobile.callNoClass'),
                      })}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 transition-colors group-hover:text-slate-500" />
                </Link>
              </li>
            ))}
            {hasAbsencesToHandle ? (
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
            ) : null}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-slate-500">{t('alerts.emptyTitle')}</p>
        )}
      </section>

      {/* Q2 — Pulsation */}
      <div className="grid grid-cols-2 gap-3 md:hidden">
        <MobileCompactStat
          title={t('stats.students')}
          value={studentsDisplay}
          tone="blue"
          onClick={() => navigate('/teaching')}
        />
        <MobileCompactStat
          title={t('stats.attendance')}
          value={attendanceDisplay}
          tone="emerald"
          hint={
            metrics?.attendanceRate == null && metricsState === 'ready'
              ? t('empty.noAttendanceData')
              : undefined
          }
          onClick={() => navigate('/teacher-attendance')}
        />
        <MobileCompactStat
          title={t('stats.absences')}
          value={absencesDisplay}
          tone="rose"
          onClick={() => navigate('/absences')}
        />
      </div>

      <div className="hidden gap-4 md:grid md:grid-cols-3">
        <StatCard
          title={t('stats.students')}
          value={studentsDisplay}
          description={metricsState === 'error' ? t('empty.metricsUnavailable') : undefined}
          icon={<Users className="h-5 w-5" />}
          onClick={() => navigate('/teaching')}
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
          onClick={() => navigate('/teacher-attendance')}
        />
        <StatCard
          title={t('stats.absences')}
          value={absencesDisplay}
          icon={<AlertCircle className="h-5 w-5" />}
          color="red"
          onClick={() => navigate('/absences')}
        />
      </div>

      {/* Q3 — Deux clics : CTA primaire + prochains cours + raccourcis */}
      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          {t('teacherMobile.shortcutsTitle')}
        </p>
        <MobilePrimaryCta
          label={t('quickActions.takeAttendance')}
          icon={<UserCheck aria-hidden />}
          onClick={() =>
            navigate(
              upcomingCalls[0]
                ? callHref(upcomingCalls[0].courseId)
                : nextCourseActions[0]
                  ? nextCourseActions[0].callTo
                  : '/teacher-attendance'
            )
          }
        />
        <p className="sr-only">{t('teacherMobile.primaryCtaHint')}</p>

        {nextCourseActions.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500">
              {hasCallReminders
                ? t('teacherMobile.nextCoursesTitle')
                : t('teacherMobile.pickCourseHint')}
            </p>
            <div className="flex flex-wrap gap-2">
              {nextCourseActions.map((course) => (
                <div key={course.id} className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm" className="rounded-full">
                    <Link to={course.callTo}>
                      {t('teacherMobile.callCourse', { course: course.name })}
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" size="sm" className="rounded-full">
                    <Link to={course.notebookTo}>
                      {t('teacherMobile.notebookCourse', { course: course.name })}
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

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
            onClick={() =>
              navigate(
                nextCourseActions[0] ? nextCourseActions[0].notebookTo : '/teaching'
              )
            }
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
