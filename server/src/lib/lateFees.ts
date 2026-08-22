import { scheduleExclusiveCron } from './cronLock.js';
import { prisma } from './prisma.js';
import { logAudit } from './audit.js';

/**
 * FIN-002 : pénalité de retard de paiement — même principe que les seuils
 * d'assiduité (PRS-006) : désactivée tant qu'un établissement n'a pas
 * explicitement configuré `lateFeeCents` (`null` par défaut), montant fixe
 * plutôt qu'un pourcentage composé qui ferait enfler une dette sans borne.
 *
 * Anti-doublon : une seule pénalité par facture, jamais réappliquée même si
 * la vérification tourne plusieurs fois (une ligne `lineType: 'penalty'`
 * déjà présente sur la facture l'exclut des candidats).
 *
 * Une pénalité est une ligne de facture ordinaire (comme une remise, FIN-002
 * plus tôt) — jamais une pénalité composée sur elle-même : une facture déjà
 * pénalisée n'est plus retenue lors des exécutions suivantes.
 */

export const runLateFeeCheck = async (): Promise<{ checked: number; feesApplied: number }> => {
  const institutions = await prisma.strkInstitution.findMany({
    where: { lateFeeCents: { not: null } },
  });

  let checked = 0;
  let feesApplied = 0;

  for (const institution of institutions) {
    if (!institution.lateFeeCents) continue;
    const graceCutoff = new Date(Date.now() - institution.lateFeeGraceDays * 24 * 60 * 60 * 1000);

    const candidates = await prisma.strkInvoice.findMany({
      where: {
        institutionId: institution.id,
        status: { in: ['issued', 'partially_paid', 'overdue'] },
        dueDate: { not: null, lt: graceCutoff },
      },
      include: { lines: true },
    });
    checked += candidates.length;

    for (const invoice of candidates) {
      const alreadyPenalized = invoice.lines.some((l) => l.lineType === 'penalty');
      // Garde de cohérence : un statut pas encore rafraîchi ne doit jamais
      // faire appliquer une pénalité sur une facture en réalité déjà soldée.
      if (alreadyPenalized || invoice.paidCents >= invoice.totalCents) continue;

      await prisma.$transaction([
        prisma.strkInvoiceLine.create({
          data: {
            invoiceId: invoice.id,
            label: 'Pénalité de retard',
            amountCents: institution.lateFeeCents,
            quantity: 1,
            lineType: 'penalty',
          },
        }),
        prisma.strkInvoice.update({
          where: { id: invoice.id },
          data: {
            totalCents: invoice.totalCents + institution.lateFeeCents,
            status: 'overdue',
          },
        }),
      ]);
      await logAudit({
        institutionId: institution.id,
        actorId: null,
        action: 'finance.late_fee_applied',
        targetType: 'invoice',
        targetId: invoice.id,
        metadata: { amountCents: institution.lateFeeCents, graceDays: institution.lateFeeGraceDays },
      });
      feesApplied += 1;
    }
  }

  return { checked, feesApplied };
};

let started = false;

/** Démarre la tâche planifiée (une fois par jour) — même fréquence que les
 * seuils d'assiduité (PRS-006), pas besoin d'une vérification horaire. */
export const startLateFeeCron = (): void => {
  if (started) return;
  started = true;
  scheduleExclusiveCron('0 6 * * *', 'late-fees', async () => {
    const { checked, feesApplied } = await runLateFeeCheck();
    console.log(
      `⏰ Pénalités de retard : ${checked} facture(s) examinée(s), ${feesApplied} pénalité(s) appliquée(s)`
    );
  });
  console.log('⏰ Tâche planifiée « pénalités de retard » enregistrée (tous les jours à 6h)');
};
