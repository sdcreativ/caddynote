import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { hashPassword } from '../lib/password.js';
import { generateTempPassword } from '../lib/tempPassword.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { isGlobalAdmin, isSameInstitution, SECRETARIAT_ROLES, INSTITUTION_STAFF_ROLES } from '../lib/authz.js';
import { PUBLIC_PROFILE_SELECT } from '../lib/profileSelect.js';
import { logAudit } from '../lib/audit.js';
import { sendAccountInvite } from '../lib/accountInvite.js';
import { checkQuota, QUOTA_LABELS } from '../lib/quotas.js';
import { ensureRoleExtension } from '../lib/roleExtensions.js';
import { isOwnedObjectKey } from '../lib/s3.js';
import { optionalEmail, optionalString, requiredEmail } from '../lib/zodHelpers.js';
import { importTeachersFromCsv } from '../lib/teacherImport.js';
import { parseCsvWithHeader } from '../lib/csvImport.js';
import { computeMfaGraceUntil } from '../lib/mfa.js';

export const usersRouter = Router();

usersRouter.use(requireAuth);

const isStaff = (role: string) => INSTITUTION_STAFF_ROLES.includes(role as (typeof INSTITUTION_STAFF_ROLES)[number]);

// GET /users?institutionId=... — remplace fetchStrkUsersByInstitution / fetchAllStrkUsers.
usersRouter.get('/', requireRole(...INSTITUTION_STAFF_ROLES), async (req, res) => {
  const institutionId = typeof req.query.institutionId === 'string' ? req.query.institutionId : undefined;

  if (!institutionId) {
    // Liste globale : réservée à l'admin (équivalent fetchAllStrkUsers).
    if (!isGlobalAdmin(req.auth!)) {
      return res.status(403).json({ error: 'Permissions insuffisantes' });
    }
    const users = await prisma.strkProfile.findMany({
      select: PUBLIC_PROFILE_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ users });
  }

  if (!isSameInstitution(req.auth!, institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const users = await prisma.strkProfile.findMany({
    where: { institutionId },
    select: PUBLIC_PROFILE_SELECT,
    orderBy: { createdAt: 'desc' },
  });
  res.json({ users });
});

const teacherImportSchema = z.object({
  csv: z.string().min(1),
  institutionId: z.string().uuid(),
});

// Chap. 22.1 — import CSV enseignants (avant /:id pour ne pas capturer "import").
usersRouter.post('/import', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const parsed = teacherImportSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  if (!isSameInstitution(req.auth!, parsed.data.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }

  const rowCount = parseCsvWithHeader(parsed.data.csv).length;
  const usersQuota = await checkQuota(parsed.data.institutionId, 'users', rowCount);
  if (!usersQuota.allowed) {
    return res.status(403).json({
      error: `Cet import (${rowCount} ligne(s)) dépasserait le quota de ${QUOTA_LABELS.users} du plan actuel (${usersQuota.current}/${usersQuota.limit}). Réduisez le fichier ou mettez à niveau l'abonnement.`,
    });
  }

  const summary = await importTeachersFromCsv(parsed.data.csv, parsed.data.institutionId, req.auth!.sub);
  res.json(summary);
});

usersRouter.get('/:id', async (req, res) => {
  if (req.auth!.sub !== req.params.id && !isStaff(req.auth!.role)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }

  const profile = await prisma.strkProfile.findUnique({
    where: { id: req.params.id },
    select: PUBLIC_PROFILE_SELECT,
  });
  if (!profile) {
    return res.status(404).json({ error: 'Utilisateur introuvable' });
  }
  if (req.auth!.sub !== profile.id && !isSameInstitution(req.auth!, profile.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  res.json({ user: profile });
});

const createUserSchema = z.object({
  email: requiredEmail,
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(['admin', 'school_admin', 'teacher', 'student', 'parent', 'group_owner', 'secretary', 'accountant', 'supervisor', 'head_teacher']),
  institutionId: z.string().uuid().optional(),
  phoneNumber: z.string().optional(),
});

// Rôles à portée "cross-tenant" (admin global, propriétaire de groupe) —
// jamais assignables par un school_admin, qui ne doit pouvoir créer que du
// personnel/élèves/parents de son propre établissement (élévation de
// privilège sinon : rien ne l'empêchait auparavant de créer un compte
// `admin`).
const CROSS_TENANT_ROLES = new Set(['admin', 'group_owner']);

/**
 * Création d'un utilisateur par le personnel, avec mot de passe temporaire.
 * Invitation réelle : e-mail (SMTP) et SMS (Twilio) si configurés ; le mot
 * de passe est aussi renvoyé dans la réponse (repli si l'envoi échoue).
 */
usersRouter.post('/', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const { email, firstName, lastName, role, phoneNumber } = parsed.data;
  let { institutionId } = parsed.data;

  // Un school_admin ne peut créer que dans son propre établissement, et
  // jamais un compte à portée cross-tenant (admin global, group_owner).
  if (!isGlobalAdmin(req.auth!)) {
    if (CROSS_TENANT_ROLES.has(role)) {
      return res.status(403).json({ error: 'Permissions insuffisantes pour ce rôle' });
    }
    if (institutionId && !isSameInstitution(req.auth!, institutionId)) {
      return res.status(403).json({ error: 'Permissions insuffisantes pour cet établissement' });
    }
    institutionId = req.auth!.institutionId ?? undefined;
  }

  const existing = await prisma.strkProfile.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: 'Un compte existe déjà avec cet e-mail' });
  }

  // SAA-003 : quota de comptes, et quota élèves spécifiquement pour ce rôle
  // — vérifiés avant toute création, jamais découverts après coup. Sans
  // établissement (admin global, group_owner) : aucun quota ne s'applique,
  // ce sont des comptes de plateforme, pas des comptes facturés à un plan.
  if (institutionId) {
    const usersQuota = await checkQuota(institutionId, 'users');
    if (!usersQuota.allowed) {
      return res.status(403).json({
        error: `Quota de ${QUOTA_LABELS.users} atteint pour le plan actuel (${usersQuota.current}/${usersQuota.limit}). Mettez à niveau l'abonnement pour créer d'autres comptes.`,
      });
    }
    if (role === 'student') {
      const studentsQuota = await checkQuota(institutionId, 'students');
      if (!studentsQuota.allowed) {
        return res.status(403).json({
          error: `Quota de ${QUOTA_LABELS.students} atteint pour le plan actuel (${studentsQuota.current}/${studentsQuota.limit}). Mettez à niveau l'abonnement pour inscrire d'autres élèves.`,
        });
      }
    }
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  try {
    const user = await prisma.strkProfile.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        role,
        phoneNumber,
        institutionId,
        mustChangePassword: true,
      },
      select: PUBLIC_PROFILE_SELECT,
    });
    // Bug réel corrigé le 16/08/2026 (voir lib/roleExtensions.ts) : sans
    // ceci, un compte élève/enseignant créé depuis cet écran restait
    // inutilisable partout où l'app indexe sur StrkStudent/StrkTeacher.
    await ensureRoleExtension(user.id, role, institutionId);
    await logAudit({
      institutionId: institutionId ?? null,
      actorId: req.auth!.sub,
      action: 'user.created',
      targetType: 'user',
      targetId: user.id,
      metadata: { role, email },
      ipAddress: req.ip,
    });
    // IAM-001 : e-mail + SMS (si téléphone + Twilio) — mot de passe aussi
    // renvoyé au personnel (repli si les canaux ne sont pas configurés).
    const { emailSent, smsSent } = await sendAccountInvite({
      email,
      firstName,
      tempPassword,
      phoneNumber,
      role,
      accountKind: role,
    });
    res.status(201).json({ user, tempPassword, emailSent, smsSent });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ error: 'Un compte existe déjà avec cet e-mail' });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return res.status(400).json({ error: "L'établissement indiqué est introuvable" });
    }
    console.error('Create user error:', error);
    res.status(500).json({ error: "Erreur lors de la création de l'utilisateur" });
  }
});

const updateUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: optionalEmail,
  phoneNumber: optionalString,
  profileImage: optionalString,
  role: z.enum(['admin', 'school_admin', 'teacher', 'student', 'parent', 'group_owner', 'secretary', 'accountant', 'supervisor', 'head_teacher']).optional(),
});

usersRouter.patch('/:id', async (req, res) => {
  const target = await prisma.strkProfile.findUnique({ where: { id: req.params.id } });
  if (!target) {
    return res.status(404).json({ error: 'Utilisateur introuvable' });
  }

  const isSelf = req.auth!.sub === target.id;
  const isStaffSameInstitution = isStaff(req.auth!.role) && isSameInstitution(req.auth!, target.institutionId);
  if (!isSelf && !isStaffSameInstitution) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }

  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }

  // Seul le personnel peut changer le rôle d'un tiers ; un utilisateur ne
  // change jamais son propre rôle via cet endpoint (élévation de privilège).
  const data = { ...parsed.data };
  if (isSelf || !isGlobalAdmin(req.auth!)) {
    delete data.role;
  }

  // Photo de profil : clé S3 du dossier avatars uniquement (upload via
  // POST /files/presign-upload), jamais une URL arbitraire.
  if (data.profileImage) {
    const ownedByUploader = isOwnedObjectKey(
      data.profileImage,
      'avatars',
      target.institutionId,
      req.auth!.sub
    );
    const ownedByTarget = isOwnedObjectKey(data.profileImage, 'avatars', target.institutionId, target.id);
    if (!ownedByUploader && !ownedByTarget) {
      return res.status(403).json({ error: 'Cette photo ne provient pas de votre espace de stockage' });
    }
  }

  if (data.email && data.email !== target.email) {
    const emailTaken = await prisma.strkProfile.findUnique({ where: { email: data.email } });
    if (emailTaken) {
      return res.status(409).json({ error: 'Un compte existe déjà avec cet e-mail' });
    }
  }

  try {
    const user = await prisma.strkProfile.update({
      where: { id: target.id },
      data,
      select: PUBLIC_PROFILE_SELECT,
    });
    if (data.role && data.role !== target.role) {
      // Même correctif que la création (lib/roleExtensions.ts) : un compte
      // promu/reconverti vers élève ou enseignant a besoin de la même ligne
      // d'extension, sans quoi il resterait tout aussi inutilisable qu'un
      // compte créé directement avec ce rôle.
      await ensureRoleExtension(target.id, data.role, user.institutionId);
      await logAudit({
        institutionId: target.institutionId,
        actorId: req.auth!.sub,
        action: 'user.role_changed',
        targetType: 'user',
        targetId: target.id,
        metadata: { previousRole: target.role, newRole: data.role },
        ipAddress: req.ip,
      });
    }
    res.json({ user });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ error: 'Un compte existe déjà avec cet e-mail' });
    }
    throw error;
  }
});

// Réassignation d'établissement : action sensible réservée à l'admin global (ORG-004).
usersRouter.patch('/:id/institution', requireRole('admin'), async (req, res) => {
  const parsed = z.object({ institutionId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }

  try {
    const user = await prisma.strkProfile.update({
      where: { id: req.params.id },
      data: { institutionId: parsed.data.institutionId },
      select: PUBLIC_PROFILE_SELECT,
    });
    res.json({ user });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }
    throw error;
  }
});

// ORG-002 : rattachement d'un compte `group_owner` à un groupe scolaire —
// même sensibilité que la réassignation d'établissement ci-dessus (accès
// consolidé cross-établissements), réservé à l'admin global.
usersRouter.patch('/:id/group', requireRole('admin'), async (req, res) => {
  const parsed = z.object({ groupId: z.string().uuid().nullable() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }

  try {
    const user = await prisma.strkProfile.update({
      where: { id: req.params.id },
      data: { groupId: parsed.data.groupId },
      select: PUBLIC_PROFILE_SELECT,
    });
    res.json({ user });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return res.status(400).json({ error: 'Le groupe indiqué est introuvable' });
    }
    throw error;
  }
});

// DSAR assisté (admin) : export JSON des données personnelles connues —
// pas une anonymisation. Complète DELETE /users/:id (désactivation soft).
usersRouter.get('/:id/privacy-export', requireRole('admin'), async (req, res) => {
  const profile = await prisma.strkProfile.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phoneNumber: true,
      role: true,
      institutionId: true,
      isActive: true,
      createdAt: true,
      deactivatedAt: true,
      mfaEnabled: true,
    },
  });
  if (!profile) {
    return res.status(404).json({ error: 'Utilisateur introuvable' });
  }

  const [student, teacher, sessions, audit] = await Promise.all([
    prisma.strkStudent.findUnique({
      where: { id: profile.id },
      select: {
        studentNumber: true,
        classId: true,
        enrollmentDate: true,
        attendanceRate: true,
        institutionId: true,
      },
    }),
    prisma.strkTeacher.findUnique({
      where: { id: profile.id },
      select: { employeeNumber: true, subjects: true, hireDate: true, institutionId: true },
    }),
    prisma.strkSession.findMany({
      where: { userId: profile.id },
      select: { id: true, ipAddress: true, userAgent: true, createdAt: true, lastSeenAt: true, revokedAt: true, expiresAt: true },
      orderBy: { lastSeenAt: 'desc' },
      take: 50,
    }),
    prisma.strkAuditLog.findMany({
      where: { OR: [{ actorId: profile.id }, { targetId: profile.id }] },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, action: true, targetType: true, targetId: true, createdAt: true, ipAddress: true },
    }),
  ]);

  await logAudit({
    institutionId: profile.institutionId,
    actorId: req.auth!.sub,
    action: 'user.privacy_export',
    targetType: 'user',
    targetId: profile.id,
  });

  res.json({
    exportedAt: new Date().toISOString(),
    notice:
      'Export administratif DSAR (lecture). Effacement = POST /users/:id/anonymize (irrésversible) ou DELETE soft.',
    subject: profile,
    student,
    teacher,
    sessions,
    recentAudit: audit,
  });
});

/**
 * DSAR — anonymisation contrôlée (admin global uniquement).
 * Conserve l’UUID et l’historique métier (notes, absences…) ; remplace les PII
 * et bloque la reconnexion. Irréversible.
 */
usersRouter.post('/:id/anonymize', requireRole('admin'), async (req, res) => {
  const target = await prisma.strkProfile.findUnique({ where: { id: req.params.id } });
  if (!target) {
    return res.status(404).json({ error: 'Utilisateur introuvable' });
  }
  if (req.auth!.sub === target.id) {
    return res.status(400).json({ error: 'Impossible d’anonymiser son propre compte' });
  }
  if (target.role === 'admin') {
    return res.status(403).json({ error: 'Anonymisation d’un admin global interdite' });
  }
  if (target.email?.endsWith('@anon.invalid')) {
    return res.status(409).json({ error: 'Compte déjà anonymisé' });
  }

  const anonEmail = `anon-${target.id.replace(/-/g, '').slice(0, 16)}@anon.invalid`;
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.strkProfile.update({
      where: { id: target.id },
      data: {
        email: anonEmail,
        firstName: 'Anonymisé',
        lastName: 'DSAR',
        phoneNumber: null,
        profileImage: null,
        passwordHash: null,
        mfaEnabled: false,
        mfaSecret: null,
        passwordResetToken: null,
        passwordResetExpires: null,
        isActive: false,
        deactivatedAt: now,
        deactivatedBy: req.auth!.sub,
      },
    });
    await tx.strkSession.updateMany({
      where: { userId: target.id, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.strkStudent.updateMany({
      where: { id: target.id },
      data: { studentNumber: null },
    });
    await tx.strkTeacher.updateMany({
      where: { id: target.id },
      data: { employeeNumber: null },
    });
    await tx.strkStudentHealthInfo.updateMany({
      where: { studentId: target.id },
      data: {
        emergencyContactName: null,
        emergencyContactPhone: null,
        allergies: null,
        medicalConditions: null,
        medications: null,
        additionalNotes: null,
      },
    });
  });

  await logAudit({
    institutionId: target.institutionId,
    actorId: req.auth!.sub,
    action: 'user.anonymized',
    targetType: 'user',
    targetId: target.id,
    metadata: { previousEmailDomain: target.email?.split('@')[1] ?? null },
  });

  res.json({
    success: true,
    userId: target.id,
    anonymizedEmail: anonEmail,
    notice: 'PII remplacées ; historique métier conservé ; compte désactivé.',
  });
});

/** Sessions d’un utilisateur (admin) — IAM-004 ops. */
usersRouter.get('/:id/sessions', requireRole('admin'), async (req, res) => {
  const target = await prisma.strkProfile.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });
  const sessions = await prisma.strkSession.findMany({
    where: { userId: target.id, revokedAt: null },
    orderBy: { lastSeenAt: 'desc' },
    take: 50,
  });
  res.json({ sessions });
});

usersRouter.delete('/:id/sessions/:sessionId', requireRole('admin'), async (req, res) => {
  const target = await prisma.strkProfile.findUnique({ where: { id: req.params.id }, select: { id: true, institutionId: true } });
  if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });
  const result = await prisma.strkSession.updateMany({
    where: { id: req.params.sessionId, userId: target.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count === 0) return res.status(404).json({ error: 'Session introuvable' });
  await logAudit({
    institutionId: target.institutionId,
    actorId: req.auth!.sub,
    action: 'user.session.revoked',
    targetType: 'session',
    targetId: req.params.sessionId,
  });
  res.json({ success: true });
});

usersRouter.delete('/:id/sessions', requireRole('admin'), async (req, res) => {
  const target = await prisma.strkProfile.findUnique({ where: { id: req.params.id }, select: { id: true, institutionId: true } });
  if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });
  const result = await prisma.strkSession.updateMany({
    where: { userId: target.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await logAudit({
    institutionId: target.institutionId,
    actorId: req.auth!.sub,
    action: 'user.sessions.revoked_all',
    targetType: 'user',
    targetId: target.id,
    metadata: { revoked: result.count },
  });
  res.json({ revoked: result.count });
});

/** Reset MFA admin (audité). */
usersRouter.post('/:id/admin-reset-mfa', requireRole('admin'), async (req, res) => {
  const target = await prisma.strkProfile.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });
  if (target.id === req.auth!.sub) {
    return res.status(400).json({ error: 'Utilisez le flux MFA personnel pour votre compte' });
  }
  await prisma.strkProfile.update({
    where: { id: target.id },
    data: {
      mfaEnabled: false,
      mfaSecret: null,
      mfaBackupCodeHashes: [],
      mfaGraceUntil: computeMfaGraceUntil(),
    },
  });
  await prisma.strkSession.updateMany({
    where: { userId: target.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await logAudit({
    institutionId: target.institutionId,
    actorId: req.auth!.sub,
    action: 'user.mfa.reset',
    targetType: 'user',
    targetId: target.id,
  });
  res.json({ success: true });
});

/** Mot de passe temporaire + révocation sessions (admin plateforme ou secrétariat du tenant). */
usersRouter.post('/:id/admin-reset-password', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const target = await prisma.strkProfile.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });

  if (!isGlobalAdmin(req.auth!)) {
    if (!isSameInstitution(req.auth!, target.institutionId)) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }
    if (CROSS_TENANT_ROLES.has(target.role) || target.role === 'school_admin') {
      return res.status(403).json({ error: 'Réinitialisation non autorisée pour ce rôle' });
    }
  }
  if (!target.email || !target.passwordHash) {
    return res.status(400).json({
      error: 'Ce compte n’a pas encore d’accès de connexion. Activez d’abord l’espace élève / invitez l’utilisateur.',
      code: 'no_login',
    });
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  await prisma.strkProfile.update({
    where: { id: target.id },
    data: {
      passwordHash,
      passwordResetToken: null,
      passwordResetExpires: null,
      mustChangePassword: true,
    },
  });
  await prisma.strkSession.updateMany({
    where: { userId: target.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await logAudit({
    institutionId: target.institutionId,
    actorId: req.auth!.sub,
    action: 'user.password.reset_admin',
    targetType: 'user',
    targetId: target.id,
    ipAddress: req.ip,
  });
  res.json({ success: true, tempPassword, email: target.email });
});

/** Timeline compte : activité + audit. */
usersRouter.get('/:id/timeline', requireRole('admin'), async (req, res) => {
  const target = await prisma.strkProfile.findUnique({
    where: { id: req.params.id },
    select: PUBLIC_PROFILE_SELECT,
  });
  if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const [activities, audit] = await Promise.all([
    prisma.strkActivity.findMany({
      where: { userId: target.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.strkAuditLog.findMany({
      where: { OR: [{ actorId: target.id }, { targetId: target.id }] },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
  ]);
  const events = [
    ...activities.map((a) => ({
      kind: 'activity' as const,
      id: a.id,
      at: a.createdAt,
      label: a.description || a.type,
      meta: a.metadata,
    })),
    ...audit.map((a) => ({
      kind: 'audit' as const,
      id: a.id,
      at: a.createdAt,
      label: a.action,
      meta: a.metadata,
    })),
  ]
    .filter((e): e is typeof e & { at: Date } => e.at != null)
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, limit);
  res.json({ user: target, events });
});

// PER-005 : désactivation, plus suppression réelle — un compte ayant la
// moindre donnée liée (notes, absences, emplois du temps, factures...) ne
// peut de toute façon pas être supprimé sans casser son historique (au
// mieux une erreur de contrainte, au pire une perte de données en cascade).
// Révoque immédiatement toutes ses sessions actives (même principe que la
// réinitialisation de mot de passe, IAM-004) : un compte désactivé ne doit
// pas rester connecté ailleurs le temps que son jeton expire naturellement.
usersRouter.delete('/:id', async (req, res) => {
  const target = await prisma.strkProfile.findUnique({ where: { id: req.params.id } });
  if (!target) {
    return res.status(404).json({ error: 'Utilisateur introuvable' });
  }
  if (!isGlobalAdmin(req.auth!) && !(isStaff(req.auth!.role) && isSameInstitution(req.auth!, target.institutionId))) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  if (req.auth!.sub === target.id) {
    return res.status(400).json({ error: 'Impossible de désactiver son propre compte' });
  }

  const user = await prisma.strkProfile.update({
    where: { id: target.id },
    data: { isActive: false, deactivatedAt: new Date(), deactivatedBy: req.auth!.sub },
    select: PUBLIC_PROFILE_SELECT,
  });
  await prisma.strkSession.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await logAudit({ institutionId: target.institutionId, actorId: req.auth!.sub, action: 'user.deactivated', targetId: target.id });
  res.json({ success: true, user });
});

usersRouter.post('/:id/reactivate', async (req, res) => {
  const target = await prisma.strkProfile.findUnique({ where: { id: req.params.id } });
  if (!target) {
    return res.status(404).json({ error: 'Utilisateur introuvable' });
  }
  if (!isGlobalAdmin(req.auth!) && !(isStaff(req.auth!.role) && isSameInstitution(req.auth!, target.institutionId))) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }

  const user = await prisma.strkProfile.update({
    where: { id: target.id },
    data: { isActive: true, deactivatedAt: null, deactivatedBy: null },
    select: PUBLIC_PROFILE_SELECT,
  });
  await logAudit({ institutionId: target.institutionId, actorId: req.auth!.sub, action: 'user.reactivated', targetId: target.id });
  res.json({ user });
});
