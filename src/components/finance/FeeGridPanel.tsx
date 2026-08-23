import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, RefreshCw, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { useToast } from '@/hooks/use-toast';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { ApiError } from '@/lib/apiClient';
import type { StrkUserRole } from '@/types/strk';
import {
  fetchFeeTypes,
  createCustomFeeType,
  fetchFeeSchedules,
  createFeeSchedule,
  replaceFeeScheduleItems,
  validateFeeSchedule,
  publishFeeSchedule,
  archiveFeeSchedule,
  reviseFeeSchedule,
  generateInvoiceFromSchedule,
  fetchFeePlanTemplates,
  createFeePlanTemplate,
  deactivateFeePlanTemplate,
  fetchNationalFees,
  type StrkFeeType,
  type StrkFeeSchedule,
  type StrkFeePlanTemplate,
  type StrkNationalFeeVersion,
  type FeeScheduleItemInput,
} from '@/services/strkFinanceService';

/** Montants grille / national : entiers FCFA (pas de /100, alignés API Lot 1–2). */
const formatFcfa = (amount: number) => `${amount.toLocaleString('fr-FR')} FCFA`;

const CYCLES = ['PRESCHOOL', 'PRIMARY', 'COLLEGE', 'LYCEE'] as const;

type DraftItem = {
  feeTypeCode: string;
  cycleCode: string;
  feeOrigin: 'state' | 'institution';
  amount: string;
  isMandatory: boolean;
};

type Props = {
  students: { id: string; name: string }[];
  userRole: StrkUserRole;
  onInvoiceCreated?: () => void;
};

const canPublishRole = (role: StrkUserRole) => role === 'admin' || role === 'school_admin';

export function FeeGridPanel({ students, userRole, onInvoiceCreated }: Props) {
  const { t } = useTranslation('finance');
  const { t: tc } = useTranslation('common');
  const { toast } = useToast();
  const confirm = useConfirmDialog();
  const canPublish = canPublishRole(userRole);

  const [loading, setLoading] = useState(true);
  const [feeTypes, setFeeTypes] = useState<StrkFeeType[]>([]);
  const [schedules, setSchedules] = useState<StrkFeeSchedule[]>([]);
  const [templates, setTemplates] = useState<StrkFeePlanTemplate[]>([]);
  const [national, setNational] = useState<StrkNationalFeeVersion | null>(null);
  const [nationalYear, setNationalYear] = useState('2026-2027');

  const [showCreateSchedule, setShowCreateSchedule] = useState(false);
  const [scheduleName, setScheduleName] = useState('');
  const [scheduleYear, setScheduleYear] = useState('2026-2027');
  const [draftItems, setDraftItems] = useState<DraftItem[]>([
    {
      feeTypeCode: 'STATE_REGISTRATION',
      cycleCode: 'COLLEGE',
      feeOrigin: 'state',
      amount: '3000',
      isMandatory: true,
    },
    {
      feeTypeCode: 'ANNUAL_TUITION',
      cycleCode: 'COLLEGE',
      feeOrigin: 'institution',
      amount: '240000',
      isMandatory: true,
    },
  ]);

  const [preview, setPreview] = useState<StrkFeeSchedule | null>(null);
  const [editItemsOpen, setEditItemsOpen] = useState(false);
  const [editItems, setEditItems] = useState<DraftItem[]>([]);

  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceScheduleId, setInvoiceScheduleId] = useState<string | null>(null);
  const [invoiceStudentId, setInvoiceStudentId] = useState('');
  const [invoiceCycle, setInvoiceCycle] = useState('COLLEGE');
  const [invoiceIncludeCanteen, setInvoiceIncludeCanteen] = useState(false);

  const [showCreateType, setShowCreateType] = useState(false);
  const [newType, setNewType] = useState({ code: '', label: '', category: 'misc' });

  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateSteps, setTemplateSteps] = useState([
    { label: 'T1', percent: '34', dueOffsetDays: '0' },
    { label: 'T2', percent: '33', dueOffsetDays: '90' },
    { label: 'T3', percent: '33', dueOffsetDays: '180' },
  ]);

  const scheduleStatusLabel = (status: string) =>
    t(`grid.status.${status}`, { defaultValue: status });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [types, scheds, tmpls] = await Promise.all([
        fetchFeeTypes(),
        fetchFeeSchedules(),
        fetchFeePlanTemplates().catch(() => [] as StrkFeePlanTemplate[]),
      ]);
      setFeeTypes(types);
      setSchedules(scheds);
      setTemplates(tmpls);
    } catch (e) {
      toast({
        title: t('toasts.loadImpossible'),
        description: e instanceof ApiError ? e.message : tc('status.error'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast, t, tc]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadNational = useCallback(async () => {
    try {
      setNational(await fetchNationalFees(nationalYear));
    } catch (e) {
      setNational(null);
      toast({
        title: t('toasts.loadImpossible'),
        description: e instanceof ApiError ? e.message : tc('status.error'),
        variant: 'destructive',
      });
    }
  }, [nationalYear, toast, t, tc]);

  const platformTypes = useMemo(
    () => feeTypes.filter((ft) => ft.institutionId == null),
    [feeTypes]
  );
  const customTypes = useMemo(
    () => feeTypes.filter((ft) => ft.institutionId != null),
    [feeTypes]
  );

  const toInputs = (items: DraftItem[]): FeeScheduleItemInput[] =>
    items
      .filter((i) => i.feeTypeCode && i.amount !== '')
      .map((i) => ({
        feeTypeCode: i.feeTypeCode,
        cycleCode: i.cycleCode || null,
        feeOrigin: i.feeOrigin,
        amountCents: Math.round(Number(i.amount)),
        isMandatory: i.isMandatory,
        currency: 'XOF',
      }))
      .filter((i) => Number.isInteger(i.amountCents) && i.amountCents >= 0);

  const fromScheduleItems = (schedule: StrkFeeSchedule): DraftItem[] =>
    schedule.items.map((i) => ({
      feeTypeCode: i.feeTypeCode,
      cycleCode: i.cycleCode || 'COLLEGE',
      feeOrigin: i.feeOrigin === 'state' ? 'state' : 'institution',
      amount: String(i.amountCents),
      isMandatory: i.isMandatory,
    }));

  const handleCreateSchedule = async () => {
    const items = toInputs(draftItems);
    if (!scheduleName.trim() || items.length === 0) {
      toast({ title: t('toasts.formIncomplete'), variant: 'destructive' });
      return;
    }
    try {
      await createFeeSchedule({
        name: scheduleName.trim(),
        academicYear: scheduleYear,
        items,
      });
      toast({ title: t('grid.toasts.scheduleCreated') });
      setShowCreateSchedule(false);
      setScheduleName('');
      await load();
    } catch (e) {
      toast({
        title: t('grid.toasts.scheduleCreateError'),
        description: e instanceof ApiError ? e.message : tc('status.error'),
        variant: 'destructive',
      });
    }
  };

  const handleSaveItems = async () => {
    if (!preview) return;
    try {
      const updated = await replaceFeeScheduleItems(preview.id, toInputs(editItems));
      setPreview(updated);
      setEditItemsOpen(false);
      toast({ title: t('grid.toasts.itemsUpdated') });
      await load();
    } catch (e) {
      toast({
        title: t('grid.toasts.itemsUpdateError'),
        description: e instanceof ApiError ? e.message : tc('status.error'),
        variant: 'destructive',
      });
    }
  };

  const runAction = async (
    action: () => Promise<StrkFeeSchedule>,
    successKey: string
  ) => {
    try {
      const updated = await action();
      setPreview(updated);
      toast({ title: t(successKey) });
      await load();
    } catch (e) {
      toast({
        title: tc('status.error'),
        description: e instanceof ApiError ? e.message : String(e),
        variant: 'destructive',
      });
    }
  };

  const handlePublish = async (schedule: StrkFeeSchedule) => {
    const ok = await confirm({
      title: t('grid.publishConfirmTitle'),
      description: t('grid.publishConfirmBody', { name: schedule.name }),
    });
    if (!ok) return;
    await runAction(
      () => publishFeeSchedule(schedule.id, `ui-publish-${schedule.id}-${Date.now()}`),
      'grid.toasts.published'
    );
  };

  const handleGenerateInvoice = async () => {
    if (!invoiceScheduleId || !invoiceStudentId) {
      toast({ title: t('toasts.formIncomplete'), variant: 'destructive' });
      return;
    }
    try {
      const invoice = await generateInvoiceFromSchedule(
        invoiceScheduleId,
        {
          studentId: invoiceStudentId,
          cycleCode: invoiceCycle,
          optionalFeeTypeCodes: invoiceIncludeCanteen ? ['CANTEEN'] : [],
        },
        `ui-inv-${invoiceScheduleId}-${invoiceStudentId}-${Date.now()}`
      );
      toast({
        title: t('toasts.invoiceCreated'),
        description: t('toasts.invoiceCreatedBody', {
          number: invoice.invoice_number,
          amount: formatFcfa(invoice.total_cents),
        }),
      });
      setInvoiceOpen(false);
      onInvoiceCreated?.();
    } catch (e) {
      toast({
        title: t('toasts.invoiceCreateError'),
        description: e instanceof ApiError ? e.message : tc('status.error'),
        variant: 'destructive',
      });
    }
  };

  const renderItemEditor = (
    items: DraftItem[],
    setItems: (items: DraftItem[]) => void
  ) => (
    <div className="space-y-3">
      {items.map((item, idx) => (
        <div key={idx} className="grid gap-2 rounded-md border p-3 md:grid-cols-5">
          <div className="md:col-span-2">
            <Label>{t('grid.feeType')}</Label>
            <Select
              value={item.feeTypeCode}
              onValueChange={(v) => {
                const next = [...items];
                next[idx] = { ...item, feeTypeCode: v };
                setItems(next);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {feeTypes.map((ft) => (
                  <SelectItem key={ft.id} value={ft.code}>
                    {ft.code} — {ft.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t('grid.cycle')}</Label>
            <Select
              value={item.cycleCode}
              onValueChange={(v) => {
                const next = [...items];
                next[idx] = { ...item, cycleCode: v };
                setItems(next);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CYCLES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {t(`grid.cycles.${c}`, { defaultValue: c })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t('grid.origin')}</Label>
            <Select
              value={item.feeOrigin}
              onValueChange={(v: 'state' | 'institution') => {
                const next = [...items];
                next[idx] = { ...item, feeOrigin: v };
                setItems(next);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="state">{t('grid.originState')}</SelectItem>
                <SelectItem value="institution">{t('grid.originInstitution')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t('grid.amountFcfa')}</Label>
            <Input
              value={item.amount}
              onChange={(e) => {
                const next = [...items];
                next[idx] = { ...item, amount: e.target.value };
                setItems(next);
              }}
            />
          </div>
          <div className="flex items-end gap-2 md:col-span-5">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={item.isMandatory}
                onCheckedChange={(v) => {
                  const next = [...items];
                  next[idx] = { ...item, isMandatory: Boolean(v) };
                  setItems(next);
                }}
              />
              {t('grid.mandatory')}
            </label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setItems(items.filter((_, i) => i !== idx))}
            >
              {t('invoices.removeLine')}
            </Button>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          setItems([
            ...items,
            {
              feeTypeCode: platformTypes[0]?.code || 'OTHER_FEE',
              cycleCode: 'COLLEGE',
              feeOrigin: 'institution',
              amount: '',
              isMandatory: true,
            },
          ])
        }
      >
        <Plus className="mr-2 h-4 w-4" />
        {t('grid.addItem')}
      </Button>
    </div>
  );

  if (loading) {
    return <LoadingState label={t('grid.loading')} />;
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="schedules">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="schedules">{t('grid.tabs.schedules')}</TabsTrigger>
          <TabsTrigger value="types">{t('grid.tabs.types')}</TabsTrigger>
          <TabsTrigger value="templates">{t('grid.tabs.templates')}</TabsTrigger>
          <TabsTrigger value="national">{t('grid.tabs.national')}</TabsTrigger>
        </TabsList>

        <TabsContent value="schedules" className="space-y-4">
          <div className="flex justify-between gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {t('reconciliation.refresh')}
            </Button>
            <Button onClick={() => setShowCreateSchedule(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t('grid.newSchedule')}
            </Button>
          </div>
          <Card>
            <CardContent className="pt-6">
              {schedules.length === 0 ? (
                <EmptyState
                  title={t('grid.emptySchedulesTitle')}
                  description={t('grid.emptySchedulesBody')}
                  actionLabel={t('grid.newSchedule')}
                  onAction={() => setShowCreateSchedule(true)}
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('grid.name')}</TableHead>
                      <TableHead>{t('grid.year')}</TableHead>
                      <TableHead>{t('grid.version')}</TableHead>
                      <TableHead>{t('invoices.status')}</TableHead>
                      <TableHead>{t('invoices.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schedules.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{s.name}</TableCell>
                        <TableCell>{s.academicYear}</TableCell>
                        <TableCell>v{s.version}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{scheduleStatusLabel(s.status)}</Badge>
                        </TableCell>
                        <TableCell className="space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setPreview(s)}
                          >
                            <Eye className="mr-1 h-3 w-3" />
                            {t('grid.preview')}
                          </Button>
                          {s.status === 'published' && (
                            <Button
                              size="sm"
                              onClick={() => {
                                setInvoiceScheduleId(s.id);
                                setInvoiceStudentId(students[0]?.id || '');
                                setInvoiceOpen(true);
                              }}
                            >
                              {t('grid.generateInvoice')}
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
        </TabsContent>

        <TabsContent value="types" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowCreateType(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t('grid.newType')}
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>{t('grid.platformCatalog')}</CardTitle>
              <CardDescription>{t('grid.platformCatalogHint')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('grid.code')}</TableHead>
                    <TableHead>{t('fees.name')}</TableHead>
                    <TableHead>{t('grid.category')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {platformTypes.map((ft) => (
                    <TableRow key={ft.id}>
                      <TableCell className="font-mono text-sm">{ft.code}</TableCell>
                      <TableCell>{ft.label}</TableCell>
                      <TableCell>{ft.category}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('grid.customTypes')}</CardTitle>
            </CardHeader>
            <CardContent>
              {customTypes.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('grid.noCustomTypes')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('grid.code')}</TableHead>
                      <TableHead>{t('fees.name')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customTypes.map((ft) => (
                      <TableRow key={ft.id}>
                        <TableCell className="font-mono text-sm">{ft.code}</TableCell>
                        <TableCell>{ft.label}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowCreateTemplate(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t('grid.newTemplate')}
            </Button>
          </div>
          <Card>
            <CardContent className="pt-6">
              {templates.length === 0 ? (
                <EmptyState
                  title={t('grid.emptyTemplatesTitle')}
                  description={t('grid.emptyTemplatesBody')}
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('grid.name')}</TableHead>
                      <TableHead>{t('grid.steps')}</TableHead>
                      <TableHead>{t('invoices.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templates.map((tpl) => (
                      <TableRow key={tpl.id}>
                        <TableCell>{tpl.name}</TableCell>
                        <TableCell>
                          {tpl.steps.map((s) => `${s.label} ${s.percent ?? 0}%`).join(' · ')}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              const ok = await confirm({
                                title: t('grid.deactivateTemplateTitle'),
                                description: tpl.name,
                              });
                              if (!ok) return;
                              await deactivateFeePlanTemplate(tpl.id);
                              toast({ title: t('grid.toasts.templateDeactivated') });
                              await load();
                            }}
                          >
                            {t('grid.deactivate')}
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

        <TabsContent value="national" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('grid.nationalTitle')}</CardTitle>
              <CardDescription>{t('grid.nationalHint')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <Label>{t('grid.year')}</Label>
                  <Input value={nationalYear} onChange={(e) => setNationalYear(e.target.value)} />
                </div>
                <Button onClick={() => void loadNational()}>{t('grid.loadNational')}</Button>
              </div>
              {national && (
                <>
                  <p className="text-sm text-muted-foreground">
                    {t('grid.nationalMeta', {
                      managedBy: national.managedBy,
                      version: national.version,
                      source: national.source || '—',
                    })}
                  </p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('grid.cycle')}</TableHead>
                        <TableHead>{t('grid.sector')}</TableHead>
                        <TableHead>{t('grid.code')}</TableHead>
                        <TableHead>{t('fees.amount')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {national.rates.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell>{r.cycleCode}</TableCell>
                          <TableCell>{r.fundingSector}</TableCell>
                          <TableCell className="font-mono text-sm">{r.feeTypeCode}</TableCell>
                          <TableCell>{formatFcfa(r.amountCents)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Création grille */}
      <Dialog open={showCreateSchedule} onOpenChange={setShowCreateSchedule}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('grid.newSchedule')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>{t('grid.name')}</Label>
                <Input value={scheduleName} onChange={(e) => setScheduleName(e.target.value)} />
              </div>
              <div>
                <Label>{t('grid.year')}</Label>
                <Input value={scheduleYear} onChange={(e) => setScheduleYear(e.target.value)} />
              </div>
            </div>
            {renderItemEditor(draftItems, setDraftItems)}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateSchedule(false)}>
              {tc('actions.cancel')}
            </Button>
            <Button onClick={() => void handleCreateSchedule()}>{tc('actions.create')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Prévisualisation / actions */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {preview?.name}{' '}
              <Badge variant="outline" className="ml-2">
                {preview ? scheduleStatusLabel(preview.status) : ''}
              </Badge>
            </DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {preview.academicYear} · v{preview.version} · {preview.currency}
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('grid.code')}</TableHead>
                    <TableHead>{t('grid.cycle')}</TableHead>
                    <TableHead>{t('grid.origin')}</TableHead>
                    <TableHead>{t('fees.amount')}</TableHead>
                    <TableHead>{t('grid.mandatory')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-sm">{item.feeTypeCode}</TableCell>
                      <TableCell>{item.cycleCode || '—'}</TableCell>
                      <TableCell>
                        {item.feeOrigin === 'state'
                          ? t('grid.originState')
                          : t('grid.originInstitution')}
                      </TableCell>
                      <TableCell>{formatFcfa(item.amountCents)}</TableCell>
                      <TableCell>{item.isMandatory ? tc('actions.yes') : tc('actions.no')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex flex-wrap gap-2">
                {preview.status === 'draft' && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditItems(fromScheduleItems(preview));
                        setEditItemsOpen(true);
                      }}
                    >
                      {t('grid.editDraft')}
                    </Button>
                    <Button
                      onClick={() =>
                        void runAction(() => validateFeeSchedule(preview.id), 'grid.toasts.validated')
                      }
                    >
                      {t('grid.validate')}
                    </Button>
                  </>
                )}
                {preview.status === 'validated' && canPublish && (
                  <Button onClick={() => void handlePublish(preview)}>{t('grid.publish')}</Button>
                )}
                {preview.status === 'validated' && !canPublish && (
                  <p className="text-sm text-muted-foreground">{t('grid.publishDirectionOnly')}</p>
                )}
                {(preview.status === 'published' || preview.status === 'archived') && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      void runAction(() => reviseFeeSchedule(preview.id), 'grid.toasts.revised')
                    }
                  >
                    {t('grid.revise')}
                  </Button>
                )}
                {preview.status === 'published' && (
                  <>
                    <Button
                      onClick={() => {
                        setInvoiceScheduleId(preview.id);
                        setInvoiceStudentId(students[0]?.id || '');
                        setInvoiceOpen(true);
                      }}
                    >
                      {t('grid.generateInvoice')}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={async () => {
                        const ok = await confirm({
                          title: t('grid.archiveConfirmTitle'),
                          description: preview.name,
                        });
                        if (!ok) return;
                        await runAction(() => archiveFeeSchedule(preview.id), 'grid.toasts.archived');
                      }}
                    >
                      {t('grid.archive')}
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editItemsOpen} onOpenChange={setEditItemsOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('grid.editDraft')}</DialogTitle>
          </DialogHeader>
          {renderItemEditor(editItems, setEditItems)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItemsOpen(false)}>
              {tc('actions.cancel')}
            </Button>
            <Button onClick={() => void handleSaveItems()}>{tc('actions.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={invoiceOpen} onOpenChange={setInvoiceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('grid.generateInvoice')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t('invoices.student')}</Label>
              <Select value={invoiceStudentId} onValueChange={setInvoiceStudentId}>
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
            <div>
              <Label>{t('grid.cycle')}</Label>
              <Select value={invoiceCycle} onValueChange={setInvoiceCycle}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CYCLES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {t(`grid.cycles.${c}`, { defaultValue: c })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={invoiceIncludeCanteen}
                onCheckedChange={(v) => setInvoiceIncludeCanteen(Boolean(v))}
              />
              {t('grid.includeCanteen')}
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvoiceOpen(false)}>
              {tc('actions.cancel')}
            </Button>
            <Button onClick={() => void handleGenerateInvoice()}>{t('grid.generateInvoice')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateType} onOpenChange={setShowCreateType}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('grid.newType')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t('grid.code')}</Label>
              <Input
                value={newType.code}
                onChange={(e) => setNewType({ ...newType, code: e.target.value.toUpperCase() })}
                placeholder="CUSTOM_FEE"
              />
            </div>
            <div>
              <Label>{t('fees.name')}</Label>
              <Input
                value={newType.label}
                onChange={(e) => setNewType({ ...newType, label: e.target.value })}
              />
            </div>
            <div>
              <Label>{t('grid.category')}</Label>
              <Input
                value={newType.category}
                onChange={(e) => setNewType({ ...newType, category: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateType(false)}>
              {tc('actions.cancel')}
            </Button>
            <Button
              onClick={async () => {
                try {
                  await createCustomFeeType(newType);
                  toast({ title: t('grid.toasts.typeCreated') });
                  setShowCreateType(false);
                  setNewType({ code: '', label: '', category: 'misc' });
                  await load();
                } catch (e) {
                  toast({
                    title: tc('status.error'),
                    description: e instanceof ApiError ? e.message : String(e),
                    variant: 'destructive',
                  });
                }
              }}
            >
              {tc('actions.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateTemplate} onOpenChange={setShowCreateTemplate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('grid.newTemplate')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t('grid.name')}</Label>
              <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
            </div>
            {templateSteps.map((st, idx) => (
              <div key={idx} className="grid grid-cols-3 gap-2">
                <Input
                  value={st.label}
                  onChange={(e) => {
                    const next = [...templateSteps];
                    next[idx] = { ...st, label: e.target.value };
                    setTemplateSteps(next);
                  }}
                  placeholder={t('grid.stepLabel')}
                />
                <Input
                  value={st.percent}
                  onChange={(e) => {
                    const next = [...templateSteps];
                    next[idx] = { ...st, percent: e.target.value };
                    setTemplateSteps(next);
                  }}
                  placeholder="%"
                />
                <Input
                  value={st.dueOffsetDays}
                  onChange={(e) => {
                    const next = [...templateSteps];
                    next[idx] = { ...st, dueOffsetDays: e.target.value };
                    setTemplateSteps(next);
                  }}
                  placeholder={t('grid.dueOffsetDays')}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateTemplate(false)}>
              {tc('actions.cancel')}
            </Button>
            <Button
              onClick={async () => {
                try {
                  await createFeePlanTemplate({
                    name: templateName,
                    steps: templateSteps.map((s) => ({
                      label: s.label,
                      percent: Math.round(Number(s.percent)),
                      dueOffsetDays: Math.round(Number(s.dueOffsetDays)) || 0,
                    })),
                  });
                  toast({ title: t('grid.toasts.templateCreated') });
                  setShowCreateTemplate(false);
                  setTemplateName('');
                  await load();
                } catch (e) {
                  toast({
                    title: tc('status.error'),
                    description: e instanceof ApiError ? e.message : String(e),
                    variant: 'destructive',
                  });
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
}
