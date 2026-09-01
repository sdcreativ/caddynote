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
import { fetchAbsencesByStudent, type StrkAbsence } from '@/services/strkAbsenceService';
import { fetchAssignmentsByStudent } from '@/services/strkAssignmentService';
import { fetchInvoicesByStudent, fetchInvoicesByInstitution } from '@/services/strkFinanceService';
import { fetchReceivedMessages } from '@/services/strkMessageService';
import { apiClient } from '@/lib/apiClient';
import { trackProductEvent } from '@/lib/productTelemetry';
import {
  summarizeOpenInvoices,
  countAbsencesSince,
  countOpenHomework,
} from '@/lib/dashboardKpis';

type LoadState = 'idle' | 'loading' | 'ready' | 'error' | 'empty';

type StudentDetail = {
  id: string;
  class?: { id: string; name: string } | null;
  profile?: { firstName: string | null; lastName: string | null; profileImage?: string | null };
};

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
    unreadMessages: number;
  } | null>(null);
  const [studentAbsences, setStudentAbsences] = useState<StrkAbsence[]>([]);
  const [studentProfile, setStudentProfile] = useState<{
    firstName: string;
    lastName: string;
    className: string | null;
    profileImage: string | null | undefined;
  } | null>(null);
  const [studentState, setStudentState] = useState<LoadState>('idle');

  const [parentKpis, setParentKpis] = useState<{
    invoicesOpen: number;
    unpaidCents: number;
    unjustifiedAbsences: number;
  } | null>(null);
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
        const [grades, absences, assignments, received, detail] = await Promise.all([
          fetchGradesByStudent(user.id),
          fetchAbsencesByStudent(user.id),
          fetchAssignmentsByStudent(user.id),
          fetchReceivedMessages(user.id).catch(() => []),
          apiClient
            .get<{ student: StudentDetail }>(`/students/${user.id}`)
            .then((r) => r.student)
            .catch(() => null),
        ]);
        const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const unreadMessages = received.filter((m) => !m.read_at).length;
        setStudentAbsences(absences);
        setStudentKpis({
          grades: grades.length,
          absences: countAbsencesSince(absences, since),
          homework: countOpenHomework(assignments),
          unreadMessages,
        });
        const nameParts = (user.name || '').split(' ');
        setStudentProfile({
          firstName: detail?.profile?.firstName || nameParts[0] || '',
          lastName: detail?.profile?.lastName ?? nameParts.slice(1).join(' '),
          className: detail?.class?.name ?? null,
          profileImage: detail?.profile?.profileImage ?? user.profileImage,
        });
        setStudentState(
          grades.length === 0 &&
            absences.length === 0 &&
            assignments.length === 0 &&
            unreadMessages === 0
            ? 'empty'
            : 'ready'
        );
      } catch {
        setStudentKpis(null);
        setStudentAbsences([]);
        setStudentProfile(null);
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
        const attendanceKids = guardian.children.filter((c) => c.canViewAttendance);

        const [invoiceLists, absenceLists] = await Promise.all([
          billable.length > 0
            ? Promise.all(billable.map((c) => fetchInvoicesByStudent(c.studentId)))
            : Promise.resolve([] as Awaited<ReturnType<typeof fetchInvoicesByStudent>>[]),
          attendanceKids.length > 0
            ? Promise.all(attendanceKids.map((c) => fetchAbsencesByStudent(c.studentId)))
            : Promise.resolve([] as Awaited<ReturnType<typeof fetchAbsencesByStudent>>[]),
        ]);

        const summary = summarizeOpenInvoices(invoiceLists.flat());
        const unjustifiedAbsences = absenceLists
          .flat()
          .filter(
            (a) =>
              a.type === 'absence' &&
              (a.justification_status === 'none' || a.justification_status === 'rejected')
          ).length;

        setParentKpis({ ...summary, unjustifiedAbsences });
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
        institutionId={user.institutionId}
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
    const selected = guardian.selectedChild;
    const selectedChildName = selected
      ? [selected.firstName, selected.lastName].filter(Boolean).join(' ')
      : null;
    return (
      <ParentDashboardHome
        userName={user.name?.split(' ')[0] ?? ''}
        childrenCount={guardian.children.length}
        invoicesOpen={parentKpis?.invoicesOpen ?? null}
        unpaidCents={parentKpis?.unpaidCents ?? null}
        unjustifiedAbsences={parentKpis?.unjustifiedAbsences ?? null}
        selectedChildName={selectedChildName}
        canViewAttendance={Boolean(selected?.canViewAttendance)}
        canViewGrades={Boolean(selected?.canViewGrades)}
        state={guardian.isLoading ? 'loading' : parentState}
        loadError={guardian.error}
      />
    );
  }

  // Élève : Accueil = Bonjour + photo/présence + À traiter (distinct du Suivi).
  if (user?.role === 'student') {
    return (
      <StudentDashboardHome
        userName={user.name?.split(' ')[0] ?? ''}
        firstName={studentProfile?.firstName}
        lastName={studentProfile?.lastName}
        className={studentProfile?.className}
        profileImage={studentProfile?.profileImage}
        absencesToday={studentAbsences}
        absencesLoading={studentState === 'loading' || studentState === 'idle'}
        grades={studentKpis?.grades ?? null}
        absences={studentKpis?.absences ?? null}
        homework={studentKpis?.homework ?? null}
        unreadMessages={studentKpis?.unreadMessages ?? null}
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
