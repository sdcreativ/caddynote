import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/EmptyState';
import type { StrkPaymentPlan } from '@/services/strkFinanceService';

type FinancePlansPanelProps = {
  paymentPlans: StrkPaymentPlan[];
  formatAmount: (cents: number, currency: string) => string;
  statusLabel: (code: string) => string;
  onCreate: () => void;
  onCancel: (planId: string) => void;
};

/** Onglet plans de paiement — extrait de FinancePage. */
export function FinancePlansPanel({
  paymentPlans,
  formatAmount,
  statusLabel,
  onCreate,
  onCancel,
}: FinancePlansPanelProps) {
  const { t } = useTranslation('finance');
  const { t: tc } = useTranslation('common');

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={onCreate}>
          <Plus className="mr-2 h-4 w-4" />
          {t('plans.new')}
        </Button>
      </div>
      <Card>
        <CardContent className="space-y-4 pt-6">
          {paymentPlans.length === 0 ? (
            <EmptyState title={t('plans.emptyTitle')} description={t('plans.emptyDescription')} />
          ) : (
            paymentPlans.map((plan) => (
              <div key={plan.id} className="space-y-2 rounded-md border p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{plan.label}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatAmount(plan.totalCents, plan.currency)} — {plan.status}
                      {plan.academicYear ? ` — ${plan.academicYear}` : ''}
                    </p>
                  </div>
                  {plan.status !== 'cancelled' ? (
                    <Button variant="outline" size="sm" onClick={() => onCancel(plan.id)}>
                      {tc('actions.cancel')}
                    </Button>
                  ) : null}
                </div>
                <ul className="space-y-1 text-sm">
                  {(plan.invoices || []).map((inv) => (
                    <li key={inv.id}>
                      {t('plans.installmentLine', {
                        index: inv.installmentIndex ?? '?',
                        number: inv.invoiceNumber,
                        amount: formatAmount(inv.totalCents, plan.currency),
                        due: inv.dueDate
                          ? t('plans.dueDateSuffix', {
                              date: new Date(inv.dueDate).toLocaleDateString('fr-FR'),
                            })
                          : '',
                        status: statusLabel(inv.status),
                      })}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
