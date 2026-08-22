
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CreditCard, Plus, Trash2, Shield, AlertCircle } from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';
import { useToast } from '@/hooks/use-toast';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { apiClient, ApiError } from '@/lib/apiClient';

const PaymentMethods: React.FC = () => {
  const { t } = useTranslation('subscription');
  const { t: tc } = useTranslation('common');
  const [loading, setLoading] = useState(false);
  const { subscription, refreshSubscription } = useSubscription();
  const { toast } = useToast();
  const confirm = useConfirmDialog();

  const handleManagePayment = async () => {
    setLoading(true);
    try {
      const { url } = await apiClient.post<{ url?: string }>('/subscriptions/customer-portal');
      if (url) {
        window.location.href = url;
      }
    } catch (error) {
      console.error('Error creating customer portal session:', error);
      toast({
        title: tc('status.error'),
        description: error instanceof ApiError ? error.message : t('payment.portalError'),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    const ok = await confirm({
      description: t('payment.cancelConfirm'),
      variant: 'destructive',
    });
    if (!ok) return;
    if (!subscription?.id) return;

    setLoading(true);
    try {
      await apiClient.patch(`/subscriptions/${subscription.id}/cancel`);

      toast({
        title: t('payment.cancelledTitle'),
        description: t('payment.cancelledBody'),
      });

      await refreshSubscription();
    } catch (error) {
      console.error('Error canceling subscription:', error);
      toast({
        title: tc('status.error'),
        description: t('payment.cancelError'),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            {t('payment.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {subscription?.stripe_customer_id ? (
            <div className="space-y-4">
              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  {t('payment.stripeManaged')}
                </AlertDescription>
              </Alert>

              <div className="flex gap-2">
                <Button onClick={handleManagePayment} disabled={loading}>
                  <CreditCard className="h-4 w-4 mr-2" />
                  {loading ? tc('actions.loading') : t('payment.manage')}
                </Button>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-semibold mb-2">{t('payment.infoTitle')}</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>{t('payment.billingCycle')}</span>
                    <span>{subscription.billing_cycle === 'monthly' ? t('payment.monthly') : t('payment.yearly')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('payment.autoRenew')}</span>
                    <Badge variant={subscription.auto_renew ? "default" : "secondary"}>
                      {subscription.auto_renew ? t('payment.enabled') : t('payment.disabled')}
                    </Badge>
                  </div>
                  {subscription.next_billing_date && (
                    <div className="flex justify-between">
                      <span>{t('payment.nextBilling')}</span>
                      <span>{new Date(subscription.next_billing_date).toLocaleDateString('fr-FR')}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {t('payment.noMethod')}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {subscription && !subscription.plan?.is_trial && (
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600">{t('payment.dangerZone')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {t('payment.cancelWarning')}
                </AlertDescription>
              </Alert>
              <Button 
                variant="destructive" 
                onClick={handleCancelSubscription}
                disabled={loading}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t('payment.cancel')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PaymentMethods;
