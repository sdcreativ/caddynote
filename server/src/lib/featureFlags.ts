import { prisma } from './prisma.js';
import { getActivePlan } from './quotas.js';

/**
 * SAA-005 — feature flags par formule / tenant / plateforme.
 *
 * Clés canoniques (UI plateforme + tenant alignées) :
 * - Modules opt-out (défaut ON si non défini) : finance, communications,
 *   admissions, documents, canteen, lot9_services
 * - Expérimental opt-in (défaut OFF) : exercises_ai, advancedReports
 *
 * Alias conservés pour rétrocompat : aiTutor → exercises_ai, lot9Services → lot9_services
 */

type FeatureMap = Record<string, boolean>;

/** Modules métier : absents = activés (ne pas casser les tenants existants). */
export const MODULE_FEATURES_DEFAULT_ON = [
  'finance',
  'communications',
  'admissions',
  'documents',
  'canteen',
  'lot9_services',
] as const;

/** Flags expérimentaux : absents = désactivés. */
export const EXPERIMENTAL_FEATURES_DEFAULT_OFF = ['exercises_ai', 'advancedReports'] as const;

export const CANONICAL_FEATURE_KEYS = [
  ...MODULE_FEATURES_DEFAULT_ON,
  ...EXPERIMENTAL_FEATURES_DEFAULT_OFF,
] as const;

const ALIASES: Record<string, string> = {
  aiTutor: 'exercises_ai',
  exercises_ai: 'exercises_ai',
  lot9Services: 'lot9_services',
  lot9_services: 'lot9_services',
  advancedReports: 'advancedReports',
  advanced_reports: 'advancedReports',
  finance: 'finance',
  communications: 'communications',
  admissions: 'admissions',
  documents: 'documents',
  canteen: 'canteen',
};

export const canonicalizeFeatureKey = (key: string): string => ALIASES[key] || key;

const lookupMap = (map: FeatureMap, key: string): boolean | undefined => {
  const canonical = canonicalizeFeatureKey(key);
  if (Object.prototype.hasOwnProperty.call(map, canonical)) return !!map[canonical];
  // Anciennes clés encore présentes en base
  for (const [alias, canon] of Object.entries(ALIASES)) {
    if (canon === canonical && Object.prototype.hasOwnProperty.call(map, alias)) {
      return !!map[alias];
    }
  }
  return undefined;
};

const getPlatformFlags = async (): Promise<FeatureMap> => {
  const setting = await prisma.strkSetting.findUnique({
    where: { category_key: { category: 'system', key: 'platformFlags' } },
    select: { value: true },
  });
  return (setting?.value as FeatureMap | null) ?? {};
};

export const isFeatureEnabled = async (institutionId: string, key: string): Promise<boolean> => {
  const canonical = canonicalizeFeatureKey(key);

  const platform = await getPlatformFlags();
  const fromPlatform = lookupMap(platform, canonical);
  if (fromPlatform !== undefined) return fromPlatform;

  const institution = await prisma.strkInstitution.findUnique({
    where: { id: institutionId },
    select: { featureOverrides: true },
  });
  const overrides = (institution?.featureOverrides as FeatureMap | null) ?? {};
  const fromOverride = lookupMap(overrides, canonical);
  if (fromOverride !== undefined) return fromOverride;

  const plan = await getActivePlan(institutionId);
  const planFeatures = (plan?.features as FeatureMap | null) ?? {};
  const fromPlan = lookupMap(planFeatures, canonical);
  if (fromPlan !== undefined) return fromPlan;

  if ((MODULE_FEATURES_DEFAULT_ON as readonly string[]).includes(canonical)) return true;
  return false;
};

/** `enabled: null` retire la surcharge (retombe sur plan / défaut). */
export const setFeatureOverride = async (
  institutionId: string,
  key: string,
  enabled: boolean | null
): Promise<FeatureMap> => {
  const canonical = canonicalizeFeatureKey(key);
  const institution = await prisma.strkInstitution.findUnique({
    where: { id: institutionId },
    select: { featureOverrides: true },
  });
  const overrides: FeatureMap = { ...((institution?.featureOverrides as FeatureMap | null) ?? {}) };
  // Nettoyer les alias obsolètes pour la même clé
  for (const [alias, canon] of Object.entries(ALIASES)) {
    if (canon === canonical) delete overrides[alias];
  }
  if (enabled === null) {
    delete overrides[canonical];
  } else {
    overrides[canonical] = enabled;
  }
  const updated = await prisma.strkInstitution.update({
    where: { id: institutionId },
    data: { featureOverrides: overrides },
  });
  return (updated.featureOverrides as FeatureMap | null) ?? {};
};

/** Vue plan + overrides + plateforme + valeurs effectives. */
export const getFeatureSnapshot = async (
  institutionId: string
): Promise<{
  planFeatures: FeatureMap;
  overrides: FeatureMap;
  platformFlags: FeatureMap;
  effective: FeatureMap;
}> => {
  const platformFlags = await getPlatformFlags();
  const institution = await prisma.strkInstitution.findUnique({
    where: { id: institutionId },
    select: { featureOverrides: true },
  });
  const overrides = (institution?.featureOverrides as FeatureMap | null) ?? {};
  const plan = await getActivePlan(institutionId);
  const planFeatures = (plan?.features as FeatureMap | null) ?? {};

  const keys = new Set<string>([
    ...CANONICAL_FEATURE_KEYS,
    ...Object.keys(planFeatures).map(canonicalizeFeatureKey),
    ...Object.keys(overrides).map(canonicalizeFeatureKey),
    ...Object.keys(platformFlags).map(canonicalizeFeatureKey),
  ]);

  const effective: FeatureMap = {};
  for (const key of keys) {
    effective[key] = await isFeatureEnabled(institutionId, key);
  }

  return { planFeatures, overrides, platformFlags, effective };
};
