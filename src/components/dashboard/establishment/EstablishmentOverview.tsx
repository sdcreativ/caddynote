import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users,
  UserCheck,
  Wallet,
  AlertTriangle,
  Snowflake,
  CreditCard,
  School,
  ClipboardCheck,
  MessageSquare,
  Receipt,
  Calendar,
  GraduationCap,
} from 'lucide-react';
import {
  MobileCompactStat,
  MobilePrimaryCta,
  MobileQuickTile,
} from '@/components/dashboard/MobileActionPrimitives';
import { useEstablishmentDashboardContext } from '@/hooks/useEstablishmentDashboardContext';
import { KpiCard } from './KpiCard';
import { AttendanceWeekChart } from './AttendanceWeekChart';
import { TodayAgenda } from './TodayAgenda';
import { PriorityAlerts } from './PriorityAlerts';
import { FinanceCollecte } from './FinanceCollecte';
import { SetupChecklist } from './SetupChecklist';
import { ScheduleTab } from '@/components/institution/ScheduleTab';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { hasAnyRole, DIRECTION_ROLES } from '@/lib/roles';
import { useStrkAuth } from '@/hooks/useStrkAuth';

const LOW_ATTENDANCE_THRESHOLD = 95;

const formatMoneyShort = (cents: number, currency: string) => {
  const amount = cents / 100;
  if (currency === 'XOF' || currency === 'XAF') {
    if (amount >= 1_000_000) {
      return `${(amount / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} M ${currency}`;
    }
    return `${Math.round(amount).toLocaleString('fr-FR')} ${currency}`;
  }
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(
    amount
  );
};

export function EstablishmentOverview() {
  const { t } = useTranslation('dashboard');
  const data = useEstablishmentDashboardContext();
  const { user } = useStrkAuth();
  const navigate = useNavigate();
  const dateLabel = format(new Date(), 'EEEE d MMMM yyyy', { locale: fr });
  const { tenantStatus } = data;
  const showSetup = hasAnyRole(user?.role, DIRECTION_ROLES);

  if (data.loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (data.loadError) {
    return (
      <div className="space-y-4 py-8">
        <EmptyState
          title={t('overview.loadErrorTitle')}
          description={data.loadError}
          actionLabel={t('overview.retry')}
          onAction={() => void data.reload()}
        />
      </div>
    );
  }

  const attendanceValue =
    data.attendanceToday.rate == null
      ? '—'
      : `${data.attendanceToday.rate.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}%`;

  const financeActive =
    data.finance.paidCents + data.finance.pendingCents + data.finance.overdueCents > 0;
  const paymentsValue = formatMoneyShort(data.finance.paidCents, data.finance.currency);

  const showAttendanceChart = data.studentCount > 0 && data.hasAttendanceHistory;
  const showAgenda = data.agenda.length > 0;
  const showFinanceBlock = financeActive;
  const showSecondary = showAttendanceChart || showAgenda || showFinanceBlock;

  const needsCallAttention =
    data.studentCount > 0 &&
    (data.attendanceToday.rate == null || data.attendanceToday.rate < LOW_ATTENDANCE_THRESHOLD);

  const firstAlert = data.alerts[0];
  const primaryCta = (() => {
    if (!firstAlert) {
      if (needsCallAttention) {
        return {
          label: t('directionMobile.primaryCtaCall'),
          href: '/attendance',
          icon: <ClipboardCheck aria-hidden />,
        };
      }
      return {
        label: t('directionMobile.primaryCta'),
        href: '/students',
        icon: <Users aria-hidden />,
      };
    }
    if (firstAlert.kind === 'admission') {
      return {
        label: t('directionMobile.primaryCtaAdmissions'),
        href: firstAlert.href || '/admissions/admin',
        icon: <School aria-hidden />,
      };
    }
    if (firstAlert.kind === 'payment') {
      return {
        label: t('directionMobile.primaryCtaPayments'),
        href: firstAlert.href || '/finance',
        icon: <Receipt aria-hidden />,
      };
    }
    return {
      label: t('directionMobile.primaryCtaAbsences'),
      href: firstAlert.href || '/absences',
      icon: <ClipboardCheck aria-hidden />,
    };
  })();

  const alertsHref = firstAlert?.href || (data.alertCount > 0 ? '/absences' : '/absences');

  const kpiColsClass = financeActive
    ? 'md:grid-cols-2 xl:grid-cols-5'
    : 'md:grid-cols-2 xl:grid-cols-4';

  return (
    <div className="space-y-6 py-4 animate-fade-in md:space-y-8 md:py-0">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{dateLabel}</p>
        <h1 className="mt-2 font-display text-[1.75rem] font-semibold leading-tight tracking-tight text-slate-900 md:text-4xl">
          {t('overview.welcomeBack', { name: data.firstName })}
        </h1>
        <p className="mt-1 text-base text-slate-500">{data.institutionName}</p>
      </header>

      {tenantStatus.frozen && (
        <Alert variant="destructive">
          <Snowflake className="h-4 w-4" />
          <AlertTitle>{t('overview.frozenTitle')}</AlertTitle>
          <AlertDescription>{t('overview.frozenBody')}</AlertDescription>
        </Alert>
      )}

      {(tenantStatus.subscriptionStatus === 'suspended' ||
        tenantStatus.subscriptionStatus === 'grace') && (
        <Alert variant={tenantStatus.subscriptionStatus === 'suspended' ? 'destructive' : 'default'}>
          <CreditCard className="h-4 w-4" />
          <AlertTitle>
            {tenantStatus.subscriptionStatus === 'suspended'
              ? t('overview.suspendedTitle')
              : t('overview.graceTitle')}
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>
              {tenantStatus.subscriptionStatus === 'suspended'
                ? t('overview.suspendedBody')
                : t('overview.graceBody')}
            </span>
            <Button asChild size="sm" variant="outline">
              <Link to="/subscription">{t('overview.openSubscription')}</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {showSetup && <SetupChecklist />}

      {tenantStatus.isEmpty && !tenantStatus.frozen && (
        <EmptyState
          title={t('overview.emptyTitle')}
          description={t('overview.emptyBody')}
          actionLabel={t('overview.emptyAction')}
          onAction={() => {
            window.location.href = '/students';
          }}
        />
      )}

      {/* Q1 — À traiter */}
      <PriorityAlerts alerts={data.alerts} total={data.alertCount} />

      {/* Q2 — Pulsation (KPI) */}
      <div className="grid grid-cols-2 gap-3 md:hidden">
        <MobileCompactStat
          title={t('overview.enrolledStudents')}
          value={String(data.studentCount)}
          tone="blue"
          onClick={() => navigate('/students')}
        />
        <MobileCompactStat
          title={t('overview.attendanceToday')}
          value={attendanceValue}
          tone="emerald"
          onClick={() => navigate('/attendance')}
        />
        <MobileCompactStat
          title={t('overview.admissionsPending')}
          value={String(data.admissionsPendingCount)}
          tone="amber"
          onClick={() => navigate('/admissions/admin')}
        />
        <MobileCompactStat
          title={t('overview.alertsToHandle')}
          value={String(data.alertCount)}
          tone="rose"
          onClick={() => navigate(alertsHref)}
        />
        {financeActive ? (
          <MobileCompactStat
            title={t('overview.paymentsReceived')}
            value={paymentsValue}
            tone="violet"
            hint={t('overview.thisMonth')}
            onClick={() => navigate('/finance')}
          />
        ) : null}
      </div>

      <div className={`hidden gap-4 md:grid ${kpiColsClass}`}>
        <KpiCard
          title={t('overview.enrolledStudents')}
          value={String(data.studentCount)}
          hint={
            data.studentCount === 0
              ? t('overview.noStudentsYet')
              : t('overview.girlsBoys', {
                  girls: data.genderHeadcount.female,
                  boys: data.genderHeadcount.male,
                })
          }
          hintTone={data.studentsDelta > 0 ? 'up' : 'neutral'}
          icon={<Users className="h-5 w-5" />}
          iconClassName="bg-blue-50 text-blue-600"
          onClick={() => navigate('/students')}
        />
        <KpiCard
          title={t('overview.attendanceToday')}
          value={attendanceValue}
          hint={
            data.attendanceToday.rate == null
              ? t('overview.noAttendanceYet')
              : t('overview.basedOnHeadcount')
          }
          hintTone="neutral"
          icon={<UserCheck className="h-5 w-5" />}
          iconClassName="bg-emerald-50 text-emerald-600"
          onClick={() => navigate('/attendance')}
        />
        <KpiCard
          title={t('overview.admissionsPending')}
          value={String(data.admissionsPendingCount)}
          hint={
            data.admissionsPendingCount === 0
              ? t('overview.noAdmissionsPending')
              : t('overview.admissionsPendingHint')
          }
          hintTone={data.admissionsPendingCount > 0 ? 'alert' : 'neutral'}
          icon={<School className="h-5 w-5" />}
          iconClassName="bg-sky-50 text-sky-600"
          onClick={() => navigate('/admissions/admin')}
        />
        <KpiCard
          title={t('overview.alertsToHandle')}
          value={String(data.alertCount)}
          hint={t('overview.priorityCount', { count: data.priorityCount })}
          hintTone={data.alertCount > 0 ? 'alert' : 'neutral'}
          icon={<AlertTriangle className="h-5 w-5" />}
          iconClassName="bg-rose-50 text-rose-600"
          onClick={() => navigate(alertsHref)}
        />
        {financeActive ? (
          <KpiCard
            title={t('overview.paymentsReceived')}
            value={paymentsValue}
            hint={t('overview.thisMonth')}
            hintTone="neutral"
            icon={<Wallet className="h-5 w-5" />}
            iconClassName="bg-violet-50 text-violet-600"
            onClick={() => navigate('/finance')}
          />
        ) : null}
      </div>

      {/* Q3 — Aller où */}
      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          {t('directionMobile.shortcutsTitle')}
        </p>
        <MobilePrimaryCta
          label={primaryCta.label}
          icon={primaryCta.icon}
          onClick={() => navigate(primaryCta.href)}
        />
        <p className="sr-only">{t('directionMobile.primaryCtaHint')}</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MobileQuickTile
            label={t('quickActions.students')}
            icon={<Users aria-hidden />}
            onClick={() => navigate('/students')}
            className="md:min-h-[5.5rem]"
          />
          <MobileQuickTile
            label={t('quickActions.attendance')}
            icon={<ClipboardCheck aria-hidden />}
            onClick={() => navigate('/attendance')}
            className="md:min-h-[5.5rem]"
          />
          <MobileQuickTile
            label={t('quickActions.absences')}
            icon={<AlertTriangle aria-hidden />}
            onClick={() => navigate('/absences')}
            className="md:min-h-[5.5rem]"
          />
          <MobileQuickTile
            label={t('quickActions.admissions')}
            icon={<School aria-hidden />}
            onClick={() => navigate('/admissions/admin')}
            className="md:min-h-[5.5rem]"
          />
          <MobileQuickTile
            label={t('directionMobile.classesCourses')}
            icon={<GraduationCap aria-hidden />}
            onClick={() => navigate('/classes')}
            className="md:min-h-[5.5rem]"
          />
          <MobileQuickTile
            label={t('quickActions.calendar')}
            icon={<Calendar aria-hidden />}
            onClick={() => navigate('/calendar')}
            className="md:min-h-[5.5rem]"
          />
          <MobileQuickTile
            label={t('quickActions.messages')}
            icon={<MessageSquare aria-hidden />}
            onClick={() => navigate('/messages')}
            className="md:min-h-[5.5rem]"
          />
          {financeActive ? (
            <MobileQuickTile
              label={t('quickActions.finance')}
              icon={<Receipt aria-hidden />}
              onClick={() => navigate('/finance')}
              className="md:min-h-[5.5rem]"
            />
          ) : null}
        </div>
      </div>

      {/* Secondaire — uniquement s’il y a des données */}
      {showSecondary ? (
        <div className="hidden space-y-4 md:block">
          {showAttendanceChart || showAgenda ? (
            <div
              className={`grid gap-4 ${
                showAttendanceChart && showAgenda ? 'xl:grid-cols-[1.6fr_1fr]' : 'grid-cols-1'
              }`}
            >
              {showAttendanceChart ? (
                <AttendanceWeekChart
                  average={data.weekAverage}
                  data={data.weekAttendance}
                  empty={false}
                />
              ) : null}
              {showAgenda ? <TodayAgenda items={data.agenda} /> : null}
            </div>
          ) : null}
          {user?.institutionId ? (
            <ScheduleTab institutionId={user.institutionId} />
          ) : null}
          {showFinanceBlock ? (
            <div className={showAttendanceChart || showAgenda ? 'xl:max-w-md xl:ml-auto' : undefined}>
              <FinanceCollecte finance={data.finance} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
