import { apiClient, authorizedFetch } from '@/lib/apiClient';

export interface DashboardMetrics {
  totalInstitutions: number;
  totalUsers: number;
  students: number;
  teachers: number;
  totalSchoolAdmins: number;
  // RPT-003 : `null` quand l'établissement n'a aucun élève — jamais une
  // valeur inventée (0% ou un pourcentage par défaut seraient tout aussi
  // faux qu'une donnée fabriquée).
  attendanceRate: number | null;
  absences: number;
  recentActivities: any[];
  // RPT-003 : horodatage réel du calcul (celui du cache s'il est servi tel
  // quel, jamais l'heure de la requête) — absent si l'appel a échoué.
  generatedAt?: string;
}

export interface AcademicMetrics {
  averageGrade: number | null;
  assignmentCompletionRate: number | null;
  messagesExchanged: number;
  documentsShared: number;
  newUsersThisMonth: number;
  generatedAt: string;
}

export interface InstitutionRankingEntry {
  institutionId: string;
  name: string;
  type: string;
  totalUsers: number;
  attendanceRate: number | null;
}

export class StrkAnalyticsService {
  static async getDashboardMetrics(institutionId?: string): Promise<DashboardMetrics> {
    const { metrics, generatedAt } = await apiClient.get<{ metrics: DashboardMetrics; generatedAt: string }>(
      `/analytics/dashboard-metrics${institutionId ? `?institutionId=${encodeURIComponent(institutionId)}` : ''}`
    );
    return { ...metrics, generatedAt };
  }

  /** RPT-003 : métriques académiques réelles (moyenne, devoirs rendus,
   * messages/documents des 30 derniers jours, nouveaux comptes du mois) —
   * remplace les nombres fabriqués de `useAdvancedAnalytics.tsx`. */
  static async getAcademicMetrics(institutionId?: string, days = 30): Promise<AcademicMetrics> {
    const qs = new URLSearchParams();
    if (institutionId) qs.set('institutionId', institutionId);
    qs.set('days', String(days));
    const { metrics, generatedAt } = await apiClient.get<{
      metrics: Omit<AcademicMetrics, 'generatedAt'>;
      generatedAt: string;
    }>(`/analytics/academic-metrics?${qs.toString()}`);
    return { ...metrics, generatedAt };
  }

  /** RPT-003 : classement inter-établissements réel (assiduité, effectif) —
   * admin global uniquement, remplace le "Classement Performance" fabriqué. */
  static async getInstitutionRanking(): Promise<{ ranking: InstitutionRankingEntry[]; generatedAt: string }> {
    return apiClient.get<{ ranking: InstitutionRankingEntry[]; generatedAt: string }>('/analytics/institution-ranking');
  }

  static async recordMetric(
    metricName: string,
    value: number,
    institutionId?: string,
    userId?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      await apiClient.post('/analytics/metrics', { metricName, value, institutionId, userId, metadata });
    } catch (error) {
      console.error('Error recording metric:', error);
    }
  }

  static async getWeeklyStats(institutionId?: string): Promise<any[]> {
    try {
      const { stats } = await apiClient.get<{ stats: any[] }>(
        `/analytics/weekly-stats${institutionId ? `?institutionId=${encodeURIComponent(institutionId)}` : ''}`
      );
      return stats;
    } catch (error) {
      console.error('Error fetching weekly stats:', error);
      return ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'].map((day) => ({
        day, absences: 0, retards: 0, signatures: 0
      }));
    }
  }

  static async getMonthlyStats(institutionId?: string): Promise<any[]> {
    const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    try {
      const { stats } = await apiClient.get<{ stats: any[] }>(
        `/analytics/monthly-stats${institutionId ? `?institutionId=${encodeURIComponent(institutionId)}` : ''}`
      );
      return stats;
    } catch (error) {
      console.error('Error fetching monthly stats:', error);
      return months.map((name) => ({ name, inscriptions: 0, absences: 0, signatures: 0 }));
    }
  }

  /** §5.15 P2 — export analytics généré côté serveur (JSON/CSV). */
  static async downloadAnalyticsExport(
    institutionId: string | undefined,
    days: number,
    format: 'json' | 'csv' = 'json'
  ): Promise<void> {
    const params = new URLSearchParams({ format, days: String(days) });
    if (institutionId) params.set('institutionId', institutionId);
    const response = await authorizedFetch(`/analytics/export?${params.toString()}`);
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error || `Erreur ${response.status} lors de l'export analytics`);
    }
    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition') || '';
    const filenameMatch = /filename="?([^"]+)"?/.exec(disposition);
    const filename = filenameMatch?.[1] || `analytics-report.${format}`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
}

export const fetchDashboardMetrics = (institutionId?: string) =>
  StrkAnalyticsService.getDashboardMetrics(institutionId);

export const recordMetric = (
  metricName: string,
  value: number,
  institutionId?: string,
  userId?: string,
  metadata?: Record<string, any>
) => StrkAnalyticsService.recordMetric(metricName, value, institutionId, userId, metadata);
