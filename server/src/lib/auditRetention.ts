import { scheduleExclusiveCron } from './cronLock.js';
import { prisma } from './prisma.js';

const CATEGORY = 'system';
const KEY = 'auditRetention';

export type AuditRetentionConfig = {
  /** Jours de conservation (min 30, max 3650). */
  days: number;
  enabled: boolean;
};

const DEFAULT: AuditRetentionConfig = { days: 365, enabled: false };

export const getAuditRetentionConfig = async (): Promise<AuditRetentionConfig> => {
  const row = await prisma.strkSetting.findUnique({
    where: { category_key: { category: CATEGORY, key: KEY } },
    select: { value: true },
  });
  const v = row?.value as Partial<AuditRetentionConfig> | null;
  if (!v) return { ...DEFAULT };
  return {
    days: Math.min(3650, Math.max(30, Number(v.days) || DEFAULT.days)),
    enabled: v.enabled === true,
  };
};

export const setAuditRetentionConfig = async (
  cfg: Partial<AuditRetentionConfig>
): Promise<AuditRetentionConfig> => {
  const current = await getAuditRetentionConfig();
  const next: AuditRetentionConfig = {
    days: Math.min(3650, Math.max(30, Number(cfg.days ?? current.days) || DEFAULT.days)),
    enabled: cfg.enabled !== undefined ? !!cfg.enabled : current.enabled,
  };
  await prisma.strkSetting.upsert({
    where: { category_key: { category: CATEGORY, key: KEY } },
    create: {
      category: CATEGORY,
      key: KEY,
      value: next,
      description: 'Rétention journal d’audit (purge cron)',
      isPublic: false,
    },
    update: { value: next },
  });
  return next;
};

export const runAuditRetentionPurge = async (): Promise<{ deleted: number; cutoff: string | null }> => {
  const cfg = await getAuditRetentionConfig();
  if (!cfg.enabled) return { deleted: 0, cutoff: null };
  const cutoff = new Date(Date.now() - cfg.days * 24 * 60 * 60 * 1000);
  const result = await prisma.strkAuditLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return { deleted: result.count, cutoff: cutoff.toISOString() };
};

let started = false;

export const startAuditRetentionCron = (): void => {
  if (started) return;
  started = true;
  scheduleExclusiveCron('30 3 * * *', 'audit-retention', async () => {
    const { deleted, cutoff } = await runAuditRetentionPurge();
    if (cutoff) {
      console.log(`⏰ Purge audit : ${deleted} ligne(s) avant ${cutoff}`);
    }
  });
  console.log('⏰ Tâche planifiée « rétention audit » enregistrée (tous les jours à 3h30)');
};
