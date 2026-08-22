/**
 * Désigne l’établissement pilote pour la recette terrain (Lot 12).
 *
 * Usage :
 *   cd server && PILOT_INSTITUTION_ID=<uuid> npm run seed:pilot
 *
 * Active le feature flag `recetteTerrain` (SAA-005) sur cet établissement seul.
 * Plus de stand-in « École Démo » — l’UUID est obligatoire.
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';
import { setFeatureOverride, getFeatureSnapshot } from '../src/lib/featureFlags.js';
import { logDatabaseTarget } from '../src/lib/databaseTarget.js';

const FLAG = 'recetteTerrain';

async function main() {
  logDatabaseTarget();

  const forcedId = process.env.PILOT_INSTITUTION_ID?.trim();
  const label = process.env.PILOT_LABEL?.trim();

  if (!forcedId) {
    throw new Error(
      'PILOT_INSTITUTION_ID requis (UUID établissement). Les établissements démo ont été retirés.'
    );
  }

  let institution = await prisma.strkInstitution.findUnique({ where: { id: forcedId } });

  if (!institution) {
    throw new Error(`Établissement introuvable : ${forcedId}`);
  }

  if (label && label !== institution.name) {
    institution = await prisma.strkInstitution.update({
      where: { id: institution.id },
      data: { name: label },
    });
  }

  await setFeatureOverride(institution.id, FLAG, true);
  const snap = await getFeatureSnapshot(institution.id);

  const others = await prisma.strkInstitution.findMany({
    where: { id: { not: institution.id } },
    select: { id: true, name: true, featureOverrides: true },
  });
  for (const other of others) {
    const overrides = (other.featureOverrides as Record<string, boolean> | null) ?? {};
    if (Object.prototype.hasOwnProperty.call(overrides, FLAG)) {
      await setFeatureOverride(other.id, FLAG, null);
      console.log(`Flag ${FLAG} retiré de : ${other.name}`);
    }
  }

  console.log('\nÉtablissement pilote désigné');
  console.log(`  id    : ${institution.id}`);
  console.log(`  nom   : ${institution.name}`);
  console.log(`  flag  : ${FLAG}=${snap.effective[FLAG] ?? snap.overrides[FLAG]}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
