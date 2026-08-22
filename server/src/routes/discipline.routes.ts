import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getStudentAccess, isSameInstitution, isFollowUpVisible, canViewFollowUpEntry, SUPERVISION_ROLES } from '../lib/authz.js';
import { logAudit } from '../lib/audit.js';
import { notifyGuardiansOfIncident } from '../lib/disciplineNotify.js';
import type { StrkIncidentStatus } from '@prisma/client';

/**
 * SUI-003/004/005 : incidents disciplinaires et leur workflow (chap. 15).
 *
 * SUI-004 : le statut suit un vrai enchaînement (`ALLOWED_TRANSITIONS`),
 * pas un champ texte libre — signalé → en instruction → (conseil de
 * discipline | clos directement pour un incident mineur) → clos. La
 * décision (`POST /:id/decision`) n'est possible qu'après renvoi en conseil,
 * et seule la direction (`admin`/`school_admin`) la prononce — un
 * enseignant ou un `supervisor` (vie scolaire) peut signaler un incident
 * mais ne décide jamais seul d'une sanction.
 */
export const disciplineRouter = Router();
disciplineRouter.use(requireAuth);

const ALLOWED_TRANSITIONS: Record<StrkIncidentStatus, StrkIncidentStatus[]> = {
  reported: ['under_review'],
  under_review: ['council_referred', 'resolved'],
  council_referred: ['resolved'],
  resolved: [],
};

const incidentSchema = z.object({
  studentId: z.string().uuid(),
  description: z.string().min(1),
  severity: z.enum(['minor', 'moderate', 'major']).default('minor'),
  date: z.string().optional(),
  involvedStudentIds: z.array(z.string().uuid()).default([]),
  restrictedToUserIds: z.array(z.string().uuid()).default([]),
  visibleToFamily: z.boolean().default(false),
});

disciplineRouter.post('/incidents', requireRole(...SUPERVISION_ROLES), async (req, res) => {
  const parsed = incidentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const student = await prisma.strkStudent.findUnique({ where: { id: parsed.data.studentId } });
  if (!student || !isSameInstitution(req.auth!, student.institutionId)) {
    return res.status(404).json({ error: 'Élève introuvable' });
  }
  const { date, ...rest } = parsed.data;
  const incident = await prisma.strkDisciplinaryIncident.create({
    data: {
      ...rest,
      institutionId: student.institutionId,
      reportedBy: req.auth!.sub,
      date: date ? new Date(date) : undefined,
    },
  });
  if (incident.visibleToFamily) {
    await notifyGuardiansOfIncident({
      studentId: incident.studentId,
      institutionId: incident.institutionId,
      requestedBy: req.auth!.sub,
      event: 'shared',
      description: incident.description,
    });
  }
  res.status(201).json({ incident });
});

disciplineRouter.get('/incidents', async (req, res) => {
  const { studentId } = req.query;
  if (typeof studentId !== 'string') {
    return res.status(400).json({ error: 'studentId requis' });
  }
  const access = await getStudentAccess(req.auth!, studentId);
  if (!access.allowed) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const incidents = await prisma.strkDisciplinaryIncident.findMany({
    where: { studentId },
    orderBy: { date: 'desc' },
  });
  const visible = incidents.filter((i) => isFollowUpVisible(access, req.auth!, { ...i, authorId: i.reportedBy }));
  res.json({ incidents: visible });
});

disciplineRouter.get('/incidents/:id', async (req, res) => {
  const incident = await prisma.strkDisciplinaryIncident.findUnique({ where: { id: req.params.id } });
  if (!incident) {
    return res.status(404).json({ error: 'Incident introuvable' });
  }
  if (!(await canViewFollowUpEntry(req.auth!, { ...incident, authorId: incident.reportedBy }))) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  res.json({ incident });
});

const statusSchema = z.object({ status: z.enum(['under_review', 'council_referred', 'resolved']) });

// SUI-004 : seule la direction pilote le workflow — un enseignant peut
// signaler (POST /incidents) mais ne fait pas avancer le dossier.
disciplineRouter.patch('/incidents/:id/status', requireRole('admin', 'school_admin'), async (req, res) => {
  const existing = await prisma.strkDisciplinaryIncident.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ error: 'Incident introuvable' });
  }
  if (!isSameInstitution(req.auth!, existing.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  if (!ALLOWED_TRANSITIONS[existing.status].includes(parsed.data.status)) {
    return res.status(409).json({
      error: `Transition invalide : ${existing.status} → ${parsed.data.status}`,
      allowed: ALLOWED_TRANSITIONS[existing.status],
    });
  }
  const data: { status: StrkIncidentStatus; councilDate?: Date } = { status: parsed.data.status };
  if (parsed.data.status === 'council_referred') {
    data.councilDate = new Date();
  }
  const incident = await prisma.strkDisciplinaryIncident.update({ where: { id: req.params.id }, data });
  await logAudit({
    institutionId: existing.institutionId,
    actorId: req.auth!.sub,
    action: 'discipline.status_changed',
    targetType: 'disciplinary_incident',
    targetId: existing.id,
    metadata: { from: existing.status, to: parsed.data.status },
    ipAddress: req.ip,
  });
  res.json({ incident });
});

const decisionSchema = z.object({ decision: z.string().min(1), sanctionType: z.string().optional() });

// La décision du conseil de discipline clôt le dossier — seulement
// atteignable depuis "council_referred" (même contrainte de workflow que
// PATCH /status, appliquée ici explicitement plutôt que réutilisée en
// silence, pour que le message d'erreur reste spécifique au bon endpoint).
disciplineRouter.post('/incidents/:id/decision', requireRole('admin', 'school_admin'), async (req, res) => {
  const existing = await prisma.strkDisciplinaryIncident.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ error: 'Incident introuvable' });
  }
  if (!isSameInstitution(req.auth!, existing.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  if (existing.status !== 'council_referred') {
    return res.status(409).json({ error: 'La décision ne peut être enregistrée qu’après renvoi en conseil de discipline' });
  }
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const incident = await prisma.strkDisciplinaryIncident.update({
    where: { id: req.params.id },
    data: {
      decision: parsed.data.decision,
      sanctionType: parsed.data.sanctionType,
      decidedBy: req.auth!.sub,
      decidedAt: new Date(),
      status: 'resolved',
    },
  });
  await logAudit({
    institutionId: existing.institutionId,
    actorId: req.auth!.sub,
    action: 'discipline.decision_recorded',
    targetType: 'disciplinary_incident',
    targetId: existing.id,
    metadata: { decision: parsed.data.decision, sanctionType: parsed.data.sanctionType },
    ipAddress: req.ip,
  });
  if (incident.visibleToFamily) {
    await notifyGuardiansOfIncident({
      studentId: incident.studentId,
      institutionId: incident.institutionId,
      requestedBy: req.auth!.sub,
      event: 'decision',
      description: incident.description,
      decision: incident.decision,
    });
  }
  res.json({ incident });
});

const updateConfidentialitySchema = z.object({
  restrictedToUserIds: z.array(z.string().uuid()).optional(),
  visibleToFamily: z.boolean().optional(),
});

// SUI-005 : ajuster la confidentialité (qui voit quoi) reste possible
// indépendamment du statut du workflow — la direction peut par exemple
// choisir de partager la décision avec la famille une fois le dossier clos.
disciplineRouter.patch('/incidents/:id/confidentiality', requireRole('admin', 'school_admin'), async (req, res) => {
  const existing = await prisma.strkDisciplinaryIncident.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ error: 'Incident introuvable' });
  }
  if (!isSameInstitution(req.auth!, existing.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const parsed = updateConfidentialitySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const wasVisible = existing.visibleToFamily;
  const incident = await prisma.strkDisciplinaryIncident.update({ where: { id: req.params.id }, data: parsed.data });
  if (!wasVisible && incident.visibleToFamily) {
    await notifyGuardiansOfIncident({
      studentId: incident.studentId,
      institutionId: incident.institutionId,
      requestedBy: req.auth!.sub,
      event: 'shared',
      description: incident.description,
    });
  }
  res.json({ incident });
});
