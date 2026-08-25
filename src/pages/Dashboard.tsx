import { useStrkAuth } from '@/hooks/useStrkAuth';
import { useStrkInstitutions } from '@/hooks/useStrkInstitutions';
import { useStrkUsers } from '@/hooks/useStrkUsers';
import { useEffect, useState } from 'react';
import { EstablishmentOverview } from '@/components/dashboard/establishment/EstablishmentOverview';
import TeacherDashboardHome from '@/components/dashboard/TeacherDashboardHome';
import ParentDashboardHome from '@/components/dashboard/ParentDashboardHome';
import StudentDashboardHome from '@/components/dashboard/StudentDashboardHome';
import SecretaryDashboardHome from '@/components/dashboard/SecretaryDashboardHome';
import SupervisorDashboardHome from '@/components/dashboard/SupervisorDashboardHome';
import AdminDashboardHome from '@/components/dashboard/AdminDashboardHome';
import AccountantDashboardHome from '@/components/dashboard/AccountantDashboardHome';
import { StrkAnalyticsService, type DashboardMetrics } from '@/services/strkAnalyticsService';
import { useGuardianChildren } from '@/hooks/useGuardianChildren';
import { fetchGradesByStudent } from '@/services/strkGradeService';
import { fetchAbsencesByStudent } from '@/services/strkAbsenceService';
import { fetchAssignmentsByStudent } from '@/services/strkAssignmentService';
import { fetchInvoicesByStudent, fetchInvoicesByInstitution } from '@/services/strkFinanceService';
import { trackProductEvent } from '@/lib/productTelemetry';
import {
  summarizeOpenInvoices,
  countAbsencesSince,
  countOpenHomework,
} from '@/lib/dashboardKpis';

type LoadState = 'idle' | 'loading' | 'ready' | 'error' | 'empty';

const STAFF_ROLES = ['teacher', 'head_teacher', 'secretary', 'supervisor'] as const;

const Dashboard = () => {
  const { user } = useStrkAuth();
  const { institutions, loadInstitutions } = useStrkInstitutions();
  const { users, loadUsersByInstitution } = useStrkUsers();
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
  }, [user?.role, guardian.isLoading, guardian.error, guardian.children]);

  if (user?.role === 'school_admin') {
    return <EstablishmentOverview />;
  }

  if (user?.role === 'admin') {
    return (
      <AdminDashboardHome
        userName={user.name?.split(' ')[0] ?? ''}
        metrics={metrics}
        metricsState={metricsState}
        totalInstitutions={totalInstitutions}
        totalStudents={totalStudents}
        totalTeachers={totalTeachers}
      />
    );
  }

  if (user?.role === 'accountant') {
    return (
      <AccountantDashboardHome
        userName={user.name?.split(' ')[0] ?? ''}
        invoicesOpen={accountantKpis?.invoicesOpen ?? null}
        unpaidCents={accountantKpis?.unpaidCents ?? null}
        state={accountantState}
      />
    );
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

  return null;
};

export default Dashboard;
