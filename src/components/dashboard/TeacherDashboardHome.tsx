import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  UserCheck,
  AlertCircle,
  GraduationCap,
  BookOpen,
  MessageSquare,
  Calendar,
  Users,
} from 'lucide-react';
import StatCard from '@/components/dashboard/StatCard';
import {
  MobileCompactStat,
  MobilePrimaryCta,
  MobileQuickTile,
} from '@/components/dashboard/MobileActionPrimitives';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
 * Accueil enseignant — layout mobile P0 (CTA appel + 2 KPI + grille) ;
 * desktop conserve la grille KPI + actions rapides existante.
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

  const attendanceDisplay =
    metricsState === 'loading' || metricsState === 'idle'
      ? '…'
      : metrics?.attendanceRate == null
        ? '—'
        : `${metrics.attendanceRate.toFixed(1)} %`;

  const dateLabel = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="space-y-6 py-4 animate-fade-in md:space-y-6 md:py-6">
      <header className="space-y-1.5">
        <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-tight md:text-3xl">
          {t('hello', { name: userName })}
        </h1>
        <p className="text-base text-slate-600 md:text-base md:text-slate-500">
          {roleLabel(role)} • {dateLabel}
        </p>
        <p className="hidden text-sm text-slate-500 md:block">{t('roleHints.staff')}</p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:hidden">
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
        <MobileCompactStat
          title={t('stats.absences')}
          value={String(kpiValue(metricsState, metrics?.absences ?? '—', '—'))}
          tone="red"
        />
      </div>

      <div className="md:hidden">
        <MobilePrimaryCta
          label={t('quickActions.takeAttendance')}
          icon={<UserCheck aria-hidden />}
          onClick={() => navigate('/teacher-attendance')}
        />
        <p className="sr-only">{t('teacherMobile.primaryCtaHint')}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:hidden">
        <MobileQuickTile
          label={t('quickActions.grades')}
          icon={<GraduationCap aria-hidden />}
          onClick={() => navigate('/grades')}
        />
        <MobileQuickTile
          label={t('quickActions.teaching')}
          icon={<BookOpen aria-hidden />}
          onClick={() => navigate('/teaching')}
        />
        <MobileQuickTile
          label={t('quickActions.messages')}
          icon={<MessageSquare aria-hidden />}
          onClick={() => navigate('/messages')}
        />
        <MobileQuickTile
          label={t('quickActions.calendar')}
          icon={<Calendar aria-hidden />}
          onClick={() => navigate('/calendar')}
        />
      </div>

      <div className="hidden md:block">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          <StatCard
            title={t('stats.students')}
            value={kpiValue(metricsState, metrics?.students ?? totalStudents)}
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
            value={kpiValue(metricsState, metrics?.absences ?? '—', '—')}
            icon={<AlertCircle className="h-5 w-5" />}
            color="red"
          />
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t('quickActions.title')}</CardTitle>
            <CardDescription>{t('quickActions.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <MobileQuickTile
                label={t('quickActions.takeAttendance')}
                icon={<UserCheck aria-hidden />}
                onClick={() => navigate('/teacher-attendance')}
              />
              <MobileQuickTile
                label={t('quickActions.grades')}
                icon={<GraduationCap aria-hidden />}
                onClick={() => navigate('/grades')}
              />
              <MobileQuickTile
                label={t('quickActions.teaching')}
                icon={<BookOpen aria-hidden />}
                onClick={() => navigate('/teaching')}
              />
              <MobileQuickTile
                label={t('quickActions.messages')}
                icon={<MessageSquare aria-hidden />}
                onClick={() => navigate('/messages')}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TeacherDashboardHome;
