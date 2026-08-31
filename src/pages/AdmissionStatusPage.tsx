import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PublicShell } from '@/components/public/PublicShell';
import { ClipboardList } from 'lucide-react';
import {
  fetchAdmissionByToken,
  initiateAdmissionFeeCinetPay,
  initiateAdmissionFeeStripe,
  type AdmissionApplication,
} from '@/services/strkAdmissionService';
import { formatCentsAmount } from '@/lib/money';
import { useToast } from '@/hooks/use-toast';

const AdmissionStatusPage = () => {
  const { t } = useTranslation('admissions');
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [application, setApplication] = useState<AdmissionApplication | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  const reload = () => {
    if (!token) return;
    fetchAdmissionByToken(token)
      .then(({ application: app }) => setApplication(app))
      .catch(() => setError(t('status.notFound')));
  };

  useEffect(() => {
    reload();
  }, [token]);

  useEffect(() => {
    const payment = searchParams.get('payment');
    if (payment === 'success') {
      toast({ title: t('status.paymentPendingTitle'), description: t('status.paymentPendingBody') });
      reload();
      // Webhook CinetPay/Stripe peut arriver après le retour navigateur.
      const timer = window.setTimeout(() => reload(), 2500);
      return () => window.clearTimeout(timer);
    }
    if (payment === 'cancelled') {
      toast({
        title: t('status.paymentCancelledTitle'),
        description: t('status.paymentCancelledBody'),
        variant: 'destructive',
      });
    }
  }, [searchParams]);

  const payCinetPay = async () => {
    if (!token) return;
    setPaying(true);
    try {
      const { paymentUrl } = await initiateAdmissionFeeCinetPay(token);
      window.location.href = paymentUrl;
    } catch {
      toast({
        title: t('status.payUnavailable'),
        description: t('status.payMobileHint'),
        variant: 'destructive',
      });
      setPaying(false);
    }
  };

  const payStripe = async () => {
    if (!token) return;
    setPaying(true);
    try {
      const { url } = await initiateAdmissionFeeStripe(token);
      if (url) window.location.href = url;
    } catch {
      toast({
        title: t('status.payUnavailable'),
        description: t('status.payCardHint'),
        variant: 'destructive',
      });
      setPaying(false);
    }
  };

  return (
    <PublicShell>
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-10 sm:px-6">
        <div className="mb-6 flex items-center gap-3">
          <ClipboardList className="h-8 w-8 text-[#05335C]" aria-hidden="true" />
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{t('status.title')}</h1>
        </div>
        {error && <p className="text-destructive">{error}</p>}
        {application && (
          <Card className="border-slate-200 shadow-none">
            <CardHeader>
              <CardTitle className="text-2xl font-semibold tracking-tight">
                {application.studentFirstName} {application.studentLastName}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p><strong>{t('status.labelStatus')}</strong> {application.status}</p>
              <p><strong>{t('status.labelYear')}</strong> {application.academicYear}</p>
              <p><strong>{t('status.labelContact')}</strong> {application.contactEmail}</p>
              {application.applicationFeeCents != null && (
                <div className="space-y-2 rounded-md border border-slate-200 p-3">
                  <p>
                    <strong>{t('status.feeLabel')}</strong>{' '}
                    {formatCentsAmount(
                      application.applicationFeeCents,
                      application.applicationFeeCurrency ?? 'XOF'
                    )}{' '}
                    {application.applicationFeePaid ? t('status.settled') : t('status.pending')}
                  </p>
                  {!application.applicationFeePaid && application.applicationFeeCents > 0 && (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" disabled={paying} onClick={payCinetPay}>
                        {t('status.payMobile')}
                      </Button>
                      <Button size="sm" variant="outline" disabled={paying} onClick={payStripe}>
                        {t('status.payCard')}
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {application.decisionNotes && <p><strong>{t('status.note')}</strong> {application.decisionNotes}</p>}
            </CardContent>
          </Card>
        )}
      </main>
    </PublicShell>
  );
};

export default AdmissionStatusPage;
