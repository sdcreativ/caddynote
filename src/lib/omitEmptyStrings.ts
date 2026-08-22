/**
 * Omet les chaînes vides avant envoi API — Zod refuse souvent `""` sur
 * `.email().optional()` / `.uuid().optional()` (400 « Données invalides »).
 */
export function omitEmptyStrings<T extends Record<string, unknown>>(payload: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === '' || value === undefined) continue;
    out[key] = value;
  }
  return out as Partial<T>;
}
