import { prisma } from './prisma.js';

/** Invalide le résumé `dashboard_summary` mis en cache (1h). */
export const invalidateDashboardSummaryCache = async (
  institutionId: string | null = null
): Promise<void> => {
  await prisma.strkDashboardStat.deleteMany({
    where: {
      statType: 'dashboard_summary',
      period: 'daily',
      institutionId,
    },
  });
};
