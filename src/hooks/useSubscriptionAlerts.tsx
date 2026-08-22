import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';

export type SubscriptionAlertItem = {
  id: string;
  userId: string;
  expiresAt?: string | null;
  trialEndsAt?: string | null;
  profile?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null;
};

export interface SubscriptionAlert {
  id: string;
  type: 'expiring_subscriptions' | 'ending_trials';
  title: string;
  count: number;
  message: string;
  actionLabel: string;
  /** Section Super Admin (state), pas une URL cassée. */
  actionSection: string;
  priority: 'high' | 'medium' | 'low';
  items: SubscriptionAlertItem[];
}

export const useSubscriptionAlerts = () => {
  const [alerts, setAlerts] = useState<SubscriptionAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSubscriptionAlerts = async () => {
    try {
      setLoading(true);

      const { expiringSubscriptions, endingTrials } = await apiClient.get<{
        expiringSubscriptions: SubscriptionAlertItem[];
        endingTrials: SubscriptionAlertItem[];
      }>('/subscriptions/alerts');

      const newAlerts: SubscriptionAlert[] = [];

      if (expiringSubscriptions.length > 0) {
        newAlerts.push({
          id: 'expiring-subscriptions',
          type: 'expiring_subscriptions',
          title: 'Alertes Abonnements',
          count: expiringSubscriptions.length,
          message: `${expiringSubscriptions.length} abonnement${expiringSubscriptions.length > 1 ? 's' : ''} expirent dans les 7 prochains jours`,
          actionLabel: 'Voir détails',
          actionSection: 'subscriptions',
          priority: 'high',
          items: expiringSubscriptions,
        });
      }

      if (endingTrials.length > 0) {
        newAlerts.push({
          id: 'ending-trials',
          type: 'ending_trials',
          title: 'Essais bientôt terminés',
          count: endingTrials.length,
          message: `${endingTrials.length} essai${endingTrials.length > 1 ? 's' : ''} gratuit${endingTrials.length > 1 ? 's' : ''} se terminent bientôt`,
          actionLabel: 'Voir abonnements',
          actionSection: 'subscriptions',
          priority: 'medium',
          items: endingTrials,
        });
      }

      setAlerts(newAlerts);
    } catch (error) {
      console.error('Error fetching subscription alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSubscriptionAlerts();
    const interval = setInterval(fetchSubscriptionAlerts, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return { alerts, loading, refetch: fetchSubscriptionAlerts };
};
