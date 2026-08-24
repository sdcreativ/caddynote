import { v4 as uuidv4 } from 'uuid';

/**
 * Identifiant client pour l’idempotence (ex. appel hors ligne).
 * `crypto.randomUUID()` n’est pas disponible hors contexte sécurisé (HTTP
 * hors localhost) — repli sur `uuid` pour le staging en IP claire.
 */
export const newClientId = (): string => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }
  return uuidv4();
};
