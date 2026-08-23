/**
 * Soldes élèves à une date donnée (Lot 5).
 * Factures émises ≤ asOf ; paiements confirmés ≤ asOf.
 * Les factures cancelled sont exclues.
 */
import { prisma } from './prisma.js';

export type StudentBalanceRow = {
  studentId: string;
  studentName: string;
  invoiceCount: number;
  scheduleInvoiceCount: number;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  currency: string;
};

export async function computeStudentBalances(params: {
  institutionId: string;
  asOf: Date;
}): Promise<StudentBalanceRow[]> {
  const asOfEnd = new Date(params.asOf);
  asOfEnd.setUTCHours(23, 59, 59, 999);

  const invoices = await prisma.strkInvoice.findMany({
    where: {
      institutionId: params.institutionId,
      status: { not: 'cancelled' },
      issuedAt: { lte: asOfEnd },
    },
    include: {
      payments: {
        where: { status: 'paid', paidAt: { lte: asOfEnd } },
        select: { amountCents: true },
      },
      student: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
    },
  });

  const byStudent = new Map<
    string,
    {
      studentName: string;
      invoiceCount: number;
      scheduleInvoiceCount: number;
      totalCents: number;
      paidCents: number;
      currency: string;
    }
  >();

  for (const inv of invoices) {
    const name =
      [inv.student.profile?.firstName, inv.student.profile?.lastName].filter(Boolean).join(' ') ||
      'Élève';
    const paid = inv.payments.reduce((s, p) => s + p.amountCents, 0);
    const cur = byStudent.get(inv.studentId) ?? {
      studentName: name,
      invoiceCount: 0,
      scheduleInvoiceCount: 0,
      totalCents: 0,
      paidCents: 0,
      currency: inv.currency || 'XOF',
    };
    cur.invoiceCount += 1;
    if (inv.feeScheduleId) cur.scheduleInvoiceCount += 1;
    cur.totalCents += inv.totalCents;
    cur.paidCents += paid;
    cur.currency = inv.currency || cur.currency;
    byStudent.set(inv.studentId, cur);
  }

  return [...byStudent.entries()]
    .map(([studentId, row]) => ({
      studentId,
      studentName: row.studentName,
      invoiceCount: row.invoiceCount,
      scheduleInvoiceCount: row.scheduleInvoiceCount,
      totalCents: row.totalCents,
      paidCents: row.paidCents,
      balanceCents: Math.max(0, row.totalCents - row.paidCents),
      currency: row.currency,
    }))
    .sort((a, b) => b.balanceCents - a.balanceCents || a.studentName.localeCompare(b.studentName, 'fr'));
}
