import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';

/**
 * Backfill Lot 1 — rattache les `StrkFeeItem` existants au catalogue de types.
 *
 * - Si `feeTypeCode` est déjà renseigné → inchangé
 * - Sinon → `OTHER_FEE` + origine `institution` (mapping soft, non destructif)
 *
 * Usage (local uniquement) :
 *   npx tsx scripts/backfill-fee-type-codes.ts
 *
 * Idempotent. Ne supprime aucune donnée.
 */
async function main() {
  const beforeTotal = await prisma.strkFeeItem.count();
  const beforeMissing = await prisma.strkFeeItem.count({
    where: { OR: [{ feeTypeCode: null }, { feeTypeCode: '' }] },
  });
  const beforeWithCode = beforeTotal - beforeMissing;

  console.log('=== backfill-fee-type-codes — avant ===');
  console.log(`FeeItems total     : ${beforeTotal}`);
  console.log(`Avec feeTypeCode   : ${beforeWithCode}`);
  console.log(`Sans feeTypeCode   : ${beforeMissing}`);

  const otherType = await prisma.strkFeeType.findFirst({
    where: { institutionId: null, code: 'OTHER_FEE' },
    select: { id: true, code: true },
  });

  if (!otherType) {
    throw new Error(
      'Catalogue plateforme OTHER_FEE introuvable — appliquer d’abord les migrations Lot 1.',
    );
  }

  const result = await prisma.strkFeeItem.updateMany({
    where: { OR: [{ feeTypeCode: null }, { feeTypeCode: '' }] },
    data: {
      feeTypeCode: otherType.code,
      feeTypeId: otherType.id,
      feeOrigin: 'institution',
    },
  });

  const afterMissing = await prisma.strkFeeItem.count({
    where: { OR: [{ feeTypeCode: null }, { feeTypeCode: '' }] },
  });
  const afterWithCode = await prisma.strkFeeItem.count({
    where: { feeTypeCode: { not: null } },
  });

  console.log('=== backfill-fee-type-codes — après ===');
  console.log(`Lignes mises à jour : ${result.count}`);
  console.log(`Avec feeTypeCode   : ${afterWithCode}`);
  console.log(`Sans feeTypeCode   : ${afterMissing}`);
  console.log('Backfill terminé (aucune suppression).');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
