/**
 * Lot 5.4 — parrainages / prises en charge tierces.
 * L’imputation augmente `creditAppliedCents` (même mécanisme que les avoirs).
 */
import { prisma } from './prisma.js';
import {
  invoiceRemainingCents,
  recomputeInvoiceStatus,
  PaymentAllocationError,
} from './paymentAllocations.js';

export class SponsorshipError extends PaymentAllocationError {
  constructor(message: string, status = 400, code = 'sponsorship_invalid') {
    super(message, status, code);
    this.name = 'SponsorshipError';
  }
}

export const createSponsorship = async (params: {
  institutionId: string;
  studentId: string;
  sponsorName: string;
  sponsorType?: string;
  amountCents: number;
  currency?: string;
  feeTypeCode?: string;
  academicYear?: string;
  notes?: string;
  createdBy: string;
}) => {
  if (params.amountCents <= 0) {
    throw new SponsorshipError('Le montant de la prise en charge doit être positif');
  }
  if (!params.sponsorName.trim()) {
    throw new SponsorshipError('Nom du sponsor requis');
  }
  const student = await prisma.strkStudent.findUnique({ where: { id: params.studentId } });
  if (!student || student.institutionId !== params.institutionId) {
    throw new SponsorshipError('Élève introuvable', 404, 'student_not_found');
  }
  return prisma.strkSponsorship.create({
    data: {
      institutionId: params.institutionId,
      studentId: params.studentId,
      sponsorName: params.sponsorName.trim(),
      sponsorType: params.sponsorType || 'individual',
      amountCents: params.amountCents,
      remainingCents: params.amountCents,
      currency: params.currency || 'XOF',
      feeTypeCode: params.feeTypeCode || 'THIRD_PARTY_SUPPORT',
      academicYear: params.academicYear,
      notes: params.notes,
      createdBy: params.createdBy,
      status: 'active',
    },
  });
};

export const applySponsorshipToInvoice = async (params: {
  sponsorshipId: string;
  invoiceId: string;
  amountCents: number;
  institutionId: string;
  actorId: string;
}) => {
  if (params.amountCents <= 0) {
    throw new SponsorshipError('Montant d’imputation invalide');
  }

  const result = await prisma.$transaction(async (tx) => {
    const sponsorship = await tx.strkSponsorship.findUnique({
      where: { id: params.sponsorshipId },
    });
    if (!sponsorship || sponsorship.institutionId !== params.institutionId) {
      throw new SponsorshipError('Parrainage introuvable', 404, 'sponsorship_not_found');
    }
    if (sponsorship.status !== 'active' || sponsorship.remainingCents <= 0) {
      throw new SponsorshipError('Parrainage non disponible');
    }
    if (params.amountCents > sponsorship.remainingCents) {
      throw new SponsorshipError('Montant supérieur au solde du parrainage');
    }

    const invoice = await tx.strkInvoice.findUnique({ where: { id: params.invoiceId } });
    if (!invoice || invoice.institutionId !== params.institutionId) {
      throw new SponsorshipError('Facture introuvable', 404, 'invoice_not_found');
    }
    if (invoice.studentId !== sponsorship.studentId) {
      throw new SponsorshipError('Le parrainage et la facture doivent concerner le même élève');
    }
    const remaining = invoiceRemainingCents(invoice);
    if (params.amountCents > remaining) {
      throw new SponsorshipError(`Montant trop élevé (reste ${remaining} centimes sur la facture)`);
    }

    const application = await tx.strkSponsorshipApplication.create({
      data: {
        sponsorshipId: sponsorship.id,
        invoiceId: invoice.id,
        amountCents: params.amountCents,
        createdBy: params.actorId,
      },
    });

    const remainingCents = sponsorship.remainingCents - params.amountCents;
    await tx.strkSponsorship.update({
      where: { id: sponsorship.id },
      data: {
        remainingCents,
        status: remainingCents <= 0 ? 'exhausted' : 'active',
      },
    });

    await tx.strkInvoice.update({
      where: { id: invoice.id },
      data: { creditAppliedCents: invoice.creditAppliedCents + params.amountCents },
    });

    return { application, sponsorshipId: sponsorship.id, invoiceId: invoice.id };
  });

  await recomputeInvoiceStatus(result.invoiceId);
  return result;
};
