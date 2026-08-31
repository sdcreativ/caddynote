/**
 * Backfill one-shot : frais d’admission XOF/XAF saisis via le piège Number("12.000")===12.
 * Critère : montant majeur (cents/100) ∈ [1, 99] → ×1000 (ex. 1200 → 1_200_000 = 12 000 FCFA).
 *
 * Usage (staging) :
 *   npx tsx scripts/backfill-admission-fee-truncation.ts --dry-run
 *   npx tsx scripts/backfill-admission-fee-truncation.ts --apply
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

async function main() {
  const rows = await prisma.strkAdmissionApplication.findMany({
    where: {
      applicationFeeCents: { not: null, gt: 0 },
      OR: [
        { applicationFeeCurrency: null },
        { applicationFeeCurrency: { in: ['XOF', 'xof', 'XAF', 'xaf'] } },
      ],
    },
    select: {
      id: true,
      studentFirstName: true,
      studentLastName: true,
      applicationFeeCents: true,
      applicationFeeCurrency: true,
    },
  });

  const targets = rows.filter((r) => {
    const cents = r.applicationFeeCents!;
    const major = cents / 100;
    return major >= 1 && major < 100 && cents % 100 === 0;
  });

  console.log(`Candidats : ${targets.length} / ${rows.length}`);
  for (const r of targets) {
    const from = r.applicationFeeCents!;
    const to = from * 1000;
    console.log(
      `${r.id} ${r.studentFirstName} ${r.studentLastName}: ${from} → ${to} (${to / 100} FCFA)`
    );
    if (apply) {
      await prisma.strkAdmissionApplication.update({
        where: { id: r.id },
        data: { applicationFeeCents: to },
      });
    }
  }
  if (!apply) console.log('Dry-run — relancer avec --apply pour écrire.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
