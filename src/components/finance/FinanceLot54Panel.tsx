import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { ApiError } from '@/lib/apiClient';
import {
  applyCreditNoteApi,
  applySponsorshipApi,
  createCreditNoteApi,
  createSponsorshipApi,
  fetchCreditNotes,
  fetchSponsorships,
  recordManualMultiPayment,
  type StrkCreditNote,
  type StrkInvoice,
  type StrkSponsorship,
} from '@/services/strkFinanceService';

const formatAmount = (cents: number, currency: string) =>
  `${(cents / 100).toLocaleString('fr-FR')} ${currency}`;

type Props = {
  invoices: StrkInvoice[];
  students: { id: string; name: string }[];
  onChanged: () => void;
};

/**
 * Lot 5.4 — encaissement multi-factures, avoirs, parrainages (staff).
 */
export function FinanceLot54Panel({ invoices, students, onChanged }: Props) {
  const { t } = useTranslation('finance');
  const { t: tc } = useTranslation('common');
  const { toast } = useToast();

  const openInvoices = useMemo(
    () =>
      invoices.filter((i) => {
        const remaining = i.total_cents - i.paid_cents - (i.credit_applied_cents || 0);
        return remaining > 0 && i.status !== 'cancelled' && i.status !== 'paid';
      }),
    [invoices]
  );

  const [method, setMethod] = useState<'cash' | 'bank_transfer'>('cash');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const [creditNotes, setCreditNotes] = useState<StrkCreditNote[]>([]);
  const [sponsorships, setSponsorships] = useState<StrkSponsorship[]>([]);
  const [cnStudentId, setCnStudentId] = useState('');
  const [cnAmount, setCnAmount] = useState('');
  const [cnReason, setCnReason] = useState('');
  const [cnApplyId, setCnApplyId] = useState('');
  const [cnApplyInvoiceId, setCnApplyInvoiceId] = useState('');
  const [cnApplyAmount, setCnApplyAmount] = useState('');

  const [spStudentId, setSpStudentId] = useState('');
  const [spName, setSpName] = useState('');
  const [spAmount, setSpAmount] = useState('');
  const [spApplyId, setSpApplyId] = useState('');
  const [spApplyInvoiceId, setSpApplyInvoiceId] = useState('');
  const [spApplyAmount, setSpApplyAmount] = useState('');

  const reloadExtras = useCallback(async () => {
    try {
      const [notes, sps] = await Promise.all([fetchCreditNotes(), fetchSponsorships()]);
      setCreditNotes(notes);
      setSponsorships(sps);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void reloadExtras();
  }, [reloadExtras]);

  const handleMultiPay = async () => {
    const allocations = Object.entries(amounts)
      .map(([invoiceId, raw]) => ({
        invoiceId,
        amountCents: Math.round(parseFloat(raw || '0') * 100),
      }))
      .filter((a) => a.amountCents > 0);
    if (allocations.length === 0) {
      toast({ title: tc('status.error'), description: t('lot54.multiNeedAmount'), variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      await recordManualMultiPayment({ method, allocations });
      toast({ title: t('toasts.paymentRecorded') });
      setAmounts({});
      onChanged();
    } catch (error) {
      toast({
        title: tc('status.error'),
        description: error instanceof ApiError ? error.message : t('toasts.paymentError'),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateCredit = async () => {
    const amountCents = Math.round(parseFloat(cnAmount || '0') * 100);
    if (!cnStudentId || amountCents <= 0) return;
    try {
      await createCreditNoteApi({ studentId: cnStudentId, amountCents, reason: cnReason || undefined });
      toast({ title: t('lot54.creditCreated') });
      setCnAmount('');
      setCnReason('');
      await reloadExtras();
    } catch (error) {
      toast({
        title: tc('status.error'),
        description: error instanceof ApiError ? error.message : t('lot54.creditError'),
        variant: 'destructive',
      });
    }
  };

  const handleApplyCredit = async () => {
    const amountCents = Math.round(parseFloat(cnApplyAmount || '0') * 100);
    if (!cnApplyId || !cnApplyInvoiceId || amountCents <= 0) return;
    try {
      await applyCreditNoteApi(cnApplyId, cnApplyInvoiceId, amountCents);
      toast({ title: t('lot54.creditApplied') });
      setCnApplyAmount('');
      await reloadExtras();
      onChanged();
    } catch (error) {
      toast({
        title: tc('status.error'),
        description: error instanceof ApiError ? error.message : t('lot54.creditError'),
        variant: 'destructive',
      });
    }
  };

  const handleCreateSponsorship = async () => {
    const amountCents = Math.round(parseFloat(spAmount || '0') * 100);
    if (!spStudentId || !spName.trim() || amountCents <= 0) return;
    try {
      await createSponsorshipApi({
        studentId: spStudentId,
        sponsorName: spName.trim(),
        amountCents,
      });
      toast({ title: t('lot54.sponsorshipCreated') });
      setSpName('');
      setSpAmount('');
      await reloadExtras();
    } catch (error) {
      toast({
        title: tc('status.error'),
        description: error instanceof ApiError ? error.message : t('lot54.sponsorshipError'),
        variant: 'destructive',
      });
    }
  };

  const handleApplySponsorship = async () => {
    const amountCents = Math.round(parseFloat(spApplyAmount || '0') * 100);
    if (!spApplyId || !spApplyInvoiceId || amountCents <= 0) return;
    try {
      await applySponsorshipApi(spApplyId, spApplyInvoiceId, amountCents);
      toast({ title: t('lot54.sponsorshipApplied') });
      setSpApplyAmount('');
      await reloadExtras();
      onChanged();
    } catch (error) {
      toast({
        title: tc('status.error'),
        description: error instanceof ApiError ? error.message : t('lot54.sponsorshipError'),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('lot54.multiTitle')}</CardTitle>
          <CardDescription>{t('lot54.multiDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs space-y-2">
            <Label>{t('invoices.recordPayment')}</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as 'cash' | 'bank_transfer')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">{t('invoices.methodCash')}</SelectItem>
                <SelectItem value="bank_transfer">{t('invoices.methodTransfer')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('invoices.number')}</TableHead>
                <TableHead>{t('invoices.student')}</TableHead>
                <TableHead>{t('lot54.remaining')}</TableHead>
                <TableHead>{t('lot54.allocate')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {openInvoices.map((inv) => {
                const remaining = inv.total_cents - inv.paid_cents - (inv.credit_applied_cents || 0);
                return (
                  <TableRow key={inv.id}>
                    <TableCell>{inv.invoice_number}</TableCell>
                    <TableCell>{inv.student.name}</TableCell>
                    <TableCell>{formatAmount(remaining, inv.currency)}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        className="w-32"
                        placeholder="0"
                        value={amounts[inv.id] || ''}
                        onChange={(e) => setAmounts((prev) => ({ ...prev, [inv.id]: e.target.value }))}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
              {openInvoices.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                    {t('lot54.noOpenInvoices')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <Button onClick={() => void handleMultiPay()} disabled={submitting || openInvoices.length === 0}>
            {t('lot54.multiSubmit')}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('lot54.creditTitle')}</CardTitle>
            <CardDescription>{t('lot54.creditDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t('invoices.student')}</Label>
              <Select value={cnStudentId} onValueChange={setCnStudentId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('invoices.studentPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                placeholder={t('fees.amountPlaceholder')}
                value={cnAmount}
                onChange={(e) => setCnAmount(e.target.value)}
              />
              <Input
                placeholder={t('lot54.reasonPlaceholder')}
                value={cnReason}
                onChange={(e) => setCnReason(e.target.value)}
              />
            </div>
            <Button onClick={() => void handleCreateCredit()}>{t('lot54.creditCreate')}</Button>

            <ul className="text-sm space-y-1 border-t pt-3">
              {creditNotes.slice(0, 8).map((n) => (
                <li key={n.id}>
                  {formatAmount(n.remainingCents, n.currency)} / {formatAmount(n.amountCents, n.currency)} — {n.status}
                </li>
              ))}
              {creditNotes.length === 0 && (
                <li className="text-muted-foreground">{t('lot54.creditEmpty')}</li>
              )}
            </ul>

            <div className="space-y-2 border-t pt-3">
              <Label>{t('lot54.applyCredit')}</Label>
              <Select value={cnApplyId} onValueChange={setCnApplyId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('lot54.pickCredit')} />
                </SelectTrigger>
                <SelectContent>
                  {creditNotes
                    .filter((n) => n.status === 'open' && n.remainingCents > 0)
                    .map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {formatAmount(n.remainingCents, n.currency)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Select value={cnApplyInvoiceId} onValueChange={setCnApplyInvoiceId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('lot54.pickInvoice')} />
                </SelectTrigger>
                <SelectContent>
                  {openInvoices.map((inv) => (
                    <SelectItem key={inv.id} value={inv.id}>
                      {inv.invoice_number} — {inv.student.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                placeholder={t('fees.amountPlaceholder')}
                value={cnApplyAmount}
                onChange={(e) => setCnApplyAmount(e.target.value)}
              />
              <Button variant="secondary" onClick={() => void handleApplyCredit()}>
                {t('lot54.apply')}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('lot54.sponsorshipTitle')}</CardTitle>
            <CardDescription>{t('lot54.sponsorshipDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t('invoices.student')}</Label>
              <Select value={spStudentId} onValueChange={setSpStudentId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('invoices.studentPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input
              placeholder={t('lot54.sponsorNamePlaceholder')}
              value={spName}
              onChange={(e) => setSpName(e.target.value)}
            />
            <Input
              type="number"
              placeholder={t('fees.amountPlaceholder')}
              value={spAmount}
              onChange={(e) => setSpAmount(e.target.value)}
            />
            <Button onClick={() => void handleCreateSponsorship()}>{t('lot54.sponsorshipCreate')}</Button>

            <ul className="text-sm space-y-1 border-t pt-3">
              {sponsorships.slice(0, 8).map((s) => (
                <li key={s.id}>
                  {s.sponsorName} — {formatAmount(s.remainingCents, s.currency)} /{' '}
                  {formatAmount(s.amountCents, s.currency)}
                </li>
              ))}
              {sponsorships.length === 0 && (
                <li className="text-muted-foreground">{t('lot54.sponsorshipEmpty')}</li>
              )}
            </ul>

            <div className="space-y-2 border-t pt-3">
              <Label>{t('lot54.applySponsorship')}</Label>
              <Select value={spApplyId} onValueChange={setSpApplyId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('lot54.pickSponsorship')} />
                </SelectTrigger>
                <SelectContent>
                  {sponsorships
                    .filter((s) => s.status === 'active' && s.remainingCents > 0)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.sponsorName} ({formatAmount(s.remainingCents, s.currency)})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Select value={spApplyInvoiceId} onValueChange={setSpApplyInvoiceId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('lot54.pickInvoice')} />
                </SelectTrigger>
                <SelectContent>
                  {openInvoices.map((inv) => (
                    <SelectItem key={inv.id} value={inv.id}>
                      {inv.invoice_number} — {inv.student.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                placeholder={t('fees.amountPlaceholder')}
                value={spApplyAmount}
                onChange={(e) => setSpApplyAmount(e.target.value)}
              />
              <Button variant="secondary" onClick={() => void handleApplySponsorship()}>
                {t('lot54.apply')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
