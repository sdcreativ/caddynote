
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, FileText, AlertCircle } from 'lucide-react';
import { BillingHistory as BillingHistoryType } from '@/types/subscription';
import { subscriptionService } from '@/services/subscriptionService';
import { useSubscription } from '@/hooks/useSubscription';
import { useToast } from '@/hooks/use-toast';

const BillingHistory: React.FC = () => {
  const { t } = useTranslation('subscription');
  const { t: tc } = useTranslation('common');
  const [billingHistory, setBillingHistory] = useState<BillingHistoryType[]>([]);
  const [loading, setLoading] = useState(true);
  const { subscription } = useSubscription();
  const { toast } = useToast();

  useEffect(() => {
    if (subscription) {
      loadBillingHistory();
    }
  }, [subscription]);

  const loadBillingHistory = async () => {
    if (!subscription) return;

    try {
      const history = await subscriptionService.getBillingHistory(subscription.id);
      setBillingHistory(history);
    } catch (error) {
      console.error('Error loading billing history:', error);
      toast({
        title: tc('status.error'),
        description: t('billing.loadError'),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge variant="default" className="bg-green-100 text-green-800">{t('billing.statusPaid')}</Badge>;
      case 'pending':
        return <Badge variant="secondary">{t('billing.statusPending')}</Badge>;
      case 'failed':
        return <Badge variant="destructive">{t('billing.statusFailed')}</Badge>;
      case 'refunded':
        return <Badge variant="outline">{t('billing.statusRefunded')}</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount);
  };

  const handleDownloadInvoice = (invoiceUrl: string) => {
    window.open(invoiceUrl, '_blank');
  };

  if (!subscription) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t('billing.noSubscriptionTitle')}</h3>
            <p className="text-muted-foreground">
              {t('billing.noSubscriptionBody')}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">{t('billing.loading')}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          {t('billing.title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {billingHistory.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t('billing.emptyTitle')}</h3>
            <p className="text-muted-foreground">
              {t('billing.emptyBody')}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('billing.colDate')}</TableHead>
                <TableHead>{t('billing.colAmount')}</TableHead>
                <TableHead>{t('billing.colStatus')}</TableHead>
                <TableHead>{t('billing.colPeriod')}</TableHead>
                <TableHead>{t('billing.colActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {billingHistory.map((bill) => (
                <TableRow key={bill.id}>
                  <TableCell>
                    {bill.payment_date ? 
                      new Date(bill.payment_date).toLocaleDateString('fr-FR') : 
                      new Date(bill.created_at).toLocaleDateString('fr-FR')
                    }
                  </TableCell>
                  <TableCell className="font-medium">
                    {formatAmount(bill.amount, bill.currency)}
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(bill.status)}
                  </TableCell>
                  <TableCell>
                    {bill.billing_period_start && bill.billing_period_end ? (
                      <div className="text-sm text-muted-foreground">
                        {new Date(bill.billing_period_start).toLocaleDateString('fr-FR')} -{' '}
                        {new Date(bill.billing_period_end).toLocaleDateString('fr-FR')}
                      </div>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell>
                    {bill.invoice_url && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownloadInvoice(bill.invoice_url!)}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        {tc('actions.download')}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

export default BillingHistory;
