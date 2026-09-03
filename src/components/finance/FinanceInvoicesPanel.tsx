import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { StrkInvoice } from '@/services/strkFinanceService';

type FinanceInvoicesPanelProps = {
  invoices: StrkInvoice[];
  isLoading: boolean;
  loadError: string | null;
  formatAmount: (cents: number, currency: string) => string;
  statusVariant: (status: string) => 'default' | 'secondary' | 'destructive' | 'outline';
  statusLabel: (code: string) => string;
  onRetry: () => void;
  onCreate: () => void;
  onSelect: (invoice: StrkInvoice) => void;
};

/** Onglet factures — extrait de FinancePage. */
export function FinanceInvoicesPanel({
  invoices,
  isLoading,
  loadError,
  formatAmount,
  statusVariant,
  statusLabel,
  onRetry,
  onCreate,
  onSelect,
}: FinanceInvoicesPanelProps) {
  const { t } = useTranslation('finance');

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={onCreate}>
          <Plus className="mr-2 h-4 w-4" />
          {t('invoices.new')}
        </Button>
      </div>
      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <LoadingState label={t('invoices.loading')} />
          ) : loadError ? (
            <ErrorState description={loadError} onRetry={onRetry} />
          ) : invoices.length === 0 ? (
            <EmptyState
              title={t('invoices.emptyTitle')}
              description={t('invoices.emptyDescription')}
              actionLabel={t('invoices.new')}
              onAction={onCreate}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('invoices.number')}</TableHead>
                  <TableHead>{t('invoices.student')}</TableHead>
                  <TableHead>{t('invoices.total')}</TableHead>
                  <TableHead>{t('invoices.paid')}</TableHead>
                  <TableHead>{t('invoices.status')}</TableHead>
                  <TableHead className="text-right">{t('invoices.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                    <TableCell>{inv.student.name}</TableCell>
                    <TableCell>{formatAmount(inv.total_cents, inv.currency)}</TableCell>
                    <TableCell>{formatAmount(inv.paid_cents, inv.currency)}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(inv.status)}>{statusLabel(inv.status)}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => onSelect(inv)}>
                        {t('invoices.details')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
