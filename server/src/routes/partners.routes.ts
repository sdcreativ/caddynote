import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { parseStoredPartners, sanitizePartnerNames } from '../lib/publicPartners.js';

const CATEGORY = 'platform';
const KEY = 'partners';

const partnersSchema = z.object({
  names: z.array(z.string()),
});

/** Route publique (pas d'auth) : liste des établissements consentants, ou vide. */
export const partnersPublicRouter = Router();

partnersPublicRouter.get('/partners', async (_req, res) => {
  const row = await prisma.strkSetting.findUnique({
    where: { category_key: { category: CATEGORY, key: KEY } },
    select: { value: true, isPublic: true },
  });

  if (!row || !row.isPublic) {
    return res.json({ names: [] });
  }

  return res.json({ names: parseStoredPartners(row.value) });
});

/** Lecture / écriture réservées à l’équipe CaddyNote.
 * Auth uniquement sur ces routes — pas de `router.use(requireRole('admin'))` :
 * le routeur est monté sur `/admin` et laisserait sinon 403
 * `POST /admin/impersonate/exit` (JWT de la cible, pas admin). */
export const partnersAdminRouter = Router();

partnersAdminRouter.get('/partners', requireAuth, requireRole('admin'), async (_req, res) => {
  const row = await prisma.strkSetting.findUnique({
    where: { category_key: { category: CATEGORY, key: KEY } },
    select: { value: true },
  });
  return res.json({ names: parseStoredPartners(row?.value) });
});

partnersAdminRouter.put('/partners', requireAuth, requireRole('admin'), async (req, res) => {
  const parsed = partnersSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }

  const sanitized = sanitizePartnerNames(parsed.data.names);
  if (!sanitized.ok) {
    return res.status(400).json({ error: sanitized.error });
  }

  await prisma.strkSetting.upsert({
    where: { category_key: { category: CATEGORY, key: KEY } },
    create: {
      category: CATEGORY,
      key: KEY,
      value: { names: sanitized.names },
      description: 'Établissements affichés sur la vitrine (consentement manuel)',
      isPublic: true,
    },
    update: {
      value: { names: sanitized.names },
      isPublic: true,
    },
  });

  return res.json({ names: sanitized.names });
});
