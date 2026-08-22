
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import {
  ClipboardList,
  FileCheck,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { useStrkActivities } from '@/hooks/useStrkActivities';
import { useStrkAuth } from '@/hooks/useStrkAuth';

const RecentActivity = () => {
  const { t } = useTranslation('dashboard');
  const { user } = useStrkAuth();
  const { activities, loadActivitiesByInstitution, loadActivitiesByUser } = useStrkActivities();

  useEffect(() => {
    if (user?.role === 'student' && user.id) {
      loadActivitiesByUser(user.id).then(r => {});
    } else if (user?.institutionId) {
      loadActivitiesByInstitution(user.institutionId).then(r => {});
    }
  }, [user, loadActivitiesByInstitution, loadActivitiesByUser]);

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'absence':
        return <ClipboardList className="h-5 w-5 text-red-500" />;
      case 'signature':
        return <FileCheck className="h-5 w-5 text-green-500" />;
      case 'lateness':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      case 'justification':
        return <CheckCircle className="h-5 w-5 text-blue-500" />;
      default:
        return <ClipboardList className="h-5 w-5 text-gray-500" />;
    }
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{t('recentActivity.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-5">
          {activities.map((activity) => (
            <div key={activity.id} className="flex items-start space-x-4">
              <div className="flex-shrink-0">
                {getActivityIcon(activity.type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {activity.description}
                </p>
                <p className="text-xs text-gray-500 flex flex-wrap items-center gap-1">
                  <span>{t('recentActivity.user')}</span>
                  <span>•</span>
                  <time dateTime={activity.created_at ?? undefined}>
                    {activity.created_at
                      ? formatDistanceToNow(new Date(activity.created_at), {
                          addSuffix: true,
                          locale: fr,
                        })
                      : '—'}
                  </time>
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default RecentActivity;
