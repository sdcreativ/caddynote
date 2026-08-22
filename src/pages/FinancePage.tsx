import { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Receipt, Plus, Trash2, Wallet, RotateCcw } from 'lucide-react';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { useToast } from '@/hooks/use-toast';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { fetchStrkUsersByInstitution } from '@/services/strkUserService';
import {
  fetchFeeItems,
  createFeeItem,
  fetchInvoicesByInstitution,
  createInvoice,
  recordManualPayment,
  initiateCinetPayPayment,
  initiateStripePayment,
  cancelInvoice,
  fetchLateFeeSettings,
  updateLateFeeSettings,
  fetchPaymentPlans,
  createPaymentPlan,
  cancelPaymentPlan,
  type StrkFeeItem,
  type StrkInvoice,
  type InvoiceLineInput,
  type StrkPaymentPlan,
} from '@/services/strkFinanceService';
import { refundPayment } from '@/services/strkBankService';
import { BankReconciliationPanel } from '@/components/finance/BankReconciliationPanel';
import { trackProductEvent } from '@/lib/productTelemetry';
import { ApiError } from '@/lib/apiClient';
import { generatePaymentReceipt, generateInvoiceDocument, downloadDocument } from '@/services/strkDocumentService';

/**
 * FIN-002/003 — le module finance était construit et testé côté serveur
 * (catalogue de frais, factures avec remises, paiements virement/espèces)
 * sans aucune interface : `POST /finance/invoices` n'était appelé nulle
 * part. Cette page relie enfin l'écran à l'API existante.
 */

const formatAmount = (cents: number, currency: string) => `${(cents / 100).toLocaleString('fr-FR')} ${currency}`;

const statusVariant = (status: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (status === 'paid') return 'secondary';
  if (status === 'overdue' || status === 'cancelled') return 'destructive';
  return 'outline';
};

const FinancePage = () => {
  const { t } = useTranslation('finance');
  const { t: tc } = useTranslation('common');
  const { user } = useStrkAuth();
  const { toast } = useToast();
  const confirm = useConfirmDialog();

  const statusLabel = (code: string) => t(`status.${code}`, { defaultValue: code });

  const [feeItems, setFeeItems] = useState<StrkFeeItem[]>([]);
  const [invoices, setInvoices] = useState<StrkInvoice[]>([]);
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [featureDisabled, setFeatureDisabled] = useState(false);

  const [showCreateFee, setShowCreateFee] = useState(false);
  const [newFee, setNewFee] = useState({ name: '', amount: '' });

  const [showCreateInvoice, setShowCreateInvoice] = useState(false);
  const [invoiceStudentId, setInvoiceStudentId] = useState('');
  const [invoiceDueDate, setInvoiceDueDate] = useState('');
  const [invoiceLines, setInvoiceLines] = useState<InvoiceLineInput[]>([]);

  const [selectedInvoice, setSelectedInvoice] = useState<StrkInvoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer'>('cash');

  // FIN-002 : pénalité de retard — désactivée tant que le montant n'est pas
  // explicitement renseigné (chaîne vide ↔ null, pas 0 par défaut).
  const [lateFeeAmount, setLateFeeAmount] = useState('');
  const [paymentPlans, setPaymentPlans] = useState<StrkPaymentPlan[]>([]);
  const [showCreatePlan, setShowCreatePlan] = useState(false);
  const [planStudentId, setPlanStudentId] = useState('');
  const [planLabel, setPlanLabel] = useState('');
  const [planInstallments, setPlanInstallments] = useState<{ dueDate: string; amount: string; label: string }[]>([
    { dueDate: '', amount: '', label: t('plans.installmentDefault', { count: 1 }) },
    { dueDate: '', amount: '', label: t('plans.installmentDefault', { count: 2 }) },
  ]);
  const [lateFeeGraceDays, setLateFeeGraceDays] = useState('7');

  const loadData = useCallback(async () => {
    if (!user?.institutionId) return;
    setIsLoading(true);
    setLoadError(null);
    setFeatureDisabled(false);
    try {
      const [fees, invs, users, lateFeeSettings, plans] = await Promise.all([
        fetchFeeItems(user.institutionId),
        fetchInvoicesByInstitution(user.institutionId),
        fetchStrkUsersByInstitution(user.institutionId),
        fetchLateFeeSettings(user.institutionId),
        fetchPaymentPlans().catch(() => [] as StrkPaymentPlan[]),
      ]);
      setFeeItems(fees);
      setInvoices(invs);
      setPaymentPlans(plans);
      setStudents(users.filter((u) => u.role === 'student').map((u) => ({ id: u.id, name: u.name || t('invoices.student') })));
      setLateFeeAmount(lateFeeSettings.late_fee_cents ? String(lateFeeSettings.late_fee_cents / 100) : '');
      setLateFeeGraceDays(String(lateFeeSettings.late_fee_grace_days));
    } catch (error) {
      if (error instanceof ApiError && error.status === 403 && error.code === 'feature_disabled') {
        setFeatureDisabled(true);
        setLoadError(null);
      } else {
        setLoadError(error instanceof ApiError ? error.message : t('toasts.loadError'));
      }
    } finally {
      setIsLoading(false);
    }
  }, [user?.institutionId, t]);

  useEffect(() => {
    trackProductEvent('finance', 'Ouverture finance');
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateFee = async () => {
    const amount = parseFloat(newFee.amount);
    if (!newFee.name || !amount) return;
    const created = await createFeeItem({ name: newFee.name, amount_cents: Math.round(amount * 100) });
    if (created) {
      toast({ title: t('toasts.feeCreated'), description: t('toasts.feeCreatedBody', { name: created.name }) });
      setShowCreateFee(false);
      setNewFee({ name: '', amount: '' });
      loadData();
    } else {
      toast({ title: tc('status.error'), description: t('toasts.feeCreateError'), variant: 'destructive' });
    }
  };

  const addFeeLine = (feeItem: StrkFeeItem) => {
    setInvoiceLines((prev) => [...prev, { fee_item_id: feeItem.id, label: feeItem.name, quantity: 1, line_type: 'fee' }]);
  };

  const addDiscountLine = () => {
    setInvoiceLines((prev) => [...prev, { label: '', amount_cents: 0, quantity: 1, line_type: 'discount' }]);
  };

  const updateLine = (index: number, patch: Partial<InvoiceLineInput>) => {
    setInvoiceLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const removeLine = (index: number) => {
    setInvoiceLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreateInvoice = async () => {
    if (!invoiceStudentId || invoiceLines.length === 0) {
      toast({ title: t('toasts.formIncomplete'), description: t('toasts.formIncompleteBody'), variant: 'destructive' });
      return;
    }
    const created = await createInvoice({
      student_id: invoiceStudentId,
      due_date: invoiceDueDate || undefined,
      lines: invoiceLines,
    });
    if (created) {
      toast({ title: t('toasts.invoiceCreated'), description: t('toasts.invoiceCreatedBody', { number: created.invoice_number, amount: formatAmount(created.total_cents, created.currency) }) });
      setShowCreateInvoice(false);
      setInvoiceStudentId('');
      setInvoiceDueDate('');
      setInvoiceLines([]);
      loadData();
    } else {
      toast({ title: tc('status.error'), description: t('toasts.invoiceCreateError'), variant: 'destructive' });
    }
  };

  const handleRecordPayment = async () => {
    if (!selectedInvoice) return;
    const amount = parseFloat(paymentAmount);
    if (!amount) return;
    const ok = await recordManualPayment(selectedInvoice.id, Math.round(amount * 100), paymentMethod);
    if (ok) {
      toast({ title: t('toasts.paymentRecorded') });
      setPaymentAmount('');
      setSelectedInvoice(null);
      loadData();
    } else {
      toast({ title: tc('status.error'), description: t('toasts.paymentError'), variant: 'destructive' });
    }
  };

  // FIN-003 : redirige vers le fournisseur — messages d'erreur explicites
  // (ex. "pas encore configuré sur cette instance") plutôt que génériques,
  // puisque ces providers sont volontairement dégradés (501) sans clés API.
  const handleOnlinePayment = async (kind: 'cinetpay' | 'stripe') => {
    if (!selectedInvoice) return;
    try {
      const url = kind === 'cinetpay'
        ? await initiateCinetPayPayment(selectedInvoice.id)
        : await initiateStripePayment(selectedInvoice.id);
      window.location.href = url;
    } catch (error) {
      toast({
        title: t('toasts.onlinePaymentUnavailable'),
        description: error instanceof ApiError ? error.message : t('toasts.onlinePaymentError'),
        variant: 'destructive',
      });
    }
  };

  // DOC-001 : un reçu de paiement est un document versionné/vérifiable par
  // QR — distinct du simple affichage du paiement dans la facture.
  const handleGenerateReceipt = async (paymentId: string) => {
    const doc = await generatePaymentReceipt(paymentId);
    if (!doc) {
      toast({ title: tc('status.error'), description: t('toasts.receiptError'), variant: 'destructive' });
      return;
    }
    try {
      await downloadDocument(doc.id, `recu-v${doc.version}.pdf`);
    } catch (error) {
      toast({ title: t('toasts.receiptGenerated'), description: t('toasts.receiptDownloadFailed') });
    }
  };

  const handleCancelInvoice = async (invoiceId: string) => {
    const ok = await confirm({
      description: t('invoices.cancelConfirm'),
      variant: 'destructive',
    });
    if (!ok) return;
    if (await cancelInvoice(invoiceId)) {
      toast({ title: t('toasts.invoiceCancelled') });
      setSelectedInvoice(null);
      loadData();
    }
  };

  const handleSaveLateFeeSettings = async () => {
    if (!user?.institutionId) return;
    const amount = lateFeeAmount ? Math.round(parseFloat(lateFeeAmount) * 100) : null;
    const ok = await updateLateFeeSettings(user.institutionId, {
      late_fee_cents: amount,
      late_fee_grace_days: parseInt(lateFeeGraceDays) || 7,
    });
    if (ok) {
      toast({
        title: t('toasts.lateFeeSaved'),
        description: amount ? t('toasts.lateFeeEnabled') : t('toasts.lateFeeDisabled'),
      });
    } else {
      toast({ title: tc('status.error'), description: t('toasts.lateFeeSaveError'), variant: 'destructive' });
    }
  };

  if (user && !user.institutionId) {
    return <Navigate to="/dashboard" replace />;
  }

  if (featureDisabled) {
    return (
      <div className="space-y-6 py-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
        </div>
        <EmptyState title={t('featureDisabledTitle')} description={t('featureDisabledBody')} />
      </div>
    );
  }

  return (
    <div className="space-y-6 py-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
      </div>

      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices">{t('tabs.invoices')}</TabsTrigger>
          <TabsTrigger value="plans">{t('tabs.plans')}</TabsTrigger>
          <TabsTrigger value="fees">{t('tabs.fees')}</TabsTrigger>
          <TabsTrigger value="bank">{t('tabs.bank')}</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowCreateInvoice(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t('invoices.new')}
            </Button>
          </div>
          <Card>
            <CardContent className="pt-6">
              {isLoading ? (
                <LoadingState label={t('invoices.loading')} />
              ) : loadError ? (
                <ErrorState description={loadError} onRetry={() => void loadData()} />
              ) : invoices.length === 0 ? (
                <EmptyState
                  title={t('invoices.emptyTitle')}
                  description={t('invoices.emptyDescription')}
                  actionLabel={t('invoices.new')}
                  onAction={() => setShowCreateInvoice(true)}
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
                          <Button variant="ghost" size="sm" onClick={() => setSelectedInvoice(inv)}>
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
        </TabsContent>

        <TabsContent value="plans" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowCreatePlan(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t('plans.new')}
            </Button>
          </div>
          <Card>
            <CardContent className="pt-6 space-y-4">
              {paymentPlans.length === 0 ? (
                <EmptyState title={t('plans.emptyTitle')} description={t('plans.emptyDescription')} />
              ) : (
                paymentPlans.map((plan) => (
                  <div key={plan.id} className="rounded-md border p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">{plan.label}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatAmount(plan.totalCents, plan.currency)} — {plan.status}
                          {plan.academicYear ? ` — ${plan.academicYear}` : ''}
                        </p>
                      </div>
                      {plan.status !== 'cancelled' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            const ok = await cancelPaymentPlan(plan.id);
                            if (ok) {
                              toast({ title: t('toasts.planCancelled') });
                              loadData();
                            } else {
                              toast({ title: t('toasts.planCancelImpossible'), variant: 'destructive' });
                            }
                          }}
                        >
                          {tc('actions.cancel')}
                        </Button>
                      )}
                    </div>
                    <ul className="text-sm space-y-1">
                      {(plan.invoices || []).map((inv) => (
                        <li key={inv.id}>
                          {t('plans.installmentLine', {
                            index: inv.installmentIndex ?? '?',
                            number: inv.invoiceNumber,
                            amount: formatAmount(inv.totalCents, plan.currency),
                            due: inv.dueDate
                              ? t('plans.dueDateSuffix', { date: new Date(inv.dueDate).toLocaleDateString('fr-FR') })
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
        </TabsContent>

        <TabsContent value="fees" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowCreateFee(true)}>
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
                  {feeItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center text-muted-foreground py-8">
                        {t('fees.empty')}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('lateFees.title')}</CardTitle>
              <CardDescription>
                {t('lateFees.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('lateFees.amountLabel')}</Label>
                  <Input
                    type="number"
                    placeholder={t('lateFees.amountPlaceholder')}
                    value={lateFeeAmount}
                    onChange={(e) => setLateFeeAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('lateFees.graceDays')}</Label>
                  <Input
                    type="number"
                    min="1"
                    value={lateFeeGraceDays}
                    onChange={(e) => setLateFeeGraceDays(e.target.value)}
                  />
                </div>
              </div>
              <Button onClick={handleSaveLateFeeSettings}>{tc('actions.save')}</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bank" className="space-y-4">
          {user?.institutionId ? (
            <BankReconciliationPanel institutionId={user.institutionId} />
          ) : (
            <p className="text-sm text-muted-foreground">{t('reconciliation.institutionRequired')}</p>
          )}
        </TabsContent>
      </Tabs>

      {/* Nouveau frais */}
      <Dialog open={showCreateFee} onOpenChange={setShowCreateFee}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('fees.new')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t('fees.name')}</Label>
              <Input value={newFee.name} onChange={(e) => setNewFee({ ...newFee, name: e.target.value })} placeholder={t('fees.namePlaceholder')} />
            </div>
            <div className="space-y-2">
              <Label>{t('fees.amountWithCurrency', { currency: user?.institutionId ? 'XOF' : '' })}</Label>
              <Input type="number" value={newFee.amount} onChange={(e) => setNewFee({ ...newFee, amount: e.target.value })} placeholder={t('fees.amountPlaceholder')} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreateFee}>{tc('actions.create')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nouvelle facture */}
      <Dialog open={showCreateInvoice} onOpenChange={setShowCreateInvoice}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{t('invoices.new')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('invoices.student')}</Label>
                <Select value={invoiceStudentId} onValueChange={setInvoiceStudentId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('invoices.studentPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('invoices.dueDateOptional')}</Label>
                <Input type="date" value={invoiceDueDate} onChange={(e) => setInvoiceDueDate(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('invoices.lines')}</Label>
              <div className="space-y-2">
                {invoiceLines.map((line, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {line.line_type === 'discount' ? (
                      <>
                        <Input
                          placeholder={t('invoices.discountReason')}
                          value={line.label}
                          onChange={(e) => updateLine(i, { label: e.target.value })}
                          className="flex-1"
                        />
                        <Input
                          type="number"
                          placeholder={t('invoices.amountPlaceholder')}
                          value={line.amount_cents ? line.amount_cents / 100 : ''}
                          onChange={(e) => updateLine(i, { amount_cents: Math.round(parseFloat(e.target.value || '0') * 100) })}
                          className="w-32"
                        />
                        <Badge variant="secondary">{t('invoices.discount')}</Badge>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm">{line.quantity > 1 ? t('invoices.lineWithQuantity', { label: line.label, count: line.quantity }) : line.label}</span>
                        <Input
                          type="number"
                          min="1"
                          value={line.quantity}
                          onChange={(e) => updateLine(i, { quantity: parseInt(e.target.value) || 1 })}
                          className="w-20"
                        />
                      </>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => removeLine(i)} aria-label={t('invoices.removeLine')}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-2">
                <Select onValueChange={(feeId) => { const fee = feeItems.find((f) => f.id === feeId); if (fee) addFeeLine(fee); }}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder={t('invoices.addFromCatalog')} />
                  </SelectTrigger>
                  <SelectContent>
                    {feeItems.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.name} ({formatAmount(f.amount_cents, f.currency)})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={addDiscountLine}>
                  <Plus className="mr-1 h-3 w-3" />
                  {t('invoices.addDiscount')}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreateInvoice}>{t('invoices.create')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Détail facture */}
      <Dialog open={!!selectedInvoice} onOpenChange={(open) => !open && setSelectedInvoice(null)}>
        <DialogContent className="sm:max-w-[500px]">
          {selectedInvoice && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5" />
                  {selectedInvoice.invoice_number}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <p className="text-sm text-muted-foreground">{selectedInvoice.student.name}</p>
                  <Badge variant={statusVariant(selectedInvoice.status)}>{statusLabel(selectedInvoice.status)}</Badge>
                </div>

                <div className="space-y-1">
                  {selectedInvoice.lines.map((l) => (
                    <div key={l.id} className="flex justify-between text-sm">
                      <span>{l.quantity > 1 ? t('invoices.lineWithQuantity', { label: l.label, count: l.quantity }) : l.label}</span>
                      <span className={l.line_type === 'discount' ? 'text-green-600' : ''}>
                        {l.line_type === 'discount' ? '- ' : ''}{formatAmount(l.amount_cents * l.quantity, selectedInvoice.currency)}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between font-medium pt-2 border-t">
                    <span>{t('invoices.total')}</span>
                    <span>{formatAmount(selectedInvoice.total_cents, selectedInvoice.currency)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>{t('invoices.paid')}</span>
                    <span>{formatAmount(selectedInvoice.paid_cents, selectedInvoice.currency)}</span>
                  </div>
                </div>

                {selectedInvoice.payments.length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t('invoices.payments')}</Label>
                    {selectedInvoice.payments.map((p) => (
                      <div key={p.id} className="flex justify-between items-center text-sm">
                        <span>{p.method === 'cash' ? t('invoices.methodCash') : p.method}</span>
                        <span>{formatAmount(p.amount_cents, selectedInvoice.currency)}</span>
                        {p.status === 'paid' && (
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => handleGenerateReceipt(p.id)}>
                              {t('invoices.generateReceipt')}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                try {
                                  await refundPayment(p.id, p.amount_cents, t('invoices.manualRefundReason'));
                                  toast({ title: t('toasts.refundRecorded') });
                                  await loadData();
                                } catch (e) {
                                  toast({
                                    title: t('toasts.refundImpossible'),
                                    description: e instanceof ApiError ? e.message : tc('status.error'),
                                    variant: 'destructive',
                                  });
                                }
                              }}
                            >
                              <RotateCcw className="mr-1 h-3.5 w-3.5" />
                              {t('invoices.refund')}
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {selectedInvoice.status !== 'paid' && selectedInvoice.status !== 'cancelled' && (
                  <div className="space-y-2 pt-2 border-t">
                    <Label className="flex items-center gap-1"><Wallet className="h-4 w-4" /> {t('invoices.recordPayment')}</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder={t('invoices.amountPlaceholder')}
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                      />
                      <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as 'cash' | 'bank_transfer')}>
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cash">{t('invoices.methodCash')}</SelectItem>
                          <SelectItem value="bank_transfer">{t('invoices.methodTransfer')}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button onClick={handleRecordPayment}>{tc('actions.save')}</Button>
                    </div>
                    {/* FIN-003 : Mobile Money/carte — dégradés proprement
                        (message explicite) si le fournisseur n'a pas de clé
                        API configurée sur cette instance. */}
                    <div className="flex gap-2 pt-1">
                      <Button variant="outline" size="sm" onClick={() => handleOnlinePayment('cinetpay')}>
                        {t('invoices.payMobileMoney')}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleOnlinePayment('stripe')}>
                        {t('invoices.payCard')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                {selectedInvoice.status !== 'cancelled' && (
                  <>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        const doc = await generateInvoiceDocument(selectedInvoice.id);
                        if (doc) {
                          toast({ title: t('toasts.pdfGenerated') });
                          await downloadDocument(doc.id, `facture-${selectedInvoice.invoice_number}.pdf`);
                        } else {
                          toast({ title: tc('status.error'), description: t('toasts.pdfError'), variant: 'destructive' });
                        }
                      }}
                    >
                      {t('invoices.pdf')}
                    </Button>
                    <Button variant="destructive" onClick={() => handleCancelInvoice(selectedInvoice.id)}>
                      {t('invoices.cancelInvoice')}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showCreatePlan} onOpenChange={setShowCreatePlan}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{t('plans.createTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>{t('invoices.student')}</Label>
              <Select value={planStudentId} onValueChange={setPlanStudentId}>
                <SelectTrigger><SelectValue placeholder={t('invoices.student')} /></SelectTrigger>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t('plans.label')}</Label>
              <Input value={planLabel} onChange={(e) => setPlanLabel(e.target.value)} placeholder={t('plans.labelPlaceholder')} />
            </div>
            {planInstallments.map((inst, idx) => (
              <div key={idx} className="grid grid-cols-3 gap-2">
                <Input
                  type="date"
                  value={inst.dueDate}
                  onChange={(e) =>
                    setPlanInstallments((prev) => prev.map((p, i) => (i === idx ? { ...p, dueDate: e.target.value } : p)))
                  }
                />
                <Input
                  type="number"
                  placeholder={t('invoices.amountPlaceholder')}
                  value={inst.amount}
                  onChange={(e) =>
                    setPlanInstallments((prev) => prev.map((p, i) => (i === idx ? { ...p, amount: e.target.value } : p)))
                  }
                />
                <Input
                  value={inst.label}
                  onChange={(e) =>
                    setPlanInstallments((prev) => prev.map((p, i) => (i === idx ? { ...p, label: e.target.value } : p)))
                  }
                />
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setPlanInstallments((prev) => [...prev, { dueDate: '', amount: '', label: t('plans.installmentDefault', { count: prev.length + 1 }) }])
              }
            >
              {t('plans.addInstallment')}
            </Button>
          </div>
          <DialogFooter>
            <Button
              onClick={async () => {
                if (!planStudentId || !planLabel.trim()) return;
                const installments = planInstallments
                  .filter((i) => i.dueDate && Number(i.amount) > 0)
                  .map((i) => ({
                    dueDate: i.dueDate,
                    amountCents: Math.round(Number(i.amount) * 100),
                    label: i.label || undefined,
                  }));
                if (installments.length === 0) {
                  toast({ title: t('toasts.planNeedInstallment'), variant: 'destructive' });
                  return;
                }
                const plan = await createPaymentPlan({
                  studentId: planStudentId,
                  label: planLabel.trim(),
                  installments,
                });
                if (plan) {
                  toast({ title: t('toasts.planCreated'), description: t('toasts.planCreatedBody', { count: installments.length }) });
                  setShowCreatePlan(false);
                  setPlanLabel('');
                  setPlanStudentId('');
                  loadData();
                } else {
                  toast({ title: tc('status.error'), description: t('toasts.planCreateError'), variant: 'destructive' });
                }
              }}
            >
              {tc('actions.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FinancePage;
