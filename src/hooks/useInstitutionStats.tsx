import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';

export interface InstitutionStats {
  totalInstitutions: number;
  institutionTypes: Record<string, number>;
  recentInstitutions: any[];
  topInstitutionsByUsers: any[];
}

export const useInstitutionStats = () => {
  const [stats, setStats] = useState<InstitutionStats>({
    totalInstitutions: 0,
    institutionTypes: {},
    recentInstitutions: [],
    topInstitutionsByUsers: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      setLoading(true);

      const { institutions } = await apiClient.get<{ institutions: any[] }>('/institutions');
      const sorted = [...institutions].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      const institutionTypes = institutions.reduce((acc, inst) => {
        acc[inst.type] = (acc[inst.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const institutionsWithUserCounts = await Promise.all(
        institutions.map(async (inst) => {
          try {
            const { users } = await apiClient.get<{ users: any[] }>(
              `/users?institutionId=${encodeURIComponent(inst.id)}`
            );
            return { ...inst, userCount: users.length };
          } catch {
            return { ...inst, userCount: 0 };
          }
        })
      );

      const topInstitutionsByUsers = institutionsWithUserCounts
        .sort((a, b) => b.userCount - a.userCount)
        .slice(0, 10);

      setStats({
        totalInstitutions: institutions.length,
        institutionTypes,
        recentInstitutions: sorted.slice(0, 5),
        topInstitutionsByUsers
      });

    } catch (err) {
      console.error('Error fetching institution stats:', err);
      setError('Failed to fetch institution statistics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return { stats, loading, error, refetch: fetchStats };
};
