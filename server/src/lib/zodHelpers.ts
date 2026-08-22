import { z } from 'zod';

/** `""` / `null` → `undefined` pour les champs optionnels (évite 400 Zod silencieux côté UI). */
export const emptyToUndefined = (value: unknown): unknown =>
  value === '' || value === null ? undefined : value;

export const optionalUuid = z.preprocess(emptyToUndefined, z.string().uuid().optional());
export const optionalEmail = z.preprocess(emptyToUndefined, z.string().email().optional());
export const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
