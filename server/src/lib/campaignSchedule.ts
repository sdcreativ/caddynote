import { scheduleExclusiveCron } from './cronLock.js';
import { prisma } from './prisma.js';
import { queueCommunication } from './communications.js';
import { logAudit } from './audit.js';

/**
 * Campagnes planifiées (MVP) — file dans settings system/campaignSchedule.
 */

export type ScheduledCampaign = {
  id: string;
  scheduledAt: string;
  subject: string;
  body: string;
  channel: 'email' | 'sms' | 'whatsapp' | 'push';
  recipientIds: string[];
  useCase?: string;
  createdBy: string;
  status: 'scheduled' | 'processing' | 'done' | 'failed';
  result?: { ok: number; fail: number };
};

const CATEGORY = 'system';
const KEY = 'campaignSchedule';

const readQueue = async (): Promise<ScheduledCampaign[]> => {
  const row = await prisma.strkSetting.findUnique({
    where: { category_key: { category: CATEGORY, key: KEY } },
    select: { value: true },
  });
  const v = row?.value as { items?: ScheduledCampaign[] } | null;
  return Array.isArray(v?.items) ? v!.items! : [];
};

const writeQueue = async (items: ScheduledCampaign[]) => {
  await prisma.strkSetting.upsert({
    where: { category_key: { category: CATEGORY, key: KEY } },
    create: {
      category: CATEGORY,
      key: KEY,
      value: { items },
      description: 'File campagnes planifiées Super Admin',
      isPublic: false,
    },
    update: { value: { items } },
  });
};

export const listScheduledCampaigns = async () => readQueue();

export const enqueueScheduledCampaign = async (
  input: Omit<ScheduledCampaign, 'id' | 'status'>
): Promise<ScheduledCampaign> => {
  const items = await readQueue();
  const campaign: ScheduledCampaign = {
    ...input,
    id: crypto.randomUUID(),
    status: 'scheduled',
  };
  items.push(campaign);
  await writeQueue(items.slice(-100));
  return campaign;
};

export const runDueCampaigns = async (): Promise<{ processed: number }> => {
  const now = Date.now();
  const items = await readQueue();
  let processed = 0;
  const next: ScheduledCampaign[] = [];

  for (const c of items) {
    if (c.status !== 'scheduled' || new Date(c.scheduledAt).getTime() > now) {
      next.push(c);
      continue;
    }
    let ok = 0;
    let fail = 0;
    for (const recipientId of c.recipientIds.slice(0, 500)) {
      const result = await queueCommunication({
        channel: c.channel,
        recipientId,
        subject: c.subject,
        body: c.body,
        useCase: c.useCase || 'platform_campaign_scheduled',
        requestedBy: c.createdBy,
      });
      if (result.ok) ok += 1;
      else fail += 1;
    }
    const done: ScheduledCampaign = {
      ...c,
      status: fail && !ok ? 'failed' : 'done',
      result: { ok, fail },
    };
    next.push(done);
    processed += 1;
    await logAudit({
      actorId: c.createdBy,
      action: 'admin.campaign.scheduled.run',
      targetType: 'campaign',
      targetId: c.id,
      metadata: { ok, fail, scheduledAt: c.scheduledAt },
    });
  }

  await writeQueue(next.slice(-100));
  return { processed };
};

export const campaignDeliveryReport = async (useCasePrefix = 'platform_campaign') => {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const logs = await prisma.strkCommunicationLog.groupBy({
    by: ['status', 'channel'],
    where: {
      useCase: { startsWith: useCasePrefix },
      requestedAt: { gte: since },
    },
    _count: { _all: true },
  });
  return {
    since: since.toISOString(),
    rows: logs.map((l) => ({
      status: l.status,
      channel: l.channel,
      count: l._count._all,
    })),
  };
};

let started = false;

export const startCampaignScheduleCron = (): void => {
  if (started) return;
  started = true;
  scheduleExclusiveCron('*/5 * * * *', 'campaign-schedule', async () => {
    const { processed } = await runDueCampaigns();
    if (processed > 0) console.log(`⏰ Campagnes planifiées : ${processed} exécutée(s)`);
  });
  console.log('⏰ Tâche planifiée « campagnes » enregistrée (toutes les 5 min)');
};
