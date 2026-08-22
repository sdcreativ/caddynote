import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';

export interface SystemMetrics {
  totalUsers: number;
  activeUsers: number;
  newUsersLast30Days: number;
  totalInstitutions: number;
  recentActivities: any[];
  usersByRole: Record<string, number>;
}

// RPT-001 : filtre par établissement — `institutionId` optionnel, propagé
// vers `/users` et `/activity` (qui l'acceptaient déjà côté serveur, ORG-004)
// mais qu'aucun appelant ne transmettait jusqu'ici.
export const useSystemMetrics = (institutionId?: string) => {
  const [metrics, setMetrics] = useState<SystemMetrics>({
    totalUsers: 0,
    activeUsers: 0,
    newUsersLast30Days: 0,
    totalInstitutions: 0,
    recentActivities: [],
    usersByRole: {},
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = async (opts?: { silent?: boolean }) => {
    try {
      // Ne pas remonter le skeleton toutes les N secondes : ça donnait
      // l'impression que « Activité récente » / toute la vue chargeait en boucle.
      if (!opts?.silent) setLoading(true);

      // Vue de supervision globale : réservée au rôle admin côté API. Sans
      // institutionId, `/users` et `/activity` renvoient la vue tous
      // établissements confondus ; avec, la vue est restreinte à celui-ci.
      const usersUrl = institutionId ? `/users?institutionId=${encodeURIComponent(institutionId)}` : '/users';
      const activityUrl = institutionId
        ? `/activity?limit=10&institutionId=${encodeURIComponent(institutionId)}`
        : '/activity?limit=10';
      const [{ users }, { institutions }, { activities }] = await Promise.all([
        apiClient.get<{ users: any[] }>(usersUrl),
        apiClient.get<{ institutions: any[] }>('/institutions'),
        apiClient.get<{ activities: any[] }>(activityUrl),
      ]);

      const usersByRole = users.reduce<Record<string, number>>((acc, profile) => {
        const role = String(profile.role || 'unknown');
        acc[role] = (acc[role] || 0) + 1;
        return acc;
      }, {});

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      // RPT-003 : bug réel trouvé au passage — "actifs" était basé sur
      // `updatedAt` (qui change à la moindre modification de profil, pas à
      // une connexion) et, si le résultat réel tombait à 0, remplacé
      // silencieusement par une estimation fabriquée (75% du total).
      // `lastLoginAt` est le champ réellement dédié à ça (ajouté à
      // `PUBLIC_PROFILE_SELECT` le 16/08/2026) ; 0 utilisateur actif reste 0,
      // jamais une valeur inventée pour éviter un chiffre qui semble vide.
      const activeUsers = users.filter((u) => u.lastLoginAt && new Date(u.lastLoginAt) >= thirtyDaysAgo).length;
      const newUsersLast30Days = users.filter((u) => new Date(u.createdAt) >= thirtyDaysAgo).length;

      setMetrics({
        totalUsers: users.length,
        activeUsers,
        newUsersLast30Days,
        totalInstitutions: institutions.length,
        recentActivities: activities,
        usersByRole,
      });
      setError(null);

    } catch (err) {
      console.error('Error fetching system metrics:', err);
      setError('Failed to fetch system metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchMetrics();

    const interval = setInterval(() => {
      void fetchMetrics({ silent: true });
    }, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [institutionId]);

  return { metrics, loading, error, refetch: () => fetchMetrics() };
};
