import { prisma } from './prisma.js';

export type OnboardingStepId =
  | 'admin_ecole'
  | 'classes'
  | 'abonnement'
  | 'premier_envoi';

export type OnboardingStep = {
  id: OnboardingStepId;
  label: string;
  done: boolean;
  auto: boolean;
  detail?: string;
};

export type OnboardingState = {
  institutionId: string;
  steps: OnboardingStep[];
  completedCount: number;
  total: number;
  percent: number;
  manual: Partial<Record<OnboardingStepId, boolean>>;
  updatedAt: string | null;
};

const settingKey = (institutionId: string) => `onboarding:${institutionId}`;

const readManual = async (
  institutionId: string
): Promise<{ manual: Partial<Record<OnboardingStepId, boolean>>; updatedAt: string | null }> => {
  const row = await prisma.strkSetting.findUnique({
    where: { category_key: { category: 'institution', key: settingKey(institutionId) } },
    select: { value: true, updatedAt: true },
  });
  const value = (row?.value as { manual?: Partial<Record<OnboardingStepId, boolean>> } | null) ?? {};
  return {
    manual: value.manual || {},
    updatedAt: row?.updatedAt?.toISOString() ?? null,
  };
};

/** Checklist onboarding calculée + overrides manuels ops. */
export const getInstitutionOnboarding = async (institutionId: string): Promise<OnboardingState> => {
  const { manual, updatedAt } = await readManual(institutionId);

  const [schoolAdmin, classCount, subscription, firstSend] = await Promise.all([
    prisma.strkProfile.findFirst({
      where: { institutionId, role: 'school_admin', isActive: true },
      select: { id: true, email: true, lastLoginAt: true },
    }),
    prisma.strkClass.count({ where: { institutionId } }),
    prisma.premiumSubscription.findFirst({
      where: { institutionId, status: { in: ['active', 'trial', 'grace'] } },
      select: { id: true, status: true, plan: true },
    }),
    prisma.strkCommunicationLog.findFirst({
      where: { institutionId, status: { in: ['sent', 'delivered', 'queued'] } },
      orderBy: { requestedAt: 'asc' },
      select: { id: true, requestedAt: true, channel: true },
    }),
  ]);

  const autoAdmin = !!schoolAdmin;
  const autoClasses = classCount > 0;
  const autoAbo = !!subscription;
  const autoSend = !!firstSend;

  const steps: OnboardingStep[] = [
    {
      id: 'admin_ecole',
      label: 'Admin école actif',
      auto: true,
      done: manual.admin_ecole === true || autoAdmin,
      detail: schoolAdmin
        ? `${schoolAdmin.email || schoolAdmin.id}${schoolAdmin.lastLoginAt ? ' · connecté' : ' · jamais connecté'}`
        : 'Aucun school_admin',
    },
    {
      id: 'classes',
      label: 'Au moins une classe',
      auto: true,
      done: manual.classes === true || autoClasses,
      detail: `${classCount} classe(s)`,
    },
    {
      id: 'abonnement',
      label: 'Abonnement actif / essai / grâce',
      auto: true,
      done: manual.abonnement === true || autoAbo,
      detail: subscription ? `${subscription.plan} (${subscription.status})` : 'Aucun abo',
    },
    {
      id: 'premier_envoi',
      label: 'Premier envoi communication',
      auto: true,
      done: manual.premier_envoi === true || autoSend,
      detail: firstSend
        ? `${firstSend.channel} · ${firstSend.requestedAt.toLocaleDateString('fr-FR')}`
        : 'Aucun envoi journalisé',
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  return {
    institutionId,
    steps,
    completedCount,
    total: steps.length,
    percent: Math.round((completedCount / steps.length) * 100),
    manual,
    updatedAt,
  };
};

export const patchInstitutionOnboarding = async (
  institutionId: string,
  patch: Partial<Record<OnboardingStepId, boolean>>
): Promise<OnboardingState> => {
  const { manual } = await readManual(institutionId);
  const next = { ...manual, ...patch };
  await prisma.strkSetting.upsert({
    where: { category_key: { category: 'institution', key: settingKey(institutionId) } },
    create: {
      category: 'institution',
      key: settingKey(institutionId),
      value: { manual: next },
      description: 'Checklist onboarding établissement',
      isPublic: false,
    },
    update: { value: { manual: next } },
  });
  return getInstitutionOnboarding(institutionId);
};
