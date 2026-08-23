import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { useToast } from '@/hooks/use-toast';
import { ApiError } from '@/lib/apiClient';
import {
  downloadFinanceBalancesExport,
  fetchFinanceBalances,
  type FinanceBalancesReport,
} from '@/services/strkFinanceService';

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Lot 5 — rapport soldes à une date + export CSV/XLSX journalisé. */
export function FinanceBalancesPanel() {
  const { t } = useTranslation('finance');
  const { t: tc } = useTranslation('common');
  const { toast } = useToast();
  const [asOf, setAsOf] = useState(todayIso());
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<FinanceBalancesReport | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await fetchFinanceBalances(asOf));
    } catch (e) {
      toast({
        title: t('toasts.loadImpossible'),
        description: e instanceof ApiError ? e.message : tc('status.error'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [asOf, toast, t, tc]);

  const onExport = async (format: 'csv' | 'xlsx') => {
    try {
      await downloadFinanceBalancesExport(asOf, format);
      toast({ title: t('balances.exportDone') });
    } catch (e) {
      toast({
        title: t('balances.exportError'),
        description: e instanceof Error ? e.message : tc('status.error'),
        variant: 'destructive',
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('balances.title')}</CardTitle>
        <CardDescription>{t('balances.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label>{t('balances.asOf')}</Label>
            <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          </div>
          <Button onClick={() => void load()}>{t('balances.load')}</Button>
          <Button variant="outline" onClick={() => void onExport('csv')} disabled={!report}>
            <Download className="mr-2 h-4 w-4" />
            CSV
          </Button>
          <Button variant="outline" onClick={() => void onExport('xlsx')} disabled={!report}>
            <Download className="mr-2 h-4 w-4" />
            XLSX
          </Button>
        </div>

        {loading ? (
          <LoadingState label={t('balances.loading')} />
        ) : !report ? (
          <EmptyState title={t('balances.emptyTitle')} description={t('balances.emptyBody')} />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3 text-sm">
              <div className="rounded-md border p-3">
                <p className="text-muted-foreground">{t('balances.totalDue')}</p>
                <p className="text-lg font-semibold">
                  {report.totals.balanceCents.toLocaleString('fr-FR')} {report.currency}
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-muted-foreground">{t('balances.unpaidStudents')}</p>
                <p className="text-lg font-semibold">{report.unpaidStudentCount}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-muted-foreground">{t('balances.scheduleInvoices')}</p>
                <p className="text-lg font-semibold">{report.scheduleInvoiceCount}</p>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('invoices.student')}</TableHead>
                  <TableHead>{t('balances.invoices')}</TableHead>
                  <TableHead>{t('balances.balance')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((row) => (
                  <TableRow key={row.studentId}>
                    <TableCell>{row.studentName}</TableCell>
                    <TableCell>
                      {row.invoiceCount}
                      {row.scheduleInvoiceCount > 0
                        ? ` (${t('balances.ofWhichSchedule', { count: row.scheduleInvoiceCount })})`
                        : ''}
                    </TableCell>
                    <TableCell>
                      {row.balanceCents.toLocaleString('fr-FR')} {row.currency}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
