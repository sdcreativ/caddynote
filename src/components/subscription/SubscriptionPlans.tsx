
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Crown, Zap, Users, Building, FileText, HardDrive } from 'lucide-react';
import { SubscriptionPlan } from '@/types/subscription';
import { subscriptionService } from '@/services/subscriptionService';
import { useToast } from '@/hooks/use-toast';
import { apiClient, ApiError } from '@/lib/apiClient';

interface SubscriptionPlansProps {
  currentPlan?: SubscriptionPlan | null;
}

const SubscriptionPlans: React.FC<SubscriptionPlansProps> = ({ currentPlan }) => {
  const { t } = useTranslation('subscription');
  const { t: tc } = useTranslation('common');
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const { toast } = useToast();

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      const availablePlans = await subscriptionService.getSubscriptionPlans();
      setPlans(availablePlans);
    } catch (error) {
      console.error('Error loading plans:', error);
      toast({
        title: tc('status.error'),
        description: t('plans.loadError'),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async (plan: SubscriptionPlan) => {
    if (plan.is_trial) {
      toast({
        title: tc('status.info'),
        description: t('plans.alreadyTrial'),
      });
      return;
    }

    setUpgrading(plan.id);
    try {
      const { url } = await apiClient.post<{ url?: string }>('/subscriptions/checkout-session', {
        planId: plan.id,
        billingCycle,
      });
      if (url) {
        window.location.href = url;
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      toast({
        title: tc('status.error'),
        description: error instanceof ApiError ? error.message : t('plans.checkoutError'),
        variant: "destructive",
      });
    } finally {
      setUpgrading(null);
    }
  };

  const getFeatureIcon = (feature: string) => {
    switch (feature) {
      case 'max_students': return <Users className="h-4 w-4" />;
      case 'max_institutions': return <Building className="h-4 w-4" />;
      case 'max_monthly_reports': return <FileText className="h-4 w-4" />;
      case 'storage_limit_gb': return <HardDrive className="h-4 w-4" />;
      default: return <Check className="h-4 w-4" />;
    }
  };

  const getFeatureLabel = (feature: string, value: any) => {
    switch (feature) {
      case 'max_students': return value ? t('features.maxStudents', { count: value }) : t('features.maxStudentsUnlimited');
      case 'max_institutions': return value ? t('features.maxInstitutions', { count: value }) : t('features.maxInstitutionsUnlimited');
      case 'max_monthly_reports': return value ? t('features.maxMonthlyReports', { count: value }) : t('features.maxMonthlyReportsUnlimited');
      case 'storage_limit_gb': return t('features.storage', { value });
      default: {
        const key = `features.${feature}`;
        const translated = t(key);
        return translated === key ? feature : translated;
      }
    }
  };

  if (loading) {
    return <div className="text-center">{t('plans.loading')}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">{t('plans.title')}</h2>
        <p className="text-muted-foreground">
          {t('plans.subtitle')}
        </p>
        <div className="mt-4 inline-flex rounded-md border p-1">
          <Button
            type="button"
            size="sm"
            variant={billingCycle === 'monthly' ? 'default' : 'ghost'}
            onClick={() => setBillingCycle('monthly')}
          >
            {t('plans.billingMonthly')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={billingCycle === 'yearly' ? 'default' : 'ghost'}
            onClick={() => setBillingCycle('yearly')}
          >
            {t('plans.billingYearly')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {plans.map((plan) => {
          const isCurrentPlan = currentPlan?.id === plan.id;
          const isPopular = plan.name === 'Pro';
          const displayPrice =
            billingCycle === 'yearly' && plan.price_yearly != null
              ? plan.price_yearly
              : plan.price_monthly;
          const priceSuffix =
            billingCycle === 'yearly' && plan.price_yearly != null ? t('perYear') : t('perMonth');

          return (
            <Card 
              key={plan.id} 
              className={`relative ${isCurrentPlan ? 'ring-2 ring-primary' : ''} ${isPopular ? 'border-primary' : ''}`}
            >
              {isPopular && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground">
                    <Crown className="h-3 w-3 mr-1" />
                    {t('plans.popular')}
                  </Badge>
                </div>
              )}

              <CardHeader className="text-center">
                <CardTitle className="flex items-center justify-center gap-2">
                  {plan.is_trial && <Zap className="h-5 w-5 text-yellow-500" />}
                  {plan.name}
                </CardTitle>
                <CardDescription>
                  <div className="text-3xl font-bold">
                    {displayPrice === 0 ? t('free') : t('priceAmount', { price: displayPrice })}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {displayPrice === 0 ? (plan.is_trial ? t('plans.trialDays') : t('plans.forever')) : priceSuffix}
                  </div>
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Limites quantitatives */}
                <div className="space-y-2">
                  {plan.max_students && (
                    <div className="flex items-center gap-2 text-sm">
                      {getFeatureIcon('max_students')}
                      {getFeatureLabel('max_students', plan.max_students)}
                    </div>
                  )}
                  {plan.max_institutions && (
                    <div className="flex items-center gap-2 text-sm">
                      {getFeatureIcon('max_institutions')}
                      {getFeatureLabel('max_institutions', plan.max_institutions)}
                    </div>
                  )}
                  {plan.max_monthly_reports && (
                    <div className="flex items-center gap-2 text-sm">
                      {getFeatureIcon('max_monthly_reports')}
                      {getFeatureLabel('max_monthly_reports', plan.max_monthly_reports)}
                    </div>
                  )}
                  {plan.storage_limit_gb && (
                    <div className="flex items-center gap-2 text-sm">
                      {getFeatureIcon('storage_limit_gb')}
                      {getFeatureLabel('storage_limit_gb', plan.storage_limit_gb)}
                    </div>
                  )}
                </div>

                {/* Fonctionnalités */}
                <div className="space-y-2">
                  {Object.entries(plan.features).map(([feature, enabled]) => 
                    enabled && (
                      <div key={feature} className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-green-500" />
                        {getFeatureLabel(feature, enabled)}
                      </div>
                    )
                  )}
                </div>

                <Button 
                  className="w-full" 
                  onClick={() => handleUpgrade(plan)}
                  disabled={isCurrentPlan || upgrading === plan.id}
                >
                  {upgrading === plan.id ? (
                    t('plans.processing')
                  ) : isCurrentPlan ? (
                    t('plans.currentPlan')
                  ) : plan.is_trial ? (
                    t('freeTrial')
                  ) : (
                    t('plans.choosePlan')
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default SubscriptionPlans;
