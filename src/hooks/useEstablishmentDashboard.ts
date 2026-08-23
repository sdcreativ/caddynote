import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { useStrkUsers } from '@/hooks/useStrkUsers';
import { fetchStrkInstitutionById } from '@/services/strkInstitutionService';
import { fetchAbsencesByInstitution, type StrkAbsence } from '@/services/strkAbsenceService';
import { fetchInvoicesByInstitution, type StrkInvoice } from '@/services/strkFinanceService';
import { fetchSchedulesByInstitution } from '@/services/strkScheduleService';
import { apiClient } from '@/lib/apiClient';
import { OPS_FROZEN_FLAG } from '@/components/admin/tenantHealthFlags';

export type DashboardAlert = {
  id: string;
  studentName: string;
  classLabel: string;
  kind: 'absence' | 'lateness' | 'payment' | 'admission';
  label: string;
  href: string;
  createdAt: string;
};

export type AgendaItem = {
  id: string;
  time: string;
  title: string;
  place?: string;
};

export type WeekAttendancePoint = {
  day: string;
  rate: number;
};

export type FinanceSnapshot = {
  paidCents: number;
  pendingCents: number;
  overdueCents: number;
  currency: string;
  familiesUpToDate: number;
  collectedRatio: number;
};

export type TenantOpsStatus = {
  frozen: boolean;
  subscriptionStatus: string | null;
  isEmpty: boolean;
};

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const formatPerson = (u?: { name?: string; first_name?: string; lastName?: string; last_name?: string } | null) => {
  if (!u) return 'Élève';
  if ('name' in u && u.name) return u.name;
  return [u.first_name, u.last_name || (u as { lastName?: string }).lastName].filter(Boolean).join(' ') || 'Élève';
};

const OPEN_INVOICE_STATUSES = new Set([
  'issued',
  'open',
  'partial',
  'partially_paid',
  'overdue',
]);

export function useEstablishmentDashboard() {
  const { user } = useStrkAuth();
  const { users, loadUsersByInstitution } = useStrkUsers();
  const [institutionName, setInstitutionName] = useState('Établissement');
  const [frozen, setFrozen] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [absences, setAbsences] = useState<StrkAbsence[]>([]);
  const [invoices, setInvoices] = useState<StrkInvoice[]>([]);
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [genderHeadcount, setGenderHeadcount] = useState({ female: 0, male: 0, unknown: 0, total: 0 });
  const [pendingAdmissions, setPendingAdmissions] = useState<
    Array<{
      id: string;
      studentFirstName: string;
      studentLastName: string;
      contactEmail: string;
      submittedAt: string | null;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const institutionId = user?.institutionId;

  const reload = useCallback(async () => {
    if (!institutionId) {
      setLoading(false);
      return;
    }
    const reqId = ++requestIdRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const jsDow = new Date().getDay();

      const [inst, absenceList, invoiceList, todaySchedules, subRes, studentsRes, admissionsRes] =
        await Promise.all([
          fetchStrkInstitutionById(institutionId),
          fetchAbsencesByInstitution(institutionId),
          fetchInvoicesByInstitution(institutionId).catch(() => [] as StrkInvoice[]),
          fetchSchedulesByInstitution(institutionId, jsDow),
          apiClient
            .get<{ subscription: { status: string } | null }>('/subscriptions/current')
            .catch(() => ({ subscription: null })),
          apiClient
            .get<{ genderHeadcount?: { female: number; male: number; unknown: number; total: number } }>(
              '/students'
            )
            .catch(() => ({ genderHeadcount: undefined })),
          apiClient
            .get<{
              applications: Array<{
                id: string;
                studentFirstName: string;
                studentLastName: string;
                contactEmail: string;
                submittedAt: string | null;
              }>;
            }>(`/admissions?institutionId=${encodeURIComponent(institutionId)}&status=submitted`)
            .catch(() => ({ applications: [] })),
          loadUsersByInstitution(institutionId),
        ]);

      if (reqId !== requestIdRef.current) return;

      if (inst?.name) setInstitutionName(inst.name);
      const overrides = (inst?.featureOverrides as Record<string, boolean> | null) ?? {};
      setFrozen(overrides[OPS_FROZEN_FLAG] === true);
      setSubscriptionStatus(subRes.subscription?.status ?? null);
      setAbsences(absenceList);
      setInvoices(invoiceList);
      setPendingAdmissions(admissionsRes.applications ?? []);
      setGenderHeadcount(
        studentsRes.genderHeadcount ?? { female: 0, male: 0, unknown: 0, total: 0 }
      );

      const items: AgendaItem[] = todaySchedules
        .map((s) => ({
          id: s.id,
          time: String(s.start_time).slice(0, 5),
          title: (s.course as { name?: string } | undefined)?.name || 'Cours',
          place: s.room || (s.class as { name?: string } | undefined)?.name || undefined,
        }))
        .sort((a, b) => a.time.localeCompare(b.time));
      setAgenda(items.slice(0, 8));
    } catch (e) {
      if (reqId !== requestIdRef.current) return;
      setLoadError(e instanceof Error ? e.message : 'Chargement impossible');
    } finally {
      if (reqId === requestIdRef.current) setLoading(false);
    }
  }, [institutionId, loadUsersByInstitution]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const students = useMemo(() => users?.filter((u) => u.role === 'student') ?? [], [users]);
  const studentCount = students.length;

  const studentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of students) map.set(s.id, s.name || s.email || 'Élève');
    return map;
  }, [students]);

  const todayIso = new Date().toISOString().slice(0, 10);
  const todayAbsences = useMemo(
    () => absences.filter((a) => a.date.slice(0, 10) === todayIso),
    [absences, todayIso]
  );

  const attendanceToday = useMemo(() => {
    if (studentCount === 0) return { rate: null as number | null, delta: null as number | null };
    const absent = todayAbsences.filter((a) => a.type === 'absence').length;
    const rate = Math.max(0, Math.min(100, ((studentCount - absent) / studentCount) * 100));
    return { rate, delta: null };
  }, [studentCount, todayAbsences]);

  const weekAttendance: WeekAttendancePoint[] = useMemo(() => {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);

    return DAY_LABELS.map((day, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      const dayAbs = absences.filter((a) => a.date.slice(0, 10) === iso && a.type === 'absence').length;
      const rate =
        studentCount > 0
          ? Math.round(Math.max(0, Math.min(100, ((studentCount - dayAbs) / studentCount) * 1000)) / 10)
          : 0;
      return { day, rate: studentCount === 0 ? 0 : rate };
    });
  }, [absences, studentCount]);

  const weekAverage = useMemo(() => {
    if (studentCount === 0) return 0;
    const withData = weekAttendance.filter((p) => p.rate > 0 || absences.length > 0);
    if (withData.length === 0) return attendanceToday.rate ?? 0;
    return withData.reduce((s, p) => s + p.rate, 0) / withData.length;
  }, [weekAttendance, attendanceToday.rate, studentCount, absences.length]);

  const finance: FinanceSnapshot = useMemo(() => {
    let paid = 0;
    let pending = 0;
    let overdue = 0;
    let upToDate = 0;
    const currency = invoices[0]?.currency || 'XOF';
    const now = Date.now();
    for (const inv of invoices) {
      paid += inv.paid_cents || 0;
      const remaining = Math.max(0, (inv.total_cents || 0) - (inv.paid_cents || 0));
      if (remaining <= 0 || inv.status === 'paid') {
        upToDate += 1;
        continue;
      }
      const due = inv.due_date ? new Date(inv.due_date).getTime() : null;
      if (due && due < now) overdue += remaining;
      else pending += remaining;
    }
    const total = paid + pending + overdue;
    return {
      paidCents: paid,
      pendingCents: pending,
      overdueCents: overdue,
      currency,
      familiesUpToDate: upToDate,
      collectedRatio: total > 0 ? paid / total : 0,
    };
  }, [invoices]);

  const alerts: DashboardAlert[] = useMemo(() => {
    const fromAbsences: DashboardAlert[] = absences
      .filter((a) => {
        const status = (a as { justification_status?: string }).justification_status;
        return !a.justified || status === 'pending' || status === 'none' || status == null;
      })
      .slice(0, 8)
      .map((a) => ({
        id: a.id,
        studentName: studentNameById.get(a.student_id) || formatPerson(a.student),
        classLabel: (a as { class_name?: string }).class_name || 'Classe',
        kind: a.type === 'lateness' ? ('lateness' as const) : ('absence' as const),
        label: a.type === 'lateness' ? 'Retard' : 'Absence non justifiée',
        href: '/absences',
        createdAt: a.created_at || a.date,
      }));

    const fromPayments: DashboardAlert[] = invoices
      .filter((inv) => OPEN_INVOICE_STATUSES.has(inv.status))
      .slice(0, 4)
      .map((inv) => ({
        id: `inv-${inv.id}`,
        studentName: inv.student?.name || 'Famille',
        classLabel: '',
        kind: 'payment' as const,
        label: 'Paiement en attente',
        href: '/finance',
        createdAt: inv.issued_at,
      }));

    const fromAdmissions: DashboardAlert[] = pendingAdmissions.slice(0, 8).map((app) => ({
      id: `adm-${app.id}`,
      studentName: `${app.studentFirstName} ${app.studentLastName}`.trim() || 'Candidat',
      classLabel: app.contactEmail || '',
      kind: 'admission' as const,
      label: 'Préinscription à traiter',
      href: '/admissions/admin',
      createdAt: app.submittedAt || new Date().toISOString(),
    }));

    return [...fromAdmissions, ...fromAbsences, ...fromPayments]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 12);
  }, [absences, invoices, studentNameById, pendingAdmissions]);

  const priorityCount = alerts.filter(
    (a) => a.kind === 'absence' || a.kind === 'payment' || a.kind === 'admission'
  ).length;
  const admissionsPendingCount = pendingAdmissions.length;
  const isEmpty =
    studentCount === 0 &&
    absences.length === 0 &&
    invoices.length === 0 &&
    agenda.length === 0 &&
    admissionsPendingCount === 0;

  const tenantStatus: TenantOpsStatus = {
    frozen,
    subscriptionStatus,
    isEmpty,
  };

  return {
    loading,
    loadError,
    reload,
    institutionName,
    firstName: user?.name?.split(' ')[0] || 'Directeur',
    userName: user?.name || 'Utilisateur',
    userRoleLabel:
      user?.role === 'school_admin'
        ? 'Directrice'
        : user?.role === 'teacher'
          ? 'Enseignant'
          : 'Utilisateur',
    studentCount,
    genderHeadcount,
    attendanceToday,
    weekAttendance,
    weekAverage,
    finance,
    agenda,
    alerts,
    alertCount: alerts.length,
    priorityCount: Math.min(priorityCount, alerts.length),
    admissionsPendingCount,
    studentsDelta: 0,
    tenantStatus,
  };
}
