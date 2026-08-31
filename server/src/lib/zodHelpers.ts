import { z } from 'zod';
import { normalizeEmail, normalizeOptionalEmail } from './emailNormalize.js';

/** `""` / `null` → `undefined` pour les champs optionnels (évite 400 Zod silencieux côté UI). */
export const emptyToUndefined = (value: unknown): unknown =>
  value === '' || value === null ? undefined : value;

export const optionalUuid = z.preprocess(emptyToUndefined, z.string().uuid().optional());

export const optionalEmail = z.preprocess((value) => {
  const emptied = emptyToUndefined(value);
  if (emptied === undefined) return undefined;
  if (typeof emptied !== 'string') return emptied;
  return normalizeOptionalEmail(emptied);
}, z.string().email().optional());

export const optionalString = z.preprocess(emptyToUndefined, z.string().optional());

/** E-mail obligatoire, normalisé (trim + minuscules) — unicité globale StrkProfile. */
export const requiredEmail = z
  .string()
  .trim()
  .email()
  .transform((v) => normalizeEmail(v));

export { normalizeEmail, normalizeOptionalEmail };
