import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  getStudentAccess,
  isGlobalAdmin,
  isSameInstitution,
  INSTITUTION_STAFF_ROLES,
  SECRETARIAT_ROLES,
  tenantWhere,
} from '../lib/authz.js';
import { rejectUnlessSameInstitution, rejectUnlessStudentAccess } from '../lib/httpAuthz.js';
import { importStudentsFromCsv } from '../lib/studentImport.js';
import { parseCsvWithHeader } from '../lib/csvImport.js';
import { checkQuota, QUOTA_LABELS } from '../lib/quotas.js';
import { logAudit } from '../lib/audit.js';
import { PUBLIC_PROFILE_SELECT } from '../lib/profileSelect.js';
import { provisionStudentLogin } from '../lib/studentLogin.js';
import { optionalEmail, optionalUuid } from '../lib/zodHelpers.js';

export const studentsRouter = Router();

studentsRouter.use(requireAuth);

// Liste des élèves : jamais de filtre fourni par le client — le périmètre
// est toujours dérivé du tenant de l'appelant (ORG-004), pas de son intention.
studentsRouter.get('/', requireRole(...INSTITUTION_STAFF_ROLES), async (req, res) => {
  const where = tenantWhere(req.auth!);

  const students = await prisma.strkStudent.findMany({
    where,
    include: {
      profile: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          phoneNumber: true,
          createdAt: true,
          isActive: true,
        },
      },
      class: { select: { id: true, name: true } },
      institution: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  const genderHeadcount = {
    female: 0,
    male: 0,
    unknown: 0,
    total: students.length,
  };
  for (const s of students) {
    if (s.gender === 'female') genderHeadcount.female += 1;
    else if (s.gender === 'male') genderHeadcount.male += 1;
    else genderHeadcount.unknown += 1;
  }

  res.json({ students, genderHeadcount });
});

const currentAcademicYear = () => {
  const year = new Date().getFullYear();
  const month = new Date().getMonth();
  return month >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
};

const importSchema = z.object({
  csv: z.string().min(1),
  institutionId: z.string().uuid(),
});

// ELV-005 : import en masse (colonnes : firstName,lastName,email,phoneNumber,
// className,studentNumber). Contrepartie de l'export (RPT-002) — voir
// server/src/lib/studentImport.ts pour le détail du traitement ligne par
// ligne et de la traçabilité de l'import.
studentsRouter.post('/import', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  if (rejectUnlessSameInstitution(res, req.auth!, parsed.data.institutionId)) return;

  // SAA-003 : rejette l'import entier si son volume dépasserait le quota,
  // plutôt que d'importer silencieusement jusqu'à la limite puis de laisser
  // le reste échoué sans explication claire — mieux vaut que l'appelant
  // ajuste son fichier ou son plan avant de commencer.
  const rowCount = parseCsvWithHeader(parsed.data.csv).length;
  const studentsQuota = await checkQuota(parsed.data.institutionId, 'students', rowCount);
  if (!studentsQuota.allowed) {
    return res.status(403).json({
      error: `Cet import (${rowCount} ligne(s)) dépasserait le quota de ${QUOTA_LABELS.students} du plan actuel (${studentsQuota.current}/${studentsQuota.limit}). Réduisez le fichier ou mettez à niveau l'abonnement.`,
    });
  }

  const summary = await importStudentsFromCsv(parsed.data.csv, parsed.data.institutionId, req.auth!.sub);
  res.json(summary);
});

/**
 * Fiche élève sans accès connexion (aligné admissions enroll).
 * Pour l’espace élève : POST /students/:id/activate-login ensuite.
 */
const createStudentRecordSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phoneNumber: z.string().max(50).optional(),
  classId: optionalUuid,
  institutionId: optionalUuid,
  gender: z.enum(['female', 'male']).optional(),
});

studentsRouter.post('/', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const parsed = createStudentRecordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }

  let institutionId = parsed.data.institutionId;
  if (!isGlobalAdmin(req.auth!)) {
    if (institutionId && !isSameInstitution(req.auth!, institutionId)) {
      return res.status(403).json({ error: 'Permissions insuffisantes' });
    }
    institutionId = req.auth!.institutionId ?? undefined;
  }
  if (!institutionId) {
    return res.status(400).json({ error: 'Établissement requis' });
  }

  const studentsQuota = await checkQuota(institutionId, 'students');
  if (!studentsQuota.allowed) {
    return res.status(403).json({
      error: `Quota de ${QUOTA_LABELS.students} atteint pour le plan actuel (${studentsQuota.current}/${studentsQuota.limit}).`,
    });
  }
  const usersQuota = await checkQuota(institutionId, 'users');
  if (!usersQuota.allowed) {
    return res.status(403).json({
      error: `Quota de ${QUOTA_LABELS.users} atteint pour le plan actuel (${usersQuota.current}/${usersQuota.limit}).`,
    });
  }

  if (parsed.data.classId) {
    const classroom = await prisma.strkClass.findUnique({ where: { id: parsed.data.classId } });
    if (!classroom || classroom.institutionId !== institutionId) {
      return res.status(400).json({ error: 'Classe invalide' });
    }
  }

  const profile = await prisma.strkProfile.create({
    data: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      phoneNumber: parsed.data.phoneNumber,
      role: 'student',
      institutionId,
    },
    select: PUBLIC_PROFILE_SELECT,
  });

  await prisma.strkStudent.create({
    data: {
      id: profile.id,
      institutionId,
      classId: parsed.data.classId ?? null,
      gender: parsed.data.gender ?? null,
      enrollmentDate: new Date(),
    },
  });

  if (parsed.data.classId) {
    const classroom = await prisma.strkClass.findUnique({ where: { id: parsed.data.classId } });
    const academicYear = classroom?.academicYear || currentAcademicYear();
    await prisma.strkClassStudent.create({
      data: {
        studentId: profile.id,
        classId: parsed.data.classId,
        academicYear,
        enrollmentDate: new Date(),
        isActive: true,
      },
    });
  }

  await logAudit({
    institutionId,
    actorId: req.auth!.sub,
    action: 'student.record_created',
    targetType: 'user',
    targetId: profile.id,
    metadata: { withLogin: false },
    ipAddress: req.ip,
  });

  res.status(201).json({ user: profile, withLogin: false });
});

const activateLoginSchema = z.object({
  /** E-mail famille réel. Absent → alias opaque s-{id}@eleves.caddynote.app */
  email: optionalEmail,
});

studentsRouter.post('/:id/activate-login', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const student = await prisma.strkStudent.findUnique({ where: { id: req.params.id } });
  if (!student || !isSameInstitution(req.auth!, student.institutionId)) {
    return res.status(404).json({ error: 'Élève introuvable' });
  }
  const parsed = activateLoginSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }

  try {
    const result = await provisionStudentLogin({
      studentId: student.id,
      email: parsed.data.email,
      actorId: req.auth!.sub,
      ipAddress: req.ip,
    });
    res.status(201).json({
      user: result.user,
      tempPassword: result.tempPassword,
      email: result.email,
      emailSent: result.emailSent,
      smsSent: result.smsSent,
      loginMode: result.loginMode,
    });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : 'Échec activation';
    if (status >= 400 && status < 500) {
      return res.status(status).json({ error: message });
    }
    console.error('activate-login:', err);
    return res.status(500).json({ error: 'Échec activation de l’espace élève' });
  }
});

studentsRouter.get('/:id', async (req, res) => {
  const access = await rejectUnlessStudentAccess(res, req.auth!, req.params.id);
  if (!access) return;

  const student = await prisma.strkStudent.findUnique({
    where: { id: req.params.id },
    include: {
      profile: { select: { firstName: true, lastName: true, email: true, phoneNumber: true } },
      class: { select: { id: true, name: true } },
      institution: { select: { id: true, name: true } },
    },
  });
  if (!student) {
    return res.status(404).json({ error: 'Élève introuvable' });
  }

  res.json({ student, accessVia: access.via });
});

// Responsables déclarés pour un élève : réservé au personnel de
// l'établissement et à l'élève lui-même (cf. §9.1 — les coordonnées des
// parents ne sont pas nécessairement exposées, y compris à d'autres parents).
studentsRouter.get('/:id/guardians', async (req, res) => {
  const access = await rejectUnlessStudentAccess(res, req.auth!, req.params.id, { denyGuardian: true });
  if (!access) return;

  const guardians = await prisma.strkStudentGuardian.findMany({
    where: { studentId: req.params.id, status: 'active' },
    include: { guardian: { select: { firstName: true, lastName: true, email: true, phoneNumber: true } } },
    orderBy: { isPrimaryContact: 'desc' },
  });
  res.json({ guardians });
});

const healthInfoSchema = z.object({
  bloodType: z.string().max(10).nullable().optional(),
  allergies: z.string().max(2000).nullable().optional(),
  medicalConditions: z.string().max(2000).nullable().optional(),
  medications: z.string().max(2000).nullable().optional(),
  emergencyContactName: z.string().max(200).nullable().optional(),
  emergencyContactPhone: z.string().max(50).nullable().optional(),
  additionalNotes: z.string().max(2000).nullable().optional(),
});

// ELV-001 : volet santé/contact d'urgence du dossier élève — catégorie de
// données plus sensible que le reste du dossier, donc contrôle d'accès
// dédié plutôt que les droits par défaut du personnel/de la famille
// (StrkStudentGuardian.canViewHealth, défaut visible comme notes/assiduité).
studentsRouter.get('/:id/health', async (req, res) => {
  const access = await rejectUnlessStudentAccess(res, req.auth!, req.params.id, { guardianPermission: 'canViewHealth' });
  if (!access) return;
  const healthInfo = await prisma.strkStudentHealthInfo.findUnique({ where: { studentId: req.params.id } });
  res.json({ healthInfo });
});

// Écriture réservée au personnel et aux responsables ayant le droit
// (ce sont eux qui connaissent ces informations) — pas l'élève lui-même,
// une donnée de sécurité ne devrait pas être auto-déclarative sans regard
// d'un adulte responsable.
studentsRouter.put('/:id/health', async (req, res) => {
  const access = await getStudentAccess(req.auth!, req.params.id);
  const canWrite =
    access.allowed &&
    (access.via === 'admin' || access.via === 'staff' || (access.via === 'guardian' && access.permissions.canViewHealth));
  if (!canWrite) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const parsed = healthInfoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const student = await prisma.strkStudent.findUnique({ where: { id: req.params.id }, select: { institutionId: true } });
  if (!student) {
    return res.status(404).json({ error: 'Élève introuvable' });
  }
  const healthInfo = await prisma.strkStudentHealthInfo.upsert({
    where: { studentId: req.params.id },
    create: { studentId: req.params.id, institutionId: student.institutionId, ...parsed.data, updatedBy: req.auth!.sub },
    update: { ...parsed.data, updatedBy: req.auth!.sub },
  });
  res.json({ healthInfo });
});

// ELV-003 : historique scolaire pluriannuel (inscriptions classe × année).
studentsRouter.get('/:id/enrollments', async (req, res) => {
  const access = await rejectUnlessStudentAccess(res, req.auth!, req.params.id);
  if (!access) return;
  const enrollments = await prisma.strkClassStudent.findMany({
    where: { studentId: req.params.id },
    orderBy: { academicYear: 'desc' },
  });
  const classIds = [...new Set(enrollments.map((e) => e.classId))];
  const classes = await prisma.strkClass.findMany({
    where: { id: { in: classIds } },
    select: { id: true, name: true, academicYear: true },
  });
  const classById = new Map(classes.map((c) => [c.id, c]));
  res.json({
    enrollments: enrollments.map((e) => ({
      ...e,
      class: classById.get(e.classId) ?? null,
    })),
  });
});

const enrollmentSchema = z.object({
  classId: z.string().uuid(),
  academicYear: z.string().min(4).optional(),
  enrollmentDate: z.string().optional(),
});

studentsRouter.post('/:id/enrollments', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const student = await prisma.strkStudent.findUnique({ where: { id: req.params.id } });
  if (!student || !isSameInstitution(req.auth!, student.institutionId)) {
    return res.status(404).json({ error: 'Élève introuvable' });
  }
  const parsed = enrollmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const classroom = await prisma.strkClass.findUnique({ where: { id: parsed.data.classId } });
  if (!classroom || classroom.institutionId !== student.institutionId) {
    return res.status(400).json({ error: 'Classe invalide' });
  }
  const academicYear = parsed.data.academicYear || classroom.academicYear || currentAcademicYear();
  await prisma.strkClassStudent.updateMany({
    where: { studentId: student.id, isActive: true },
    data: { isActive: false, endedAt: new Date(), outcome: 'promoted' },
  });
  const enrollment = await prisma.strkClassStudent.create({
    data: {
      studentId: student.id,
      classId: classroom.id,
      academicYear,
      enrollmentDate: parsed.data.enrollmentDate ? new Date(parsed.data.enrollmentDate) : new Date(),
      isActive: true,
    },
  });
  await prisma.strkStudent.update({ where: { id: student.id }, data: { classId: classroom.id } });
  res.status(201).json({ enrollment });
});

const closeEnrollmentSchema = z.object({
  outcome: z.enum(['promoted', 'repeated', 'transferred', 'withdrawn']),
  endedAt: z.string().optional(),
});

studentsRouter.post('/:id/enrollments/:enrollmentId/close', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const student = await prisma.strkStudent.findUnique({ where: { id: req.params.id } });
  if (!student || !isSameInstitution(req.auth!, student.institutionId)) {
    return res.status(404).json({ error: 'Élève introuvable' });
  }
  const enrollment = await prisma.strkClassStudent.findUnique({ where: { id: req.params.enrollmentId } });
  if (!enrollment || enrollment.studentId !== student.id) {
    return res.status(404).json({ error: 'Inscription introuvable' });
  }
  const parsed = closeEnrollmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const updated = await prisma.strkClassStudent.update({
    where: { id: enrollment.id },
    data: {
      isActive: false,
      outcome: parsed.data.outcome,
      endedAt: parsed.data.endedAt ? new Date(parsed.data.endedAt) : new Date(),
    },
  });
  res.json({ enrollment: updated });
});
