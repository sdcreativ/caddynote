/** Noms d’établissements affichés sur la vitrine (« Ils nous font confiance »). */

export const MAX_PUBLIC_PARTNERS = 12;
export const MAX_PARTNER_NAME_LENGTH = 80;

const FORBIDDEN_SCHEME_RE = /https?:|javascript:|data:/i;
const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/;

export const isSafePartnerName = (raw: unknown): raw is string => {
  if (typeof raw !== 'string') return false;
  const name = raw.trim();
  if (name.length < 1 || name.length > MAX_PARTNER_NAME_LENGTH) return false;
  if (name.includes('//') || name.includes('<') || name.includes('>')) return false;
  if (FORBIDDEN_SCHEME_RE.test(name)) return false;
  if (CONTROL_CHARS_RE.test(name)) return false;
  return true;
};

export type SanitizePartnersResult =
  | { ok: true; names: string[] }
  | { ok: false; error: string };

/**
 * Valide une liste envoyée par l’admin : échoue dès qu’un élément est invalide.
 * Dédoublonne sans tenir compte de la casse (conserve la première forme).
 */
export const sanitizePartnerNames = (input: unknown): SanitizePartnersResult => {
  if (!Array.isArray(input)) return { ok: false, error: 'Liste invalide' };
  if (input.length > MAX_PUBLIC_PARTNERS) {
    return { ok: false, error: `Maximum ${MAX_PUBLIC_PARTNERS} noms` };
  }

  const names: string[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    if (typeof item !== 'string') return { ok: false, error: 'Nom invalide' };
    const name = item.trim();
    if (!isSafePartnerName(name)) return { ok: false, error: 'Nom invalide' };
    const key = name.toLocaleLowerCase('fr');
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return { ok: true, names };
};

/** Lecture défensive : ignore les entrées invalides, plafonne à 12. */
export const filterPartnerNames = (input: unknown): string[] => {
  if (!Array.isArray(input)) return [];
  const names: string[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    if (typeof item !== 'string') continue;
    const name = item.trim();
    if (!isSafePartnerName(name)) continue;
    const key = name.toLocaleLowerCase('fr');
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    if (names.length >= MAX_PUBLIC_PARTNERS) break;
  }
  return names;
};

export const parseStoredPartners = (value: unknown): string[] => {
  if (!value || typeof value !== 'object') return [];
  return filterPartnerNames((value as { names?: unknown }).names);
};
