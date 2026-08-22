import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { isSameInstitution } from '../lib/authz.js';

/**
 * EVA-002 : barèmes nommés et réutilisables par établissement (ex. « Note
 * sur 20 », « Note sur 10 ») — jusqu'ici, seul le champ libre
 * `StrkGrade.maxGrade` existait, sans aucune configuration ni UI pour un
 * établissement qui veut proposer une liste fermée à ses enseignants plutôt
 * qu'un nombre saisi à la main à chaque note.
 */
export const gradingScalesRouter = Router();
gradingScalesRouter.use(requireAuth);

gradingScalesRouter.get('/', async (req, res) => {
  const institutionId = typeof req.query.institutionId === 'string' ? req.query.institutionId : undefined;
  if (!institutionId || !isSameInstitution(req.auth!, institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const scales = await prisma.strkGradingScale.findMany({
    where: { institutionId },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });
  res.json({ scales });
});

const gradingScaleSchema = z.object({
  institutionId: z.string().uuid(),
  name: z.string().min(1),
  maxValue: z.number().positive(),
  isDefault: z.boolean().optional(),
});

// Un seul barème par défaut par établissement — en poser un nouveau
// désactive silencieusement l'ancien plutôt que de laisser deux barèmes
// "par défaut" se contredire (transaction : jamais un état intermédiaire
// avec zéro ou deux défauts visible d'une requête concurrente).
const setAsDefault = (tx: Prisma.TransactionClient, institutionId: string, scaleId: string) =>
  tx.strkGradingScale.updateMany({
    where: { institutionId, id: { not: scaleId }, isDefault: true },
    data: { isDefault: false },
  });

gradingScalesRouter.post('/', requireRole('admin', 'school_admin'), async (req, res) => {
  const parsed = gradingScaleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  if (!isSameInstitution(req.auth!, parsed.data.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  try {
    const scale = await prisma.$transaction(async (tx) => {
      const created = await tx.strkGradingScale.create({ data: parsed.data });
      if (created.isDefault) {
        await setAsDefault(tx, parsed.data.institutionId, created.id);
      }
      return created;
    });
    res.status(201).json({ scale });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ error: 'Un barème de ce nom existe déjà pour cet établissement' });
    }
    throw error;
  }
});

const updateGradingScaleSchema = gradingScaleSchema.partial().omit({ institutionId: true });

gradingScalesRouter.patch('/:id', requireRole('admin', 'school_admin'), async (req, res) => {
  const existing = await prisma.strkGradingScale.findUnique({ where: { id: req.params.id } });
  if (!existing || !isSameInstitution(req.auth!, existing.institutionId)) {
    return res.status(404).json({ error: 'Barème introuvable' });
  }
  const parsed = updateGradingScaleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const scale = await prisma.$transaction(async (tx) => {
    const updated = await tx.strkGradingScale.update({ where: { id: req.params.id }, data: parsed.data });
    if (updated.isDefault) {
      await setAsDefault(tx, existing.institutionId, updated.id);
    }
    return updated;
  });
  res.json({ scale });
});

gradingScalesRouter.delete('/:id', requireRole('admin', 'school_admin'), async (req, res) => {
  const existing = await prisma.strkGradingScale.findUnique({ where: { id: req.params.id } });
  if (!existing || !isSameInstitution(req.auth!, existing.institutionId)) {
    return res.status(404).json({ error: 'Barème introuvable' });
  }
  // Un barème n'est jamais référencé par une note (StrkGrade.maxGrade est
  // une copie, pas une clé étrangère) — sa suppression ne casse donc jamais
  // d'historique, contrairement aux périodes académiques.
  await prisma.strkGradingScale.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});
