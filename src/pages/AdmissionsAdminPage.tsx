import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AdmissionPacketsConfigPanel from '@/components/admissions/AdmissionPacketsConfigPanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { useStrkInstitutions } from '@/hooks/useStrkInstitutions';
import { useToast } from '@/hooks/use-toast';
import { usePromptDialog } from '@/components/ui/prompt-dialog';
import { ApiError } from '@/lib/apiClient';
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

const AdmissionsAdminPage = () => {
  const { t } = useTranslation('admissions');
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
          label: t('admin.feePrompt'),
          defaultValue: '5000',
          type: 'number',
          required: true,
        },
      ],
      confirmLabel: tc('actions.confirm'),
    });
    if (!values) return;
    const amount = Number(values.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      toast({ title: t('admin.feeInvalid'), variant: 'destructive' });
      return;
    }
    try {
      await setAdmissionFee(id, Math.round(amount * 100));
      toast({ title: t('admin.feeSavedTitle'), description: t('admin.feeSavedBody', { amount }) });
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
    <div className="space-y-6 py-6">
      <h1 className="text-3xl font-bold">{t('admin.title')}</h1>

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
      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="queue">{t('admin.tabQueue')}</TabsTrigger>
          <TabsTrigger value="config">{t('admin.tabConfig')}</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="space-y-4">
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
          <div className="flex flex-wrap items-end gap-3">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[200px]">
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
            <Select value={applicationKind} onValueChange={setApplicationKind}>
              <SelectTrigger className="w-[200px]">
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
            <Select value={pieceStatus} onValueChange={(v) => { setPieceStatus(v); setReviewMode(v !== 'all'); }}>
              <SelectTrigger className="w-[200px]">
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
            <Input
              className="w-[140px]"
              placeholder={t('apply.academicYear')}
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
            />
            <Input
              className="w-[140px]"
              placeholder={t('config.level')}
              value={level}
              onChange={(e) => setLevel(e.target.value)}
            />
            <Input
              type="date"
              className="w-[160px]"
              value={submittedFrom}
              onChange={(e) => setSubmittedFrom(e.target.value)}
              aria-label={t('admin.submittedFrom')}
            />
            <Input
              type="date"
              className="w-[160px]"
              value={submittedTo}
              onChange={(e) => setSubmittedTo(e.target.value)}
              aria-label={t('admin.submittedTo')}
            />
          </div>

          {applications.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">{t('admin.empty')}</CardContent>
            </Card>
          ) : (
            applications.map((app) => (
              <Card key={app.id}>
                <CardHeader>
                  <CardTitle className="text-lg">
                    {app.studentFirstName} {app.studentLastName}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {app.status} — {app.contactEmail}
                      {app.applicationKind ? ` · ${app.applicationKind}` : ''}
                      {app.level ? ` · ${app.level}` : ''}
                      {app.academicYear ? ` · ${app.academicYear}` : ''}
                    </span>
                    {app.applicationFeeCents != null && (
                      <span className="text-sm text-muted-foreground">
                        {t('admin.feeAmount', {
                          amount: (app.applicationFeeCents / 100).toFixed(0),
                          currency: app.applicationFeeCurrency ?? 'XOF',
                        })}
                        {app.applicationFeePaid ? t('admin.feePaid') : t('admin.feePending')}
                      </span>
                    )}
                    <Button size="sm" variant="outline" onClick={() => void togglePacket(app.id)}>
                      {openPacketId === app.id ? t('admin.hidePieces') : t('admin.showPieces')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void act(app.id, 'needs_info')}>
                      {t('admin.needsInfo')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void act(app.id, 'conditionally_accepted')}
                    >
                      {t('admin.accept')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void act(app.id, 'rejected')}>
                      {t('admin.reject')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void setFee(app.id)}>
                      {t('admin.setFee')}
                    </Button>
                    {!app.applicationFeePaid && (
                      <Button size="sm" variant="outline" onClick={() => void confirmFee(app.id)}>
                        {t('admin.confirmManual')}
                      </Button>
                    )}
                    <Button size="sm" onClick={() => void enroll(app.id)}>
                      {t('admin.enroll')}
                    </Button>
                  </div>

                  {openPacketId === app.id && packet && (
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
                                    void review(app.id, item.id, 'finalized', { originalSeen: true })
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
                  )}
                </CardContent>
              </Card>
            ))
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
