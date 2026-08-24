import { useStrkAuth } from '@/hooks/useStrkAuth';
import { useStrkInstitutions } from '@/hooks/useStrkInstitutions';
import { useStrkUsers } from '@/hooks/useStrkUsers';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import StatCard from '@/components/dashboard/StatCard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Users,
  Award,
  School,
  UserCheck,
  AlertCircle,
  FileText,
  Shield,
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { EstablishmentOverview } from '@/components/dashboard/establishment/EstablishmentOverview';
import TeacherDashboardHome from '@/components/dashboard/TeacherDashboardHome';
import ParentDashboardHome from '@/components/dashboard/ParentDashboardHome';
import StudentDashboardHome from '@/components/dashboard/StudentDashboardHome';
import SecretaryDashboardHome from '@/components/dashboard/SecretaryDashboardHome';
import SupervisorDashboardHome from '@/components/dashboard/SupervisorDashboardHome';
import { StrkAnalyticsService, type DashboardMetrics } from '@/services/strkAnalyticsService';
import { useGuardianChildren } from '@/hooks/useGuardianChildren';
import { fetchGradesByStudent } from '@/services/strkGradeService';
import { fetchAbsencesByStudent } from '@/services/strkAbsenceService';
import { fetchAssignmentsByStudent } from '@/services/strkAssignmentService';
import { fetchInvoicesByStudent, fetchInvoicesByInstitution } from '@/services/strkFinanceService';
import { roleLabel } from '@/lib/navConfig';
import { Button } from '@/components/ui/button';
import { trackProductEvent } from '@/lib/productTelemetry';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  summarizeOpenInvoices,
  countAbsencesSince,
  countOpenHomework,
  formatCentsFr,
} from '@/lib/dashboardKpis';

type LoadState = 'idle' | 'loading' | 'ready' | 'error' | 'empty';

const STAFF_ROLES = ['teacher', 'head_teacher', 'secretary', 'supervisor'] as const;

const Dashboard = () => {
  const { t } = useTranslation('dashboard');
  const { user } = useStrkAuth();
  const { institutions, loadInstitutions } = useStrkInstitutions();
  const { users, loadUsersByInstitution } = useStrkUsers();
  const navigate = useNavigate();
  const guardian = useGuardianChildren();

  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [metricsState, setMetricsState] = useState<LoadState>('idle');

  const [studentKpis, setStudentKpis] = useState<{
    grades: number;
    absences: number;
    homework: number;
  } | null>(null);
  const [studentState, setStudentState] = useState<LoadState>('idle');

  const [parentKpis, setParentKpis] = useState<{ invoicesOpen: number; unpaidCents: number } | null>(
    null
  );
  const [parentState, setParentState] = useState<LoadState>('idle');

  const [accountantKpis, setAccountantKpis] = useState<{
    invoicesOpen: number;
    unpaidCents: number;
  } | null>(null);
  const [accountantState, setAccountantState] = useState<LoadState>('idle');

  const totalInstitutions = institutions?.length || 0;
  const totalStudents = users?.filter((u) => u.role === 'student').length || 0;
  const totalTeachers = users?.filter((u) => u.role === 'teacher').length || 0;

  useEffect(() => {
    if (user?.id) {
      trackProductEvent('dashboard', 'Ouverture tableau de bord', { role: user.role });
    }
  }, [user?.id, user?.role]);

  useEffect(() => {
    const loadDashboardData = async () => {
      if (!user) return;
      if (user.role === 'admin') {
        setMetricsState('loading');
        try {
          await loadInstitutions();
          const m = await StrkAnalyticsService.getDashboardMetrics();
          setMetrics(m);
          setMetricsState('ready');
        } catch {
          setMetrics(null);
          setMetricsState('error');
        }
        return;
      }
      if (user.institutionId) {
        await loadUsersByInstitution(user.institutionId);
        if ((STAFF_ROLES as readonly string[]).includes(user.role)) {
          setMetricsState('loading');
          try {
            const m = await StrkAnalyticsService.getDashboardMetrics(user.institutionId);
            setMetrics(m);
            setMetricsState('ready');
          } catch {
            setMetrics(null);
            setMetricsState('error');
          }
        }
      }
    };
    void loadDashboardData();
  }, [user, loadInstitutions, loadUsersByInstitution]);

  useEffect(() => {
    if (user?.role !== 'student' || !user.id) return;
    setStudentState('loading');
    void (async () => {
      try {
        const [grades, absences, assignments] = await Promise.all([
          fetchGradesByStudent(user.id),
          fetchAbsencesByStudent(user.id),
          fetchAssignmentsByStudent(user.id),
        ]);
        const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
        setStudentKpis({
          grades: grades.length,
          absences: countAbsencesSince(absences, since),
          homework: countOpenHomework(assignments),
        });
        setStudentState(
          grades.length === 0 && absences.length === 0 && assignments.length === 0
            ? 'empty'
            : 'ready'
        );
      } catch {
        setStudentKpis(null);
        setStudentState('error');
      }
    })();
  }, [user]);

  useEffect(() => {
    if (user?.role !== 'accountant' || !user.institutionId) return;
    setAccountantState('loading');
    void (async () => {
      try {
        const invoices = await fetchInvoicesByInstitution(user.institutionId!);
        const summary = summarizeOpenInvoices(invoices);
        setAccountantKpis(summary);
        setAccountantState(invoices.length === 0 ? 'empty' : 'ready');
      } catch {
        setAccountantKpis(null);
        setAccountantState('error');
      }
    })();
  }, [user?.role, user?.institutionId]);

  useEffect(() => {
    if (user?.role !== 'parent') return;
    if (guardian.isLoading) {
      setParentState('loading');
      return;
    }
    if (guardian.error) {
      setParentKpis(null);
      setParentState('error');
      return;
    }
    if (guardian.children.length === 0) {
      setParentKpis(null);
      setParentState('empty');
      return;
    }
    setParentState('loading');
    void (async () => {
      try {
        const billable = guardian.children.filter((c) => c.canViewBilling);
        if (billable.length === 0) {
          setParentKpis({ invoicesOpen: 0, unpaidCents: 0 });
          setParentState('ready');
          return;
        }
        const lists = await Promise.all(billable.map((c) => fetchInvoicesByStudent(c.studentId)));
        const all = lists.flat();
        const summary = summarizeOpenInvoices(all);
        setParentKpis(summary);
        setParentState('ready');
      } catch {
        setParentKpis(null);
        setParentState('error');
      }
    })();
  }, [
    user?.role,
    guardian.isLoading,
    guardian.error,
    guardian.children,
  ]);

  if (user?.role === 'school_admin') {
    return <EstablishmentOverview />;
  }

  if (user?.role === 'teacher' || user?.role === 'head_teacher') {
    return (
      <TeacherDashboardHome
        userName={user.name?.split(' ')[0] ?? ''}
        role={user.role}
        metrics={metrics}
        metricsState={metricsState}
        totalStudents={totalStudents}
      />
    );
  }

  if (user?.role === 'parent') {
    return (
      <ParentDashboardHome
        userName={user.name?.split(' ')[0] ?? ''}
        childrenCount={guardian.children.length}
        invoicesOpen={parentKpis?.invoicesOpen ?? null}
        unpaidCents={parentKpis?.unpaidCents ?? null}
        state={guardian.isLoading ? 'loading' : parentState}
        loadError={guardian.error}
      />
    );
  }

  if (user?.role === 'student') {
    return (
      <StudentDashboardHome
        userName={user.name?.split(' ')[0] ?? ''}
        grades={studentKpis?.grades ?? null}
        absences={studentKpis?.absences ?? null}
        homework={studentKpis?.homework ?? null}
        state={studentState}
      />
    );
  }

  if (user?.role === 'secretary') {
    return (
      <SecretaryDashboardHome
        userName={user.name?.split(' ')[0] ?? ''}
        metrics={metrics}
        metricsState={metricsState}
        totalStudents={totalStudents}
      />
    );
  }

  if (user?.role === 'supervisor') {
    return (
      <SupervisorDashboardHome
        userName={user.name?.split(' ')[0] ?? ''}
        metrics={metrics}
        metricsState={metricsState}
        totalStudents={totalStudents}
      />
    );
  }

  const kpiValue = (state: LoadState, value: string | number | null | undefined, emptyLabel = '0') => {
    if (state === 'loading' || state === 'idle') return '…';
    if (state === 'error') return '—';
    if (value == null) return emptyLabel;
    return value;
  };

  const roleHint =
    user?.role === 'accountant'
      ? t('roleHints.accountant')
      : user?.role === 'admin'
        ? t('roleHints.admin')
        : (STAFF_ROLES as readonly string[]).includes(user?.role || '')
          ? t('roleHints.staff')
          : null;

  return (
    <div className="space-y-6 py-6 animate-fade-in">
      {user?.role === 'admin' && (
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">{t('spaces.businessTitle')}</p>
            <p className="text-sm text-slate-500">{t('spaces.businessHint')}</p>
          </div>
          <Button asChild variant="outline" className="shrink-0 rounded-full border-slate-300">
            <Link to="/super-admin">
              <Shield className="mr-2 h-4 w-4" aria-hidden />
              {t('spaces.toPlatformConsole')}
            </Link>
          </Button>
        </div>
      )}

      <div className="flex flex-col space-y-2 md:flex-row md:items-center md:justify-between md:space-y-0">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {t('hello', { name: user?.name?.split(' ')[0] ?? '' })}
          </h1>
          <p className="text-slate-500">
            {roleLabel(user?.role)} •{' '}
            {new Date().toLocaleDateString('fr-FR', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
          {roleHint ? <p className="mt-1 text-sm text-slate-500">{roleHint}</p> : null}
        </div>
      </div>

      {user?.role === 'accountant' && accountantState === 'error' && (
        <EmptyState title={t('empty.loadErrorTitle')} description={t('empty.loadErrorBody')} />
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {user?.role === 'admin' && (
          <StatCard
            title={t('stats.institutions')}
            value={kpiValue(metricsState, metrics?.totalInstitutions ?? totalInstitutions)}
            description={metricsState === 'error' ? t('empty.metricsUnavailable') : undefined}
            icon={<School className="h-5 w-5" />}
            color="blue"
          />
        )}

        {user?.role === 'admin' && (
          <>
            <StatCard
              title={t('stats.students')}
              value={kpiValue(metricsState, metrics?.students ?? totalStudents)}
              description={metricsState === 'error' ? t('empty.metricsUnavailable') : undefined}
              icon={<Users className="h-5 w-5" />}
            />
            <StatCard
              title={t('stats.attendance')}
              value={
                metricsState === 'loading' || metricsState === 'idle'
                  ? '…'
                  : metrics?.attendanceRate == null
                    ? '—'
                    : `${metrics.attendanceRate.toFixed(1)} %`
              }
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
          </>
        )}

        {user?.role === 'accountant' && (
          <>
            <StatCard
              title={t('stats.openInvoices')}
              value={kpiValue(accountantState, accountantKpis?.invoicesOpen)}
              description={accountantState === 'empty' ? t('empty.accountantNoInvoices') : undefined}
              icon={<FileText className="h-5 w-5" />}
            />
            <StatCard
              title={t('stats.remainingToCollect')}
              value={
                accountantState === 'loading' || accountantState === 'idle'
                  ? '…'
                  : accountantKpis
                    ? formatCentsFr(accountantKpis.unpaidCents)
                    : '—'
              }
              icon={<Award className="h-5 w-5" />}
              color="purple"
            />
          </>
        )}

        {user?.role === 'admin' && (
          <StatCard
            title={t('stats.teachers')}
            value={kpiValue(metricsState, metrics?.teachers ?? totalTeachers)}
            icon={<Award className="h-5 w-5" />}
            color="purple"
          />
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('quickActions.title')}</CardTitle>
          <CardDescription>{t('quickActions.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {user?.role === 'admin' && (
              <button
                type="button"
                onClick={() => navigate('/institutions')}
                className="rounded-lg border p-4 text-center transition-colors hover:bg-gray-50"
              >
                <School className="mx-auto mb-2 h-6 w-6 text-blue-600" />
                <span className="text-sm font-medium">{t('quickActions.institutions')}</span>
              </button>
            )}
            {user?.role === 'accountant' && (
              <button
                type="button"
                onClick={() => navigate('/finance')}
                className="rounded-lg border p-4 text-center transition-colors hover:bg-gray-50"
              >
                <FileText className="mx-auto mb-2 h-6 w-6 text-blue-600" />
                <span className="text-sm font-medium">{t('quickActions.finance')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('/messages')}
              className="rounded-lg border p-4 text-center transition-colors hover:bg-gray-50"
            >
              <FileText className="mx-auto mb-2 h-6 w-6 text-blue-600" />
              <span className="text-sm font-medium">{t('quickActions.messages')}</span>
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
