import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requireFeature } from '../middleware/requireFeature.js';
import { EXPORT_ROLES, isSameInstitution } from '../lib/authz.js';
import { toCsv } from '../lib/csvExport.js';
import { toXlsx } from '../lib/xlsxExport.js';
import { renderTablePdf } from '../lib/reportPdf.js';
import { prepareReportExport } from '../lib/reportExport.js';
import {
  enqueueScheduledExport,
  listScheduledExports,
  runDueExports,
} from '../lib/exportSchedule.js';

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

const exportQuerySchema = z.object({
  type: z.enum(['students', 'absences', 'grades', 'attendance']),
  institutionId: z.string().uuid(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  // RPT-001 : filtres multi-critères — classe et matière, en plus de
  // institutionId (déjà là, ORG-004) et de la plage de dates (déjà là).
  classId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  // RPT-002 : les 3 formats attendus par le cahier des charges. CSV reste le
  // défaut (rétrocompatible avec les appelants qui ne le précisaient pas).
  format: z.enum(['csv', 'xlsx', 'pdf']).default('csv'),
});

/**
 * RPT-002 : export réel. §5.15 : rôles alignés sur `EXPORT_ROLES`
 * (inclut `head_teacher`).
 */
reportsRouter.get('/export', requireRole(...EXPORT_ROLES), async (req, res) => {
  const parsed = exportQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Paramètres invalides', details: parsed.error.flatten() });
  }
  const { type, institutionId, classId, subjectId, format, startDate, endDate } = parsed.data;
  if (!isSameInstitution(req.auth!, institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }

  const prepared = await prepareReportExport({
    type,
    institutionId,
    classId,
    subjectId,
    startDate,
    endDate,
  });
  const { rows, columns, baseFilename, title } = prepared;

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${baseFilename}.csv"`);
    return res.send(toCsv(rows, columns));
  }

  if (format === 'xlsx') {
    const buffer = await toXlsx(title, rows, columns);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${baseFilename}.xlsx"`);
    return res.send(buffer);
  }

  const pdfBytes = await renderTablePdf({
    title,
    generatedAt: new Date(),
    columns: columns.map((c) => c.label),
    rows: rows.map((row) =>
      columns.map((c) => {
        const v = c.value(row);
        return v === null || v === undefined ? '' : String(v);
      })
    ),
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${baseFilename}.pdf"`);
  res.send(Buffer.from(pdfBytes));
});

const scheduleSchema = z.object({
  type: z.enum(['students', 'absences', 'grades', 'attendance']),
  institutionId: z.string().uuid(),
  scheduledAt: z.string().min(1),
  classId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

/** §5.15 P1 — planifier un export CSV (file + cron 5 min). */
reportsRouter.post('/schedule', requireRole(...EXPORT_ROLES), async (req, res) => {
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  if (!isSameInstitution(req.auth!, parsed.data.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const when = new Date(parsed.data.scheduledAt).getTime();
  if (Number.isNaN(when) || when < Date.now() - 60_000) {
    return res.status(400).json({ error: 'scheduledAt doit être dans le futur' });
  }
  const job = await enqueueScheduledExport({
    ...parsed.data,
    createdBy: req.auth!.sub,
  });
  res.status(201).json({ job });
});

reportsRouter.get('/schedule', requireRole(...EXPORT_ROLES), async (req, res) => {
  const institutionId = typeof req.query.institutionId === 'string' ? req.query.institutionId : undefined;
  if (institutionId && !isSameInstitution(req.auth!, institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  // Personnel d'établissement : toujours filtré au tenant JWT (pas de vue globale).
  const scope =
    req.auth!.role === 'admin'
      ? institutionId
      : institutionId || req.auth!.institutionId || '__none__';
  const jobs = await listScheduledExports(scope === undefined ? undefined : scope);
  res.json({ jobs });
});

/** Déclenchement manuel (tests / ops) — direction uniquement. */
reportsRouter.post('/schedule/run', requireRole('admin', 'school_admin'), async (req, res) => {
  const result = await runDueExports();
  res.json(result);
});

const reportSchema = z.object({
  title: z.string().min(1),
  reportType: z.enum(['attendance', 'performance', 'usage', 'financial', 'custom']),
  institutionId: z.string().uuid().optional(),
  parameters: z.record(z.unknown()).default({}),
});

reportsRouter.post('/', requireRole('admin', 'school_admin'), requireFeature('advancedReports'), async (req, res) => {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  if (parsed.data.institutionId && !isSameInstitution(req.auth!, parsed.data.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const report = await prisma.strkReport.create({
    data: {
      title: parsed.data.title,
      reportType: parsed.data.reportType,
      institutionId: parsed.data.institutionId,
      parameters: parsed.data.parameters as any,
      status: 'pending',
      createdBy: req.auth!.sub,
    },
  });
  res.status(201).json({ report });
});

reportsRouter.get('/', requireFeature('advancedReports'), async (req, res) => {
  const institutionId = typeof req.query.institutionId === 'string' ? req.query.institutionId : undefined;
  if (institutionId && !isSameInstitution(req.auth!, institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const reports = await prisma.strkReport.findMany({
    where: institutionId ? { institutionId } : {},
    orderBy: { createdAt: 'desc' },
  });
  res.json({ reports });
});

reportsRouter.get('/:id/download', requireRole(...EXPORT_ROLES), async (req, res) => {
  const report = await prisma.strkReport.findUnique({ where: { id: req.params.id } });
  if (!report) {
    return res.status(404).json({ error: 'Rapport introuvable' });
  }
  if (report.institutionId && !isSameInstitution(req.auth!, report.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const data = report.data as { csv?: string; filename?: string; format?: string } | null;
  if (!data?.csv) {
    return res.status(404).json({ error: 'Aucun fichier stocké pour ce rapport' });
  }
  const filename = data.filename || `rapport_${report.id}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(data.csv);
});

reportsRouter.get('/:id', requireFeature('advancedReports'), async (req, res) => {
  const report = await prisma.strkReport.findUnique({ where: { id: req.params.id } });
  if (!report) {
    return res.status(404).json({ error: 'Rapport introuvable' });
  }
  if (report.institutionId && !isSameInstitution(req.auth!, report.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  res.json({ report });
});

reportsRouter.patch('/:id/status', requireRole('admin', 'school_admin'), requireFeature('advancedReports'), async (req, res) => {
  const existing = await prisma.strkReport.findUnique({ where: { id: req.params.id }, select: { institutionId: true } });
  // ORG-004 : sans ce contrôle, le personnel d'un établissement B pouvait
  // modifier le statut/fichier d'un rapport de l'établissement A par id.
  if (!existing || (existing.institutionId && !isSameInstitution(req.auth!, existing.institutionId))) {
    return res.status(404).json({ error: 'Rapport introuvable' });
  }
  const parsed = z
    .object({ status: z.enum(['pending', 'processing', 'completed', 'error']), fileUrl: z.string().optional() })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const report = await prisma.strkReport.update({
    where: { id: req.params.id },
    data: { status: parsed.data.status, ...(parsed.data.fileUrl ? { fileUrl: parsed.data.fileUrl } : {}) },
  });
  res.json({ report });
});

reportsRouter.delete('/:id', requireRole('admin', 'school_admin'), requireFeature('advancedReports'), async (req, res) => {
  const existing = await prisma.strkReport.findUnique({ where: { id: req.params.id }, select: { institutionId: true } });
  if (!existing || (existing.institutionId && !isSameInstitution(req.auth!, existing.institutionId))) {
    return res.status(404).json({ error: 'Rapport introuvable' });
  }
  await prisma.strkReport.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});
