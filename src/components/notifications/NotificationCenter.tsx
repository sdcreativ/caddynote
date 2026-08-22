import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bell, CheckCircle, AlertTriangle, Info, X, Mail, MessageSquare } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { fetchNotifications, markNotificationAsRead, markAllNotificationsAsRead } from '@/services/strkNotificationService';
import { StrkNotification } from '@/types/strk';
import { useTranslation } from 'react-i18next';
import { tCommon } from '@/i18n/config';

interface NotificationCenterProps {
  userId: string;
  className?: string;
}

export const NotificationCenter = ({ userId, className }: NotificationCenterProps) => {
  const [notifications, setNotifications] = useState<StrkNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const { t } = useTranslation('notifications');


  useEffect(() => {
    loadNotifications();
  }, [userId]);

  const loadNotifications = async () => {
    setIsLoading(true);
    try {
      const data = await fetchNotifications(userId);
      setNotifications(data);
    } catch (error) {
      console.error('Error loading notifications:', error);
      toast({
        title: tCommon('status.error'),
        description: t('loadError'),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await markNotificationAsRead(notificationId);
      setNotifications(prev => 
        prev.map(notif => 
          notif.id === notificationId ? { ...notif, read_at: new Date().toISOString() } : notif
        )
      );
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllNotificationsAsRead(userId);
      setNotifications(prev => 
        prev.map(notif => ({ ...notif, read_at: new Date().toISOString() }))
      );
      toast({
        title: t('markedTitle'),
        description: t('markedBody'),
      });
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const getNotificationIcon = (type: StrkNotification['type']) => {
    switch (type) {
      case 'attendance':
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      case 'signature':
        return <Mail className="h-4 w-4 text-blue-500" />;
      case 'system':
        return <Info className="h-4 w-4 text-gray-500" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <X className="h-4 w-4 text-red-500" />;
      default:
        return <Bell className="h-4 w-4 text-blue-500" />;
    }
  };

  const getPriorityColor = (priority: string = 'normal') => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'high':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case 'medium':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'low':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 60) {
      return t('agoMinutes', { count: diffInMinutes });
    } else if (diffInMinutes < 1440) {
      return t('agoHours', { count: Math.floor(diffInMinutes / 60) });
    } else {
      return t('agoDays', { count: Math.floor(diffInMinutes / 1440) });
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;
  const recentNotifications = notifications.filter(n => !n.read);
  const allNotifications = notifications;

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              {t('title')}
            </CardTitle>
            {unreadCount > 0 && (
              <Badge variant="destructive">{unreadCount}</Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button onClick={handleMarkAllAsRead} variant="outline" size="sm">
              {t('markAllRead')}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="recent" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="recent" className="flex items-center gap-2">
              {t('unread')}
              {unreadCount > 0 && <Badge variant="secondary">{unreadCount}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="all">{t('all')}</TabsTrigger>
          </TabsList>

          <TabsContent value="recent" className="space-y-3 mt-4">
            {isLoading ? (
              <div className="text-center py-4 text-muted-foreground">
                {tCommon('actions.loading')}
              </div>
            ) : recentNotifications.length > 0 ? (
              recentNotifications.map(notification => (
                <div
                  key={notification.id}
                  className={`p-3 border rounded-lg ${
                    notification.read ? 'bg-muted/50' : 'bg-background'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {getNotificationIcon(notification.type)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className={`text-sm font-medium ${
                          notification.read ? 'text-muted-foreground' : 'text-foreground'
                        }`}>
                          {notification.title}
                        </h4>
                        <Badge variant="outline" className={getPriorityColor('normal')}>
                          normal
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        {notification.message}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {formatTimeAgo(notification.created_at)}
                        </span>
                        {!notification.read && (
                          <Button
                            onClick={() => handleMarkAsRead(notification.id)}
                            variant="ghost"
                            size="sm"
                          >
                            {t('markRead')}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>{t('empty')}</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="all" className="space-y-3 mt-4">
            {allNotifications.map(notification => (
              <div
                key={notification.id}
                className={`p-3 border rounded-lg ${
                  notification.read_at ? 'bg-muted/50' : 'bg-background'
                }`}
              >
                <div className="flex items-start gap-3">
                  {getNotificationIcon(notification.type)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className={`text-sm font-medium ${
                        notification.read_at ? 'text-muted-foreground' : 'text-foreground'
                      }`}>
                        {notification.title}
                      </h4>
                      <Badge variant="outline" className={getPriorityColor(notification.priority)}>
                        {notification.priority}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      {notification.message}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {formatTimeAgo(notification.created_at)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};