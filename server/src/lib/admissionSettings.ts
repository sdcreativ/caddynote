/**
 * Politique admissions par établissement (canaux + paiement) — StrkSetting.
 */
import { prisma } from './prisma.js';

export type AdmissionChannelPrefs = {
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
  inApp: boolean;
};

export type AdmissionPaymentPolicy = {
  /** when_to_charge */
  trigger: 'before_review' | 'after_acceptance' | 'reservation_deposit' | 'full_before_confirm' | 'manual';
  requirePaidBeforeSubmit: boolean;
  requirePaidBeforeEnroll: boolean;
  /** Frais de dossier appliqués à la création (centimes). 0 = pas de frais auto. */
  defaultApplicationFeeCents?: number;
  defaultApplicationFeeCurrency?: string;
};

export type AdmissionInstitutionPolicy = {
  channels: AdmissionChannelPrefs;
  payment: AdmissionPaymentPolicy;
  /** Jours avant expiration pour relancer. */
  expiryReminderDays: number;
  /** Jours avant clôture de dépôt pour relancer. */
  deadlineReminderDays: number;
  /** Jours d’inactivité avant relance dossier incomplet (draft / needs_info). */
  incompleteReminderDays: number;
};

const DEFAULT_POLICY: AdmissionInstitutionPolicy = {
  channels: { email: true, sms: true, whatsapp: true, inApp: true },
  payment: {
    trigger: 'manual',
    requirePaidBeforeSubmit: false,
    requirePaidBeforeEnroll: false,
    defaultApplicationFeeCents: 0,
    defaultApplicationFeeCurrency: 'XOF',
  },
  expiryReminderDays: 14,
  deadlineReminderDays: 3,
  incompleteReminderDays: 7,
};

const settingKey = (institutionId: string) => `admissions:${institutionId}`;

export const getAdmissionInstitutionPolicy = async (
  institutionId: string
): Promise<AdmissionInstitutionPolicy> => {
  const row = await prisma.strkSetting.findUnique({
    where: { category_key: { category: 'institution', key: settingKey(institutionId) } },
  });
  if (!row?.value || typeof row.value !== 'object') return { ...DEFAULT_POLICY };
  const v = row.value as Partial<AdmissionInstitutionPolicy>;
  return {
    channels: { ...DEFAULT_POLICY.channels, ...(v.channels ?? {}) },
    payment: { ...DEFAULT_POLICY.payment, ...(v.payment ?? {}) },
    expiryReminderDays: v.expiryReminderDays ?? DEFAULT_POLICY.expiryReminderDays,
    deadlineReminderDays: v.deadlineReminderDays ?? DEFAULT_POLICY.deadlineReminderDays,
    incompleteReminderDays: v.incompleteReminderDays ?? DEFAULT_POLICY.incompleteReminderDays,
  };
};

export const setAdmissionInstitutionPolicy = async (
  institutionId: string,
  policy: {
    channels?: Partial<AdmissionChannelPrefs>;
    payment?: Partial<AdmissionPaymentPolicy>;
    expiryReminderDays?: number;
    deadlineReminderDays?: number;
    incompleteReminderDays?: number;
  }
): Promise<AdmissionInstitutionPolicy> => {
  const current = await getAdmissionInstitutionPolicy(institutionId);
  const next: AdmissionInstitutionPolicy = {
    channels: { ...current.channels, ...(policy.channels ?? {}) },
    payment: { ...current.payment, ...(policy.payment ?? {}) },
    expiryReminderDays: policy.expiryReminderDays ?? current.expiryReminderDays,
    deadlineReminderDays: policy.deadlineReminderDays ?? current.deadlineReminderDays,
    incompleteReminderDays: policy.incompleteReminderDays ?? current.incompleteReminderDays,
  };
  await prisma.strkSetting.upsert({
    where: { category_key: { category: 'institution', key: settingKey(institutionId) } },
    create: {
      category: 'institution',
      key: settingKey(institutionId),
      value: next,
      description: 'Politique admissions (canaux + paiement)',
    },
    update: { value: next },
  });
  return next;
};

export const DEFAULT_REJECTION_REASONS: Array<{ code: string; label: string; sortOrder: number }> = [
  { code: 'illegible', label: 'Document illisible ou flou', sortOrder: 10 },
  { code: 'incomplete', label: 'Document incomplet', sortOrder: 20 },
  { code: 'expired', label: 'Document périmé', sortOrder: 30 },
  { code: 'wrong_type', label: 'Mauvais type de document', sortOrder: 40 },
  { code: 'identity_mismatch', label: 'Identité non concordante', sortOrder: 50 },
  { code: 'forged_suspect', label: 'Authenticité douteuse', sortOrder: 60 },
];

export const ensureDefaultRejectionReasons = async (institutionId: string) => {
  for (const reason of DEFAULT_REJECTION_REASONS) {
    const existing = await prisma.strkAdmissionRejectionReason.findUnique({
      where: { institutionId_code: { institutionId, code: reason.code } },
    });
    if (!existing) {
      await prisma.strkAdmissionRejectionReason.create({
        data: {
          institutionId,
          code: reason.code,
          label: reason.label,
          sortOrder: reason.sortOrder,
        },
      });
    }
  }
};
