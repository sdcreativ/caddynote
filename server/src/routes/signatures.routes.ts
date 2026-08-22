import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { isSameInstitution } from '../lib/authz.js';
import { rejectUnlessSameInstitution, rejectUnlessStudentAccess, sendForbidden } from '../lib/httpAuthz.js';

export const signaturesRouter = Router();
signaturesRouter.use(requireAuth);

const SIGNATURE_INCLUDE = {
  student: { select: { profile: { select: { firstName: true, lastName: true, email: true } } } },
  sender: { select: { firstName: true, lastName: true, email: true } },
  recipient: { select: { firstName: true, lastName: true, email: true } },
};

signaturesRouter.get('/', async (req, res) => {
  const { institutionId, studentId } = req.query;

  if (typeof studentId === 'string') {
    const access = await rejectUnlessStudentAccess(res, req.auth!, studentId, {
      guardianPermission: 'canViewAttendance',
    });
    if (!access) return;
    const signatures = await prisma.strkSignature.findMany({
      where: { studentId },
      include: SIGNATURE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ signatures });
  }

  if (typeof institutionId === 'string') {
    if (rejectUnlessSameInstitution(res, req.auth!, institutionId)) return;
    const signatures = await prisma.strkSignature.findMany({
      where: { institutionId },
      include: SIGNATURE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ signatures });
  }

  return res.status(400).json({ error: 'institutionId ou studentId requis' });
});

signaturesRouter.get('/:id', async (req, res) => {
  const signature = await prisma.strkSignature.findUnique({ where: { id: req.params.id }, include: SIGNATURE_INCLUDE });
  if (!signature) {
    return res.status(404).json({ error: 'Signature introuvable' });
  }
  const access = await rejectUnlessStudentAccess(res, req.auth!, signature.studentId, {
    guardianPermission: 'canViewAttendance',
  });
  if (!access) return;
  res.json({ signature });
});

const createSignatureSchema = z.object({
  studentId: z.string().uuid(),
  institutionId: z.string().uuid(),
  title: z.string().min(1),
  type: z.enum(['entry', 'exit', 'document']),
  date: z.string(),
  timestamp: z.string().optional(),
  senderId: z.string().uuid().optional(),
  recipientId: z.string().uuid().optional(),
  expiresAt: z.string().optional(),
});

signaturesRouter.post('/', requireRole('admin', 'school_admin', 'teacher'), async (req, res) => {
  const parsed = createSignatureSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  if (rejectUnlessSameInstitution(res, req.auth!, parsed.data.institutionId)) return;
  const { date, expiresAt, ...rest } = parsed.data;
  const signature = await prisma.strkSignature.create({
    data: { ...rest, date: new Date(date), expiresAt: expiresAt ? new Date(expiresAt) : undefined },
    include: SIGNATURE_INCLUDE,
  });
  res.status(201).json({ signature });
});

const updateStatusSchema = z.object({
  status: z.enum(['pending', 'completed', 'expired']),
  signatureData: z.string().optional(),
});

signaturesRouter.patch('/:id/status', async (req, res) => {
  const signature = await prisma.strkSignature.findUnique({ where: { id: req.params.id } });
  if (!signature) {
    return res.status(404).json({ error: 'Signature introuvable' });
  }
  // L'élève concerné peut signer lui-même (entrée/sortie) ; sinon réservé au
  // personnel de son propre établissement (ORG-004 — sans le contrôle
  // d'établissement, le personnel d'un autre établissement pouvait valider
  // n'importe quelle signature par id).
  const isSelf = req.auth!.sub === signature.studentId;
  const isStaffSameInstitution =
    ['admin', 'school_admin', 'teacher'].includes(req.auth!.role) && isSameInstitution(req.auth!, signature.institutionId);
  if (!isSelf && !isStaffSameInstitution) {
    sendForbidden(res);
    return;
  }

  const parsed = updateStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }

  const updated = await prisma.strkSignature.update({
    where: { id: req.params.id },
    data: {
      status: parsed.data.status,
      ...(parsed.data.status === 'completed'
        ? { completedAt: new Date(), verified: true, ...(parsed.data.signatureData ? { signatureData: parsed.data.signatureData } : {}) }
        : {}),
    },
    include: SIGNATURE_INCLUDE,
  });
  res.json({ signature: updated });
});

signaturesRouter.delete('/:id', requireRole('admin', 'school_admin'), async (req, res) => {
  const signature = await prisma.strkSignature.findUnique({ where: { id: req.params.id }, select: { institutionId: true } });
  if (!signature || !isSameInstitution(req.auth!, signature.institutionId)) {
    return res.status(404).json({ error: 'Signature introuvable' });
  }
  await prisma.strkSignature.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});
