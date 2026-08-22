
import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { subscriptionService } from '@/services/subscriptionService';
import { Subscription, SubscriptionPlan, SubscriptionLimits, SubscriptionNotification } from '@/types/subscription';
import { useToast } from '@/hooks/use-toast';

interface SubscriptionContextType {
  subscription: Subscription | null;
  plan: SubscriptionPlan | null;
  limits: SubscriptionLimits | null;
  notifications: SubscriptionNotification[];
  isLoading: boolean;
  isExpired: boolean;
  isExpiringSoon: boolean;
  daysUntilExpiration: number;
  refreshSubscription: () => Promise<void>;
  markNotificationAsRead: (notificationId: string) => Promise<void>;
  checkLimit: (limitType: string, currentValue: number) => boolean;
  hasFeature: (feature: string) => boolean;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const SubscriptionProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useStrkAuth();
  const { toast } = useToast();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [plan, setPlan] = useState<SubscriptionPlan | null>(null);
  const [notifications, setNotifications] = useState<SubscriptionNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshSubscription = async () => {
    if (!user) {
      setSubscription(null);
      setPlan(null);
      setNotifications([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      
      // Récupérer l'abonnement actuel
      const currentSubscription = await subscriptionService.getCurrentSubscription(user.id);
      setSubscription(currentSubscription);
      
      if (currentSubscription?.plan) {
        setPlan(currentSubscription.plan as SubscriptionPlan);
      }

      // Récupérer les notifications non lues
      const unreadNotifications = await subscriptionService.getUnreadNotifications(user.id);
      setNotifications(unreadNotifications);

      // Vérifier si l'abonnement expire bientôt et créer des notifications si nécessaire
      if (currentSubscription && !subscriptionService.isSubscriptionExpired(currentSubscription)) {
        const days = subscriptionService.getDaysUntilExpiration(currentSubscription);
        
        // Créer des notifications d'avertissement
        if (days <= 7 && days > 3) {
          await subscriptionService.createExpirationNotification(
            currentSubscription.id,
            user.id,
            'expiration_warning',
            days
          );
        } else if (days <= 3 && days > 1) {
          await subscriptionService.createExpirationNotification(
            currentSubscription.id,
            user.id,
            'expiration_warning',
            days
          );
        } else if (days <= 1) {
          await subscriptionService.createExpirationNotification(
            currentSubscription.id,
            user.id,
            'expiration_warning',
            days
          );
        }
      }

    } catch (error) {
      console.error('Error fetching subscription:', error);
      toast({
        title: "Erreur de chargement",
        description: "Impossible de charger les informations d'abonnement",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const markNotificationAsRead = async (notificationId: string) => {
    try {
      await subscriptionService.markNotificationAsRead(notificationId);
      setNotifications(prev => 
        prev.map(notif => 
          notif.id === notificationId 
            ? { ...notif, in_app_read: true }
            : notif
        )
      );
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const checkLimit = (limitType: string, currentValue: number): boolean => {
    if (!plan) return false;

    switch (limitType) {
      case 'students':
        return plan.max_students ? currentValue < plan.max_students : true;
      case 'institutions':
        return plan.max_institutions ? currentValue < plan.max_institutions : true;
      case 'reports':
        return plan.max_monthly_reports ? currentValue < plan.max_monthly_reports : true;
      default:
        return true;
    }
  };

  const hasFeature = (feature: string): boolean => {
    if (!plan) return false;
    return plan.features[feature as keyof typeof plan.features] === true;
  };

  // Calculer les limites
  const limits: SubscriptionLimits | null = plan ? {
    maxStudents: plan.max_students,
    maxInstitutions: plan.max_institutions,
    maxMonthlyReports: plan.max_monthly_reports,
    storageLimitGb: plan.storage_limit_gb,
    hasFeature
  } : null;

  const isExpired = subscription ? subscriptionService.isSubscriptionExpired(subscription) : false;
  const isExpiringSoon = subscription ? subscriptionService.isSubscriptionExpiringSoon(subscription) : false;
  const daysUntilExpiration = subscription ? subscriptionService.getDaysUntilExpiration(subscription) : 0;

  useEffect(() => {
    refreshSubscription();
  }, [user]);

  // Vérifier périodiquement l'expiration
  useEffect(() => {
    const interval = setInterval(() => {
      if (subscription && !isExpired) {
        const currentDays = subscriptionService.getDaysUntilExpiration(subscription);
        if (currentDays <= 0) {
          refreshSubscription();
        }
      }
    }, 60000); // Vérifier toutes les minutes

    return () => clearInterval(interval);
  }, [subscription, isExpired]);

  const contextValue = {
    subscription,
    plan,
    limits,
    notifications,
    isLoading,
    isExpired,
    isExpiringSoon,
    daysUntilExpiration,
    refreshSubscription,
    markNotificationAsRead,
    checkLimit,
    hasFeature
  };

  return (
    <SubscriptionContext.Provider value={contextValue}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};
