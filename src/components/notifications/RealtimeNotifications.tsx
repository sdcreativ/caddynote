import { useEffect, useRef } from 'react';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { useToast } from '@/hooks/use-toast';
import { StrkNotification } from '@/types/strk';
import { fetchUnreadNotifications } from '@/services/strkNotificationService';
import { useTranslation } from 'react-i18next';

interface RealtimeNotificationsProps {
  onNewNotification?: (notification: StrkNotification) => void;
}

const POLL_INTERVAL_MS = 20000;

/**
 * Remplace l'abonnement temps réel Supabase (`postgres_changes`), qui n'a pas
 * d'équivalent direct sans infrastructure WebSocket dédiée côté `server/`.
 * Solution de repli pragmatique : interrogation périodique des notifications
 * non lues, avec détection des nouvelles par comparaison d'identifiants déjà
 * vus. Un vrai canal temps réel (WebSocket/SSE) reste à envisager si la
 * fraîcheur à la seconde près devient nécessaire (cf. Lot 6 Communication).
 */
export const RealtimeNotifications = ({ onNewNotification }: RealtimeNotificationsProps) => {
  const { user } = useStrkAuth();
  const { toast } = useToast();
  const { t } = useTranslation('notifications');
  const seenIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    const handleNewNotification = (notification: StrkNotification) => {
      const variant = notification.type === 'error' ? 'destructive' : 'default';
      const actionUrl = notification.actionUrl?.trim() || null;

      toast({
        title: notification.title,
        description: notification.message,
        variant,
        action: actionUrl ? (
          <a href={actionUrl} className="text-sm font-medium hover:underline">
            {t('view')}
          </a>
        ) : undefined,
      });

      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(notification.title, {
          body: notification.message,
          icon: '/logo-cn-light.png',
          tag: notification.id,
        });
      }

      onNewNotification?.(notification);
    };

    const poll = async () => {
      try {
        const notifications = await fetchUnreadNotifications(user.id);
        if (cancelled) return;

        if (seenIds.current === null) {
          // Premier passage : mémoriser l'existant sans notifier (évite un
          // déluge de toasts au chargement de la page).
          seenIds.current = new Set(notifications.map((n) => n.id));
          return;
        }

        for (const notification of notifications) {
          if (!seenIds.current.has(notification.id)) {
            seenIds.current.add(notification.id);
            handleNewNotification(notification);
          }
        }
      } catch (error) {
        console.error('Error polling notifications:', error);
      }
    };

    void poll();
    const interval = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [onNewNotification, t, toast, user]);

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, []);

  return null;
};

export default RealtimeNotifications;
