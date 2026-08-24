import { apiClient } from "@/lib/apiClient";

/**
 * FIN-002/003 — le module finance (frais, factures, remises, paiements
 * virement/espèces) était entièrement construit et testé côté serveur mais
 * n'avait **aucune interface** : `POST /finance/invoices` n'était appelé
 * nulle part dans le frontend. Ce service relie enfin l'écran à l'API.
 */

export interface StrkFeeItem {
  id: string;
  institution_id: string;
  name: string;
  description?: string;
  amount_cents: number;
  currency: string;
  academic_year?: string;
  is_active: boolean;
}

export interface StrkInvoiceLine {
  id: string;
  fee_item_id?: string;
  label: string;
  amount_cents: number;
  quantity: number;
  line_type: 'fee' | 'discount';
  fee_type_code?: string;
  fee_origin?: 'state' | 'institution' | string;
}

export interface StrkPayment {
  id: string;
  amount_cents: number;
  method: string;
  status: string;
  paid_at?: string;
  receipt_number?: string;
}

export interface StrkInvoice {
  id: string;
  invoice_number: string;
  status: string;
  total_cents: number;
  paid_cents: number;
  currency: string;
  due_date?: string;
  issued_at: string;
  fee_schedule_id?: string;
  student: { id: string; name: string };
  lines: StrkInvoiceLine[];
  payments: StrkPayment[];
}

interface ApiFeeItem {
  id: string;
  institutionId: string;
  name: string;
  description?: string | null;
  amountCents: number;
  currency: string;
  academicYear?: string | null;
  isActive: boolean;
}

const mapFeeItem = (f: ApiFeeItem): StrkFeeItem => ({
  id: f.id,
  institution_id: f.institutionId,
  name: f.name,
  description: f.description || undefined,
  amount_cents: f.amountCents,
  currency: f.currency,
  academic_year: f.academicYear || undefined,
  is_active: f.isActive,
});

interface ApiInvoiceLine {
  id: string;
  feeItemId?: string | null;
  label: string;
  amountCents: number;
  quantity: number;
  lineType: 'fee' | 'discount';
  feeTypeCode?: string | null;
  feeOrigin?: string | null;
}

interface ApiPayment {
  id: string;
  amountCents: number;
  method: string;
  status: string;
  paidAt?: string | null;
  receiptNumber?: string | null;
}

interface ApiInvoice {
  id: string;
  invoiceNumber: string;
  status: string;
  totalCents: number;
  paidCents: number;
  currency: string;
  dueDate?: string | null;
  issuedAt: string;
  feeScheduleId?: string | null;
  student: { id: string; profile?: { firstName: string | null; lastName: string | null } | null } | null;
  lines: ApiInvoiceLine[];
  payments: ApiPayment[];
}

const mapInvoice = (i: ApiInvoice): StrkInvoice => ({
  id: i.id,
  invoice_number: i.invoiceNumber,
  status: i.status,
  total_cents: i.totalCents,
  paid_cents: i.paidCents,
  currency: i.currency,
  due_date: i.dueDate || undefined,
  issued_at: i.issuedAt,
  fee_schedule_id: i.feeScheduleId || undefined,
  student: {
    id: i.student?.id || '',
    name: [i.student?.profile?.firstName, i.student?.profile?.lastName].filter(Boolean).join(' ') || 'Élève',
  },
  lines: i.lines.map((l) => ({
    id: l.id,
    fee_item_id: l.feeItemId || undefined,
    label: l.label,
    amount_cents: l.amountCents,
    quantity: l.quantity,
    line_type: l.lineType,
    fee_type_code: l.feeTypeCode || undefined,
    fee_origin: l.feeOrigin || undefined,
  })),
  payments: i.payments.map((p) => ({
    id: p.id,
    amount_cents: p.amountCents,
    method: p.method,
    status: p.status,
    paid_at: p.paidAt || undefined,
    receipt_number: p.receiptNumber || undefined,
  })),
});

export const fetchFeeItems = async (institutionId: string): Promise<StrkFeeItem[]> => {
  try {
    const { feeItems } = await apiClient.get<{ feeItems: ApiFeeItem[] }>(
      `/finance/fee-items?institutionId=${encodeURIComponent(institutionId)}`
    );
    return feeItems.map(mapFeeItem);
  } catch (error) {
    console.error('Error in fetchFeeItems:', error);
    return [];
  }
};

export const createFeeItem = async (data: {
  name: string;
  description?: string;
  amount_cents: number;
  currency?: string;
}): Promise<StrkFeeItem | null> => {
  try {
    const { feeItem } = await apiClient.post<{ feeItem: ApiFeeItem }>('/finance/fee-items', {
      name: data.name,
      description: data.description,
      amountCents: data.amount_cents,
      currency: data.currency,
    });
    return mapFeeItem(feeItem);
  } catch (error) {
    console.error('Error in createFeeItem:', error);
    return null;
  }
};

export const fetchInvoicesByInstitution = async (institutionId: string): Promise<StrkInvoice[]> => {
  try {
    const { invoices } = await apiClient.get<{ invoices: ApiInvoice[] }>(
      `/finance/invoices?institutionId=${encodeURIComponent(institutionId)}`
    );
    return invoices.map(mapInvoice);
  } catch (error) {
    console.error('Error in fetchInvoicesByInstitution:', error);
    return [];
  }
};

/** Factures d'un élève — accessible au personnel et aux parents avec canViewBilling. */
export const fetchInvoicesByStudent = async (studentId: string): Promise<StrkInvoice[]> => {
  try {
    const { invoices } = await apiClient.get<{ invoices: ApiInvoice[] }>(
      `/finance/invoices?studentId=${encodeURIComponent(studentId)}`
    );
    return invoices.map(mapInvoice);
  } catch (error) {
    console.error('Error in fetchInvoicesByStudent:', error);
    return [];
  }
};

export interface InvoiceLineInput {
  fee_item_id?: string;
  label?: string;
  amount_cents?: number;
  quantity?: number;
  line_type?: 'fee' | 'discount';
}

export const createInvoice = async (data: {
  student_id: string;
  due_date?: string;
  currency?: string;
  lines: InvoiceLineInput[];
}): Promise<StrkInvoice | null> => {
  try {
    const { invoice } = await apiClient.post<{ invoice: ApiInvoice }>('/finance/invoices', {
      studentId: data.student_id,
      dueDate: data.due_date,
      currency: data.currency,
      lines: data.lines.map((l) => ({
        feeItemId: l.fee_item_id,
        label: l.label,
        amountCents: l.amount_cents,
        quantity: l.quantity ?? 1,
        lineType: l.line_type ?? 'fee',
      })),
    });
    return mapInvoice(invoice);
  } catch (error) {
    console.error('Error in createInvoice:', error);
    return null;
  }
};

export const recordManualPayment = async (
  invoiceId: string,
  amountCents: number,
  method: 'cash' | 'bank_transfer'
): Promise<boolean> => {
  try {
    await apiClient.post(`/finance/invoices/${invoiceId}/payments/manual`, { amountCents, method });
    return true;
  } catch (error) {
    console.error('Error in recordManualPayment:', error);
    return false;
  }
};

/**
 * FIN-003 : Mobile Money/carte — redirige vers le fournisseur (CinetPay/
 * Stripe). Lève une erreur explicite (message serveur, ex. « pas encore
 * configuré sur cette instance ») si le fournisseur n'est pas configuré
 * (501) — l'appelant l'affiche telle quelle plutôt qu'un message générique.
 */
export const initiateCinetPayPayment = async (invoiceId: string): Promise<string> => {
  const { paymentUrl } = await apiClient.post<{ paymentUrl: string }>(`/finance/invoices/${invoiceId}/payments/cinetpay/initiate`, {});
  return paymentUrl;
};

export const initiateStripePayment = async (invoiceId: string): Promise<string> => {
  const { url } = await apiClient.post<{ url: string }>(`/finance/invoices/${invoiceId}/payments/stripe/initiate`, {});
  return url;
};

/** FIN-002 : pénalité de retard de paiement — désactivée tant que
 * `lateFeeCents` n'est pas explicitement configuré (`null` par défaut). */
export const fetchLateFeeSettings = async (
  institutionId: string
): Promise<{ late_fee_cents: number | null; late_fee_grace_days: number }> => {
  const { institution } = await apiClient.get<{ institution: { lateFeeCents: number | null; lateFeeGraceDays: number } }>(
    `/institutions/${institutionId}`
  );
  return { late_fee_cents: institution.lateFeeCents, late_fee_grace_days: institution.lateFeeGraceDays };
};

export const updateLateFeeSettings = async (
  institutionId: string,
  data: { late_fee_cents: number | null; late_fee_grace_days?: number }
): Promise<boolean> => {
  try {
    await apiClient.patch(`/institutions/${institutionId}`, {
      lateFeeCents: data.late_fee_cents,
      lateFeeGraceDays: data.late_fee_grace_days,
    });
    return true;
  } catch (error) {
    console.error('Error in updateLateFeeSettings:', error);
    return false;
  }
};

export const cancelInvoice = async (invoiceId: string): Promise<boolean> => {
  try {
    await apiClient.patch(`/finance/invoices/${invoiceId}/cancel`);
    return true;
  } catch (error) {
    console.error('Error in cancelInvoice:', error);
    return false;
  }
};

export interface StrkPaymentPlan {
  id: string;
  label: string;
  studentId: string;
  totalCents: number;
  currency: string;
  academicYear?: string | null;
  status: string;
  invoices: { id: string; invoiceNumber: string; totalCents: number; paidCents: number; dueDate?: string | null; installmentIndex?: number | null; status: string }[];
}

export const fetchPaymentPlans = async (): Promise<StrkPaymentPlan[]> => {
  const { plans } = await apiClient.get<{ plans: StrkPaymentPlan[] }>('/finance/payment-plans');
  return plans;
};

export const createPaymentPlan = async (data: {
  studentId: string;
  label: string;
  currency?: string;
  academicYear?: string;
  installments: { dueDate: string; amountCents: number; label?: string }[];
}): Promise<StrkPaymentPlan | null> => {
  try {
    const { plan } = await apiClient.post<{ plan: StrkPaymentPlan }>('/finance/payment-plans', data);
    return plan;
  } catch (error) {
    console.error('Error in createPaymentPlan:', error);
    return null;
  }
};

export const cancelPaymentPlan = async (id: string): Promise<boolean> => {
  try {
    await apiClient.patch(`/finance/payment-plans/${id}/cancel`);
    return true;
  } catch {
    return false;
  }
};

// --- Grille financière CI (Lots 1–4) ---------------------------------------

export interface StrkFeeType {
  id: string;
  institutionId: string | null;
  code: string;
  label: string;
  category: string;
  frequency: string;
  isActive: boolean;
  sortOrder: number;
}

export interface StrkFeeScheduleItem {
  id: string;
  feeTypeCode: string;
  cycleCode?: string | null;
  gradeLevelId?: string | null;
  feeOrigin: string;
  amountCents: number;
  currency: string;
  isMandatory: boolean;
  isDiscountable: boolean;
  frequency: string;
  sortOrder: number;
}

export interface StrkFeeSchedule {
  id: string;
  institutionId: string;
  academicYear: string;
  name: string;
  currency: string;
  version: number;
  status: string;
  effectiveFrom?: string | null;
  validatedAt?: string | null;
  publishedAt?: string | null;
  items: StrkFeeScheduleItem[];
}

export interface FeeScheduleItemInput {
  feeTypeCode: string;
  cycleCode?: string | null;
  feeOrigin?: 'state' | 'institution';
  amountCents: number;
  currency?: string;
  isMandatory?: boolean;
  isDiscountable?: boolean;
  frequency?: string;
}

export interface StrkFeePlanTemplate {
  id: string;
  name: string;
  currency: string;
  feeScheduleId?: string | null;
  isActive: boolean;
  steps: { id: string; label: string; percent: number | null; dueOffsetDays?: number | null; sortOrder: number }[];
}

export interface StrkNationalFeeVersion {
  id: string;
  countryCode: string;
  academicYear: string;
  currency: string;
  version: number;
  status: string;
  managedBy: string;
  effectiveFrom: string;
  source?: string | null;
  rates: {
    id: string;
    cycleCode: string;
    fundingSector: string;
    feeTypeCode: string;
    amountCents: number;
    currency: string;
  }[];
}

export const fetchFeeTypes = async (): Promise<StrkFeeType[]> => {
  const { feeTypes } = await apiClient.get<{ feeTypes: StrkFeeType[] }>('/finance/fee-types');
  return feeTypes;
};

export const createCustomFeeType = async (data: {
  code: string;
  label: string;
  category: string;
  frequency?: string;
}): Promise<StrkFeeType> => {
  const { feeType } = await apiClient.post<{ feeType: StrkFeeType }>('/finance/fee-types', data);
  return feeType;
};

export const fetchNationalFees = async (
  academicYear: string,
  countryCode = 'CI'
): Promise<StrkNationalFeeVersion> => {
  const { version } = await apiClient.get<{ version: StrkNationalFeeVersion }>(
    `/finance/national-fees?countryCode=${encodeURIComponent(countryCode)}&academicYear=${encodeURIComponent(academicYear)}`
  );
  return version;
};

export const fetchFeeSchedules = async (params?: {
  status?: string;
  academicYear?: string;
}): Promise<StrkFeeSchedule[]> => {
  const q = new URLSearchParams();
  if (params?.status) q.set('status', params.status);
  if (params?.academicYear) q.set('academicYear', params.academicYear);
  const qs = q.toString();
  const { schedules } = await apiClient.get<{ schedules: StrkFeeSchedule[] }>(
    `/finance/fee-schedules${qs ? `?${qs}` : ''}`
  );
  return schedules;
};

export const createFeeSchedule = async (data: {
  academicYear: string;
  name: string;
  currency?: string;
  items?: FeeScheduleItemInput[];
}): Promise<StrkFeeSchedule> => {
  const { schedule } = await apiClient.post<{ schedule: StrkFeeSchedule }>('/finance/fee-schedules', data);
  return schedule;
};

export const replaceFeeScheduleItems = async (
  scheduleId: string,
  items: FeeScheduleItemInput[]
): Promise<StrkFeeSchedule> => {
  const { schedule } = await apiClient.put<{ schedule: StrkFeeSchedule }>(
    `/finance/fee-schedules/${scheduleId}/items`,
    { items }
  );
  return schedule;
};

export const validateFeeSchedule = async (scheduleId: string): Promise<StrkFeeSchedule> => {
  const { schedule } = await apiClient.post<{ schedule: StrkFeeSchedule }>(
    `/finance/fee-schedules/${scheduleId}/validate`,
    {}
  );
  return schedule;
};

export const publishFeeSchedule = async (
  scheduleId: string,
  idempotencyKey?: string
): Promise<StrkFeeSchedule> => {
  const { schedule } = await apiClient.post<{ schedule: StrkFeeSchedule }>(
    `/finance/fee-schedules/${scheduleId}/publish`,
    {},
    idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : undefined
  );
  return schedule;
};

export const archiveFeeSchedule = async (scheduleId: string): Promise<StrkFeeSchedule> => {
  const { schedule } = await apiClient.post<{ schedule: StrkFeeSchedule }>(
    `/finance/fee-schedules/${scheduleId}/archive`,
    {}
  );
  return schedule;
};

export const reviseFeeSchedule = async (scheduleId: string): Promise<StrkFeeSchedule> => {
  const { schedule } = await apiClient.post<{ schedule: StrkFeeSchedule }>(
    `/finance/fee-schedules/${scheduleId}/revise`,
    {}
  );
  return schedule;
};

export const generateInvoiceFromSchedule = async (
  scheduleId: string,
  data: {
    studentId: string;
    cycleCode?: string;
    optionalFeeTypeCodes?: string[];
    includeNationalRegistration?: boolean;
    fundingSector?: 'public' | 'private' | 'mixed';
  },
  idempotencyKey?: string
): Promise<StrkInvoice> => {
  const { invoice } = await apiClient.post<{ invoice: ApiInvoice }>(
    `/finance/fee-schedules/${scheduleId}/generate-invoice`,
    data,
    idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : undefined
  );
  return mapInvoice(invoice);
};

export const fetchFeePlanTemplates = async (): Promise<StrkFeePlanTemplate[]> => {
  const { templates } = await apiClient.get<{ templates: StrkFeePlanTemplate[] }>(
    '/finance/fee-plan-templates'
  );
  return templates;
};

export const createFeePlanTemplate = async (data: {
  name: string;
  currency?: string;
  steps: { label: string; percent: number; dueOffsetDays?: number }[];
}): Promise<StrkFeePlanTemplate> => {
  const { template } = await apiClient.post<{ template: StrkFeePlanTemplate }>(
    '/finance/fee-plan-templates',
    data
  );
  return template;
};

export const deactivateFeePlanTemplate = async (id: string): Promise<void> => {
  await apiClient.delete(`/finance/fee-plan-templates/${id}`);
};

export type FinanceBalanceRow = {
  studentId: string;
  studentName: string;
  invoiceCount: number;
  scheduleInvoiceCount: number;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  currency: string;
};

export type FinanceBalancesReport = {
  asOf: string;
  currency: string;
  totals: { totalCents: number; paidCents: number; balanceCents: number };
  unpaidStudentCount: number;
  scheduleInvoiceCount: number;
  rows: FinanceBalanceRow[];
};

export const fetchFinanceBalances = async (asOf: string): Promise<FinanceBalancesReport> => {
  return apiClient.get<FinanceBalancesReport>(
    `/finance/balances?asOf=${encodeURIComponent(asOf)}`
  );
};

/** Export CSV/XLSX des soldes — journalisé côté serveur. */
export const downloadFinanceBalancesExport = async (
  asOf: string,
  format: 'csv' | 'xlsx' = 'csv'
): Promise<void> => {
  const { getToken } = await import('@/lib/apiClient');
  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
  const token = getToken();
  const res = await fetch(
    `${API_BASE_URL}/finance/balances/export?asOf=${encodeURIComponent(asOf)}&format=${format}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} }
  );
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error((data as { error?: string } | null)?.error || `Export impossible (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `soldes-${asOf}.${format === 'xlsx' ? 'xlsx' : 'csv'}`;
  a.click();
  URL.revokeObjectURL(url);
};

/** Affiche un montant facture : grille → FCFA entiers ; legacy catalogue → /100. */
export const formatInvoiceMoney = (invoice: StrkInvoice, amountCents: number): string => {
  const fromSchedule = Boolean(invoice.fee_schedule_id);
  const value = fromSchedule ? amountCents : amountCents / 100;
  return `${value.toLocaleString('fr-FR')} ${invoice.currency}`;
};

export interface StrkStudentFeeAssignment {
  id: string;
  institutionId: string;
  studentId: string;
  feeScheduleId: string;
  academicYear: string;
  cycleCode?: string | null;
  gradeLevelId?: string | null;
  optionalFeeTypeCodes: string[] | unknown;
  status: string;
  createdAt: string;
  student?: {
    id: string;
    profile?: { firstName?: string | null; lastName?: string | null } | null;
  };
  feeSchedule?: {
    id: string;
    name: string;
    version: number;
    status: string;
    academicYear: string;
  };
}

export const fetchStudentFeeAssignments = async (params?: {
  studentId?: string;
  academicYear?: string;
  status?: string;
}): Promise<StrkStudentFeeAssignment[]> => {
  const q = new URLSearchParams();
  if (params?.studentId) q.set('studentId', params.studentId);
  if (params?.academicYear) q.set('academicYear', params.academicYear);
  if (params?.status) q.set('status', params.status);
  const qs = q.toString();
  const { assignments } = await apiClient.get<{ assignments: StrkStudentFeeAssignment[] }>(
    `/finance/student-fee-assignments${qs ? `?${qs}` : ''}`
  );
  return assignments;
};

export const upsertStudentFeeAssignment = async (data: {
  studentId: string;
  feeScheduleId: string;
  academicYear: string;
  cycleCode?: string | null;
  optionalFeeTypeCodes?: string[];
}): Promise<StrkStudentFeeAssignment> => {
  const { assignment } = await apiClient.post<{ assignment: StrkStudentFeeAssignment }>(
    '/finance/student-fee-assignments',
    data
  );
  return assignment;
};

export const patchStudentFeeAssignment = async (
  id: string,
  data: {
    optionalFeeTypeCodes?: string[];
    cycleCode?: string | null;
    status?: 'active' | 'ended';
  }
): Promise<StrkStudentFeeAssignment> => {
  const { assignment } = await apiClient.patch<{ assignment: StrkStudentFeeAssignment }>(
    `/finance/student-fee-assignments/${id}`,
    data
  );
  return assignment;
};

export const generateInvoiceFromAssignment = async (
  assignmentId: string,
  idempotencyKey?: string
): Promise<StrkInvoice> => {
  const { invoice } = await apiClient.post<{ invoice: ApiInvoice }>(
    `/finance/student-fee-assignments/${assignmentId}/generate-invoice`,
    {},
    idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : undefined
  );
  return mapInvoice(invoice);
};
