import { Loader2, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/EmptyState';

export type ServicesCanteenEnrollment = {
  id: string;
  studentId: string;
  studentName?: string;
  invoice?: { invoiceNumber: string; totalCents: number; status: string } | null;
};

export type ServicesCanteenPlan = {
  id: string;
  name: string;
  priceCents: number;
  isActive: boolean;
  subscriptions: ServicesCanteenEnrollment[];
};

type ServicesCanteenPanelProps = {
  canteenDisabled: boolean;
  plans: ServicesCanteenPlan[];
  saving: boolean;
  loading: boolean;
  onCreatePlan: () => void;
  onSubscribe: (planId: string) => void;
  onEndSubscription: (subscriptionId: string) => void;
};

/** Module cantine — extrait de ServicesPage. */
export function ServicesCanteenPanel({
  canteenDisabled,
  plans,
  saving,
  loading,
  onCreatePlan,
  onSubscribe,
  onEndSubscription,
}: ServicesCanteenPanelProps) {
  const { t } = useTranslation('services');

  if (canteenDisabled) {
    return <EmptyState title={t('canteenDisabledTitle')} description={t('canteenDisabledBody')} />;
  }

  return (
    <div className="space-y-3">
      <Button onClick={onCreatePlan} disabled={saving || loading}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
        {t('plan')}
      </Button>
      {plans.length === 0 ? (
        <EmptyState title={t('emptyPlansTitle')} description={t('emptyPlansBody')} />
      ) : (
        plans.map((p) => (
          <Card key={p.id}>
            <CardHeader className="py-3">
              <CardTitle className="text-base">
                {p.name} — {(p.priceCents / 100).toFixed(0)}{' '}
                <Badge variant="outline">{t('abo', { count: p.subscriptions.length })}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pb-4">
              <Button
                size="sm"
                variant="secondary"
                disabled={saving || !p.isActive}
                onClick={() => onSubscribe(p.id)}
              >
                {t('subscribeStudent')}
              </Button>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {p.subscriptions.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-2">
                      {s.studentName ?? s.studentId}
                      {s.invoice?.invoiceNumber ? (
                        <Badge variant="secondary">
                          {t('invoiced', { number: s.invoice.invoiceNumber })}
                        </Badge>
                      ) : p.priceCents > 0 ? (
                        <Badge variant="outline">{t('notInvoiced')}</Badge>
                      ) : null}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={saving}
                      onClick={() => onEndSubscription(s.id)}
                    >
                      {t('close')}
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
