import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { isSameInstitution } from '../lib/authz.js';

export const guardiansRouter = Router();
guardiansRouter.use(requireAuth);

const GUARDIAN_INCLUDE = {
  guardian: { select: { id: true, firstName: true, lastName: true, email: true, phoneNumber: true } },
  student: { select: { id: true, firstName: true, lastName: true, email: true } },
};

// ELV-002 : responsables déclarés pour un élève — réservé au personnel de
// l'établissement et à l'élève lui-même (cf. §9.1).
guardiansRouter.get('/for-student/:studentId', async (req, res) => {
  const student = await prisma.strkStudent.findUnique({ where: { id: req.params.studentId } });
  if (!student) {
    return res.status(404).json({ error: 'Élève introuvable' });
  }
  const isSelf = req.auth!.sub === req.params.studentId;
  if (!isSelf && !isSameInstitution(req.auth!, student.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const guardians = await prisma.strkStudentGuardian.findMany({
    where: { studentId: req.params.studentId },
    include: GUARDIAN_INCLUDE,
    orderBy: [{ isPrimaryContact: 'desc' }, { createdAt: 'asc' }],
  });
  res.json({ guardians });
});

// Espace parent : liste des enfants liés activement (§7.1).
guardiansRouter.get('/my-children', requireRole('parent'), async (req, res) => {
  const links = await prisma.strkStudentGuardian.findMany({
    where: { guardianId: req.auth!.sub, status: 'active' },
    include: { student: { select: { id: true, firstName: true, lastName: true, email: true, profileImage: true } } },
  });

  // StrkStudentGuardian.student pointe vers StrkProfile (identité) ; les
  // informations de classe viennent de l'extension StrkStudent, à part.
  const studentIds = links.map((l) => l.studentId);
  const studentExtensions = await prisma.strkStudent.findMany({
    where: { id: { in: studentIds } },
    select: { id: true, classId: true, class: { select: { name: true } } },
  });
  const extensionById = new Map(studentExtensions.map((s) => [s.id, s]));

  const children = links.map((link) => {
    const extension = extensionById.get(link.studentId);
    return {
      guardianLinkId: link.id,
      studentId: link.studentId,
      firstName: link.student.firstName || '',
      lastName: link.student.lastName || '',
      email: link.student.email,
      profileImage: link.student.profileImage,
      classId: extension?.classId,
      className: extension?.class?.name,
      institutionId: link.institutionId,
      relationship: link.relationship,
      isPrimaryContact: link.isPrimaryContact,
      canViewGrades: link.canViewGrades,
      canViewAttendance: link.canViewAttendance,
      canViewBilling: link.canViewBilling,
      canMakePayments: link.canMakePayments,
      canViewDiscipline: link.canViewDiscipline,
      canViewHealth: link.canViewHealth,
    };
  });
  res.json({ children });
});

guardiansRouter.get('/search-by-email', requireRole('admin', 'school_admin'), async (req, res) => {
  const email = String(req.query.email ?? '').trim();
  if (!email) {
    return res.status(400).json({ error: 'email requis' });
  }
  const candidate = await prisma.strkProfile.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, firstName: true, lastName: true, email: true, role: true },
  });
  res.json({ candidate });
});

const linkSchema = z.object({
  institutionId: z.string().uuid(),
  studentId: z.string().uuid(),
  guardianId: z.string().uuid(),
  relationship: z.enum(['father', 'mother', 'tutor', 'payer', 'other_authorized']),
  isPrimaryContact: z.boolean().optional(),
  canViewGrades: z.boolean().optional(),
  canViewAttendance: z.boolean().optional(),
  canViewBilling: z.boolean().optional(),
  canMakePayments: z.boolean().optional(),
  canReceiveCommunications: z.boolean().optional(),
  canAuthorizePickup: z.boolean().optional(),
  // SUI-005 : droit de principe à voir les observations/incidents partagés
  // avec la famille (cf. lib/authz.ts, isFollowUpVisible).
  canViewDiscipline: z.boolean().optional(),
  // ELV-001 : accès au volet santé/contact d'urgence du dossier élève.
  canViewHealth: z.boolean().optional(),
});

guardiansRouter.post('/', requireRole('admin', 'school_admin'), async (req, res) => {
  const parsed = linkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  if (!isSameInstitution(req.auth!, parsed.data.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }

  // ORG-004 / ELV-002 : l’élève doit appartenir à l’établissement déclaré
  // (évite de rattacher un élève A via institutionId B).
  const student = await prisma.strkStudent.findUnique({
    where: { id: parsed.data.studentId },
    select: { id: true, institutionId: true },
  });
  if (!student || student.institutionId !== parsed.data.institutionId) {
    return res.status(400).json({
      error: 'Élève introuvable dans cet établissement',
      code: 'student_institution_mismatch',
    });
  }

  const guardian = await prisma.strkProfile.findUnique({
    where: { id: parsed.data.guardianId },
    select: { id: true, role: true },
  });
  if (!guardian) {
    return res.status(404).json({ error: 'Responsable introuvable' });
  }

  try {
    const link = await prisma.strkStudentGuardian.create({
      data: { ...parsed.data, createdBy: req.auth!.sub, status: 'active' },
      include: GUARDIAN_INCLUDE,
    });
    res.status(201).json({ guardian: link });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Ce responsable est déjà lié à cet élève' });
    }
    throw error;
  }
});

const updateLinkSchema = linkSchema
  .omit({ institutionId: true, studentId: true, guardianId: true })
  .partial()
  .extend({ status: z.enum(['active', 'inactive']).optional() });

guardiansRouter.patch('/:id', requireRole('admin', 'school_admin'), async (req, res) => {
  const link = await prisma.strkStudentGuardian.findUnique({ where: { id: req.params.id } });
  if (!link || !isSameInstitution(req.auth!, link.institutionId)) {
    return res.status(404).json({ error: 'Lien introuvable' });
  }
  const parsed = updateLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const updated = await prisma.strkStudentGuardian.update({
    where: { id: req.params.id },
    data: parsed.data,
    include: GUARDIAN_INCLUDE,
  });
  res.json({ guardian: updated });
});

// Désactivation logique (conserve l'historique — §7.1).
guardiansRouter.patch('/:id/deactivate', requireRole('admin', 'school_admin'), async (req, res) => {
  const link = await prisma.strkStudentGuardian.findUnique({ where: { id: req.params.id } });
  if (!link || !isSameInstitution(req.auth!, link.institutionId)) {
    return res.status(404).json({ error: 'Lien introuvable' });
  }
  await prisma.strkStudentGuardian.update({ where: { id: req.params.id }, data: { status: 'inactive' } });
  res.json({ success: true });
});
