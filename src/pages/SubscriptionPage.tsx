import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSubscription } from '@/hooks/useSubscription';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Crown, CreditCard, FileText, Settings, Zap } from 'lucide-react';
import SubscriptionPlans from '@/components/subscription/SubscriptionPlans';
import PublicOffersCatalogAdmin from '@/components/subscription/PublicOffersCatalogAdmin';
import BillingHistory from '@/components/subscription/BillingHistory';
import PaymentMethods from '@/components/subscription/PaymentMethods';
import { useToast } from '@/hooks/use-toast';

const SubscriptionPage: React.FC = () => {
  const { t } = useTranslation('subscription');
  const { subscription, plan, isExpired, isExpiringSoon, daysUntilExpiration, refreshSubscription } =
    useSubscription();
  const { user } = useStrkAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();

  useEffect(() => {
    const checkout = searchParams.get('checkout');
    if (!checkout) return;
    if (checkout === 'success') {
      toast({ title: t('checkoutSuccessTitle'), description: t('checkoutSuccessBody') });
      refreshSubscription();
    } else if (checkout === 'cancelled') {
      toast({
        title: t('checkoutCancelledTitle'),
        description: t('checkoutCancelledBody'),
        variant: 'destructive',
      });
    }
    const next = new URLSearchParams(searchParams);
    next.delete('checkout');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, toast, t, refreshSubscription]);

  if (!user) {
    return (
      <div className="container mx-auto py-8">
        <Alert>
          <AlertDescription>{t('mustLogin')}</AlertDescription>
        </Alert>
      </div>
    );
  }

  // Super admin : catalogue des offres publiques, pas une souscription perso.
  if (user.role === 'admin') {
    return (
      <div className="animate-fade-in py-2">
        <PublicOffersCatalogAdmin />
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button onClick={refreshSubscription} variant="outline" size="sm">
          <Settings className="mr-2 h-4 w-4" />
          {t('refresh')}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5" />
            {t('currentStatus')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant={isExpired ? 'destructive' : 'default'}>
                  {plan?.name || t('noPlan')}
                </Badge>
                {plan?.is_trial && <Badge variant="secondary">{t('freeTrial')}</Badge>}
              </div>
              <div className="text-sm text-muted-foreground">
                {subscription?.expires_at && (
                  <span>
                    {t('expiresAt', {
                      date: new Date(subscription.expires_at).toLocaleDateString('fr-FR'),
                    })}
                    {isExpiringSoon && (
                      <span className="font-medium text-orange-600">
                        {' '}
                        {t('expiresInParen', { count: daysUntilExpiration })}
                      </span>
                    )}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">
                {plan?.price_monthly ? t('priceAmount', { price: plan.price_monthly }) : t('free')}
              </div>
              <div className="text-sm text-muted-foreground">{t('perMonth')}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="plans" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="plans" className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            {t('tabs.plans')}
          </TabsTrigger>
          <TabsTrigger value="billing" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {t('tabs.billing')}
          </TabsTrigger>
          <TabsTrigger value="payment" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            {t('tabs.payment')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="plans">
          <SubscriptionPlans currentPlan={plan} />
        </TabsContent>
        <TabsContent value="billing">
          <BillingHistory />
        </TabsContent>
        <TabsContent value="payment">
          <PaymentMethods />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SubscriptionPage;
