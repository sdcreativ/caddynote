/**
 * Exports planifiés (§5.15) — file dans settings system/exportSchedule.
 * À échéance : génère un CSV (MVP) et crée un ticket StrkReport `completed`
 * avec le contenu stocké dans `data` (téléchargeable via GET /reports/:id/download).
 */
import { scheduleExclusiveCron } from './cronLock.js';
import { prisma } from './prisma.js';
import { toCsv } from './csvExport.js';
import { prepareReportExport, type ReportExportType } from './reportExport.js';
import { logAudit } from './audit.js';

export type ScheduledExport = {
  id: string;
  scheduledAt: string;
  type: ReportExportType;
  institutionId: string;
  createdBy: string;
  classId?: string;
  subjectId?: string;
  startDate?: string;
  endDate?: string;
  status: 'scheduled' | 'processing' | 'done' | 'failed';
  reportId?: string;
  error?: string;
};

const CATEGORY = 'system';
const KEY = 'exportSchedule';
/** Plafond du CSV stocké en JSON (évite de saturer strk_settings / rapports). */
const MAX_CSV_CHARS = 400_000;

const readQueue = async (): Promise<ScheduledExport[]> => {
  const row = await prisma.strkSetting.findUnique({
    where: { category_key: { category: CATEGORY, key: KEY } },
    select: { value: true },
  });
  const v = row?.value as { items?: ScheduledExport[] } | null;
  return Array.isArray(v?.items) ? v!.items! : [];
};

const writeQueue = async (items: ScheduledExport[]) => {
  await prisma.strkSetting.upsert({
    where: { category_key: { category: CATEGORY, key: KEY } },
    create: {
      category: CATEGORY,
      key: KEY,
      value: { items },
      description: 'File exports planifiés établissement',
      isPublic: false,
    },
    update: { value: { items } },
  });
};

export const listScheduledExports = async (institutionId?: string): Promise<ScheduledExport[]> => {
  const items = await readQueue();
  return institutionId ? items.filter((i) => i.institutionId === institutionId) : items;
};

export const enqueueScheduledExport = async (
  input: Omit<ScheduledExport, 'id' | 'status'>
): Promise<ScheduledExport> => {
  const items = await readQueue();
  const job: ScheduledExport = {
    ...input,
    id: crypto.randomUUID(),
    status: 'scheduled',
  };
  items.push(job);
  await writeQueue(items.slice(-100));
  return job;
};

const runOne = async (job: ScheduledExport): Promise<ScheduledExport> => {
  try {
    const prepared = await prepareReportExport({
      type: job.type,
      institutionId: job.institutionId,
      classId: job.classId,
      subjectId: job.subjectId,
      startDate: job.startDate,
      endDate: job.endDate,
    });
    let csv = toCsv(prepared.rows, prepared.columns);
    let truncated = false;
    if (csv.length > MAX_CSV_CHARS) {
      csv = csv.slice(0, MAX_CSV_CHARS);
      truncated = true;
    }
    const report = await prisma.strkReport.create({
      data: {
        title: `${prepared.title} (planifié)`,
        reportType: job.type,
        institutionId: job.institutionId,
        parameters: {
          scheduledExportId: job.id,
          classId: job.classId,
          subjectId: job.subjectId,
          startDate: job.startDate,
          endDate: job.endDate,
          format: 'csv',
        } as any,
        data: {
          format: 'csv',
          filename: `${prepared.baseFilename}.csv`,
          rowCount: prepared.rows.length,
          truncated,
          csv,
        } as any,
        status: 'completed',
        createdBy: job.createdBy,
      },
    });
    await logAudit({
      actorId: job.createdBy,
      action: 'reports.export.scheduled.run',
      targetType: 'report',
      targetId: report.id,
      institutionId: job.institutionId,
      metadata: { scheduledExportId: job.id, type: job.type, rowCount: prepared.rows.length, truncated },
    });
    return { ...job, status: 'done', reportId: report.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    return { ...job, status: 'failed', error: message };
  }
};

export const runDueExports = async (): Promise<{ processed: number }> => {
  const now = Date.now();
  const items = await readQueue();
  let processed = 0;
  const next: ScheduledExport[] = [];

  for (const job of items) {
    if (job.status !== 'scheduled' || new Date(job.scheduledAt).getTime() > now) {
      next.push(job);
      continue;
    }
    const done = await runOne({ ...job, status: 'processing' });
    next.push(done);
    processed += 1;
  }

  await writeQueue(next.slice(-100));
  return { processed };
};

let started = false;

export const startExportScheduleCron = (): void => {
  if (started) return;
  started = true;
  scheduleExclusiveCron('*/5 * * * *', 'export-schedule', async () => {
    const { processed } = await runDueExports();
    if (processed > 0) console.log(`⏰ Exports planifiés : ${processed} exécuté(s)`);
  });
  console.log('⏰ Tâche planifiée « exports » enregistrée (toutes les 5 min)');
};
