import { isTestMode } from './testMode.js';

/**
 * Déploiement CaddyNote (`CADDYNOTE_DEPLOYMENT`).
 * staging / production = environnements « serveur réel » (fail-closed partiel).
 */

export type DeploymentKind = 'local' | 'staging' | 'production' | 'other';

export const getDeployment = (): DeploymentKind => {
  const d = (process.env.CADDYNOTE_DEPLOYMENT || '').trim().toLowerCase();
  if (d === 'staging') return 'staging';
  if (d === 'production') return 'production';
  if (!d) return 'local';
  return 'other';
};

export const isDeployedServer = (): boolean => {
  const d = getDeployment();
  return d === 'staging' || d === 'production';
};

/** Hors test mode, sur staging/production. */
export const isHardenedRuntime = (): boolean => isDeployedServer() && !isTestMode();
