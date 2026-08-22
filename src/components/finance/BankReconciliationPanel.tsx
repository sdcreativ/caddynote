import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Landmark, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  getBankSummary,
  importBankStatement,
  autoMatchBankLine,
  ignoreBankLine,
  type BankSummary,
} from '@/services/strkBankService';
import { ApiError } from '@/lib/apiClient';

/** FIN-007 — rapprochement bancaire branché sur l’API existante. */
export function BankReconciliationPanel({ institutionId }: { institutionId: string }) {
  const { t } = useTranslation('finance');
  const { t: tc } = useTranslation('common');
  const { toast } = useToast();
  const [summary, setSummary] = useState<BankSummary | null>(null);
  const [csv, setCsv] = useState('date,amount,label\n2026-08-01,150000,Frais scolarité Dupont\n');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSummary(await getBankSummary(institutionId));
    } catch (e) {
      toast({
        title: t('toasts.loadImpossible'),
        description: e instanceof ApiError ? e.message : tc('status.error'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [institutionId, toast, t, tc]);

  useEffect(() => {
    void load();
  }, [load]);

  const onImport = async () => {
    try {
      const lines = csv
        .trim()
        .split('\n')
        .slice(1)
        .map((row) => {
          const [date, amount, label] = row.split(',').map((s) => s.trim());
          const euros = Number(amount);
          return {
            date,
            amountCents: Math.round(euros * (Math.abs(euros) < 10000 ? 100 : 1)),
            label: label || t('reconciliation.defaultLineLabel'),
          };
        })
        .filter((l) => l.date && !Number.isNaN(l.amountCents));
      const res = await importBankStatement(institutionId, lines);
      toast({
        title: t('toasts.importDone'),
        description: t('toasts.importDoneBody', { imported: res.imported, autoMatched: res.autoMatched }),
      });
      await load();
    } catch (e) {
      toast({
        title: t('toasts.importFailed'),
        description: e instanceof ApiError ? e.message : tc('status.error'),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <Landmark className="h-4 w-4" /> {t('reconciliation.title')}
          </h3>
          <p className="text-sm text-muted-foreground">{t('reconciliation.subtitle')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {t('reconciliation.refresh')}
        </Button>
      </div>

      {summary && (
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge variant="outline">{t('reconciliation.unmatched', { count: summary.counts.unmatched })}</Badge>
          <Badge variant="secondary">{t('reconciliation.matched', { count: summary.counts.matched })}</Badge>
          <Badge variant="outline">{t('reconciliation.ignored', { count: summary.counts.ignored })}</Badge>
          <Badge variant="outline">{t('reconciliation.orphanPayments', { count: summary.unreconciledPayments.length })}</Badge>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('reconciliation.importTitle')}</CardTitle>
          <CardDescription>{t('reconciliation.importDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea rows={5} value={csv} onChange={(e) => setCsv(e.target.value)} className="font-mono text-xs" />
          <Button onClick={() => void onImport()}>{tc('actions.import')}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('reconciliation.unmatchedLines')}</CardTitle>
        </CardHeader>
        <CardContent>
          {!summary?.unmatchedLines?.length ? (
            <p className="text-sm text-muted-foreground">{t('reconciliation.nonePending')}</p>
          ) : (
            <ul className="divide-y text-sm">
              {summary.unmatchedLines.map((line) => (
                <li key={line.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">{line.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(line.date).toLocaleDateString('fr-FR')} · {(line.amountCents / 100).toLocaleString('fr-FR')}{' '}
                      {line.currency}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          const r = await autoMatchBankLine(line.id);
                          toast({
                            title: r.matched ? t('toasts.matchOk') : t('toasts.noUniqueCandidate'),
                          });
                          await load();
                        } catch (e) {
                          toast({
                            title: t('toasts.failure'),
                            description: e instanceof ApiError ? e.message : tc('status.error'),
                            variant: 'destructive',
                          });
                        }
                      }}
                    >
                      {t('reconciliation.autoMatch')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await ignoreBankLine(line.id);
                        await load();
                      }}
                    >
                      {t('reconciliation.ignore')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
