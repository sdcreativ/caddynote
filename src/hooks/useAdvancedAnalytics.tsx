import { useState, useEffect } from 'react';
import { useStrkAuth } from './useStrkAuth';
import { useSystemMetrics } from './useSystemMetrics';
import { StrkAnalyticsService, type InstitutionRankingEntry } from '@/services/strkAnalyticsService';
import { useToast } from './use-toast';

/**
 * RPT-003 — découvert en travaillant sur la fraîcheur des données affichées :
 * ce hook alimentait le "Centre d'Analytics" (`/super-admin`, section
 * Analytics — `AnalyticsCenter.tsx` + `AdvancedAnalyticsDashboard.tsx`) avec
 * des nombres **entièrement fabriqués** ("1250 utilisateurs", "145ms de
 * temps de réponse", "99.9% d'uptime", classement d'établissements inventé,
 * répartition par appareil/navigateur inventée...) enveloppés dans une
 * vraie infrastructure de cache/mesure (`CacheService`, `PerformanceService`)
 * qui les faisait ressembler à de vraies métriques surveillées. Rien
 * n'indiquait à l'écran qu'il s'agissait de données de démonstration.
 *
 * Réécrit pour renvoyer uniquement des données réelles :
 * - `AdvancedMetrics` compose `useSystemMetrics` (utilisateurs/rôles réels,
 *   déjà corrigé RPT-001/003) avec `/analytics/dashboard-metrics` (assiduité,
 *   fraîcheur) et `/analytics/academic-metrics` (moyenne, devoirs rendus,
 *   messages/documents des 30 derniers jours — nouveau, 16/08/2026).
 * - `institutionRanking` (admin uniquement) vient de
 *   `/analytics/institution-ranking`, réellement calculé.
 * - Ce qui n'a **aucune source de donnée réelle dans ce produit** —
 *   comportement utilisateur (heures d'activité, appareils, navigateurs,
 *   parcours), supervision infrastructure (uptime, temps de réponse, taux
 *   d'erreur), scores de satisfaction, répartition géographique — n'est plus
 *   généré du tout. Les construire réellement demande des briques qui
 *   n'existent pas ici (télémétrie client, APM, enquêtes de satisfaction,
 *   géolocalisation) : un chantier à part entière, pas une case à cocher
 *   RPT-003. Les composants consommateurs affichent désormais une mention
 *   explicite plutôt que ces sections, voir `AnalyticsCenter.tsx` et
 *   `AdvancedAnalyticsDashboard.tsx`.
 */
export interface WeeklyTrend {
  day: string;
  absences: number;
  retards: number;
  signatures: number;
}

export interface MonthlyTrend {
  name: string;
  inscriptions: number;
  absences: number;
  signatures: number;
}

export interface AdvancedMetrics {
  totalUsers: number;
  activeUsers: number;
  newUsersThisMonth: number;
  attendanceRate: number | null;
  averageGrade: number | null;
  assignmentCompletionRate: number | null;
  messagesExchanged: number;
  documentsShared: number;
  weeklyTrends: WeeklyTrend[];
  monthlyTrends: MonthlyTrend[];
  /** RPT-003 : horodatage réel du calcul `/analytics/dashboard-metrics` (mis
   * en cache jusqu'à 1h côté serveur) — le reste de cet objet est recalculé
   * à chaque appel, mais c'est le seul champ pour lequel "à jour depuis
   * quand" est une vraie question. */
  generatedAt: string;
}

export const useAdvancedAnalytics = (period: '7d' | '30d' | '90d' | '1y' = '30d') => {
  const { user } = useStrkAuth();
  const institutionId = user?.role === 'admin' ? undefined : user?.institutionId;
  const { metrics: systemMetrics, loading: systemLoading } = useSystemMetrics(institutionId);

  const periodDays = period === '7d' ? 7 : period === '90d' ? 90 : period === '1y' ? 365 : 30;
  const monthSlice = period === '7d' || period === '30d' ? 1 : period === '90d' ? 3 : 12;

  const [metrics, setMetrics] = useState<AdvancedMetrics | null>(null);
  const [institutionRanking, setInstitutionRanking] = useState<InstitutionRankingEntry[] | null>(null);
  const [rankingGeneratedAt, setRankingGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const loadMetrics = async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);

      const [dashboard, academic, weeklyTrends, monthlyTrends] = await Promise.all([
        StrkAnalyticsService.getDashboardMetrics(institutionId),
        StrkAnalyticsService.getAcademicMetrics(institutionId, periodDays),
        StrkAnalyticsService.getWeeklyStats(institutionId),
        StrkAnalyticsService.getMonthlyStats(institutionId),
      ]);

      const nowMonth = new Date().getMonth();
      const slicedMonthly =
        monthSlice >= 12
          ? monthlyTrends
          : monthlyTrends.slice(Math.max(0, nowMonth - monthSlice + 1), nowMonth + 1);

      setMetrics({
        totalUsers: systemMetrics.totalUsers,
        activeUsers: systemMetrics.activeUsers,
        newUsersThisMonth: academic.newUsersThisMonth,
        attendanceRate: dashboard.attendanceRate,
        averageGrade: academic.averageGrade,
        assignmentCompletionRate: academic.assignmentCompletionRate,
        messagesExchanged: academic.messagesExchanged,
        documentsShared: academic.documentsShared,
        weeklyTrends,
        monthlyTrends: slicedMonthly,
        generatedAt: dashboard.generatedAt ?? new Date().toISOString(),
      });

      if (user.role === 'admin') {
        const { ranking, generatedAt } = await StrkAnalyticsService.getInstitutionRanking();
        setInstitutionRanking(ranking);
        setRankingGeneratedAt(generatedAt);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Erreur lors du chargement des métriques d'analytics";
      setError(errorMessage);
      toast({ title: 'Erreur', description: errorMessage, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const generatePredictiveInsights = (): string[] => {
    if (!metrics) return [];
    const insights: string[] = [];

    const last = metrics.weeklyTrends[metrics.weeklyTrends.length - 1];
    const previous = metrics.weeklyTrends[metrics.weeklyTrends.length - 2];
    if (last && previous && previous.absences > 0 && last.absences > previous.absences * 1.2) {
      insights.push('📈 Absences en hausse sensible sur le dernier jour ouvré suivi');
    }

    if (metrics.attendanceRate !== null && metrics.attendanceRate < 90) {
      insights.push(`📊 Assiduité à ${metrics.attendanceRate}% : sous le seuil de 90%`);
    }

    if (metrics.assignmentCompletionRate !== null && metrics.assignmentCompletionRate < 0.7) {
      insights.push(`📉 ${Math.round(metrics.assignmentCompletionRate * 100)}% des devoirs rendus : en dessous de 70%`);
    }

    return insights;
  };

  const exportAnalyticsReport = async (format: 'json' | 'csv' = 'json') => {
    try {
      await StrkAnalyticsService.downloadAnalyticsExport(institutionId, periodDays, format);
      toast({ title: 'Rapport exporté', description: "Le rapport d'analytics a été téléchargé depuis le serveur" });
    } catch (err) {
      toast({
        title: "Erreur d'export",
        description: err instanceof Error ? err.message : "Impossible d'exporter le rapport",
        variant: 'destructive',
      });
    }
  };

  const refreshData = async () => {
    await loadMetrics();
  };

  useEffect(() => {
    if (user) {
      loadMetrics();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, institutionId, systemLoading, period]);

  return {
    metrics,
    institutionRanking,
    rankingGeneratedAt,
    loading: loading || systemLoading,
    error,
    insights: generatePredictiveInsights(),
    periodDays,
    refreshData,
    // Conservé pour compatibilité d'appel (le bouton "Vider cache" des
    // composants consommateurs) : il n'y a plus de cache client à vider
    // depuis que les données sont réelles — un rechargement suffit.
    invalidateCache: refreshData,
    exportAnalyticsReport,
  };
};

export default useAdvancedAnalytics;
