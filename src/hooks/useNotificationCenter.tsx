import { useState, useEffect, useCallback } from 'react';
import { useOptimizedQuery } from './useOptimizedQuery';
import { useAsyncOperation } from './useAsyncOperation';
import { fetchNotifications, markNotificationAsRead, markAllNotificationsAsRead } from '@/services/strkNotificationService';
import type { StrkNotification } from '@/types/strk';

export function useNotificationCenter(userId: string) {
  const [notifications, setNotifications] = useState<StrkNotification[]>([]);
  
  const { data, isLoading: queryLoading, refetch } = useOptimizedQuery(
    ['notifications', userId],
    () => fetchNotifications(userId),
    {
      enabled: !!userId,
      staleTime: 1 * 60 * 1000, // 1 minute pour les notifications
    }
  );

  const { execute: markAsRead, loading: markingAsRead } = useAsyncOperation<void>();
  const { execute: markAllAsRead, loading: markingAllAsRead } = useAsyncOperation<void>();

  useEffect(() => {
    if (data) {
      setNotifications(data);
    }
  }, [data]);

  const handleMarkAsRead = useCallback(async (notificationId: string) => {
    try {
      await markAsRead(() => markNotificationAsRead(notificationId));
      setNotifications((prev) =>
        prev.map((notif) => (notif.id === notificationId ? { ...notif, read: true } : notif))
      );
    } catch (error) {
      console.error('Erreur lors du marquage de la notification:', error);
    }
  }, [markAsRead]);

  const handleMarkAllAsRead = useCallback(async () => {
    try {
      await markAllAsRead(() => markAllNotificationsAsRead(userId));
      setNotifications((prev) => prev.map((notif) => ({ ...notif, read: true })));
    } catch (error) {
      console.error('Erreur lors du marquage de toutes les notifications:', error);
    }
  }, [markAllAsRead, userId]);

  const unreadCount = notifications.filter(n => !n.read).length;

  return {
    notifications,
    unreadCount,
    loading: queryLoading,
    markAsRead: handleMarkAsRead,
    markAllAsRead: handleMarkAllAsRead,
    markingAsRead,
    markingAllAsRead,
    refetch,
  };
}