import { prisma } from './prisma.js';
import { getQuotaOverview, type QuotaStatus } from './quotas.js';
import { logAudit } from './audit.js';

const CATEGORY = 'system';
const KEY = 'overagePolicy';

export type OveragePolicy = {
  /** warn_only = autorise le dépassement avec audit ; hard_block = quotas stricts (défaut). */
  mode: 'hard_block' | 'warn_only';
};

export const getOveragePolicy = async (): Promise<OveragePolicy> => {
  const row = await prisma.strkSetting.findUnique({
    where: { category_key: { category: CATEGORY, key: KEY } },
    select: { value: true },
  });
  const mode = (row?.value as { mode?: string } | null)?.mode;
  return { mode: mode === 'warn_only' ? 'warn_only' : 'hard_block' };
};

export const setOveragePolicy = async (mode: OveragePolicy['mode']): Promise<OveragePolicy> => {
  const value: OveragePolicy = { mode };
  await prisma.strkSetting.upsert({
    where: { category_key: { category: CATEGORY, key: KEY } },
    create: {
      category: CATEGORY,
      key: KEY,
      value,
      description: 'Politique dépassement quotas (SMS/stockage/…)',
      isPublic: false,
    },
    update: { value },
  });
  return value;
};

/**
 * Wrapper : en mode warn_only, force allowed=true si limite dépassée et journalise.
 */
export const checkQuotaWithOverage = async (
  institutionId: string,
  type: QuotaStatus['type'],
  additional = 1,
  actorId?: string | null
): Promise<QuotaStatus & { overage: boolean }> => {
  const { checkQuota } = await import('./quotas.js');
  const status = await checkQuota(institutionId, type, additional);
  if (status.allowed || status.limit === null) {
    return { ...status, overage: false };
  }
  const policy = await getOveragePolicy();
  if (policy.mode !== 'warn_only') {
    return { ...status, overage: false };
  }
  await logAudit({
    institutionId,
    actorId: actorId ?? null,
    action: 'quota.overage.allowed',
    targetType: 'institution',
    targetId: institutionId,
    metadata: {
      type,
      current: status.current,
      limit: status.limit,
      additional,
    },
  });
  return { ...status, allowed: true, warning: true, overage: true };
};

export const listInstitutionsNearQuota = async (): Promise<
  Array<{ institutionId: string; name: string; quotas: QuotaStatus[] }>
> => {
  const institutions = await prisma.strkInstitution.findMany({
    select: { id: true, name: true },
    take: 200,
    orderBy: { name: 'asc' },
  });
  const out: Array<{ institutionId: string; name: string; quotas: QuotaStatus[] }> = [];
  for (const inst of institutions) {
    const quotas = await getQuotaOverview(inst.id);
    const interesting = quotas.filter((q) => q.warning || !q.allowed);
    if (interesting.length > 0) {
      out.push({ institutionId: inst.id, name: inst.name, quotas: interesting });
    }
  }
  return out;
};
