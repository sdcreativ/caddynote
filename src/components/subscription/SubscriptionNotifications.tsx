
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSubscription } from '@/hooks/useSubscription';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, AlertTriangle, Clock, CreditCard } from 'lucide-react';
import { Link } from 'react-router-dom';

const SubscriptionNotifications: React.FC = () => {
  const { t } = useTranslation('subscription');
  const { notifications, markNotificationAsRead, daysUntilExpiration, isExpiringSoon } = useSubscription();

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'trial_warning':
        return <Clock className="h-4 w-4" />;
      case 'expiration_warning':
        return <AlertTriangle className="h-4 w-4" />;
      case 'expired':
        return <CreditCard className="h-4 w-4" />;
      default:
        return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const getNotificationMessage = (type: string, daysBeforeExpiration?: number) => {
    switch (type) {
      case 'trial_warning':
        return t('notifications.trialWarning', { count: daysBeforeExpiration });
      case 'expiration_warning':
        return t('notifications.expirationWarning', { count: daysBeforeExpiration });
      case 'expired':
        return t('notifications.expired');
      default:
        return t('notifications.title');
    }
  };

  const getNotificationVariant = (type: string) => {
    switch (type) {
      case 'expired':
        return 'destructive';
      case 'expiration_warning':
        return 'default';
      case 'trial_warning':
        return 'default';
      default:
        return 'default';
    }
  };

  if (notifications.length === 0 && !isExpiringSoon) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Alerte persistante pour expiration imminente */}
      {isExpiringSoon && (
        <Alert className="border-yellow-200 bg-yellow-50">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertTitle className="text-yellow-800">
            {t('notifications.actionRequired')}
          </AlertTitle>
          <AlertDescription className="text-yellow-700">
            <div className="flex items-center justify-between">
              <span>
                {t('guard.expiresIn', { count: daysUntilExpiration })}
              </span>
              <Button asChild size="sm" className="ml-4">
                <Link to="/subscription">
                  {t('notifications.renew')}
                </Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Notifications individuelles */}
      {notifications.map((notification) => (
        <Alert 
          key={notification.id} 
          variant={getNotificationVariant(notification.notification_type)}
          className="relative"
        >
          {getNotificationIcon(notification.notification_type)}
          <AlertTitle className="flex items-center justify-between">
            <span>{t('notifications.title')}</span>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {new Date(notification.created_at).toLocaleDateString()}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => markNotificationAsRead(notification.id)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </AlertTitle>
          <AlertDescription>
            <div className="flex items-center justify-between">
              <span>
                {getNotificationMessage(notification.notification_type, notification.days_before_expiration)}
              </span>
              <Button asChild size="sm" variant="outline" className="ml-4">
                <Link to="/subscription">
                  {t('notifications.manage')}
                </Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
};

export default SubscriptionNotifications;
