/**
 * Origines CORS : jamais `origin: true` (reflet de n’importe quel Origin
 * + credentials). Staging/production : liste obligatoire via CORS_ORIGIN.
 */
import { isHardenedRuntime } from './deployment.js';

const LOCAL_DEV_ORIGINS = [
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

const normalizeOrigin = (raw: string): string => raw.replace(/\/$/, '');

export const parseCorsOrigins = (raw: string | undefined): string[] =>
  (raw ?? '')
    .split(',')
    .map((part) => normalizeOrigin(part.trim()))
    .filter((origin) => origin.length > 0 && origin !== '*' && origin.toLowerCase() !== 'true');

export type CorsOriginOption = string[] | false;

/**
 * @returns liste d’origines, ou `false` (aucun reflet) si durci et non configuré.
 * Ne retourne jamais `true`.
 */
export const resolveCorsOrigin = (opts?: {
  raw?: string;
  hardened?: boolean;
}): CorsOriginOption => {
  const raw = opts && 'raw' in opts ? opts.raw : process.env.CORS_ORIGIN;
  const hardened = opts?.hardened ?? isHardenedRuntime();
  const origins = parseCorsOrigins(raw);
  if (origins.length > 0) return origins;
  if (hardened) return false;
  return LOCAL_DEV_ORIGINS;
};

/** Fail-fast au boot HTTP si staging/production sans CORS_ORIGIN. */
export const assertCorsOriginReady = (): void => {
  if (!isHardenedRuntime()) return;
  if (parseCorsOrigins(process.env.CORS_ORIGIN).length === 0) {
    throw new Error(
      'CORS_ORIGIN obligatoire en staging/production (liste d’origines séparées par des virgules, sans *). ' +
        'Refus de démarrer avec un CORS permissif.'
    );
  }
};
