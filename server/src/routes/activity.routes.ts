import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { isGlobalAdmin, isSameInstitution, INSTITUTION_STAFF_ROLES } from '../lib/authz.js';

export const activityRouter = Router();
activityRouter.use(requireAuth);

const activitySchema = z.object({
  type: z.string(),
  institutionId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  targetId: z.string().optional(),
  targetType: z.string().optional(),
  description: z.string().min(1),
  metadata: z.record(z.unknown()).default({}),
});

activityRouter.post('/', async (req, res) => {
  const parsed = activitySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  // ORG-004 : sans ce contrôle, n'importe quel compte pouvait injecter une
  // entrée dans le journal d'activité d'un autre établissement (usurpation
  // de piste d'audit).
  if (parsed.data.institutionId && !isSameInstitution(req.auth!, parsed.data.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  // Télémétrie produit : forcer userId = acteur authentifié.
  const data = {
    ...parsed.data,
    userId: parsed.data.type.startsWith('product.') ? req.auth!.sub : parsed.data.userId ?? req.auth!.sub,
    institutionId: parsed.data.institutionId ?? req.auth!.institutionId ?? undefined,
  };
  const activity = await prisma.strkActivity.create({ data: data as any });
  res.status(201).json({ activity });
});

// `StrkActivity.userId` n'a pas de relation Prisma déclarée vers
// `StrkProfile` (comme StrkGrade/StrkAbsence.courseId ailleurs) — jointure
// manuelle pour afficher le nom de l'auteur plutôt qu'un id brut.
// RPT-003 : ajouté en corrigeant `SuperAdminOverview.tsx`, qui affichait déjà
// une carte "Activité récente" référençant des champs Supabase disparus
// depuis la migration vers Express/Prisma (`activity_type`, `strk_profiles`,
// `created_at`) — chaque entrée s'affichait donc vide/« Invalid Date »
// plutôt que le contenu réel de l'activité.
const withActorNames = async <T extends { userId: string | null }>(activities: T[]) => {
  const userIds = [...new Set(activities.map((a) => a.userId).filter((id): id is string => !!id))];
  const profiles =
    userIds.length > 0
      ? await prisma.strkProfile.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  return activities.map((a) => ({ ...a, actor: a.userId ? profileById.get(a.userId) ?? null : null }));
};

activityRouter.get('/', async (req, res) => {
  const institutionId = typeof req.query.institutionId === 'string' ? req.query.institutionId : undefined;
  const limit = Math.min(Number(req.query.limit) || 50, 200);

  if (institutionId) {
    if (!isSameInstitution(req.auth!, institutionId)) {
      return res.status(403).json({ error: 'Permissions insuffisantes' });
    }
    const staff = INSTITUTION_STAFF_ROLES.includes(
      req.auth!.role as (typeof INSTITUTION_STAFF_ROLES)[number]
    );
    if (!staff) {
      return res.status(403).json({ error: 'Permissions insuffisantes' });
    }
  } else if (!isGlobalAdmin(req.auth!)) {
    // Sans filtre d'établissement, seule la supervision globale (admin) est autorisée.
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const activities = await prisma.strkActivity.findMany({
    where: institutionId ? { institutionId } : {},
    include: { institution: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  res.json({ activities: await withActorNames(activities) });
});

activityRouter.get('/by-user/:userId', async (req, res) => {
  const isSelf = req.auth!.sub === req.params.userId;
  if (!isSelf) {
    // ORG-004 : un school_admin ne consulte le journal d'un tiers que si ce
    // dernier appartient à son propre établissement (l'admin global voit tout).
    if (req.auth!.role === 'school_admin') {
      const target = await prisma.strkProfile.findUnique({
        where: { id: req.params.userId },
        select: { institutionId: true },
      });
      if (!target || !isSameInstitution(req.auth!, target.institutionId)) {
        return res.status(403).json({ error: 'Permissions insuffisantes' });
      }
    } else if (!isGlobalAdmin(req.auth!)) {
      return res.status(403).json({ error: 'Permissions insuffisantes' });
    }
  }
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const activities = await prisma.strkActivity.findMany({
    where: { userId: req.params.userId },
    include: { institution: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  res.json({ activities });
});
