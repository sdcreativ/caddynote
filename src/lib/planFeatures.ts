/**
 * Clés feature alignées sur le backend (`server/src/lib/featureFlags.ts`).
 * Les alias legacy restent acceptés côté lecture UI.
 */
const FEATURE_ALIASES: Record<string, string[]> = {
  advancedReports: ['advancedReports', 'advanced_reports'],
  advanced_reports: ['advancedReports', 'advanced_reports'],
  exercises_ai: ['exercises_ai', 'aiTutor'],
  aiTutor: ['exercises_ai', 'aiTutor'],
  lot9_services: ['lot9_services', 'lot9Services'],
  lot9Services: ['lot9_services', 'lot9Services'],
  finance: ['finance'],
  communications: ['communications'],
  admissions: ['admissions'],
  documents: ['documents'],
  canteen: ['canteen'],
};

export const planHasFeature = (
  features: Record<string, unknown> | null | undefined,
  feature: string
): boolean => {
  if (!features || typeof features !== 'object') return false;
  const keys = FEATURE_ALIASES[feature] ?? [feature];
  return keys.some((key) => features[key] === true);
};
