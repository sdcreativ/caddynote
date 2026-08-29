/**
 * Lot 5.4 — avoirs (credit notes) imputables sur factures sans cash.
 */
import { prisma } from './prisma.js';
import {
  invoiceRemainingCents,
  recomputeInvoiceStatus,
  PaymentAllocationError,
} from './paymentAllocations.js';

export class CreditNoteError extends PaymentAllocationError {
  constructor(message: string, status = 400, code = 'credit_note_invalid') {
    super(message, status, code);
    this.name = 'CreditNoteError';
  }
}

export const createCreditNote = async (params: {
  institutionId: string;
  studentId: string;
  amountCents: number;
  currency?: string;
  reason?: string;
  relatedInvoiceId?: string;
  createdBy: string;
}) => {
  if (params.amountCents <= 0) {
    throw new CreditNoteError('Le montant de l’avoir doit être positif');
  }
  const student = await prisma.strkStudent.findUnique({ where: { id: params.studentId } });
  if (!student || student.institutionId !== params.institutionId) {
    throw new CreditNoteError('Élève introuvable', 404, 'student_not_found');
  }
  return prisma.strkCreditNote.create({
    data: {
      institutionId: params.institutionId,
      studentId: params.studentId,
      amountCents: params.amountCents,
      remainingCents: params.amountCents,
      currency: params.currency || 'XOF',
      reason: params.reason,
      relatedInvoiceId: params.relatedInvoiceId,
      createdBy: params.createdBy,
      status: 'open',
    },
  });
};

export const applyCreditNoteToInvoice = async (params: {
  creditNoteId: string;
  invoiceId: string;
  amountCents: number;
  institutionId: string;
  actorId: string;
}) => {
  if (params.amountCents <= 0) {
    throw new CreditNoteError('Montant d’imputation invalide');
  }

  const result = await prisma.$transaction(async (tx) => {
    const note = await tx.strkCreditNote.findUnique({ where: { id: params.creditNoteId } });
    if (!note || note.institutionId !== params.institutionId) {
      throw new CreditNoteError('Avoir introuvable', 404, 'credit_note_not_found');
    }
    if (note.status !== 'open' || note.remainingCents <= 0) {
      throw new CreditNoteError('Avoir non disponible');
    }
    if (params.amountCents > note.remainingCents) {
      throw new CreditNoteError('Montant supérieur au solde de l’avoir');
    }

    const invoice = await tx.strkInvoice.findUnique({ where: { id: params.invoiceId } });
    if (!invoice || invoice.institutionId !== params.institutionId) {
      throw new CreditNoteError('Facture introuvable', 404, 'invoice_not_found');
    }
    if (invoice.studentId !== note.studentId) {
      throw new CreditNoteError('L’avoir et la facture doivent concerner le même élève');
    }
    const remaining = invoiceRemainingCents(invoice);
    if (params.amountCents > remaining) {
      throw new CreditNoteError(`Montant trop élevé (reste ${remaining} centimes sur la facture)`);
    }

    const application = await tx.strkCreditNoteApplication.create({
      data: {
        creditNoteId: note.id,
        invoiceId: invoice.id,
        amountCents: params.amountCents,
        createdBy: params.actorId,
      },
    });

    const remainingCents = note.remainingCents - params.amountCents;
    await tx.strkCreditNote.update({
      where: { id: note.id },
      data: {
        remainingCents,
        status: remainingCents <= 0 ? 'exhausted' : 'open',
      },
    });

    await tx.strkInvoice.update({
      where: { id: invoice.id },
      data: { creditAppliedCents: invoice.creditAppliedCents + params.amountCents },
    });

    return { application, creditNoteId: note.id, invoiceId: invoice.id };
  });

  await recomputeInvoiceStatus(result.invoiceId);
  return result;
};
