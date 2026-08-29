import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requireFeature } from '../middleware/requireFeature.js';
import { getStudentAccess, isSameInstitution, FINANCE_ROLES } from '../lib/authz.js';
import { isCinetPayConfigured, initiatePayment, checkTransactionStatus } from '../lib/cinetpay.js';
import { isStripeConfigured, getStripeClient } from '../lib/stripeClient.js';
import { logAudit } from '../lib/audit.js';
import { importBankStatementLines, attemptAutoMatch } from '../lib/bankReconciliation.js';
import { runLateFeeCheck } from '../lib/lateFees.js';
import { feeGridRouter } from './feeGrid.routes.js';
import { computeStudentBalances } from '../lib/financeBalances.js';
import { toCsv } from '../lib/csvExport.js';
import { toXlsx } from '../lib/xlsxExport.js';
import {
  createManualMultiPayment,
  ensureSingleAllocation,
  recomputeInvoiceStatus,
  PaymentAllocationError,
} from '../lib/paymentAllocations.js';
import { applyCreditNoteToInvoice, createCreditNote, CreditNoteError } from '../lib/creditNotes.js';
import {
  applySponsorshipToInvoice,
  createSponsorship,
  SponsorshipError,
} from '../lib/sponsorships.js';

/**
 * Module Finance (chap. 16, FIN-001 à 008) : catalogue de frais, factures,
 * paiements (Mobile Money via CinetPay, carte via Stripe, virement/espèces
 * enregistrés manuellement par le personnel), reçus + jeton de vérification
 * publique, remboursements traçables.
 *
 * Distinct de PremiumSubscription/BillingHistory (abonnement SaaS
 * établissement ↔ SDCREATIV, cf. subscriptions.routes.ts) : ici c'est
 * établissement ↔ parent, pour les frais de scolarité.
 *
 * Montants toujours en entiers (centimes) — jamais en flottant.
 */

export const financeRouter = Router();

const generateInvoiceNumber = (): string =>
  `INV-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
const generateReceiptNumber = (): string =>
  `REC-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
const generateVerificationToken = (): string => crypto.randomBytes(16).toString('hex');

financeRouter.use(requireAuth);
financeRouter.use(requireFeature('finance'));

// Grille financière CI (Lots 1–3) — fee-types, schedules, templates, national.
financeRouter.use(feeGridRouter);

// Déclenchement manuel de la tâche planifiée quotidienne (FIN-002), même
// principe que POST /absences/threshold-check — utile pour tester sans
// attendre 6h du matin. Réservé à l'admin global.
financeRouter.post('/late-fee-check', requireRole('admin'), async (_req, res) => {
  const result = await runLateFeeCheck();
  res.json(result);
});

// --- Catalogue de frais (FIN-001) ---

financeRouter.get('/fee-items', async (req, res) => {
  const institutionId = typeof req.query.institutionId === 'string' ? req.query.institutionId : req.auth!.institutionId;
  if (!institutionId || !isSameInstitution(req.auth!, institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const feeItems = await prisma.strkFeeItem.findMany({
    where: { institutionId, isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ feeItems });
});

const feeItemSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  amountCents: z.number().int().positive(),
  currency: z.string().default('XOF'),
  academicYear: z.string().optional(),
});

financeRouter.post('/fee-items', requireRole(...FINANCE_ROLES), async (req, res) => {
  const parsed = feeItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  if (!req.auth!.institutionId) {
    return res.status(400).json({ error: 'Aucun établissement associé à ce compte' });
  }
  const feeItem = await prisma.strkFeeItem.create({
    data: { ...parsed.data, institutionId: req.auth!.institutionId },
  });
  res.status(201).json({ feeItem });
});

financeRouter.patch('/fee-items/:id', requireRole(...FINANCE_ROLES), async (req, res) => {
  const existing = await prisma.strkFeeItem.findUnique({ where: { id: req.params.id } });
  if (!existing || !isSameInstitution(req.auth!, existing.institutionId)) {
    return res.status(404).json({ error: 'Frais introuvable' });
  }
  const parsed = feeItemSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const feeItem = await prisma.strkFeeItem.update({ where: { id: req.params.id }, data: parsed.data });
  res.json({ feeItem });
});

financeRouter.delete('/fee-items/:id', requireRole(...FINANCE_ROLES), async (req, res) => {
  const existing = await prisma.strkFeeItem.findUnique({ where: { id: req.params.id } });
  if (!existing || !isSameInstitution(req.auth!, existing.institutionId)) {
    return res.status(404).json({ error: 'Frais introuvable' });
  }
  // Désactivation plutôt que suppression : une facture déjà émise référence
  // encore ce frais (StrkInvoiceLine.feeItemId), l'historique ne doit pas casser.
  await prisma.strkFeeItem.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ success: true });
});

// --- Factures (FIN-002) ---

const enrichInvoice = async (invoice: {
  studentId: string;
  createdBy: string;
  lines: unknown[];
  payments: unknown[];
}) => {
  const [student, creator] = await Promise.all([
    prisma.strkStudent.findUnique({
      where: { id: invoice.studentId },
      select: { id: true, profile: { select: { firstName: true, lastName: true } } },
    }),
    prisma.strkProfile.findUnique({
      where: { id: invoice.createdBy },
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);
  return { ...invoice, student, createdByProfile: creator };
};

financeRouter.get('/invoices', async (req, res) => {
  const { studentId, institutionId } = req.query;

  if (typeof studentId === 'string') {
    const access = await getStudentAccess(req.auth!, studentId);
    if (!access.allowed || (access.via === 'guardian' && !access.permissions.canViewBilling)) {
      return res.status(403).json({ error: 'Permissions insuffisantes' });
    }
    // Le personnel pédagogique (teacher / supervisor…) peut accéder à l’élève
    // pour notes/absences, pas à la facturation — réservé à FINANCE_ROLES.
    if (access.via === 'staff' && !(FINANCE_ROLES as readonly string[]).includes(req.auth!.role)) {
      return res.status(403).json({ error: 'Permissions insuffisantes' });
    }
    const invoices = await prisma.strkInvoice.findMany({
      where: { studentId },
      include: { lines: true, payments: { include: { allocations: true } }, allocations: true },
      orderBy: { issuedAt: 'desc' },
    });
    return res.json({ invoices: await Promise.all(invoices.map(enrichInvoice)) });
  }

  // Liste établissement : direction / compta / admin uniquement (aligné UI FINANCE_ROLES).
  if (!(FINANCE_ROLES as readonly string[]).includes(req.auth!.role)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }

  const targetInstitutionId = typeof institutionId === 'string' ? institutionId : req.auth!.institutionId;
  if (!targetInstitutionId || !isSameInstitution(req.auth!, targetInstitutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const invoices = await prisma.strkInvoice.findMany({
    where: { institutionId: targetInstitutionId },
    include: { lines: true, payments: { include: { allocations: true } }, allocations: true },
    orderBy: { issuedAt: 'desc' },
  });
  res.json({ invoices: await Promise.all(invoices.map(enrichInvoice)) });
});

financeRouter.get('/invoices/:id', async (req, res) => {
  const invoice = await prisma.strkInvoice.findUnique({
    where: { id: req.params.id },
    include: { lines: true, payments: { include: { allocations: true } }, allocations: true },
  });
  if (!invoice) {
    return res.status(404).json({ error: 'Facture introuvable' });
  }
  const access = await getStudentAccess(req.auth!, invoice.studentId);
  if (!access.allowed || (access.via === 'guardian' && !access.permissions.canViewBilling)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  res.json({ invoice: await enrichInvoice(invoice) });
});

const invoiceLineInputSchema = z.object({
  feeItemId: z.string().uuid().optional(),
  label: z.string().min(1).optional(),
  amountCents: z.number().int().positive().optional(),
  quantity: z.number().int().positive().default(1),
  // FIN-002 : remise/bourse — toujours saisie comme une magnitude positive
  // (« 5000 FCFA de remise »), jamais un montant négatif ; c'est lineType
  // qui détermine si la ligne s'ajoute ou se retranche du total.
  lineType: z.enum(['fee', 'discount']).default('fee'),
});

const invoiceSchema = z.object({
  studentId: z.string().uuid(),
  dueDate: z.string().optional(),
  currency: z.string().default('XOF'),
  lines: z.array(invoiceLineInputSchema).min(1),
});

financeRouter.post('/invoices', requireRole(...FINANCE_ROLES), async (req, res) => {
  const parsed = invoiceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const auth = req.auth!;
  if (!auth.institutionId) {
    return res.status(400).json({ error: 'Aucun établissement associé à ce compte' });
  }
  const student = await prisma.strkStudent.findUnique({ where: { id: parsed.data.studentId } });
  if (!student || !isSameInstitution(auth, student.institutionId)) {
    return res.status(404).json({ error: 'Élève introuvable' });
  }

  // Résout chaque ligne : soit à partir du catalogue (feeItemId), soit ad-hoc
  // (label + amountCents fournis directement par le personnel).
  const feeItemIds = parsed.data.lines.map((l) => l.feeItemId).filter((id): id is string => !!id);
  const feeItems = feeItemIds.length
    ? await prisma.strkFeeItem.findMany({ where: { id: { in: feeItemIds }, institutionId: auth.institutionId } })
    : [];
  const feeItemById = new Map(feeItems.map((f) => [f.id, f]));

  const resolvedLines: { feeItemId?: string; label: string; amountCents: number; quantity: number; lineType: string }[] = [];
  for (const line of parsed.data.lines) {
    if (line.lineType === 'discount') {
      // FIN-002 : remise/bourse — jamais rattachée au catalogue de frais
      // (un frais et une remise sont deux natures différentes), toujours
      // un label et un montant explicites saisis par le personnel.
      if (!line.label || !line.amountCents) {
        return res.status(400).json({ error: 'Une remise doit fournir un label et un montant' });
      }
      resolvedLines.push({ label: line.label, amountCents: line.amountCents, quantity: line.quantity, lineType: 'discount' });
      continue;
    }
    if (line.feeItemId) {
      const feeItem = feeItemById.get(line.feeItemId);
      if (!feeItem) {
        return res.status(400).json({ error: `Frais introuvable dans le catalogue : ${line.feeItemId}` });
      }
      resolvedLines.push({
        feeItemId: feeItem.id,
        label: feeItem.name,
        amountCents: feeItem.amountCents,
        quantity: line.quantity,
        lineType: 'fee',
      });
    } else {
      if (!line.label || !line.amountCents) {
        return res.status(400).json({ error: 'Une ligne sans frais du catalogue doit fournir label et amountCents' });
      }
      resolvedLines.push({ label: line.label, amountCents: line.amountCents, quantity: line.quantity, lineType: 'fee' });
    }
  }

  const grossCents = resolvedLines
    .filter((l) => l.lineType === 'fee')
    .reduce((sum, l) => sum + l.amountCents * l.quantity, 0);
  const discountCents = resolvedLines
    .filter((l) => l.lineType === 'discount')
    .reduce((sum, l) => sum + l.amountCents * l.quantity, 0);
  const totalCents = grossCents - discountCents;
  if (totalCents < 0) {
    return res.status(400).json({ error: 'Le total des remises dépasse le total des frais' });
  }

  const invoice = await prisma.strkInvoice.create({
    data: {
      institutionId: auth.institutionId,
      studentId: student.id,
      invoiceNumber: generateInvoiceNumber(),
      totalCents,
      currency: parsed.data.currency,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
      createdBy: auth.sub,
      lines: { create: resolvedLines },
    },
    include: { lines: true, payments: { include: { allocations: true } }, allocations: true },
  });
  res.status(201).json({ invoice: await enrichInvoice(invoice) });
});

financeRouter.patch('/invoices/:id/cancel', requireRole(...FINANCE_ROLES), async (req, res) => {
  const invoice = await prisma.strkInvoice.findUnique({ where: { id: req.params.id } });
  if (!invoice || !isSameInstitution(req.auth!, invoice.institutionId)) {
    return res.status(404).json({ error: 'Facture introuvable' });
  }
  if (invoice.paidCents > 0 || invoice.creditAppliedCents > 0) {
    return res.status(400).json({ error: 'Impossible d’annuler une facture déjà partiellement payée' });
  }
  const updated = await prisma.strkInvoice.update({ where: { id: invoice.id }, data: { status: 'cancelled' } });
  res.json({ invoice: updated });
});

// --- Paiements (FIN-003/004/005) ---

const requireInvoiceAccess = async (req: import('express').Request, res: import('express').Response) => {
  const invoice = await prisma.strkInvoice.findUnique({ where: { id: req.params.id } });
  if (!invoice) {
    res.status(404).json({ error: 'Facture introuvable' });
    return null;
  }
  const access = await getStudentAccess(req.auth!, invoice.studentId);
  if (!access.allowed || (access.via === 'guardian' && !access.permissions.canMakePayments)) {
    res.status(403).json({ error: 'Permissions insuffisantes' });
    return null;
  }
  return invoice;
};

const paymentAmountSchema = z.object({ amountCents: z.number().int().positive().optional() });

// Mobile Money (CinetPay) — paiement partiel possible (FIN-004) : par défaut
// couvre le solde restant, ou le montant fourni s'il est inférieur.
financeRouter.post('/invoices/:id/payments/cinetpay/initiate', async (req, res) => {
  if (!isCinetPayConfigured()) {
    return res.status(501).json({
      error: "Le paiement Mobile Money (CinetPay) n'est pas encore configuré sur cette instance. Contactez SDCREATIV.",
    });
  }
  const invoice = await requireInvoiceAccess(req, res);
  if (!invoice) return;
  const parsed = paymentAmountSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const remaining = invoice.totalCents - invoice.paidCents - invoice.creditAppliedCents;
  const amountCents = Math.min(parsed.data.amountCents ?? remaining, remaining);
  if (amountCents <= 0) {
    return res.status(400).json({ error: 'Cette facture est déjà entièrement payée' });
  }

  const payer = await prisma.strkProfile.findUnique({ where: { id: req.auth!.sub } });
  const payment = await prisma.strkPayment.create({
    data: {
      invoiceId: invoice.id,
      amountCents,
      currency: invoice.currency,
      method: 'mobile_money',
      status: 'pending',
      provider: 'cinetpay',
      paidBy: req.auth!.sub,
    },
  });
  await ensureSingleAllocation(payment.id, invoice.id, amountCents);

  const appUrl = process.env.APP_URL || 'http://localhost:8080';
  const apiUrl = process.env.API_URL || 'http://localhost:4000';
  try {
    const { paymentUrl } = await initiatePayment({
      transactionId: payment.id,
      amountCents,
      currency: invoice.currency,
      description: `Facture ${invoice.invoiceNumber}`,
      customerName: payer?.lastName || 'Client',
      customerSurname: payer?.firstName || 'CaddyNote',
      customerEmail: payer?.email || 'noreply@caddynote.app',
      customerPhoneNumber: payer?.phoneNumber || '',
      notifyUrl: `${apiUrl}/finance/webhooks/cinetpay`,
      returnUrl: `${appUrl}/finance/invoices/${invoice.id}?payment=pending`,
    });
    await prisma.strkPayment.update({ where: { id: payment.id }, data: { providerRef: payment.id } });
    res.json({ paymentUrl, paymentId: payment.id });
  } catch (error) {
    console.error('CinetPay initiate error:', error);
    await prisma.strkPayment.update({ where: { id: payment.id }, data: { status: 'failed' } });
    res.status(502).json({ error: "Échec de l'initialisation du paiement Mobile Money" });
  }
});

// Carte via Stripe (paiement ponctuel, distinct de l'abonnement SaaS).
financeRouter.post('/invoices/:id/payments/stripe/initiate', async (req, res) => {
  if (!isStripeConfigured()) {
    return res.status(501).json({
      error: "Le paiement par carte (Stripe) n'est pas encore configuré sur cette instance. Contactez SDCREATIV.",
    });
  }
  const invoice = await requireInvoiceAccess(req, res);
  if (!invoice) return;
  const parsed = paymentAmountSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const remaining = invoice.totalCents - invoice.paidCents - invoice.creditAppliedCents;
  const amountCents = Math.min(parsed.data.amountCents ?? remaining, remaining);
  if (amountCents <= 0) {
    return res.status(400).json({ error: 'Cette facture est déjà entièrement payée' });
  }

  const payment = await prisma.strkPayment.create({
    data: {
      invoiceId: invoice.id,
      amountCents,
      currency: invoice.currency,
      method: 'card',
      status: 'pending',
      provider: 'stripe',
      paidBy: req.auth!.sub,
    },
  });
  await ensureSingleAllocation(payment.id, invoice.id, amountCents);

  const appUrl = process.env.APP_URL || 'http://localhost:8080';
  const session = await getStripeClient().checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: invoice.currency.toLowerCase(),
          product_data: { name: `Facture ${invoice.invoiceNumber}` },
          unit_amount: amountCents,
        },
        quantity: 1,
      },
    ],
    success_url: `${appUrl}/finance/invoices/${invoice.id}?payment=success`,
    cancel_url: `${appUrl}/finance/invoices/${invoice.id}?payment=cancelled`,
    metadata: { kind: 'finance_payment', paymentId: payment.id, invoiceId: invoice.id },
  });
  await prisma.strkPayment.update({ where: { id: payment.id }, data: { providerRef: session.id } });
  res.json({ url: session.url, paymentId: payment.id });
});

const manualPaymentSchema = z.object({
  amountCents: z.number().int().positive(),
  method: z.enum(['bank_transfer', 'cash']),
});

// Virement/espèces (FIN-003) : enregistré directement par le personnel
// habilité, confirmé immédiatement (pas de provider tiers à vérifier).
financeRouter.post('/invoices/:id/payments/manual', requireRole(...FINANCE_ROLES), async (req, res) => {
  const invoice = await prisma.strkInvoice.findUnique({ where: { id: req.params.id } });
  if (!invoice || !isSameInstitution(req.auth!, invoice.institutionId)) {
    return res.status(404).json({ error: 'Facture introuvable' });
  }
  const parsed = manualPaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const remaining = invoice.totalCents - invoice.paidCents - invoice.creditAppliedCents;
  if (parsed.data.amountCents > remaining) {
    return res.status(400).json({ error: 'Le montant dépasse le solde restant dû' });
  }

  const payment = await prisma.strkPayment.create({
    data: {
      invoiceId: invoice.id,
      amountCents: parsed.data.amountCents,
      currency: invoice.currency,
      method: parsed.data.method,
      status: 'paid',
      provider: 'manual',
      paidBy: req.auth!.sub,
      paidAt: new Date(),
      receiptNumber: generateReceiptNumber(),
      verificationToken: generateVerificationToken(),
    },
  });
  await ensureSingleAllocation(payment.id, invoice.id, parsed.data.amountCents);
  await recomputeInvoiceStatus(invoice.id);
  await logAudit({
    institutionId: invoice.institutionId,
    actorId: req.auth!.sub,
    action: 'finance.payment.manual_confirmed',
    targetType: 'payment',
    targetId: payment.id,
    metadata: { invoiceId: invoice.id, amountCents: parsed.data.amountCents, method: parsed.data.method },
    ipAddress: req.ip,
  });
  const allocations = await prisma.strkPaymentAllocation.findMany({ where: { paymentId: payment.id } });
  res.status(201).json({ payment, allocations });
});

const manualMultiSchema = z.object({
  method: z.enum(['bank_transfer', 'cash']),
  currency: z.string().optional(),
  allocations: z
    .array(
      z.object({
        invoiceId: z.string().uuid(),
        amountCents: z.number().int().positive(),
      })
    )
    .min(1),
});

/** Encaissement unique ventilé sur plusieurs factures (staff). */
financeRouter.post('/payments/manual-multi', requireRole(...FINANCE_ROLES), async (req, res) => {
  if (!req.auth!.institutionId) {
    return res.status(400).json({ error: 'Aucun établissement associé à ce compte' });
  }
  const parsed = manualMultiSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  try {
    const result = await createManualMultiPayment({
      institutionId: req.auth!.institutionId,
      actorId: req.auth!.sub,
      method: parsed.data.method,
      currency: parsed.data.currency,
      allocations: parsed.data.allocations,
      receiptNumber: generateReceiptNumber(),
      verificationToken: generateVerificationToken(),
    });
    await logAudit({
      institutionId: req.auth!.institutionId,
      actorId: req.auth!.sub,
      action: 'finance.payment.manual_multi_confirmed',
      targetType: 'payment',
      targetId: result.payment.id,
      metadata: {
        amountCents: result.payment.amountCents,
        method: parsed.data.method,
        allocations: parsed.data.allocations,
      },
      ipAddress: req.ip,
    });
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof PaymentAllocationError) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    throw error;
  }
});

// --- Remboursement (FIN-008) : traçable, sans jamais supprimer/modifier le paiement initial ---

const refundSchema = z.object({ amountCents: z.number().int().positive(), reason: z.string().optional() });

financeRouter.post('/payments/:id/refund', requireRole(...FINANCE_ROLES), async (req, res) => {
  const payment = await prisma.strkPayment.findUnique({
    where: { id: req.params.id },
    include: { invoice: true, allocations: true },
  });
  if (!payment || !isSameInstitution(req.auth!, payment.invoice.institutionId)) {
    return res.status(404).json({ error: 'Paiement introuvable' });
  }
  if (payment.status !== 'paid') {
    return res.status(400).json({ error: 'Seul un paiement confirmé peut être remboursé' });
  }
  const parsed = refundSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  if (parsed.data.amountCents > payment.amountCents) {
    return res.status(400).json({ error: 'Le remboursement dépasse le montant du paiement' });
  }

  const refund = await prisma.strkRefund.create({
    data: {
      paymentId: payment.id,
      amountCents: parsed.data.amountCents,
      reason: parsed.data.reason,
      refundedBy: req.auth!.sub,
    },
  });
  // Le paiement initial n'est ni supprimé ni modifié dans son montant —
  // seul son statut reflète qu'il a fait l'objet d'un remboursement.
  await prisma.strkPayment.update({ where: { id: payment.id }, data: { status: 'refunded' } });
  const invoiceIds = [
    ...new Set([payment.invoiceId, ...payment.allocations.map((a) => a.invoiceId)]),
  ];
  for (const invoiceId of invoiceIds) {
    await recomputeInvoiceStatus(invoiceId);
  }
  await logAudit({
    institutionId: payment.invoice.institutionId,
    actorId: req.auth!.sub,
    action: 'finance.payment.refunded',
    targetType: 'payment',
    targetId: payment.id,
    metadata: { refundId: refund.id, amountCents: parsed.data.amountCents, reason: parsed.data.reason },
    ipAddress: req.ip,
  });
  res.status(201).json({ refund });
});

// --- Avoirs (Lot 5.4) ---

const creditNoteSchema = z.object({
  studentId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  currency: z.string().optional(),
  reason: z.string().optional(),
  relatedInvoiceId: z.string().uuid().optional(),
});

financeRouter.get('/credit-notes', requireRole(...FINANCE_ROLES), async (req, res) => {
  const institutionId = req.auth!.institutionId;
  if (!institutionId) return res.status(400).json({ error: 'Aucun établissement associé' });
  const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : undefined;
  const notes = await prisma.strkCreditNote.findMany({
    where: { institutionId, ...(studentId ? { studentId } : {}) },
    include: { applications: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ creditNotes: notes });
});

financeRouter.post('/credit-notes', requireRole(...FINANCE_ROLES), async (req, res) => {
  if (!req.auth!.institutionId) {
    return res.status(400).json({ error: 'Aucun établissement associé' });
  }
  const parsed = creditNoteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  try {
    const note = await createCreditNote({
      institutionId: req.auth!.institutionId,
      createdBy: req.auth!.sub,
      ...parsed.data,
    });
    await logAudit({
      institutionId: req.auth!.institutionId,
      actorId: req.auth!.sub,
      action: 'finance.credit_note.created',
      targetType: 'credit_note',
      targetId: note.id,
      metadata: { amountCents: note.amountCents, studentId: note.studentId },
      ipAddress: req.ip,
    });
    res.status(201).json({ creditNote: note });
  } catch (error) {
    if (error instanceof CreditNoteError) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    throw error;
  }
});

const applyCreditSchema = z.object({
  invoiceId: z.string().uuid(),
  amountCents: z.number().int().positive(),
});

financeRouter.post('/credit-notes/:id/apply', requireRole(...FINANCE_ROLES), async (req, res) => {
  if (!req.auth!.institutionId) {
    return res.status(400).json({ error: 'Aucun établissement associé' });
  }
  const parsed = applyCreditSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  try {
    const result = await applyCreditNoteToInvoice({
      creditNoteId: req.params.id,
      invoiceId: parsed.data.invoiceId,
      amountCents: parsed.data.amountCents,
      institutionId: req.auth!.institutionId,
      actorId: req.auth!.sub,
    });
    await logAudit({
      institutionId: req.auth!.institutionId,
      actorId: req.auth!.sub,
      action: 'finance.credit_note.applied',
      targetType: 'credit_note',
      targetId: req.params.id,
      metadata: result,
      ipAddress: req.ip,
    });
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof CreditNoteError) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    throw error;
  }
});

// --- Parrainages (Lot 5.4) ---

const sponsorshipSchema = z.object({
  studentId: z.string().uuid(),
  sponsorName: z.string().min(1),
  sponsorType: z.enum(['ngo', 'company', 'individual', 'state']).optional(),
  amountCents: z.number().int().positive(),
  currency: z.string().optional(),
  feeTypeCode: z.string().optional(),
  academicYear: z.string().optional(),
  notes: z.string().optional(),
});

financeRouter.get('/sponsorships', requireRole(...FINANCE_ROLES), async (req, res) => {
  const institutionId = req.auth!.institutionId;
  if (!institutionId) return res.status(400).json({ error: 'Aucun établissement associé' });
  const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : undefined;
  const rows = await prisma.strkSponsorship.findMany({
    where: { institutionId, ...(studentId ? { studentId } : {}) },
    include: { applications: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ sponsorships: rows });
});

financeRouter.post('/sponsorships', requireRole(...FINANCE_ROLES), async (req, res) => {
  if (!req.auth!.institutionId) {
    return res.status(400).json({ error: 'Aucun établissement associé' });
  }
  const parsed = sponsorshipSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  try {
    const sponsorship = await createSponsorship({
      institutionId: req.auth!.institutionId,
      createdBy: req.auth!.sub,
      ...parsed.data,
    });
    await logAudit({
      institutionId: req.auth!.institutionId,
      actorId: req.auth!.sub,
      action: 'finance.sponsorship.created',
      targetType: 'sponsorship',
      targetId: sponsorship.id,
      metadata: { amountCents: sponsorship.amountCents, studentId: sponsorship.studentId },
      ipAddress: req.ip,
    });
    res.status(201).json({ sponsorship });
  } catch (error) {
    if (error instanceof SponsorshipError) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    throw error;
  }
});

const applySponsorshipSchema = z.object({
  invoiceId: z.string().uuid(),
  amountCents: z.number().int().positive(),
});

financeRouter.post('/sponsorships/:id/apply', requireRole(...FINANCE_ROLES), async (req, res) => {
  if (!req.auth!.institutionId) {
    return res.status(400).json({ error: 'Aucun établissement associé' });
  }
  const parsed = applySponsorshipSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  try {
    const result = await applySponsorshipToInvoice({
      sponsorshipId: req.params.id,
      invoiceId: parsed.data.invoiceId,
      amountCents: parsed.data.amountCents,
      institutionId: req.auth!.institutionId,
      actorId: req.auth!.sub,
    });
    await logAudit({
      institutionId: req.auth!.institutionId,
      actorId: req.auth!.sub,
      action: 'finance.sponsorship.applied',
      targetType: 'sponsorship',
      targetId: req.params.id,
      metadata: result,
      ipAddress: req.ip,
    });
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof SponsorshipError) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    throw error;
  }
});

// --- Rapprochement bancaire (FIN-007) ---

const bankLineInputSchema = z.object({
  date: z.string(),
  amountCents: z.number().int(),
  currency: z.string().optional(),
  label: z.string().min(1),
  externalRef: z.string().optional(),
});

const importSchema = z.object({ institutionId: z.string().uuid(), lines: z.array(bankLineInputSchema).min(1).max(1000) });

financeRouter.post('/bank-statement/import', requireRole(...FINANCE_ROLES), async (req, res) => {
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  if (!isSameInstitution(req.auth!, parsed.data.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const result = await importBankStatementLines({
    institutionId: parsed.data.institutionId,
    importedBy: req.auth!.sub,
    lines: parsed.data.lines.map((l) => ({ ...l, date: new Date(l.date) })),
  });
  await logAudit({
    institutionId: parsed.data.institutionId,
    actorId: req.auth!.sub,
    action: 'finance.bank_statement.imported',
    metadata: { imported: result.imported, autoMatched: result.autoMatched },
    ipAddress: req.ip,
  });
  res.status(201).json(result);
});

financeRouter.get('/bank-statement/lines', requireRole(...FINANCE_ROLES), async (req, res) => {
  const { institutionId, status } = req.query;
  if (typeof institutionId !== 'string' || !isSameInstitution(req.auth!, institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const statusFilter = z.enum(['unmatched', 'matched', 'ignored']).safeParse(status);
  const lines = await prisma.strkBankStatementLine.findMany({
    where: { institutionId, status: statusFilter.success ? statusFilter.data : undefined },
    orderBy: { date: 'desc' },
    take: 500,
  });
  res.json({ lines });
});

// Retente le rapprochement automatique pour une ligne encore "unmatched" —
// utile après l'enregistrement d'un paiement postérieur à l'import du relevé.
financeRouter.post('/bank-statement/lines/:id/auto-match', requireRole(...FINANCE_ROLES), async (req, res) => {
  const line = await prisma.strkBankStatementLine.findUnique({ where: { id: req.params.id } });
  if (!line) {
    return res.status(404).json({ error: 'Ligne introuvable' });
  }
  if (!isSameInstitution(req.auth!, line.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const matched = await attemptAutoMatch(line.id);
  const updated = await prisma.strkBankStatementLine.findUnique({ where: { id: line.id } });
  res.json({ matched, line: updated });
});

const manualMatchSchema = z.object({ paymentId: z.string().uuid() });

financeRouter.post('/bank-statement/lines/:id/match', requireRole(...FINANCE_ROLES), async (req, res) => {
  const line = await prisma.strkBankStatementLine.findUnique({ where: { id: req.params.id } });
  if (!line) {
    return res.status(404).json({ error: 'Ligne introuvable' });
  }
  if (!isSameInstitution(req.auth!, line.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const parsed = manualMatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const payment = await prisma.strkPayment.findUnique({ where: { id: parsed.data.paymentId }, include: { invoice: true } });
  if (!payment || payment.invoice.institutionId !== line.institutionId) {
    return res.status(400).json({ error: 'Paiement invalide pour cet établissement' });
  }
  const updated = await prisma.strkBankStatementLine.update({
    where: { id: line.id },
    data: { status: 'matched', matchedPaymentId: payment.id, matchedBy: req.auth!.sub, matchedAt: new Date() },
  });
  res.json({ line: updated });
});

financeRouter.delete('/bank-statement/lines/:id/match', requireRole(...FINANCE_ROLES), async (req, res) => {
  const line = await prisma.strkBankStatementLine.findUnique({ where: { id: req.params.id } });
  if (!line) {
    return res.status(404).json({ error: 'Ligne introuvable' });
  }
  if (!isSameInstitution(req.auth!, line.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const updated = await prisma.strkBankStatementLine.update({
    where: { id: line.id },
    data: { status: 'unmatched', matchedPaymentId: null, matchedBy: null, matchedAt: null },
  });
  res.json({ line: updated });
});

financeRouter.post('/bank-statement/lines/:id/ignore', requireRole(...FINANCE_ROLES), async (req, res) => {
  const line = await prisma.strkBankStatementLine.findUnique({ where: { id: req.params.id } });
  if (!line) {
    return res.status(404).json({ error: 'Ligne introuvable' });
  }
  if (!isSameInstitution(req.auth!, line.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const updated = await prisma.strkBankStatementLine.update({
    where: { id: line.id },
    data: { status: 'ignored', matchedBy: req.auth!.sub, matchedAt: new Date() },
  });
  res.json({ line: updated });
});

// Bilan de rapprochement sur une période : lignes non rapprochées, et
// paiements confirmés sans aucune ligne de relevé associée (signal possible
// d'un paiement enregistré mais jamais réellement arrivé en banque).
financeRouter.get('/bank-statement/summary', requireRole(...FINANCE_ROLES), async (req, res) => {
  const { institutionId, from, to } = req.query;
  if (typeof institutionId !== 'string' || !isSameInstitution(req.auth!, institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const fromDate = typeof from === 'string' ? new Date(from) : new Date(0);
  const toDate = typeof to === 'string' ? new Date(to) : new Date();

  const [unmatchedCount, matchedCount, ignoredCount, unmatchedLines] = await Promise.all([
    prisma.strkBankStatementLine.count({ where: { institutionId, status: 'unmatched', date: { gte: fromDate, lte: toDate } } }),
    prisma.strkBankStatementLine.count({ where: { institutionId, status: 'matched', date: { gte: fromDate, lte: toDate } } }),
    prisma.strkBankStatementLine.count({ where: { institutionId, status: 'ignored', date: { gte: fromDate, lte: toDate } } }),
    prisma.strkBankStatementLine.findMany({
      where: { institutionId, status: 'unmatched', date: { gte: fromDate, lte: toDate } },
      orderBy: { date: 'desc' },
      take: 100,
    }),
  ]);

  const matchedPaymentIds = (
    await prisma.strkBankStatementLine.findMany({
      where: { institutionId, status: 'matched', matchedPaymentId: { not: null } },
      select: { matchedPaymentId: true },
    })
  ).map((l) => l.matchedPaymentId!);

  const unreconciledPayments = await prisma.strkPayment.findMany({
    where: {
      status: 'paid',
      paidAt: { gte: fromDate, lte: toDate },
      id: { notIn: matchedPaymentIds },
      invoice: { institutionId },
    },
    orderBy: { paidAt: 'desc' },
    take: 100,
  });

  res.json({
    counts: { unmatched: unmatchedCount, matched: matchedCount, ignored: ignoredCount },
    unmatchedLines,
    unreconciledPayments,
  });
});

// --- Soldes à une date (Lot 5) ---------------------------------------------

const asOfQuerySchema = z.object({
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  format: z.enum(['csv', 'xlsx']).optional(),
});

financeRouter.get('/balances', requireRole(...FINANCE_ROLES), async (req, res) => {
  const institutionId = req.auth!.institutionId;
  if (!institutionId) {
    return res.status(400).json({ error: 'Aucun établissement associé à ce compte' });
  }
  const parsed = asOfQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Paramètre asOf requis (YYYY-MM-DD)' });
  }
  const asOf = new Date(`${parsed.data.asOf}T00:00:00.000Z`);
  const rows = await computeStudentBalances({ institutionId, asOf });
  const totals = rows.reduce(
    (acc, r) => {
      acc.totalCents += r.totalCents;
      acc.paidCents += r.paidCents;
      acc.balanceCents += r.balanceCents;
      return acc;
    },
    { totalCents: 0, paidCents: 0, balanceCents: 0 }
  );
  res.json({
    asOf: parsed.data.asOf,
    currency: rows[0]?.currency ?? 'XOF',
    totals,
    unpaidStudentCount: rows.filter((r) => r.balanceCents > 0).length,
    scheduleInvoiceCount: rows.reduce((s, r) => s + r.scheduleInvoiceCount, 0),
    rows,
  });
});

financeRouter.get('/balances/export', requireRole(...FINANCE_ROLES), async (req, res) => {
  const institutionId = req.auth!.institutionId;
  if (!institutionId) {
    return res.status(400).json({ error: 'Aucun établissement associé à ce compte' });
  }
  const parsed = asOfQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Paramètre asOf requis (YYYY-MM-DD)' });
  }
  const format = parsed.data.format ?? 'csv';
  const asOf = new Date(`${parsed.data.asOf}T00:00:00.000Z`);
  const rows = await computeStudentBalances({ institutionId, asOf });
  const columns = [
    { key: 'studentName', label: 'Élève', value: (r: (typeof rows)[0]) => r.studentName },
    { key: 'invoiceCount', label: 'Factures', value: (r: (typeof rows)[0]) => r.invoiceCount },
    {
      key: 'scheduleInvoiceCount',
      label: 'Dont grille',
      value: (r: (typeof rows)[0]) => r.scheduleInvoiceCount,
    },
    { key: 'totalCents', label: 'Total (centimes)', value: (r: (typeof rows)[0]) => r.totalCents },
    { key: 'paidCents', label: 'Payé (centimes)', value: (r: (typeof rows)[0]) => r.paidCents },
    { key: 'balanceCents', label: 'Solde (centimes)', value: (r: (typeof rows)[0]) => r.balanceCents },
    { key: 'currency', label: 'Devise', value: (r: (typeof rows)[0]) => r.currency },
  ];

  await logAudit({
    institutionId,
    actorId: req.auth!.sub,
    action: 'finance.balances.exported',
    targetType: 'institution',
    targetId: institutionId,
    metadata: { asOf: parsed.data.asOf, format, rowCount: rows.length },
    ipAddress: req.ip,
  });

  const base = `soldes-${parsed.data.asOf}`;
  if (format === 'xlsx') {
    const buffer = await toXlsx(`Soldes au ${parsed.data.asOf}`, rows, columns);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.xlsx"`);
    return res.send(buffer);
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${base}.csv"`);
  return res.send(toCsv(rows, columns));
});

// --- Échéanciers de paiement (FIN) ---

const paymentPlanSchema = z.object({
  studentId: z.string().uuid(),
  label: z.string().min(1),
  currency: z.string().default('XOF'),
  academicYear: z.string().optional(),
  installments: z
    .array(
      z.object({
        dueDate: z.string().min(1),
        amountCents: z.number().int().positive(),
        label: z.string().optional(),
      })
    )
    .min(1),
});

financeRouter.get('/payment-plans', requireRole(...FINANCE_ROLES), async (req, res) => {
  const institutionId = req.auth!.institutionId;
  if (!institutionId) {
    return res.status(400).json({ error: 'Aucun établissement associé à ce compte' });
  }
  const plans = await prisma.strkPaymentPlan.findMany({
    where: { institutionId },
    include: { invoices: { orderBy: { installmentIndex: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ plans });
});

financeRouter.post('/payment-plans', requireRole(...FINANCE_ROLES), async (req, res) => {
  const parsed = paymentPlanSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const auth = req.auth!;
  if (!auth.institutionId) {
    return res.status(400).json({ error: 'Aucun établissement associé à ce compte' });
  }
  const student = await prisma.strkStudent.findUnique({ where: { id: parsed.data.studentId } });
  if (!student || !isSameInstitution(auth, student.institutionId)) {
    return res.status(404).json({ error: 'Élève introuvable' });
  }
  const totalCents = parsed.data.installments.reduce((sum, i) => sum + i.amountCents, 0);
  const plan = await prisma.$transaction(async (tx) => {
    const created = await tx.strkPaymentPlan.create({
      data: {
        institutionId: auth.institutionId!,
        studentId: student.id,
        label: parsed.data.label,
        currency: parsed.data.currency,
        academicYear: parsed.data.academicYear,
        totalCents,
        createdBy: auth.sub,
      },
    });
    for (let i = 0; i < parsed.data.installments.length; i++) {
      const inst = parsed.data.installments[i];
      await tx.strkInvoice.create({
        data: {
          institutionId: auth.institutionId!,
          studentId: student.id,
          invoiceNumber: generateInvoiceNumber(),
          totalCents: inst.amountCents,
          currency: parsed.data.currency,
          dueDate: new Date(inst.dueDate),
          createdBy: auth.sub,
          paymentPlanId: created.id,
          installmentIndex: i + 1,
          lines: {
            create: [
              {
                label: inst.label || `${parsed.data.label} — échéance ${i + 1}`,
                amountCents: inst.amountCents,
                quantity: 1,
                lineType: 'fee',
              },
            ],
          },
        },
      });
    }
    return tx.strkPaymentPlan.findUniqueOrThrow({
      where: { id: created.id },
      include: { invoices: { orderBy: { installmentIndex: 'asc' }, include: { lines: true } } },
    });
  });
  await logAudit({
    institutionId: auth.institutionId,
    actorId: auth.sub,
    action: 'finance.payment_plan.created',
    targetType: 'payment_plan',
    targetId: plan.id,
    metadata: { studentId: student.id, totalCents, installments: parsed.data.installments.length },
    ipAddress: req.ip,
  });
  res.status(201).json({ plan });
});

financeRouter.patch('/payment-plans/:id/cancel', requireRole(...FINANCE_ROLES), async (req, res) => {
  const plan = await prisma.strkPaymentPlan.findUnique({
    where: { id: req.params.id },
    include: { invoices: true },
  });
  if (!plan || !isSameInstitution(req.auth!, plan.institutionId)) {
    return res.status(404).json({ error: 'Échéancier introuvable' });
  }
  if (plan.invoices.some((inv) => inv.paidCents > 0)) {
    return res.status(400).json({ error: 'Impossible d’annuler un échéancier déjà partiellement payé' });
  }
  await prisma.$transaction([
    prisma.strkInvoice.updateMany({
      where: { paymentPlanId: plan.id, paidCents: 0 },
      data: { status: 'cancelled' },
    }),
    prisma.strkPaymentPlan.update({ where: { id: plan.id }, data: { status: 'cancelled' } }),
  ]);
  const updated = await prisma.strkPaymentPlan.findUnique({
    where: { id: plan.id },
    include: { invoices: { orderBy: { installmentIndex: 'asc' } } },
  });
  res.json({ plan: updated });
});

// --- Surface publique Finance (sans authentification) ---
// Webhook CinetPay + vérification de reçu : montés ICI et pas sur
// `financeRouter` (qui applique `requireAuth` globalement). Sinon CinetPay
// reçoit 401 sur notify_url et FIN-005 ne peut jamais confirmer un paiement.

export const financePublicRouter = Router();

// CinetPay POST notify_url : le corps n'est jamais interprété comme preuve de
// paiement, uniquement comme déclencheur d'un appel de contrôle serveur.
financePublicRouter.post('/webhooks/cinetpay', async (req, res) => {
  const transactionId =
    (req.body?.cpm_trans_id as string | undefined) ?? (req.body?.transaction_id as string | undefined);
  if (!transactionId) {
    return res.status(400).send('transaction_id manquant');
  }
  try {
    const result = await checkTransactionStatus(transactionId);
    const payment = await prisma.strkPayment.findUnique({ where: { id: transactionId }, include: { invoice: true } });
    if (payment) {
      if (result.status === 'ACCEPTED' && payment.status === 'pending') {
        await prisma.strkPayment.update({
          where: { id: payment.id },
          data: {
            status: 'paid',
            paidAt: new Date(),
            receiptNumber: generateReceiptNumber(),
            verificationToken: generateVerificationToken(),
            providerPaymentId: result.operatorId,
          },
        });
        await ensureSingleAllocation(payment.id, payment.invoiceId, payment.amountCents);
        await recomputeInvoiceStatus(payment.invoiceId);
        await logAudit({
          institutionId: payment.invoice.institutionId,
          actorId: null,
          action: 'finance.payment.cinetpay_confirmed',
          targetType: 'payment',
          targetId: payment.id,
          metadata: { invoiceId: payment.invoiceId, operatorId: result.operatorId },
        });
      } else if (result.status === 'REFUSED' && payment.status === 'pending') {
        await prisma.strkPayment.update({ where: { id: payment.id }, data: { status: 'failed' } });
      }
      return res.sendStatus(200);
    }

    // Frais de dossier admissions (même notify_url) — confirmation serveur uniquement.
    if (result.status === 'ACCEPTED') {
      const { markAdmissionFeePaidByProviderRef } = await import('./admissions.routes.js');
      await markAdmissionFeePaidByProviderRef(transactionId, 'cinetpay');
    }
    res.sendStatus(200);
  } catch (error) {
    console.error('Erreur webhook CinetPay:', error);
    res.sendStatus(500);
  }
});

financePublicRouter.get('/verify/:token', async (req, res) => {
  const payment = await prisma.strkPayment.findUnique({
    where: { verificationToken: req.params.token },
    include: { invoice: true },
  });
  if (!payment || payment.status !== 'paid') {
    return res.status(404).json({ valid: false });
  }
  res.json({
    valid: true,
    receiptNumber: payment.receiptNumber,
    amountCents: payment.amountCents,
    currency: payment.currency,
    method: payment.method,
    paidAt: payment.paidAt,
    invoiceNumber: payment.invoice.invoiceNumber,
  });
});
