import { useState, useCallback } from 'react';
import { 
  StrkActivity,
  createStrkActivity,
  fetchStrkActivitiesByInstitution,
  fetchStrkActivitiesByUser
} from '@/services/strkActivityService';

export const useStrkActivities = () => {
  const [activities, setActivities] = useState<StrkActivity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadActivitiesByInstitution = useCallback(async (institutionId: string, limit: number = 10) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchStrkActivitiesByInstitution(institutionId, limit);
      setActivities(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement des activités');
      console.error('Error loading activities by institution:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadActivitiesByUser = useCallback(async (userId: string, limit: number = 10) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchStrkActivitiesByUser(userId, limit);
      setActivities(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement des activités utilisateur');
      console.error('Error loading activities by user:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createActivity = useCallback(async (activityData: {
    type: 'user_created' | 'institution_created' | 'login' | 'attendance_taken' | 'signature_requested' | 'report_generated';
    description: string;
    user_id: string;
    target_user_id?: string;
    institution_id: string;
    metadata?: Record<string, any>;
  }) => {
    try {
      const newActivity = await createStrkActivity({
        type: activityData.type,
        description: activityData.description,
        userId: activityData.user_id,
        institutionId: activityData.institution_id,
        metadata: activityData.metadata
      });
      if (newActivity) {
        setActivities(prev => [newActivity, ...prev.slice(0, 9)]); // Garder seulement les 10 plus récentes
        return newActivity;
      }
      return null;
    } catch (err) {
      console.error('Error creating activity:', err);
      return null;
    }
  }, []);

  return {
    activities,
    isLoading,
    error,
    loadActivitiesByInstitution,
    loadActivitiesByUser,
    createActivity
  };
};