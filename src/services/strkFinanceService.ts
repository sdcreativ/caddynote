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
