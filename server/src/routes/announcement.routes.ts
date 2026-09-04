import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { isInternalCtaPath, sanitizeCtaUrl } from '../lib/internalCtaPath.js';

const CATEGORY = 'platform';
const KEY = 'announcement';

export interface AnnouncementPayload {
  text: string;
  shortText: string;
  ctaLabel: string;
  ctaUrl: string;
  showYear: boolean;
  enabled: boolean;
}

const DEFAULTS: AnnouncementPayload = {
  text: '',
  shortText: '',
  ctaLabel: '',
  ctaUrl: '',
  showYear: true,
  enabled: false,
};

const announcementSchema = z.object({
  text: z.string().max(300),
  shortText: z.string().max(200),
  ctaLabel: z.string().max(120),
  ctaUrl: z
    .string()
    .max(500)
    .refine((value) => isInternalCtaPath(value), { message: 'Chemin interne requis (ex. /contact)' }),
  showYear: z.boolean(),
  enabled: z.boolean(),
});

/** Route publique (pas d'auth) : lecture seule de l'annonce si activée. */
export const announcementPublicRouter = Router();

announcementPublicRouter.get('/announcement', async (_req, res) => {
  const row = await prisma.strkSetting.findUnique({
    where: { category_key: { category: CATEGORY, key: KEY } },
    select: { value: true, isPublic: true },
  });

  if (!row || !row.isPublic) {
    return res.json({ announcement: null });
  }

  const data = row.value as unknown as AnnouncementPayload;
  if (!data.enabled) {
    return res.json({ announcement: null });
  }

  return res.json({
    announcement: {
      ...data,
      ctaUrl: sanitizeCtaUrl(data.ctaUrl),
    },
  });
});

/** Route admin : lecture / écriture de l’annonce.
 * Auth uniquement sur ces routes — pas de `router.use(requireRole('admin'))` :
 * le routeur est monté sur `/admin` et laisserait sinon 403
 * `POST /admin/impersonate/exit` (JWT de la cible, pas admin). */
export const announcementAdminRouter = Router();

announcementAdminRouter.get('/announcement', requireAuth, requireRole('admin'), async (_req, res) => {
  const row = await prisma.strkSetting.findUnique({
    where: { category_key: { category: CATEGORY, key: KEY } },
    select: { value: true },
  });
  return res.json({ announcement: (row?.value as unknown as AnnouncementPayload) ?? DEFAULTS });
});

announcementAdminRouter.put('/announcement', requireAuth, requireRole('admin'), async (req, res) => {
  const parsed = announcementSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }

  await prisma.strkSetting.upsert({
    where: { category_key: { category: CATEGORY, key: KEY } },
    create: {
      category: CATEGORY,
      key: KEY,
      value: parsed.data as object,
      description: "Bandeau d'annonce public (site vitrine)",
      isPublic: true,
    },
    update: {
      value: parsed.data as object,
      isPublic: true,
    },
  });

  return res.json({ announcement: parsed.data });
});
