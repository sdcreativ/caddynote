import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Users,
  UserCheck,
  AlertCircle,
  MessageSquare,
  School,
  ClipboardCheck,
  FileText,
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

type SecretaryDashboardHomeProps = {
  userName: string;
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
 * Accueil secrétariat — mobile P0 (CTA élèves + KPI + grille) ;
 * desktop conserve la grille KPI + actions rapides.
 */
const SecretaryDashboardHome = ({
  userName,
  metrics,
  metricsState,
  totalStudents,
}: SecretaryDashboardHomeProps) => {
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
          {roleLabel('secretary')} • {dateLabel}
        </p>
        <p className="hidden text-sm text-slate-500 md:block">{t('roleHints.staff')}</p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:hidden">
        <MobileCompactStat
          title={t('stats.students')}
          value={String(kpiValue(metricsState, metrics?.students ?? totalStudents))}
          tone="blue"
        />
        <MobileCompactStat
          title={t('stats.absences')}
          value={String(kpiValue(metricsState, metrics?.absences ?? '—', '—'))}
          tone="rose"
        />
      </div>

      <div className="md:hidden">
        <MobilePrimaryCta
          label={t('secretaryMobile.primaryCta')}
          icon={<Users aria-hidden />}
          onClick={() => navigate('/students')}
        />
        <p className="sr-only">{t('secretaryMobile.primaryCtaHint')}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:hidden">
        <MobileQuickTile
          label={t('quickActions.attendance')}
          icon={<ClipboardCheck aria-hidden />}
          onClick={() => navigate('/attendance')}
        />
        <MobileQuickTile
          label={t('quickActions.admissions')}
          icon={<School aria-hidden />}
          onClick={() => navigate('/admissions/admin')}
        />
        <MobileQuickTile
          label={t('quickActions.messages')}
          icon={<MessageSquare aria-hidden />}
          onClick={() => navigate('/messages')}
        />
        <MobileQuickTile
          label={t('quickActions.documents')}
          icon={<FileText aria-hidden />}
          onClick={() => navigate('/documents')}
        />
      </div>

      <div className="hidden md:block">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
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
                label={t('quickActions.students')}
                icon={<Users aria-hidden />}
                onClick={() => navigate('/students')}
              />
              <MobileQuickTile
                label={t('quickActions.admissions')}
                icon={<School aria-hidden />}
                onClick={() => navigate('/admissions/admin')}
              />
              <MobileQuickTile
                label={t('quickActions.attendance')}
                icon={<ClipboardCheck aria-hidden />}
                onClick={() => navigate('/attendance')}
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

export default SecretaryDashboardHome;
