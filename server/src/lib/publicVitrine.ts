/** Contenu éditable de la vitrine (témoignages, coordonnées, chiffres, FAQ). */

export const DEFAULT_PUBLIC_EMAIL = 'contact@caddynote.com';

export const MAX_TESTIMONIALS = 8;
export const MAX_FAQ_ITEMS = 20;

const FORBIDDEN_SCHEME_RE = /https?:|javascript:|data:/i;
const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/;
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const PHONE_RE = /^\+?[0-9][0-9\s().-]{6,22}$/;

export type PublicTestimonial = {
  quote: string;
  name: string;
  role: string;
  place: string;
};

export type PublicContact = {
  email: string;
  phone: string;
  whatsapp: string;
};

export type PublicStats = {
  schools: number | null;
  students: number | null;
};

export type PublicFaqItem = {
  q: string;
  a: string;
};

export type SanitizeResult<T> = { ok: true; value: T } | { ok: false; error: string };

export const isSafePublicText = (raw: unknown, min: number, max: number): raw is string => {
  if (typeof raw !== 'string') return false;
  const text = raw.trim();
  if (text.length < min || text.length > max) return false;
  if (text.includes('//') || text.includes('<') || text.includes('>')) return false;
  if (FORBIDDEN_SCHEME_RE.test(text)) return false;
  if (CONTROL_CHARS_RE.test(text)) return false;
  return true;
};

const trim = (raw: unknown): string => (typeof raw === 'string' ? raw.trim() : '');

export const sanitizeTestimonials = (input: unknown): SanitizeResult<PublicTestimonial[]> => {
  if (!Array.isArray(input)) return { ok: false, error: 'Liste invalide' };
  if (input.length > MAX_TESTIMONIALS) {
    return { ok: false, error: `Maximum ${MAX_TESTIMONIALS} témoignages` };
  }
  const items: PublicTestimonial[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'Témoignage invalide' };
    const row = raw as Record<string, unknown>;
    const quote = trim(row.quote);
    const name = trim(row.name);
    const role = trim(row.role);
    const place = trim(row.place);
    if (!isSafePublicText(quote, 10, 400) || !isSafePublicText(name, 1, 80)) {
      return { ok: false, error: 'Témoignage invalide' };
    }
    if (!isSafePublicText(role, 1, 80) || !isSafePublicText(place, 1, 80)) {
      return { ok: false, error: 'Témoignage invalide' };
    }
    const key = `${name.toLocaleLowerCase('fr')}::${quote.toLocaleLowerCase('fr')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ quote, name, role, place });
  }
  return { ok: true, value: items };
};

export const filterTestimonials = (input: unknown): PublicTestimonial[] => {
  if (!Array.isArray(input)) return [];
  const result: PublicTestimonial[] = [];
  for (const raw of input) {
    const parsed = sanitizeTestimonials([raw]);
    if (!parsed.ok || parsed.value.length === 0) continue;
    result.push(parsed.value[0]);
    if (result.length >= MAX_TESTIMONIALS) break;
  }
  return result;
};

export const parseStoredTestimonials = (value: unknown): PublicTestimonial[] => {
  if (!value || typeof value !== 'object') return [];
  return filterTestimonials((value as { items?: unknown }).items);
};

const sanitizeOptionalPhone = (raw: unknown): SanitizeResult<string> => {
  const value = trim(raw);
  if (!value) return { ok: true, value: '' };
  if (!PHONE_RE.test(value) || value.includes('<') || FORBIDDEN_SCHEME_RE.test(value)) {
    return { ok: false, error: 'Téléphone invalide' };
  }
  return { ok: true, value };
};

export const sanitizeContact = (input: unknown): SanitizeResult<PublicContact> => {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Coordonnées invalides' };
  const row = input as Record<string, unknown>;
  const email = trim(row.email);
  if (email && (!EMAIL_RE.test(email) || email.length > 120 || FORBIDDEN_SCHEME_RE.test(email))) {
    return { ok: false, error: 'E-mail invalide' };
  }
  const phone = sanitizeOptionalPhone(row.phone);
  if (!phone.ok) return phone;
  const whatsapp = sanitizeOptionalPhone(row.whatsapp);
  if (!whatsapp.ok) return { ok: false, error: 'WhatsApp invalide' };
  return { ok: true, value: { email, phone: phone.value, whatsapp: whatsapp.value } };
};

export const parseStoredContact = (value: unknown, fallbackEmail = false): PublicContact => {
  const parsed = sanitizeContact(value);
  if (parsed.ok) return parsed.value;
  return {
    email: fallbackEmail ? DEFAULT_PUBLIC_EMAIL : '',
    phone: '',
    whatsapp: '',
  };
};

const parseOptionalCount = (raw: unknown): number | null => {
  if (raw == null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 10_000_000) return null;
  return n;
};

export const sanitizeStats = (input: unknown): SanitizeResult<PublicStats> => {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Chiffres invalides' };
  const row = input as Record<string, unknown>;
  const schools = row.schools == null || row.schools === '' ? null : Number(row.schools);
  const students = row.students == null || row.students === '' ? null : Number(row.students);
  if (schools != null && (!Number.isInteger(schools) || schools < 1 || schools > 10_000_000)) {
    return { ok: false, error: 'Chiffre établissements invalide' };
  }
  if (students != null && (!Number.isInteger(students) || students < 1 || students > 10_000_000)) {
    return { ok: false, error: 'Chiffre élèves invalide' };
  }
  return { ok: true, value: { schools, students } };
};

export const parseStoredStats = (value: unknown): PublicStats => {
  if (!value || typeof value !== 'object') return { schools: null, students: null };
  return {
    schools: parseOptionalCount((value as { schools?: unknown }).schools),
    students: parseOptionalCount((value as { students?: unknown }).students),
  };
};

export const sanitizeFaq = (input: unknown): SanitizeResult<PublicFaqItem[]> => {
  if (!Array.isArray(input)) return { ok: false, error: 'Liste invalide' };
  if (input.length > MAX_FAQ_ITEMS) {
    return { ok: false, error: `Maximum ${MAX_FAQ_ITEMS} questions` };
  }
  const items: PublicFaqItem[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'Question invalide' };
    const row = raw as Record<string, unknown>;
    const q = trim(row.q);
    const a = trim(row.a);
    if (!isSafePublicText(q, 5, 160) || !isSafePublicText(a, 10, 1200)) {
      return { ok: false, error: 'Question invalide' };
    }
    const key = q.toLocaleLowerCase('fr');
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ q, a });
  }
  return { ok: true, value: items };
};

export const filterFaq = (input: unknown): PublicFaqItem[] => {
  if (!Array.isArray(input)) return [];
  const result: PublicFaqItem[] = [];
  for (const raw of input) {
    const parsed = sanitizeFaq([raw]);
    if (!parsed.ok || parsed.value.length === 0) continue;
    result.push(parsed.value[0]);
    if (result.length >= MAX_FAQ_ITEMS) break;
  }
  return result;
};

export const parseStoredFaq = (value: unknown): PublicFaqItem[] => {
  if (!value || typeof value !== 'object') return [];
  return filterFaq((value as { items?: unknown }).items);
};
