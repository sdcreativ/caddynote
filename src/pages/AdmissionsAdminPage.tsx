import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import AdmissionPacketsConfigPanel from '@/components/admissions/AdmissionPacketsConfigPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { useStrkInstitutions } from '@/hooks/useStrkInstitutions';
import { useToast } from '@/hooks/use-toast';
import { usePromptDialog } from '@/components/ui/prompt-dialog';
import { ApiError } from '@/lib/apiClient';
import { formatCentsAmount, majorToCents, parseMajorAmountInput } from '@/lib/money';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  confirmAdmissionFee,
  enrollAdmission,
  ensureAdmissionPackets,
  fetchAdmissionPacketAdmin,
  fetchAdmissionReviewQueue,
  fetchAdmissionsQueue,
  reviewAdmissionPacketItem,
  setAdmissionFee,
  updateAdmissionStatus,
  downloadAdmissionPacketItem,
  fetchAdmissionItemVersions,
  fetchAdmissionRejectionReasons,
  type AdmissionApplication,
  type AdmissionPacket,
} from '@/services/strkAdmissionService';

const statusBadgeVariant = (
  status: string
): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' => {
  switch (status) {
    case 'enrolled':
      return 'success';
    case 'conditionally_accepted':
      return 'default';
    case 'needs_info':
      return 'warning';
    case 'rejected':
    case 'cancelled':
      return 'destructive';
    case 'submitted':
      return 'secondary';
    default:
      return 'outline';
  }
};

const AdmissionsAdminPage = () => {
  const { t } = useTranslation('admissions');
  const [searchParams, setSearchParams] = useSearchParams();
  const admissionsTab = searchParams.get('tab') === 'config' ? 'config' : 'queue';
  const setAdmissionsTab = (tab: string) => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'queue') next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  const { t: tc } = useTranslation('common');
  const { user } = useStrkAuth();
  const { institutions, loadInstitutions } = useStrkInstitutions();
  const { toast } = useToast();
  const prompt = usePromptDialog();
  const [applications, setApplications] = useState<AdmissionApplication[]>([]);
  const [status, setStatus] = useState<string>('submitted');
  const [academicYear, setAcademicYear] = useState('');
  const [level, setLevel] = useState('');
  const [applicationKind, setApplicationKind] = useState('all');
  const [pieceStatus, setPieceStatus] = useState('all');
  const [submittedFrom, setSubmittedFrom] = useState('');
  const [submittedTo, setSubmittedTo] = useState('');
  const [openPacketId, setOpenPacketId] = useState<string | null>(null);
  const [packet, setPacket] = useState<AdmissionPacket | null>(null);
  const [reviewMode, setReviewMode] = useState(false);
  const [rejectionReasons, setRejectionReasons] = useState<Array<{ id: string; code: string; label: string }>>([]);
  const [versionsByItem, setVersionsByItem] = useState<Record<string, Array<{ version: number; status: string; fileName: string | null; isCurrent: boolean }>>>({});
  const [scopedInstitutionId, setScopedInstitutionId] = useState<string>('');

  const institutionId = user?.institutionId || scopedInstitutionId || null;
  const isPlatformAdmin = user?.role === 'admin';

  useEffect(() => {
    if (user?.institutionId) {
      setScopedInstitutionId(user.institutionId);
      return;
    }
    if (isPlatformAdmin) {
      void loadInstitutions();
    }
  }, [user?.institutionId, isPlatformAdmin, loadInstitutions]);

  const load = async () => {
    if (!institutionId) return;
    try {
      await ensureAdmissionPackets().catch(() => undefined);
      if (reviewMode || pieceStatus !== 'all') {
        const { applications: list } = await fetchAdmissionReviewQueue({
          status: status === 'all' ? undefined : status,
          academicYear: academicYear || undefined,
          level: level || undefined,
          applicationKind: applicationKind === 'all' ? undefined : applicationKind,
          pieceStatus: pieceStatus === 'all' ? undefined : pieceStatus,
          submittedFrom: submittedFrom || undefined,
          submittedTo: submittedTo || undefined,
        });
        setApplications(
          list.map((a) => ({
            id: a.id,
            institutionId,
            classId: a.class?.id ?? null,
            academicYear: a.academicYear,
            applicationKind: a.applicationKind,
            level: a.level,
            status: a.status,
            studentFirstName: a.studentFirstName,
            studentLastName: a.studentLastName,
            studentBirthDate: '',
            studentGender: null,
            guardians: [],
            documents: null,
            applicationFeeCents: null,
            applicationFeePaid: false,
            decisionNotes: null,
            submittedAt: a.submittedAt,
            contactEmail: a.contactEmail,
            publicToken: '',
            createdAt: '',
          }))
        );
      } else {
        const { applications: list } = await fetchAdmissionsQueue(institutionId, {
          status: status === 'all' ? undefined : status,
          academicYear: academicYear || undefined,
          level: level || undefined,
          applicationKind: applicationKind === 'all' ? undefined : applicationKind,
          submittedFrom: submittedFrom || undefined,
          submittedTo: submittedTo || undefined,
        });
        setApplications(list);
      }
    } catch (error) {
      toast({
        title: tc('status.error'),
        description: error instanceof ApiError ? error.message : t('admin.loadError'),
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    void load();
    fetchAdmissionRejectionReasons()
      .then(({ reasons }) => setRejectionReasons(reasons))
      .catch(() => undefined);
  }, [institutionId, status, academicYear, level, applicationKind, pieceStatus, submittedFrom, submittedTo, reviewMode]);

  const togglePacket = async (id: string) => {
    if (openPacketId === id) {
      setOpenPacketId(null);
      setPacket(null);
      return;
    }
    try {
      const pkt = await fetchAdmissionPacketAdmin(id);
      setPacket(pkt);
      setOpenPacketId(id);
    } catch (error) {
      toast({
        title: tc('status.error'),
        description: error instanceof ApiError ? error.message : t('admin.packetLoadError'),
        variant: 'destructive',
      });
    }
  };

  const review = async (
    applicationId: string,
    itemId: string,
    next: string,
    extra?: { originalSeen?: boolean; rejectionReason?: string }
  ) => {
    try {
      const pkt = await reviewAdmissionPacketItem(applicationId, itemId, {
        status: next,
        rejectionReason:
          next === 'non_compliant'
            ? extra?.rejectionReason || rejectionReasons[0]?.label || t('admin.rejectReasonDefault')
            : undefined,
        originalSeen: extra?.originalSeen,
      });
      setPacket(pkt);
      toast({ title: t('admin.pieceUpdated') });
    } catch (error) {
      toast({
        title: tc('status.error'),
        description: error instanceof ApiError ? error.message : t('admin.pieceUpdateError'),
        variant: 'destructive',
      });
    }
  };

  const openDownload = async (applicationId: string, itemId: string) => {
    try {
      await downloadAdmissionPacketItem(applicationId, itemId);
    } catch (error) {
      toast({
        title: tc('status.error'),
        description: error instanceof ApiError ? error.message : t('admin.downloadError'),
        variant: 'destructive',
      });
    }
  };

  const loadVersions = async (applicationId: string, itemId: string) => {
    try {
      const { versions } = await fetchAdmissionItemVersions(applicationId, itemId);
      setVersionsByItem((prev) => ({ ...prev, [itemId]: versions }));
    } catch {
      /* ignore */
    }
  };

  const act = async (id: string, next: string) => {
    try {
      await updateAdmissionStatus(id, next);
      void load();
    } catch (error) {
      toast({
        title: tc('status.error'),
        description: error instanceof ApiError ? error.message : t('admin.transitionDenied'),
        variant: 'destructive',
      });
    }
  };

  const enroll = async (id: string) => {
    try {
      const result = await enrollAdmission(id);
      toast({
        title: t('admin.enrolledTitle'),
        description: t('admin.enrolledBody', { number: result.studentNumber ?? result.studentId ?? '—' }),
      });
      void load();
    } catch (error) {
      toast({
        title: tc('status.error'),
        description: error instanceof ApiError ? error.message : t('admin.enrollError'),
        variant: 'destructive',
      });
    }
  };

  const setFee = async (id: string) => {
    const values = await prompt({
      title: t('admin.feePrompt'),
      fields: [
        {
          name: 'amount',
          label: t('admin.feePromptLabel'),
          defaultValue: '12000',
          type: 'text',
          required: true,
        },
      ],
      confirmLabel: tc('actions.confirm'),
    });
    if (!values) return;
    const amount = parseMajorAmountInput(String(values.amount ?? ''));
    if (amount == null) {
      toast({ title: t('admin.feeInvalid'), variant: 'destructive' });
      return;
    }
    try {
      await setAdmissionFee(id, majorToCents(amount));
      toast({
        title: t('admin.feeSavedTitle'),
        description: t('admin.feeSavedBody', { amount: formatCentsAmount(majorToCents(amount), 'XOF') }),
      });
      void load();
    } catch (error) {
      toast({
        title: tc('status.error'),
        description: error instanceof ApiError ? error.message : t('admin.feeSaveError'),
        variant: 'destructive',
      });
    }
  };

  const confirmFee = async (id: string) => {
    try {
      await confirmAdmissionFee(id);
      toast({ title: t('admin.feeConfirmed') });
      void load();
    } catch (error) {
      toast({
        title: tc('status.error'),
        description: error instanceof ApiError ? error.message : t('admin.feeConfirmError'),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-w-0 space-y-6 py-4 sm:py-6">
      <h1 className="text-2xl font-bold sm:text-3xl">{t('admin.title')}</h1>

      {!institutionId ? (
        <Card>
          <CardContent className="space-y-4 py-8">
            <EmptyState title={t('admin.noInstitutionTitle')} description={t('admin.noInstitutionBody')} />
            {isPlatformAdmin && institutions.length > 0 && (
              <div className="mx-auto max-w-md space-y-2">
                <p className="text-sm font-medium">{t('admin.pickInstitution')}</p>
                <Select value={scopedInstitutionId || undefined} onValueChange={setScopedInstitutionId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('admin.pickInstitution')} />
                  </SelectTrigger>
                  <SelectContent>
                    {institutions.map((inst) => (
                      <SelectItem key={inst.id} value={inst.id}>
                        {inst.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
      <Tabs value={admissionsTab} onValueChange={setAdmissionsTab} className="min-w-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight">
              {admissionsTab === 'queue' ? t('admin.tabQueue') : t('admin.tabConfig')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {admissionsTab === 'queue' ? t('admin.tabQueueHint') : t('admin.tabConfigHint')}
            </p>
          </div>
          {admissionsTab === 'queue' ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setAdmissionsTab('config')}>
              {t('admin.openConfig')}
            </Button>
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdmissionsTab('queue')}>
              {t('admin.backToQueue')}
            </Button>
          )}
        </div>

        <TabsContent value="queue" className="min-w-0 space-y-4">
          {isPlatformAdmin && !user?.institutionId && (
            <div className="max-w-md space-y-2">
              <p className="text-sm font-medium">{t('admin.pickInstitution')}</p>
              <Select value={institutionId} onValueChange={setScopedInstitutionId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('admin.pickInstitution')} />
                </SelectTrigger>
                <SelectContent>
                  {institutions.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>
                      {inst.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="min-w-0 rounded-xl border border-slate-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">{t('admin.filters.status')}</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="submitted">{t('admin.status.submitted')}</SelectItem>
                    <SelectItem value="needs_info">{t('admin.status.needs_info')}</SelectItem>
                    <SelectItem value="conditionally_accepted">{t('admin.status.conditionally_accepted')}</SelectItem>
                    <SelectItem value="enrolled">{t('admin.status.enrolled')}</SelectItem>
                    <SelectItem value="all">{t('admin.status.all')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">{t('config.kind')}</Label>
                <Select value={applicationKind} onValueChange={setApplicationKind}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('config.kind')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('admin.status.all')}</SelectItem>
                    <SelectItem value="pre_registration">{t('config.kinds.pre_registration')}</SelectItem>
                    <SelectItem value="first_enrollment">{t('config.kinds.first_enrollment')}</SelectItem>
                    <SelectItem value="re_enrollment">{t('config.kinds.re_enrollment')}</SelectItem>
                    <SelectItem value="transfer">{t('config.kinds.transfer')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">{t('admin.pieceStatus')}</Label>
                <Select
                  value={pieceStatus}
                  onValueChange={(v) => {
                    setPieceStatus(v);
                    setReviewMode(v !== 'all');
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('admin.pieceStatus')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('admin.pieceStatusAll')}</SelectItem>
                    <SelectItem value="in_review">{t('admin.pieceStatusInReview')}</SelectItem>
                    <SelectItem value="original_pending">{t('admin.pieceStatusOriginal')}</SelectItem>
                    <SelectItem value="non_compliant">{t('admin.pieceKo')}</SelectItem>
                    <SelectItem value="unreadable">{t('admin.pieceUnreadable')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">{t('apply.academicYear')}</Label>
                <Input
                  placeholder={t('apply.academicYear')}
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">{t('config.level')}</Label>
                <Input
                  placeholder={t('config.levelPlaceholder')}
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">{t('admin.submittedFrom')}</Label>
                <Input
                  type="date"
                  value={submittedFrom}
                  onChange={(e) => setSubmittedFrom(e.target.value)}
                  aria-label={t('admin.submittedFrom')}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">{t('admin.submittedTo')}</Label>
                <Input
                  type="date"
                  value={submittedTo}
                  onChange={(e) => setSubmittedTo(e.target.value)}
                  aria-label={t('admin.submittedTo')}
                />
              </div>
            </div>
          </div>

          {applications.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">{t('admin.empty')}</CardContent>
            </Card>
          ) : (
            <ul className="space-y-3">
              {applications.map((app) => {
                const statusLabel = t(`admin.status.${app.status}`, {
                  defaultValue: app.status,
                });
                const kindLabel = app.applicationKind
                  ? t(`config.kinds.${app.applicationKind}`, { defaultValue: app.applicationKind })
                  : null;
                const feeLabel =
                  app.applicationFeeCents != null
                    ? t('admin.feeAmount', {
                        amount: formatCentsAmount(
                          app.applicationFeeCents,
                          app.applicationFeeCurrency ?? 'XOF'
                        ),
                      })
                    : null;

                return (
                  <li key={app.id}>
                    <Card className="overflow-hidden border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                      <CardHeader className="space-y-3 p-4 pb-3 sm:p-6 sm:pb-3">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <CardTitle className="text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
                                {app.studentFirstName} {app.studentLastName}
                              </CardTitle>
                              <Badge variant={statusBadgeVariant(app.status)}>{statusLabel}</Badge>
                              {app.applicationFeeCents != null ? (
                                <Badge variant={app.applicationFeePaid ? 'success' : 'warning'}>
                                  {app.applicationFeePaid ? t('admin.feePaidShort') : t('admin.feePendingShort')}
                                </Badge>
                              ) : null}
                            </div>
                            <div className="flex flex-col gap-1 text-sm text-slate-600 sm:flex-row sm:flex-wrap sm:gap-x-3 sm:gap-y-1">
                              {app.contactEmail ? (
                                <span className="min-w-0 break-all sm:truncate">{app.contactEmail}</span>
                              ) : null}
                              {kindLabel ? <span>{kindLabel}</span> : null}
                              {app.level ? <span>{app.level}</span> : null}
                              {app.academicYear ? <span>{app.academicYear}</span> : null}
                              {feeLabel ? (
                                <span className="font-medium tabular-nums text-slate-800">{feeLabel}</span>
                              ) : null}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full sm:w-auto"
                              onClick={() => void togglePacket(app.id)}
                            >
                              {openPacketId === app.id ? t('admin.hidePieces') : t('admin.showPieces')}
                            </Button>
                            {app.status !== 'enrolled' ? (
                              <Button size="sm" className="w-full sm:w-auto" onClick={() => void enroll(app.id)}>
                                {t('admin.enroll')}
                              </Button>
                            ) : null}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="col-span-2 w-full sm:col-auto sm:w-auto"
                                  aria-label={t('admin.moreActions')}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                  <span className="ml-1.5">{t('admin.moreActions')}</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuItem onClick={() => void act(app.id, 'needs_info')}>
                                  {t('admin.needsInfo')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => void act(app.id, 'conditionally_accepted')}
                                >
                                  {t('admin.accept')}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => void act(app.id, 'rejected')}>
                                  {t('admin.reject')}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => void setFee(app.id)}>
                                  {t('admin.setFee')}
                                </DropdownMenuItem>
                                {!app.applicationFeePaid ? (
                                  <DropdownMenuItem onClick={() => void confirmFee(app.id)}>
                                    {t('admin.confirmManual')}
                                  </DropdownMenuItem>
                                ) : null}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </CardHeader>

                      {openPacketId === app.id && packet ? (
                        <CardContent className="border-t border-slate-100 pt-4">
                          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                            <p className="mb-3 text-sm font-medium text-slate-700">
                              {t('apply.completeness', { percent: packet.completeness.percent })}
                              {packet.template ? ` — ${packet.template.name}` : ''}
                            </p>
                            <ul className="space-y-2">
                              {packet.items.map((item) => (
                                <li
                                  key={item.id}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm"
                                >
                                  <div>
                                    <span className="font-medium">{item.documentType.label}</span>
                                    <span className="ml-2 text-xs text-slate-500">{item.status}</span>
                                    {item.originalMode && item.originalMode !== 'digital_only' && (
                                      <span className="ml-2 text-xs text-amber-700">
                                        {t(`config.originalModes.${item.originalMode}`)}
                                      </span>
                                    )}
                                    {item.reusedFromItemId && (
                                      <span className="ml-2 text-xs text-emerald-700">{t('admin.reused')}</span>
                                    )}
                                    {item.fileName && (
                                      <span className="ml-2 text-xs text-slate-400">{item.fileName}</span>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => void openDownload(app.id, item.id)}
                                      disabled={!item.fileKey}
                                    >
                                      {t('admin.download')}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => void loadVersions(app.id, item.id)}
                                    >
                                      {t('admin.versions')}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => void review(app.id, item.id, 'compliant')}
                                    >
                                      {t('admin.pieceOk')}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        void (async () => {
                                          let reason = t('admin.rejectReasonDefault');
                                          if (rejectionReasons.length > 0) {
                                            const values = await prompt({
                                              title: t('admin.chooseRejectReason'),
                                              fields: [
                                                {
                                                  name: 'reason',
                                                  label: t('admin.chooseRejectReason'),
                                                  type: 'select',
                                                  required: true,
                                                  defaultValue: rejectionReasons[0]?.label,
                                                  options: rejectionReasons.map((r) => ({
                                                    value: r.label,
                                                    label: r.label,
                                                  })),
                                                },
                                              ],
                                            });
                                            if (!values) return;
                                            reason = values.reason;
                                          }
                                          await review(app.id, item.id, 'non_compliant', {
                                            rejectionReason: reason,
                                          });
                                        })();
                                      }}
                                    >
                                      {t('admin.pieceKo')}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => void review(app.id, item.id, 'unreadable')}
                                    >
                                      {t('admin.pieceUnreadable')}
                                    </Button>
                                    {(item.originalMode === 'copy_then_original' ||
                                      item.originalMode === 'physical_only' ||
                                      item.status === 'original_pending') && (
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() =>
                                          void review(app.id, item.id, 'finalized', {
                                            originalSeen: true,
                                          })
                                        }
                                      >
                                        {t('admin.originalSeen')}
                                      </Button>
                                    )}
                                  </div>
                                  {versionsByItem[item.id] && (
                                    <ul className="mt-1 w-full text-xs text-slate-500">
                                      {versionsByItem[item.id]!.map((v) => (
                                        <li key={`${item.id}-v${v.version}`}>
                                          v{v.version} — {v.status}
                                          {v.fileName ? ` — ${v.fileName}` : ''}
                                          {v.isCurrent ? ` (${t('admin.currentVersion')})` : ''}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </CardContent>
                      ) : null}
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="config">
          <AdmissionPacketsConfigPanel />
        </TabsContent>
      </Tabs>
      )}
    </div>
  );
};

export default AdmissionsAdminPage;
