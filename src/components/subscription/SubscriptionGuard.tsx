
import React, { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSubscription } from '@/hooks/useSubscription';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Lock, Crown, AlertTriangle, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';

interface SubscriptionGuardProps {
  children: ReactNode;
  feature?: string;
  limitType?: 'students' | 'institutions' | 'reports';
  currentValue?: number;
  fallback?: ReactNode;
  showUpgrade?: boolean;
  compact?: boolean;
}

const SubscriptionGuard: React.FC<SubscriptionGuardProps> = ({
  children,
  feature,
  limitType,
  currentValue = 0,
  fallback,
  showUpgrade = true,
  compact = false
}) => {
  const { t } = useTranslation('subscription');
  const { 
    subscription, 
    plan, 
    limits, 
    isExpired, 
    isExpiringSoon, 
    daysUntilExpiration,
    hasFeature, 
    checkLimit 
  } = useSubscription();

  // Si abonnement expiré
  if (isExpired) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="h-5 w-5" />
            {t('guard.expiredTitle')}
          </CardTitle>
          <CardDescription className="text-red-600">
            {t('guard.expiredBody')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button asChild>
              <Link to="/dashboard/subscription">
                {t('guard.renew')}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Vérification des fonctionnalités
  if (feature && !hasFeature(feature)) {
    if (compact) {
      const compactContent = (
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-amber-50 to-amber-100 rounded border border-amber-200 opacity-90"></div>
          <div className="relative p-3 text-center">
            <Crown className="h-4 w-4 mx-auto text-amber-600 mb-1" />
            <p className="text-xs font-medium text-amber-700 mb-1">{t('guard.premiumTitle')}</p>
            {showUpgrade && (
              <Button asChild size="sm" variant="outline" className="text-xs h-6 border-amber-300 text-amber-700 hover:bg-amber-100">
                <Link to="/dashboard/subscription">
                  {t('guard.unlock')}
                </Link>
              </Button>
            )}
          </div>
        </div>
      );
      return fallback || compactContent;
    }

    const upgradeContent = (
      <Card className="border-amber-200 bg-amber-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-700">
            <Crown className="h-5 w-5" />
            {t('guard.premiumTitle')}
          </CardTitle>
          <CardDescription className="text-amber-600">
            {t('guard.premiumBody')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                {plan?.name || t('guard.currentPlan')}
              </Badge>
              <span className="text-sm text-gray-600">→</span>
              <Badge className="bg-blue-100 text-blue-800">
                {t('guard.proOrEnterprise')}
              </Badge>
            </div>
            {showUpgrade && (
              <div className="flex gap-2">
                <Button asChild size="sm">
                  <Link to="/dashboard/subscription">
                    <Zap className="h-4 w-4 mr-2" />
                    {t('guard.upgrade')}
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );

    return fallback || upgradeContent;
  }

  // Vérification des limites
  if (limitType && limits && !checkLimit(limitType, currentValue)) {
    const limitValues = {
      students: limits.maxStudents,
      institutions: limits.maxInstitutions,
      reports: limits.maxMonthlyReports
    };

    const limitContent = (
      <Card className="border-orange-200 bg-orange-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-orange-700">
            <Lock className="h-5 w-5" />
            {t('guard.limitReached')}
          </CardTitle>
          <CardDescription className="text-orange-600">
            {t('guard.limitBody', { limit: t(`guard.limits.${limitType}`) })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t('guard.currentLimit')}</span>
              <Badge variant="outline">
                {currentValue} / {limitValues[limitType] || '∞'}
              </Badge>
            </div>
            {showUpgrade && (
              <div className="flex gap-2">
                <Button asChild size="sm">
                  <Link to="/dashboard/subscription">
                    {t('guard.increaseLimit')}
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );

    return fallback || limitContent;
  }

  // Afficher l'alerte d'expiration si nécessaire
  const expirationAlert = isExpiringSoon && (
    <Alert className="mb-4 border-yellow-200 bg-yellow-50">
      <AlertTriangle className="h-4 w-4 text-yellow-600" />
      <AlertTitle className="text-yellow-800">
        {t('guard.expiringSoonTitle')}
      </AlertTitle>
      <AlertDescription className="text-yellow-700">
        {t('guard.expiresIn', { count: daysUntilExpiration })}
        <Button asChild variant="link" className="p-0 h-auto ml-2 text-yellow-800">
          <Link to="/dashboard/subscription">
            {t('guard.renewNow')}
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  );

  return (
    <>
      {expirationAlert}
      {children}
    </>
  );
};

export default SubscriptionGuard;
