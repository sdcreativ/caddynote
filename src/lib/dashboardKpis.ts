/** Agrégats KPI dashboard — purs, testables, sans placeholders silencieux. */

export type InvoiceLike = {
  status: string;
  total_cents: number;
  paid_cents: number;
};

export type AbsenceLike = {
  date: string;
  type: string;
};

export type AssignmentLike = {
  due_date?: string | null;
  status?: string | null;
};

export const summarizeOpenInvoices = (invoices: InvoiceLike[]) => {
  const open = invoices.filter((i) => i.status !== 'paid' && i.status !== 'cancelled');
  return {
    invoicesOpen: open.length,
    unpaidCents: open.reduce((s, i) => s + Math.max(0, i.total_cents - i.paid_cents), 0),
  };
};

export const countAbsencesSince = (absences: AbsenceLike[], sinceMs: number) =>
  absences.filter((a) => a.type === 'absence' && new Date(a.date).getTime() >= sinceMs).length;

/** Devoirs encore « ouverts » : non archivés, échéance future ou absente. */
export const countOpenHomework = (assignments: AssignmentLike[], nowMs = Date.now()) =>
  assignments.filter((a) => {
    const status = (a.status || '').toLowerCase();
    if (status === 'archived' || status === 'cancelled' || status === 'closed') return false;
    if (!a.due_date) return true;
    return new Date(a.due_date).getTime() >= nowMs - 24 * 60 * 60 * 1000;
  }).length;

export const formatCentsFr = (cents: number) =>
  (cents / 100).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
