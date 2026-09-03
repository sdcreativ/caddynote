import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { StrkFeeItem } from '@/services/strkFinanceService';

type FinanceFeesPanelProps = {
  feeItems: StrkFeeItem[];
  formatAmount: (cents: number, currency: string) => string;
  lateFeeAmount: string;
  lateFeeGraceDays: string;
  onLateFeeAmountChange: (value: string) => void;
  onLateFeeGraceDaysChange: (value: string) => void;
  onCreateFee: () => void;
  onSaveLateFees: () => void;
};

/** Onglet catalogue frais + pénalités — extrait de FinancePage. */
export function FinanceFeesPanel({
  feeItems,
  formatAmount,
  lateFeeAmount,
  lateFeeGraceDays,
  onLateFeeAmountChange,
  onLateFeeGraceDaysChange,
  onCreateFee,
  onSaveLateFees,
}: FinanceFeesPanelProps) {
  const { t } = useTranslation('finance');
  const { t: tc } = useTranslation('common');

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={onCreateFee}>
          <Plus className="mr-2 h-4 w-4" />
          {t('fees.new')}
        </Button>
      </div>
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('fees.name')}</TableHead>
                <TableHead>{t('fees.amount')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {feeItems.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>{f.name}</TableCell>
                  <TableCell>{formatAmount(f.amount_cents, f.currency)}</TableCell>
                </TableRow>
              ))}
              {feeItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="py-8 text-center text-muted-foreground">
                    {t('fees.empty')}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('lateFees.title')}</CardTitle>
          <CardDescription>{t('lateFees.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('lateFees.amountLabel')}</Label>
              <Input
                type="number"
                placeholder={t('lateFees.amountPlaceholder')}
                value={lateFeeAmount}
                onChange={(e) => onLateFeeAmountChange(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('lateFees.graceDays')}</Label>
              <Input
                type="number"
                min="1"
                value={lateFeeGraceDays}
                onChange={(e) => onLateFeeGraceDaysChange(e.target.value)}
              />
            </div>
          </div>
          <Button onClick={onSaveLateFees}>{tc('actions.save')}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
