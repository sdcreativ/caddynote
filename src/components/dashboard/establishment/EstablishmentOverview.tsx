import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Users, UserCheck, Wallet, AlertTriangle, Snowflake, CreditCard, School } from 'lucide-react';
import { useEstablishmentDashboardContext } from '@/hooks/useEstablishmentDashboardContext';
import { KpiCard } from './KpiCard';
import { AttendanceWeekChart } from './AttendanceWeekChart';
import { TodayAgenda } from './TodayAgenda';
import { PriorityAlerts } from './PriorityAlerts';
import { FinanceCollecte } from './FinanceCollecte';
import { SetupChecklist } from './SetupChecklist';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { hasAnyRole, DIRECTION_ROLES } from '@/lib/roles';
import { useStrkAuth } from '@/hooks/useStrkAuth';

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

  return (
    <div className="space-y-8 animate-fade-in">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{dateLabel}</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          {t('overview.welcomeBack', { name: data.firstName })}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{data.institutionName}</p>
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

      {data.admissionsPendingCount > 0 && (
        <Alert>
          <School className="h-4 w-4" />
          <AlertTitle>{t('overview.admissionsPendingTitle')}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{t('overview.admissionsPendingBody', { count: data.admissionsPendingCount })}</span>
            <Button asChild size="sm">
              <Link to="/admissions/admin">{t('overview.openAdmissions')}</Link>
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
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
        />
        <KpiCard
          title={t('overview.paymentsReceived')}
          value={formatMoneyShort(data.finance.paidCents, data.finance.currency)}
          hint={
            data.finance.paidCents + data.finance.pendingCents + data.finance.overdueCents === 0
              ? t('overview.noFinanceYet')
              : t('overview.thisMonth')
          }
          hintTone="neutral"
          icon={<Wallet className="h-5 w-5" />}
          iconClassName="bg-violet-50 text-violet-600"
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
        />
        <KpiCard
          title={t('overview.alertsToHandle')}
          value={String(data.alertCount)}
          hint={t('overview.priorityCount', { count: data.priorityCount })}
          hintTone={data.alertCount > 0 ? 'alert' : 'neutral'}
          icon={<AlertTriangle className="h-5 w-5" />}
          iconClassName="bg-rose-50 text-rose-600"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
        <AttendanceWeekChart
          average={data.weekAverage}
          data={data.weekAttendance}
          empty={data.studentCount === 0}
        />
        <TodayAgenda items={data.agenda} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
        <PriorityAlerts alerts={data.alerts} total={data.alertCount} />
        <FinanceCollecte finance={data.finance} />
      </div>
    </div>
  );
}
