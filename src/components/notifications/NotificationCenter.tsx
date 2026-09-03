import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bell, CheckCircle, AlertTriangle, Info, X, Mail } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  fetchNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '@/services/strkNotificationService';
import { StrkNotification } from '@/types/strk';
import { useTranslation } from 'react-i18next';
import { tCommon } from '@/i18n/config';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';

interface NotificationCenterProps {
  userId: string;
  className?: string;
}

const isUnread = (n: StrkNotification) => !n.read;

export const NotificationCenter = ({ userId, className }: NotificationCenterProps) => {
  const [notifications, setNotifications] = useState<StrkNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { toast } = useToast();
  const { t } = useTranslation('notifications');

  const loadNotifications = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await fetchNotifications(userId);
      setNotifications(data);
    } catch (error) {
      console.error('Error loading notifications:', error);
      setNotifications([]);
      setLoadError(t('loadError'));
      toast({
        title: tCommon('status.error'),
        description: t('loadError'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
    // `toast` est une fonction stable côté hook ; on ne l’ajoute pas aux deps
    // pour éviter une boucle de rechargement si un mock/test la recrée.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast volontairement omis
  }, [t, userId]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await markNotificationAsRead(notificationId);
      setNotifications((prev) =>
        prev.map((notif) => (notif.id === notificationId ? { ...notif, read: true } : notif))
      );
    } catch (error) {
      console.error('Error marking notification as read:', error);
      toast({
        title: tCommon('status.error'),
        description: t('markError'),
        variant: 'destructive',
      });
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllNotificationsAsRead(userId);
      setNotifications((prev) => prev.map((notif) => ({ ...notif, read: true })));
      toast({
        title: t('markedTitle'),
        description: t('markedBody'),
      });
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      toast({
        title: tCommon('status.error'),
        description: t('markError'),
        variant: 'destructive',
      });
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'attendance':
        return <AlertTriangle className="h-4 w-4 text-orange-500" aria-hidden />;
      case 'signature':
        return <Mail className="h-4 w-4 text-blue-500" aria-hidden />;
      case 'system':
        return <Info className="h-4 w-4 text-gray-500" aria-hidden />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" aria-hidden />;
      case 'error':
        return <X className="h-4 w-4 text-red-500" aria-hidden />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-orange-500" aria-hidden />;
      default:
        return <Bell className="h-4 w-4 text-blue-500" aria-hidden />;
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '—';
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffInMinutes < 60) {
      return t('agoMinutes', { count: Math.max(0, diffInMinutes) });
    }
    if (diffInMinutes < 1440) {
      return t('agoHours', { count: Math.floor(diffInMinutes / 60) });
    }
    return t('agoDays', { count: Math.floor(diffInMinutes / 1440) });
  };

  const unreadNotifications = notifications.filter(isUnread);
  const unreadCount = unreadNotifications.length;

  const renderNotification = (notification: StrkNotification) => {
    const unread = isUnread(notification);
    const actionUrl = notification.actionUrl?.trim() || null;

    return (
      <div
        key={notification.id}
        className={`rounded-lg border p-3 ${unread ? 'bg-background' : 'bg-muted/50'}`}
      >
        <div className="flex items-start gap-3">
          {getNotificationIcon(notification.type)}
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h4 className={`text-sm font-medium ${unread ? 'text-foreground' : 'text-muted-foreground'}`}>
                {notification.title}
              </h4>
              {notification.priority ? (
                <Badge variant="outline">{notification.priority}</Badge>
              ) : null}
            </div>
            <p className="mb-2 text-sm text-muted-foreground">{notification.message}</p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">{formatTimeAgo(notification.createdAt)}</span>
              <div className="flex flex-wrap gap-1">
                {actionUrl ? (
                  actionUrl.startsWith('/') ? (
                    <Button asChild variant="ghost" size="sm">
                      <Link to={actionUrl}>{t('view')}</Link>
                    </Button>
                  ) : (
                    <Button asChild variant="ghost" size="sm">
                      <a href={actionUrl} rel="noopener noreferrer">
                        {t('view')}
                      </a>
                    </Button>
                  )
                ) : null}
                {unread ? (
                  <Button onClick={() => void handleMarkAsRead(notification.id)} variant="ghost" size="sm">
                    {t('markRead')}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" aria-hidden />
              {t('title')}
            </CardTitle>
            {unreadCount > 0 ? <Badge variant="destructive">{unreadCount}</Badge> : null}
          </div>
          {unreadCount > 0 ? (
            <Button onClick={() => void handleMarkAllAsRead()} variant="outline" size="sm">
              {t('markAllRead')}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingState label={tCommon('actions.loading')} />
        ) : loadError ? (
          <ErrorState description={loadError} onRetry={() => void loadNotifications()} />
        ) : (
          <Tabs defaultValue="recent" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="recent" className="flex items-center gap-2">
                {t('unread')}
                {unreadCount > 0 ? <Badge variant="secondary">{unreadCount}</Badge> : null}
              </TabsTrigger>
              <TabsTrigger value="all">{t('all')}</TabsTrigger>
            </TabsList>

            <TabsContent value="recent" className="mt-4 space-y-3">
              {unreadNotifications.length > 0 ? (
                unreadNotifications.map(renderNotification)
              ) : (
                <EmptyState title={t('emptyUnreadTitle')} description={t('emptyUnreadBody')} />
              )}
            </TabsContent>

            <TabsContent value="all" className="mt-4 space-y-3">
              {notifications.length > 0 ? (
                notifications.map(renderNotification)
              ) : (
                <EmptyState title={t('emptyAllTitle')} description={t('emptyAllBody')} />
              )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
};
