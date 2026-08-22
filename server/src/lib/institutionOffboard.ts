import { prisma } from './prisma.js';
import { logAudit } from './audit.js';
import { estimateInstitutionStorageBytes } from './quotas.js';

/** Export bulk JSON pour offboarding (pas un ZIP — consommable API). */
export const exportInstitutionBundle = async (institutionId: string) => {
  const institution = await prisma.strkInstitution.findUnique({ where: { id: institutionId } });
  if (!institution) {
    throw Object.assign(new Error('Établissement introuvable'), { status: 404 });
  }

  const [
    profiles,
    classes,
    students,
    subscriptions,
    invoices,
    tickets,
    auditSample,
    storageBytes,
  ] = await Promise.all([
    prisma.strkProfile.findMany({
      where: { institutionId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    }),
    prisma.strkClass.findMany({
      where: { institutionId },
      select: { id: true, name: true, academicYear: true, createdAt: true },
    }),
    prisma.strkStudent.findMany({
      where: { institutionId },
      select: { id: true, studentNumber: true, classId: true },
      take: 5000,
    }),
    prisma.premiumSubscription.findMany({ where: { institutionId } }),
    prisma.strkInvoice.findMany({
      where: { institutionId },
      select: { id: true, status: true, totalCents: true, createdAt: true },
      take: 2000,
    }),
    prisma.strkSupportTicket.findMany({
      where: { institutionId },
      select: { id: true, subject: true, status: true, createdAt: true },
    }),
    prisma.strkAuditLog.findMany({
      where: { institutionId },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
    estimateInstitutionStorageBytes(institutionId),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    institution: {
      id: institution.id,
      name: institution.name,
      type: institution.type,
      email: institution.email,
      phone: institution.phone,
      address: institution.address,
    },
    counts: {
      profiles: profiles.length,
      classes: classes.length,
      students: students.length,
      subscriptions: subscriptions.length,
      invoices: invoices.length,
      tickets: tickets.length,
      storageBytes,
    },
    profiles,
    classes,
    students,
    subscriptions,
    invoices,
    tickets,
    auditSample,
  };
};

/** Anonymise PII établissement + comptes liés (soft). Irréversible. */
export const anonymizeInstitution = async (
  institutionId: string,
  actorId: string
): Promise<{ usersAnonymized: number }> => {
  const institution = await prisma.strkInstitution.findUnique({ where: { id: institutionId } });
  if (!institution) {
    throw Object.assign(new Error('Établissement introuvable'), { status: 404 });
  }

  const stamp = Date.now();
  await prisma.strkInstitution.update({
    where: { id: institutionId },
    data: {
      name: `Établissement anonymisé ${institutionId.slice(0, 8)}`,
      email: `anon-inst-${institutionId.slice(0, 8)}@anon.invalid`,
      phone: null,
      address: null,
      logo: null,
      featureOverrides: {
        ...((institution.featureOverrides as object) || {}),
        __ops_frozen: true,
        __offboarded: true,
      },
    },
  });

  const users = await prisma.strkProfile.findMany({
    where: { institutionId, role: { not: 'admin' } },
    select: { id: true },
  });

  let usersAnonymized = 0;
  for (const u of users) {
    const anonEmail = `anon-${u.id.slice(0, 8)}-${stamp}@anon.invalid`;
    await prisma.strkProfile.update({
      where: { id: u.id },
      data: {
        email: anonEmail,
        firstName: 'Anonyme',
        lastName: 'Anonyme',
        phoneNumber: null,
        profileImage: null,
        isActive: false,
        deactivatedAt: new Date(),
        deactivatedBy: actorId,
        passwordHash: null,
        mfaEnabled: false,
        mfaSecret: null,
        mfaBackupCodeHashes: [],
      },
    });
    usersAnonymized += 1;
  }

  await logAudit({
    institutionId,
    actorId,
    action: 'institution.offboard.anonymize',
    targetType: 'institution',
    targetId: institutionId,
    metadata: { usersAnonymized },
  });

  return { usersAnonymized };
};
