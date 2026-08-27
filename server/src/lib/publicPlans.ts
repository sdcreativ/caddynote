import type { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

/**
 * Catalogue public Essentiel / Performance / Réseau.
 * Mélange métadonnées marketing (`featureList`, CTA…) et entitlements
 * booléens lus par `isFeatureEnabled` + quotas colonnes plan.
 */
export type PublicPlanDefault = {
  name: string;
  priceMonthly: number;
  sortOrder: number;
  maxStudents: number | null;
  maxInstitutions: number | null;
  maxMonthlyReports: number | null;
  maxSmsPerMonth: number | null;
  maxUsers: number | null;
  features: Record<string, unknown>;
};

const ENTITLEMENT_KEYS = [
  'finance',
  'communications',
  'admissions',
  'documents',
  'canteen',
  'lot9_services',
  'advancedReports',
  'exercises_ai',
] as const;

/** Modules de base ON pour les 3 offres (mix prudent — pas de coupure finance/SMS). */
const BASE_MODULES_ON = {
  finance: true,
  communications: true,
  admissions: true,
  documents: true,
  canteen: true,
  lot9_services: true,
  exercises_ai: false,
} as const;

export const PUBLIC_PLAN_DEFAULTS: PublicPlanDefault[] = [
  {
    name: 'Essentiel',
    priceMonthly: 0,
    sortOrder: 1,
    maxStudents: 400,
    maxInstitutions: 1,
    maxMonthlyReports: 20,
    maxSmsPerMonth: 100,
    maxUsers: 40,
    features: {
      slug: 'essentiel',
      description: 'Pour démarrer la transformation numérique.',
      featureList: [
        'Gestion des élèves',
        'Présences & absences',
        'Notes et bulletins',
        'Espace parents',
      ],
      ctaPath: '/contact?subject=Offre%20Essentiel',
      featured: false,
      priceLabel: 'Sur devis',
      ...BASE_MODULES_ON,
      advancedReports: false,
    },
  },
  {
    name: 'Performance',
    priceMonthly: 0,
    sortOrder: 2,
    maxStudents: null,
    maxInstitutions: 1,
    maxMonthlyReports: null,
    maxSmsPerMonth: null,
    maxUsers: null,
    features: {
      slug: 'performance',
      description: 'Pour piloter un établissement complet.',
      featureList: [
        'Tout Essentiel',
        'Paiements Mobile Money',
        'Alertes SMS automatisées',
        'Rapports avancés',
        'Support prioritaire (accompagnement)',
      ],
      ctaPath: '/contact?subject=Offre%20Performance',
      featured: true,
      priceLabel: 'Sur devis',
      ...BASE_MODULES_ON,
      advancedReports: true,
    },
  },
  {
    name: 'Réseau',
    priceMonthly: 0,
    sortOrder: 3,
    maxStudents: null,
    maxInstitutions: 20,
    maxMonthlyReports: null,
    maxSmsPerMonth: null,
    maxUsers: null,
    features: {
      slug: 'reseau',
      description: 'Pour les groupes scolaires multi-sites.',
      featureList: [
        'Tout Performance',
        'Réseau multi-établissements (mise en place accompagnée)',
        'Vue consolidée des effectifs',
        'API & intégrations sur devis',
        'Accompagnement dédié',
      ],
      ctaPath: '/contact?subject=Offre%20R%C3%A9seau',
      featured: false,
      priceLabel: 'Personnalisé',
      ...BASE_MODULES_ON,
      advancedReports: true,
    },
  },
];

const asJson = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;

const planSlug = (features: unknown): string | null => {
  if (!features || typeof features !== 'object' || Array.isArray(features)) return null;
  const slug = (features as Record<string, unknown>).slug;
  return typeof slug === 'string' ? slug : null;
};

const mergePublicFeatures = (
  existing: unknown,
  defaults: Record<string, unknown>
): Record<string, unknown> => {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  const merged = { ...base, ...defaults };
  // Garantir les clés d’entitlement même si un admin a édité le marketing.
  for (const key of ENTITLEMENT_KEYS) {
    if (typeof defaults[key] === 'boolean') {
      merged[key] = defaults[key];
    }
  }
  return merged;
};

export type SyncPublicPlansResult = {
  seeded: boolean;
  synced: number;
  planIds: string[];
};

/**
 * Crée le catalogue public s’il est vide, sinon resynchronise
 * Essentiel / Performance / Réseau (marketing + entitlements + quotas soft).
 */
export const syncPublicSubscriptionPlans = async (): Promise<SyncPublicPlansResult> => {
  const existing = await prisma.subscriptionPlan.findMany({ orderBy: { sortOrder: 'asc' } });
  const bySlug = new Map<string, (typeof existing)[number]>();
  const byName = new Map<string, (typeof existing)[number]>();
  for (const plan of existing) {
    const slug = planSlug(plan.features);
    if (slug) bySlug.set(slug, plan);
    byName.set(plan.name.toLowerCase(), plan);
  }

  if (existing.length === 0) {
    await prisma.subscriptionPlan.createMany({
      data: PUBLIC_PLAN_DEFAULTS.map((d) => ({
        name: d.name,
        priceMonthly: d.priceMonthly,
        sortOrder: d.sortOrder,
        maxStudents: d.maxStudents,
        maxInstitutions: d.maxInstitutions,
        maxMonthlyReports: d.maxMonthlyReports,
        maxSmsPerMonth: d.maxSmsPerMonth,
        maxUsers: d.maxUsers,
        features: asJson(d.features),
        isActive: true,
      })),
    });
    const plans = await prisma.subscriptionPlan.findMany({ orderBy: { sortOrder: 'asc' } });
    return { seeded: true, synced: plans.length, planIds: plans.map((p) => p.id) };
  }

  let synced = 0;
  const planIds: string[] = [];
  for (const d of PUBLIC_PLAN_DEFAULTS) {
    const slug = String(d.features.slug || '');
    const match = (slug && bySlug.get(slug)) || byName.get(d.name.toLowerCase());
    if (!match) {
      const created = await prisma.subscriptionPlan.create({
        data: {
          name: d.name,
          priceMonthly: d.priceMonthly,
          sortOrder: d.sortOrder,
          maxStudents: d.maxStudents,
          maxInstitutions: d.maxInstitutions,
          maxMonthlyReports: d.maxMonthlyReports,
          maxSmsPerMonth: d.maxSmsPerMonth,
          maxUsers: d.maxUsers,
          features: asJson(d.features),
          isActive: true,
        },
      });
      planIds.push(created.id);
      synced += 1;
      continue;
    }
    await prisma.subscriptionPlan.update({
      where: { id: match.id },
      data: {
        name: d.name,
        sortOrder: d.sortOrder,
        maxStudents: d.maxStudents,
        maxInstitutions: d.maxInstitutions,
        maxMonthlyReports: d.maxMonthlyReports,
        maxSmsPerMonth: d.maxSmsPerMonth,
        maxUsers: d.maxUsers,
        features: asJson(mergePublicFeatures(match.features, d.features)),
        isActive: true,
      },
    });
    planIds.push(match.id);
    synced += 1;
  }

  return { seeded: false, synced, planIds };
};
