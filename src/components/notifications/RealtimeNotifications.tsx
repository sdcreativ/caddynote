import { useEffect, useRef } from 'react';
import { apiClient } from '@/lib/apiClient';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { useToast } from '@/hooks/use-toast';
import { Bell, MessageSquare, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { StrkNotification } from '@/types/strk';
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

    const poll = async () => {
      try {
        const { notifications } = await apiClient.get<{ notifications: StrkNotification[] }>(
          `/notifications?userId=${encodeURIComponent(user.id)}&unread=true`
        );
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

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user]);

  const handleNewNotification = (notification: StrkNotification) => {
    const variant = getNotificationVariant(notification.type);

    toast({
      title: notification.title,
      description: notification.message,
      variant: variant as any,
      action: notification.action_url ? (
        <a
          href={notification.action_url}
          className="text-sm font-medium hover:underline"
        >
          {t('view')}
        </a>
      ) : undefined,
    });

    if (Notification.permission === 'granted') {
      new Notification(notification.title, {
        body: notification.message,
        icon: '/logo-cn-light.png',
        tag: notification.id,
      });
    }

    if (onNewNotification) {
      onNewNotification(notification);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'message': return MessageSquare;
      case 'warning': return AlertTriangle;
      case 'success': return CheckCircle;
      case 'info': return Info;
      default: return Bell;
    }
  };

  const getNotificationVariant = (type: string) => {
    switch (type) {
      case 'error': return 'destructive';
      case 'warning': return 'default';
      case 'success': return 'default';
      default: return 'default';
    }
  };

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  return null; // Ce composant ne rend rien visuellement
};

export default RealtimeNotifications;
