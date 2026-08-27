/**
 * Hard wipe STAGING — vide le graphe métier (établissements, parents,
 * enseignants, élèves, admissions, devoirs, finances tenant, etc.).
 *
 * Conserve :
 *   - comptes `role=admin` (plateforme)
 *   - catalogues plateforme (plans, RBAC, cycles/niveaux, grilles nationales,
 *     settings, fee types / doc types admission avec institution_id NULL)
 *
 * Usage (local / conteneur API) :
 *   npx tsx scripts/staging-hard-wipe.ts --dry-run
 *   STAGING_HARD_WIPE_CONFIRM=YES_WIPE_STAGING npx tsx scripts/staging-hard-wipe.ts
 *
 * Sur le VPS (après backup pg_dump) :
 *   docker compose -f docker-compose.yml -f docker-compose.staging.yml --profile split exec -T \
 *     -e STAGING_HARD_WIPE_CONFIRM=YES_WIPE_STAGING caddynote-api \
 *     sh -c 'cd /app && npx tsx scripts/staging-hard-wipe.ts --dry-run'
 *
 * Refuse production. Irréversible sans restore du dump.
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';
import { logDatabaseTarget, getDatabaseTarget } from '../src/lib/databaseTarget.js';

const dryRun = process.argv.includes('--dry-run');
const CONFIRM = 'YES_WIPE_STAGING';

/** Tables 100 % opérationnelles / tenant — TRUNCATE (pas les catalogues plateforme). */
const TRUNCATE_TABLES = [
  // Admissions (runtime + config tenant)
  'strk_admission_document_items',
  'strk_admission_applications',
  'strk_admission_packet_requirements',
  'strk_admission_packet_templates',
  'strk_admission_rejection_reasons',
  // Devoirs / exercices / présence
  'strk_assignment_reminders',
  'strk_submissions',
  'strk_assignments',
  'strk_exercise_progress',
  'strk_exercise_attempts',
  'strk_exercise_assignments',
  'strk_exercise_questions',
  'strk_exercises',
  'strk_attendances',
  'strk_absences',
  'strk_threshold_alerts',
  'strk_grades',
  'strk_grade_computations',
  'strk_pedagogical_observations',
  'strk_disciplinary_incidents',
  'strk_signatures',
  // Emploi du temps / cours / classes
  'strk_schedule_exceptions',
  'strk_schedules',
  'strk_teacher_availabilities',
  'strk_lesson_entries',
  'strk_course_materials',
  'strk_course_students',
  'strk_courses',
  'strk_class_subjects',
  'strk_student_classes',
  'strk_class_students',
  'strk_classes',
  'strk_subjects',
  'strk_academic_periods',
  'strk_grading_scales',
  'strk_campuses',
  // Personnes (extensions)
  'strk_student_guardians',
  'strk_student_health_info',
  'strk_student_fee_assignments',
  'strk_students',
  'strk_teachers',
  // Finance tenant
  'strk_refunds',
  'strk_payments',
  'strk_invoice_lines',
  'strk_invoices',
  'strk_payment_plans',
  'strk_bank_statement_lines',
  'strk_fee_plan_template_steps',
  'strk_fee_plan_templates',
  'strk_fee_schedule_items',
  'strk_fee_schedules',
  'strk_fee_items',
  'billing_history',
  'subscription_notifications',
  'premium_subscriptions',
  // Services annexes
  'strk_transport_enrollments',
  'strk_transport_routes',
  'strk_canteen_subscriptions',
  'strk_canteen_plans',
  'strk_library_loans',
  'strk_library_items',
  'strk_boarding_assignments',
  'strk_boarding_rooms',
  'strk_clinic_visits',
  'strk_hr_staff_records',
  // Comms / docs / support / analytics
  'strk_communication_logs',
  'strk_communication_preferences',
  'strk_message_templates',
  'strk_messages',
  'strk_documents',
  'strk_document_templates',
  'strk_support_ticket_messages',
  'strk_support_tickets',
  'strk_reports',
  'strk_analytics',
  'strk_dashboard_stats',
  'strk_activities',
  'strk_audit_logs',
  'strk_notifications',
  'notifications',
  'strk_notification_settings',
  'strk_sessions',
  'strk_contact_messages',
] as const;

const PRESERVE_HINT = [
  'strk_profiles (admins only)',
  'strk_settings',
  'strk_platform_*',
  'subscription_plans',
  'strk_education_cycles / strk_grade_levels',
  'strk_national_fee_*',
  'strk_fee_types / strk_admission_document_types (institution_id NULL)',
];

async function countRows(table: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*)::bigint AS c FROM "${table}"`
  );
  return Number(rows[0]?.c ?? 0);
}

async function main() {
  logDatabaseTarget();
  const deployment = (process.env.CADDYNOTE_DEPLOYMENT || '').trim().toLowerCase();
  if (deployment === 'production') {
    throw new Error('Refus : staging-hard-wipe interdit en CADDYNOTE_DEPLOYMENT=production');
  }
  if (deployment && deployment !== 'staging' && process.env.STAGING_HARD_WIPE_ALLOW_OTHER !== 'true') {
    throw new Error(
      `Refus : CADDYNOTE_DEPLOYMENT="${deployment || '(vide)'}" — attendu "staging" ` +
        `(ou STAGING_HARD_WIPE_ALLOW_OTHER=true pour un lab local)`
    );
  }

  const target = getDatabaseTarget();
  console.log(`Cible : ${target ? `${target.host}:${target.port}/${target.database}` : '(illisible)'}`);
  console.log(`Mode  : ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`Conserve : ${PRESERVE_HINT.join(' · ')}`);

  const admins = await prisma.strkProfile.findMany({
    where: { role: 'admin', isActive: true },
    select: { id: true, email: true },
  });
  if (admins.length === 0) {
    throw new Error('Aucun admin plateforme actif — abort (évite un lock-out)');
  }
  console.log(`\nAdmins conservés (${admins.length}) :`);
  for (const a of admins) console.log(`  - ${a.email} (${a.id})`);

  const institutions = await prisma.strkInstitution.count();
  const nonAdmins = await prisma.strkProfile.count({ where: { role: { not: 'admin' } } });
  const parents = await prisma.strkProfile.count({ where: { role: 'parent' } });
  const teachers = await prisma.strkProfile.count({ where: { role: 'teacher' } });
  const assignments = await countRows('strk_assignments');
  const admissions = await countRows('strk_admission_applications');

  console.log('\nVolumes actuels :');
  console.log(`  établissements     : ${institutions}`);
  console.log(`  profils non-admin  : ${nonAdmins} (parents=${parents}, teachers=${teachers})`);
  console.log(`  admissions         : ${admissions}`);
  console.log(`  devoirs            : ${assignments}`);

  const truncatePreview: Array<{ table: string; count: number }> = [];
  for (const table of TRUNCATE_TABLES) {
    try {
      truncatePreview.push({ table, count: await countRows(table) });
    } catch {
      truncatePreview.push({ table, count: -1 });
    }
  }
  const nonempty = truncatePreview.filter((t) => t.count > 0);
  console.log(`\nTables à TRUNCATE avec données : ${nonempty.length}`);
  for (const t of nonempty.slice(0, 25)) {
    console.log(`  - ${t.table}: ${t.count}`);
  }
  if (nonempty.length > 25) console.log(`  … +${nonempty.length - 25} autres`);

  if (dryRun) {
    console.log('\n--dry-run : aucune modification. Relancer sans --dry-run avec STAGING_HARD_WIPE_CONFIRM=YES_WIPE_STAGING');
    return;
  }

  if (process.env.STAGING_HARD_WIPE_CONFIRM !== CONFIRM) {
    throw new Error(
      `Refus : définir STAGING_HARD_WIPE_CONFIRM=${CONFIRM} pour appliquer (après backup pg_dump)`
    );
  }

  console.log('\n1) Détache admin_id / institution_id des admins…');
  await prisma.$executeRawUnsafe(`UPDATE "strk_institutions" SET "admin_id" = NULL`);
  await prisma.strkProfile.updateMany({
    where: { role: 'admin' },
    data: { institutionId: null, groupId: null },
  });

  console.log('2) TRUNCATE tables opérationnelles…');
  const quoted = TRUNCATE_TABLES.map((t) => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);

  console.log('3) Purge catalogues tenant (fee types / doc types admission)…');
  await prisma.$executeRawUnsafe(
    `DELETE FROM "strk_fee_types" WHERE "institution_id" IS NOT NULL`
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "strk_admission_document_types" WHERE "institution_id" IS NOT NULL`
  );

  console.log('4) Suppression profils non-admin…');
  const deletedProfiles = await prisma.strkProfile.deleteMany({ where: { role: { not: 'admin' } } });
  console.log(`   profils supprimés : ${deletedProfiles.count}`);

  console.log('5) Suppression établissements + groupes vides…');
  const deletedInst = await prisma.strkInstitution.deleteMany({});
  const deletedGroups = await prisma.strkInstitutionGroup.deleteMany({});
  console.log(`   établissements : ${deletedInst.count}`);
  console.log(`   groupes        : ${deletedGroups.count}`);

  const leftAdmins = await prisma.strkProfile.count({ where: { role: 'admin', isActive: true } });
  const leftInst = await prisma.strkInstitution.count();
  const leftNonAdmin = await prisma.strkProfile.count({ where: { role: { not: 'admin' } } });
  console.log('\nWipe terminé.');
  console.log(`  admins restants     : ${leftAdmins}`);
  console.log(`  établissements      : ${leftInst}`);
  console.log(`  profils non-admin   : ${leftNonAdmin}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
