import { prisma } from './prisma.js';
import type { SubscriptionPlan } from '@prisma/client';
import { isS3Configured, listObjects } from './s3.js';

/**
 * SAA-003 (Lot 10) : quotas élèves / users / SMS / stockage.
 * Stockage : estimation S3 par préfixe `…/inst-{id}/` + compteur
 * `storageUsedBytes` (max des deux pour ne pas sous-estimer).
 */
export type QuotaType = 'students' | 'users' | 'smsPerMonth' | 'storageGb' | 'aiPerMonth';

export interface QuotaStatus {
  type: QuotaType;
  current: number;
  /** `null` = illimité (aucun plafond sur le plan actif, ou aucun abonnement actif). */
  limit: number | null;
  allowed: boolean;
  /** Vrai à partir de 80% du plafond, tant que la limite n'est pas encore atteinte. */
  warning: boolean;
}

const WARNING_RATIO = 0.8;

const LIMIT_FIELD: Record<QuotaType, keyof SubscriptionPlan> = {
  students: 'maxStudents',
  users: 'maxUsers',
  smsPerMonth: 'maxSmsPerMonth',
  storageGb: 'storageLimitGb',
  aiPerMonth: 'maxAiPerMonth',
};

export const getActivePlan = async (institutionId: string): Promise<SubscriptionPlan | null> => {
  const subscription = await prisma.premiumSubscription.findFirst({
    where: { institutionId, status: 'active' },
    include: { plan_: true },
    orderBy: { createdAt: 'desc' },
  });
  return subscription?.plan_ ?? null;
};

const startOfCurrentMonth = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
};

const STORAGE_FOLDERS = [
  'avatars',
  'documents',
  'assignments',
  'messages',
  'receipts',
  'course-materials',
  'admissions',
] as const;

/** Octets utilisés pour un établissement (estimation S3 + compteur local). */
export const estimateInstitutionStorageBytes = async (institutionId: string): Promise<number> => {
  const institution = await prisma.strkInstitution.findUnique({
    where: { id: institutionId },
    select: { storageUsedBytes: true },
  });
  const counter = Number(institution?.storageUsedBytes ?? 0);
  if (!isS3Configured()) return counter;

  let listed = 0;
  const scope = `inst-${institutionId}`;
  for (const folder of STORAGE_FOLDERS) {
    try {
      const objects = await listObjects(`${folder}/${scope}/`);
      listed += objects.reduce((sum, o) => sum + o.sizeBytes, 0);
    } catch (error) {
      console.error(`Estimation stockage S3 échouée (${folder}/${scope}):`, error);
    }
  }
  return Math.max(counter, listed);
};

const countCurrentUsage = async (institutionId: string, type: QuotaType): Promise<number> => {
  switch (type) {
    case 'students':
      return prisma.strkStudent.count({ where: { institutionId } });
    case 'users':
      return prisma.strkProfile.count({ where: { institutionId } });
    case 'smsPerMonth':
      return prisma.strkCommunicationLog.count({
        where: { institutionId, channel: { in: ['sms', 'whatsapp'] }, requestedAt: { gte: startOfCurrentMonth() } },
      });
    case 'aiPerMonth':
      // Compteur = générations IA réussies journalisées (exercises.ai.generate).
      return prisma.strkAuditLog.count({
        where: {
          institutionId,
          action: 'exercises.ai.generate',
          createdAt: { gte: startOfCurrentMonth() },
        },
      });
    case 'storageGb': {
      const bytes = await estimateInstitutionStorageBytes(institutionId);
      return Math.ceil(bytes / (1024 * 1024 * 1024));
    }
  }
};

/** `additional` : unités que l'appelant s'apprête à ajouter. */
export const checkQuota = async (institutionId: string, type: QuotaType, additional = 1): Promise<QuotaStatus> => {
  const plan = await getActivePlan(institutionId);
  const limit = plan ? ((plan[LIMIT_FIELD[type]] as number | null) ?? null) : null;
  const current = await countCurrentUsage(institutionId, type);

  if (limit === null) {
    return { type, current, limit: null, allowed: true, warning: false };
  }

  const allowed = current + additional <= limit;
  const warning = allowed && current + additional >= limit * WARNING_RATIO;
  return { type, current, limit, allowed, warning };
};

export const QUOTA_LABELS: Record<QuotaType, string> = {
  students: 'élèves',
  users: 'comptes utilisateurs',
  smsPerMonth: 'SMS/WhatsApp ce mois-ci',
  storageGb: 'stockage (Go)',
  aiPerMonth: 'générations IA ce mois-ci',
};

const ALL_QUOTA_TYPES: QuotaType[] = ['students', 'users', 'smsPerMonth', 'storageGb', 'aiPerMonth'];

export const getQuotaOverview = async (institutionId: string): Promise<QuotaStatus[]> =>
  Promise.all(ALL_QUOTA_TYPES.map((type) => checkQuota(institutionId, type, 0)));

/** Incrémente le compteur local après un upload confirmé (taille connue). */
export const recordStorageUsage = async (institutionId: string, deltaBytes: number): Promise<void> => {
  if (!institutionId || !Number.isFinite(deltaBytes) || deltaBytes === 0) return;
  await prisma.strkInstitution
    .update({
      where: { id: institutionId },
      data: { storageUsedBytes: { increment: BigInt(Math.trunc(deltaBytes)) } },
    })
    .catch((error) => console.error('Échec maj storageUsedBytes:', error));
};
