import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  DEFAULT_PUBLIC_EMAIL,
  parseStoredContact,
  parseStoredFaq,
  parseStoredStats,
  parseStoredTestimonials,
  sanitizeContact,
  sanitizeFaq,
  sanitizeStats,
  sanitizeTestimonials,
  type PublicContact,
  type PublicFaqItem,
  type PublicStats,
  type PublicTestimonial,
} from '../lib/publicVitrine.js';

const CATEGORY = 'platform';
const KEYS = {
  testimonials: 'testimonials',
  contact: 'publicContact',
  stats: 'publicStats',
  faq: 'faq',
} as const;

const readSetting = async (key: string) =>
  prisma.strkSetting.findUnique({
    where: { category_key: { category: CATEGORY, key } },
    select: { value: true, isPublic: true },
  });

const upsertSetting = async (key: string, value: object, description: string) => {
  await prisma.strkSetting.upsert({
    where: { category_key: { category: CATEGORY, key } },
    create: { category: CATEGORY, key, value, description, isPublic: true },
    update: { value, isPublic: true },
  });
};

const publicContactFromRow = (row: { value: unknown; isPublic: boolean } | null): PublicContact => {
  if (!row || !row.isPublic) {
    return { email: DEFAULT_PUBLIC_EMAIL, phone: '', whatsapp: '' };
  }
  return parseStoredContact(row.value, true);
};

const publicList = <T>(row: { value: unknown; isPublic: boolean } | null, parse: (value: unknown) => T[]): T[] => {
  if (!row || !row.isPublic) return [];
  return parse(row.value);
};

const publicStatsFromRow = (row: { value: unknown; isPublic: boolean } | null): PublicStats => {
  if (!row || !row.isPublic) return { schools: null, students: null };
  return parseStoredStats(row.value);
};

export const vitrinePublicRouter = Router();

vitrinePublicRouter.get('/vitrine', async (_req, res) => {
  const [testimonials, contact, stats, faq] = await Promise.all([
    readSetting(KEYS.testimonials),
    readSetting(KEYS.contact),
    readSetting(KEYS.stats),
    readSetting(KEYS.faq),
  ]);

  return res.json({
    testimonials: publicList(testimonials, parseStoredTestimonials),
    contact: publicContactFromRow(contact),
    stats: publicStatsFromRow(stats),
    faq: publicList(faq, parseStoredFaq),
  });
});

/** Auth uniquement sur ces routes — pas de `router.use(requireRole('admin'))`. */
export const vitrineAdminRouter = Router();

const loadAdminPayload = async () => {
  const [testimonials, contact, stats, faq] = await Promise.all([
    readSetting(KEYS.testimonials),
    readSetting(KEYS.contact),
    readSetting(KEYS.stats),
    readSetting(KEYS.faq),
  ]);
  return {
    testimonials: parseStoredTestimonials(testimonials?.value),
    contact: contact ? parseStoredContact(contact.value) : { email: DEFAULT_PUBLIC_EMAIL, phone: '', whatsapp: '' },
    stats: parseStoredStats(stats?.value),
    faq: parseStoredFaq(faq?.value),
  };
};

vitrineAdminRouter.get('/vitrine', requireAuth, requireRole('admin'), async (_req, res) => {
  return res.json(await loadAdminPayload());
});

const testimonialsSchema = z.object({ items: z.array(z.unknown()) });
const contactSchema = z.object({
  email: z.string(),
  phone: z.string(),
  whatsapp: z.string(),
});
const statsSchema = z.object({
  schools: z.union([z.number(), z.null()]),
  students: z.union([z.number(), z.null()]),
});
const faqSchema = z.object({ items: z.array(z.unknown()) });

vitrineAdminRouter.put('/vitrine/testimonials', requireAuth, requireRole('admin'), async (req, res) => {
  const parsed = testimonialsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const sanitized = sanitizeTestimonials(parsed.data.items);
  if (!sanitized.ok) return res.status(400).json({ error: sanitized.error });
  await upsertSetting(KEYS.testimonials, { items: sanitized.value }, 'Témoignages vitrine (consentement manuel)');
  return res.json({ items: sanitized.value as PublicTestimonial[] });
});

vitrineAdminRouter.put('/vitrine/contact', requireAuth, requireRole('admin'), async (req, res) => {
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const sanitized = sanitizeContact(parsed.data);
  if (!sanitized.ok) return res.status(400).json({ error: sanitized.error });
  await upsertSetting(KEYS.contact, sanitized.value, 'Coordonnées publiques (e-mail, téléphone, WhatsApp)');
  return res.json(sanitized.value);
});

vitrineAdminRouter.put('/vitrine/stats', requireAuth, requireRole('admin'), async (req, res) => {
  const parsed = statsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const sanitized = sanitizeStats(parsed.data);
  if (!sanitized.ok) return res.status(400).json({ error: sanitized.error });
  await upsertSetting(KEYS.stats, sanitized.value, 'Chiffres publics vitrine (saisie manuelle, pas de compteur auto)');
  return res.json(sanitized.value as PublicStats);
});

vitrineAdminRouter.put('/vitrine/faq', requireAuth, requireRole('admin'), async (req, res) => {
  const parsed = faqSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const sanitized = sanitizeFaq(parsed.data.items);
  if (!sanitized.ok) return res.status(400).json({ error: sanitized.error });
  await upsertSetting(KEYS.faq, { items: sanitized.value }, 'FAQ publique (page Aide)');
  return res.json({ items: sanitized.value as PublicFaqItem[] });
});
