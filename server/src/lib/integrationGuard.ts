/**
 * Garde-fous pour la validation sandbox des intégrations.
 * Ne lit jamais la valeur d’un secret dans les logs — seulement des préfixes.
 */

const LIVE_ALLOW = 'ALLOW_LIVE_INTEGRATION_KEYS';

/** Présence brute des variables (ignore `CADDYNOTE_TEST_MODE`). */
export const hasEnv = (key: string, env: NodeJS.ProcessEnv = process.env): boolean =>
  !!(env[key] && String(env[key]).trim());

export const detectLiveSecretLabels = (env: NodeJS.ProcessEnv = process.env): string[] => {
  const hits: string[] = [];
  const stripe = env.STRIPE_SECRET_KEY?.trim() ?? '';
  if (stripe.startsWith('sk_live_')) hits.push('STRIPE_SECRET_KEY (sk_live_)');
  // Stripe webhook secrets live commencent aussi par whsec_ — pas de distinction fiable.
  return hits;
};

export const isLiveIntegrationKeysAllowed = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env[LIVE_ALLOW] === 'true' || env[LIVE_ALLOW] === '1';

/**
 * Refuse les clés live en validation sandbox sauf dérogation explicite.
 * Retourne un message d’erreur ou null si OK.
 */
export const assertSandboxIntegrationKeys = (env: NodeJS.ProcessEnv = process.env): string | null => {
  const live = detectLiveSecretLabels(env);
  if (live.length === 0) return null;
  if (isLiveIntegrationKeysAllowed(env)) return null;
  return `Clés live détectées (${live.join(', ')}). Utilisez des clés sandbox/test, ou définissez ${LIVE_ALLOW}=true après revue SDCREATIV.`;
};
