/**
 * Purge les données de démonstration (@caddynote.test, « École Démo* »).
 *
 * Stratégie : **anonymisation + désactivation** (pas de DELETE hard).
 * Les FK (absences, logs, classes…) restent intactes ; plus aucune connexion
 * possible avec les anciens e-mails démo.
 *
 *   cd server && npm run purge:demo
 *   cd server && npx tsx scripts/purge-demo-data.ts --dry-run
 *
 * Refuse CADDYNOTE_DEPLOYMENT=production sauf PURGE_DEMO_ALLOW_PROD=true.
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';
import { logDatabaseTarget } from '../src/lib/databaseTarget.js';
import { anonymizeInstitution } from '../src/lib/institutionOffboard.js';

const dryRun = process.argv.includes('--dry-run');

const anonymizeDemoProfile = async (id: string, actorId: string) => {
  const anonEmail = `anon-demo-${id.replace(/-/g, '').slice(0, 16)}@anon.invalid`;
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.strkProfile.update({
      where: { id },
      data: {
        email: anonEmail,
        firstName: 'Anonyme',
        lastName: 'Demo',
        phoneNumber: null,
        profileImage: null,
        passwordHash: null,
        mfaEnabled: false,
        mfaSecret: null,
        mfaBackupCodeHashes: [],
        passwordResetToken: null,
        passwordResetExpires: null,
        isActive: false,
        deactivatedAt: now,
        deactivatedBy: actorId,
      },
    });
    await tx.strkSession.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.strkStudent.updateMany({
      where: { id },
      data: { studentNumber: null },
    });
    await tx.strkTeacher.updateMany({
      where: { id },
      data: { employeeNumber: null },
    });
  });
  return anonEmail;
};

async function main() {
  logDatabaseTarget();
  const deployment = (process.env.CADDYNOTE_DEPLOYMENT || '').trim().toLowerCase();
  if (deployment === 'production' && process.env.PURGE_DEMO_ALLOW_PROD !== 'true') {
    throw new Error(
      'Refus : purge démo en production — PURGE_DEMO_ALLOW_PROD=true uniquement si volontaire et documenté'
    );
  }

  const demoProfiles = await prisma.strkProfile.findMany({
    where: { email: { endsWith: '@caddynote.test' } },
    select: { id: true, email: true, role: true },
  });
  const demoInstitutions = await prisma.strkInstitution.findMany({
    where: {
      OR: [
        { name: { contains: 'École Démo' } },
        { name: { contains: 'Ecole Demo' } },
        { name: { contains: 'École Demo' } },
      ],
    },
    select: { id: true, name: true },
  });

  console.log(`Profils @caddynote.test : ${demoProfiles.length}`);
  for (const p of demoProfiles) console.log(`  - ${p.email} (${p.role})`);
  console.log(`Établissements démo : ${demoInstitutions.length}`);
  for (const i of demoInstitutions) console.log(`  - ${i.name} (${i.id})`);

  if (dryRun) {
    console.log('\n--dry-run : aucune modification (anonymisation prévue)');
    return;
  }

  if (!demoProfiles.length && !demoInstitutions.length) {
    console.log('\nRien à purger');
    return;
  }

  const actorId = demoProfiles[0]?.id ?? demoInstitutions[0]?.id;
  if (!actorId) return;

  let profilesDone = 0;
  for (const p of demoProfiles) {
    const anon = await anonymizeDemoProfile(p.id, actorId);
    console.log(`Anonymisé : ${p.email} → ${anon}`);
    profilesDone += 1;
  }

  let institutionsDone = 0;
  for (const inst of demoInstitutions) {
    // anonymizeInstitution gèle le tenant + anonymise les profils encore
    // rattachés (hors admin global). Les @caddynote.test déjà traités ci-dessus
    // ont un e-mail @anon.invalid.
    const { usersAnonymized } = await anonymizeInstitution(inst.id, actorId);
    console.log(`Établissement gelé/anonymisé : ${inst.name} (+${usersAnonymized} comptes liés)`);
    institutionsDone += 1;
  }

  const leftover = await prisma.strkProfile.count({
    where: { email: { endsWith: '@caddynote.test' } },
  });
  const leftoverInst = await prisma.strkInstitution.count({
    where: {
      OR: [{ name: { contains: 'École Démo' } }, { name: { contains: 'Ecole Demo' } }],
    },
  });

  console.log('\nPurge démo terminée (soft — historique conservé, login démo impossible)');
  console.log(`  profils traités : ${profilesDone}`);
  console.log(`  établissements  : ${institutionsDone}`);
  console.log(`  reste @caddynote.test : ${leftover}`);
  console.log(`  reste nom « Démo »    : ${leftoverInst}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
