import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Check, CheckCircle2, Circle, Clock3, Loader2, School } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FadeIn } from '@/components/public/FadeIn';
import { PublicShell } from '@/components/public/PublicShell';
import { useToast } from '@/hooks/use-toast';
import { ApiError } from '@/lib/apiClient';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/utils';
import {
  attachAdmissionPacketItem,
  createAdmission,
  fetchAdmissionByToken,
  fetchAdmissionCampuses,
  fetchAdmissionClasses,
  fetchAdmissionInstitutions,
  fetchAdmissionPacket,
  initiateAdmissionFeeCinetPay,
  initiateAdmissionFeeStripe,
  submitAdmission,
  type AdmissionApplication,
  type AdmissionClass,
  type AdmissionGuardianInput,
  type AdmissionInstitution,
  type AdmissionPacket,
} from '@/services/strkAdmissionService';

const BLUE = BRAND.blue;
const NAVY = BRAND.navy;
const ADMISSION_DRAFT_KEY = 'caddynote.admission.apply.draft.v1';

type AdmissionDraftV1 = {
  v: 1;
  step: number;
  institutionId: string;
  classId: string;
  academicYear: string;
  applicationKind: 'pre_registration' | 'first_enrollment' | 're_enrollment' | 'transfer';
  level: string;
  foreignStudent: boolean;
  assignedStudent: boolean;
  scholarshipStudent: boolean;
  campus: string;
  campusId: string;
  studentFirstName: string;
  studentLastName: string;
  studentBirthDate: string;
  studentGender: string;
  guardian: AdmissionGuardianInput;
  token?: string;
  applicationId?: string;
};

const currentAcademicYear = () => {
  const year = new Date().getFullYear();
  const month = new Date().getMonth();
  return month >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
};

function AdmissionStepper({
  steps,
  current,
  progressLabel,
}: {
  steps: string[];
  current: number;
  progressLabel: string;
}) {
  const pct = Math.round(((current + 1) / steps.length) * 100);

  return (
    <div className="space-y-4">
      <div
        className="h-1.5 overflow-hidden rounded-full bg-slate-200/80"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={progressLabel}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%`, backgroundColor: BLUE }}
        />
      </div>

      <ol className="flex items-center gap-0 sm:gap-1" aria-hidden>
        {steps.map((label, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={label} className="flex min-w-0 flex-1 items-center">
              <span
                title={label}
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors sm:h-9 sm:w-9 sm:text-sm',
                  done && 'bg-emerald-600 text-white',
                  active && 'text-white shadow-sm ring-4 ring-[#1D70D8]/20',
                  !done && !active && 'bg-slate-100 text-slate-400'
                )}
                style={active ? { backgroundColor: NAVY } : undefined}
              >
                {done ? <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={2.5} /> : i + 1}
              </span>
              {i < steps.length - 1 && (
                <span
                  className={cn(
                    'mx-0.5 h-0.5 min-w-[4px] flex-1 rounded-full sm:mx-1',
                    i < current ? 'bg-emerald-500' : 'bg-slate-200'
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function AdmissionConfirmation({
  token,
  applicationId,
  contactEmail,
  followEmailSent,
}: {
  token: string;
  applicationId: string;
  contactEmail: string;
  followEmailSent: boolean | null;
}) {
  const { t } = useTranslation('admissions');
  const { toast } = useToast();
  const [application, setApplication] = useState<AdmissionApplication | null>(null);
  const [paying, setPaying] = useState(false);
  const [showLink, setShowLink] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetchAdmissionByToken(token)
      .then(({ application: app }) => setApplication(app))
      .catch(() => setApplication(null));
  }, [token]);

  const payCinetPay = async () => {
    setPaying(true);
    try {
      const { paymentUrl } = await initiateAdmissionFeeCinetPay(token);
      window.location.href = paymentUrl;
    } catch {
      toast({
        title: t('confirm.payUnavailable'),
        description: t('confirm.payMobileHint'),
        variant: 'destructive',
      });
      setPaying(false);
    }
  };

  const payStripe = async () => {
    setPaying(true);
    try {
      const { url } = await initiateAdmissionFeeStripe(token);
      if (url) window.location.href = url;
    } catch {
      toast({
        title: t('confirm.payUnavailable'),
        description: t('confirm.payCardHint'),
        variant: 'destructive',
      });
      setPaying(false);
    }
  };

  const followUrl = `${window.location.origin}/admissions/suivi/${token}`;
  const feeDue =
    application &&
    application.applicationFeeCents != null &&
    application.applicationFeeCents > 0 &&
    !application.applicationFeePaid;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-950">
        <p className="font-semibold">{t('confirm.submitted')}</p>
        <p className="mt-1 text-emerald-900/90">
          {followEmailSent === false
            ? t('confirm.emailFallback', { email: contactEmail })
            : t('confirm.emailSent', { email: contactEmail })}
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button asChild className="bg-[#1D70D8] text-white hover:bg-[#1660bc]">
          <Link to={`/admissions/suivi/${token}`}>{t('confirm.openFollow')}</Link>
        </Button>
        <Button type="button" variant="outline" onClick={() => setShowLink((v) => !v)}>
          {showLink ? t('confirm.hideLink') : t('confirm.showLink')}
        </Button>
      </div>

      {showLink && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{t('confirm.followLink')}</p>
          <code className="block break-all rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800">
            {followUrl}
          </code>
          <p className="mt-2 text-xs text-slate-500">{t('confirm.internalRef', { id: applicationId })}</p>
        </div>
      )}

      {feeDue && (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-700">
            <strong>{t('confirm.feeLabel')}</strong> {(application.applicationFeeCents! / 100).toFixed(2)}{' '}
            {application.applicationFeeCurrency ?? 'XOF'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={paying}
              onClick={() => void payCinetPay()}
              className="bg-[#1D70D8] text-white hover:bg-[#1660bc]"
            >
              {t('confirm.payMobile')}
            </Button>
            <Button size="sm" variant="outline" disabled={paying} onClick={() => void payStripe()}>
              {t('confirm.payCard')}
            </Button>
          </div>
        </div>
      )}
      {application?.applicationFeePaid && (
        <p className="text-sm font-medium text-emerald-700">{t('confirm.feePaid')}</p>
      )}
      {!feeDue && !application?.applicationFeePaid && (
        <p className="text-sm text-slate-500">{t('confirm.feeLater')}</p>
      )}
    </div>
  );
}

const primaryBtn =
  'bg-[#1D70D8] text-white shadow-sm hover:bg-[#1660bc] focus-visible:ring-[#1D70D8] disabled:bg-slate-300 disabled:text-slate-500';

const AdmissionApplyPage = () => {
  const { t } = useTranslation('admissions');
  const { t: tc } = useTranslation('common');
  const { toast } = useToast();
  const navigate = useNavigate();
  const steps = t('apply.steps', { returnObjects: true }) as string[];
  const [step, setStep] = useState(0);
  const [institutions, setInstitutions] = useState<AdmissionInstitution[]>([]);
  const [classes, setClasses] = useState<AdmissionClass[]>([]);
  const [institutionId, setInstitutionId] = useState('');
  const [classId, setClassId] = useState('');
  const [academicYear, setAcademicYear] = useState(currentAcademicYear());
  const [applicationKind, setApplicationKind] = useState<
    'pre_registration' | 'first_enrollment' | 're_enrollment' | 'transfer'
  >('pre_registration');
  const [level, setLevel] = useState('');
  const [foreignStudent, setForeignStudent] = useState(false);
  const [assignedStudent, setAssignedStudent] = useState(false);
  const [scholarshipStudent, setScholarshipStudent] = useState(false);
  const [campus, setCampus] = useState('');
  const [campusId, setCampusId] = useState('');
  const [campuses, setCampuses] = useState<Array<{ id: string; name: string }>>([]);
  const [studentFirstName, setStudentFirstName] = useState('');
  const [studentLastName, setStudentLastName] = useState('');
  const [studentBirthDate, setStudentBirthDate] = useState('');
  const [studentGender, setStudentGender] = useState('');
  const [guardian, setGuardian] = useState<AdmissionGuardianInput>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    relationship: 'tutor',
  });
  const [token, setToken] = useState('');
  const [applicationId, setApplicationId] = useState('');
  const [followEmailSent, setFollowEmailSent] = useState<boolean | null>(null);
  const [packet, setPacket] = useState<AdmissionPacket | null>(null);
  const [busy, setBusy] = useState(false);
  const [storageMode, setStorageMode] = useState<'s3' | 'local' | null>(null);
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const [draftHydrated, setDraftHydrated] = useState(false);

  useEffect(() => {
    fetchAdmissionInstitutions()
      .then(({ institutions: list }) => setInstitutions(list))
      .catch(() =>
        toast({ title: tc('status.error'), description: t('apply.loadInstitutionsError'), variant: 'destructive' })
      );
  }, [toast, t, tc]);

  useEffect(() => {
    if (draftHydrated) return;
    try {
      const raw = localStorage.getItem(ADMISSION_DRAFT_KEY);
      if (!raw) {
        setDraftHydrated(true);
        return;
      }
      const draft = JSON.parse(raw) as AdmissionDraftV1;
      if (draft?.v !== 1) {
        setDraftHydrated(true);
        return;
      }
      setInstitutionId(draft.institutionId || '');
      setClassId(draft.classId || '');
      setAcademicYear(draft.academicYear || currentAcademicYear());
      setApplicationKind(draft.applicationKind || 'pre_registration');
      setLevel(draft.level || '');
      setForeignStudent(!!draft.foreignStudent);
      setAssignedStudent(!!draft.assignedStudent);
      setScholarshipStudent(!!draft.scholarshipStudent);
      setCampus(draft.campus || '');
      setCampusId(draft.campusId || '');
      setStudentFirstName(draft.studentFirstName || '');
      setStudentLastName(draft.studentLastName || '');
      setStudentBirthDate(draft.studentBirthDate || '');
      setStudentGender(draft.studentGender || '');
      if (draft.guardian) setGuardian(draft.guardian);
      if (draft.token) setToken(draft.token);
      if (draft.applicationId) setApplicationId(draft.applicationId);
      // Ne pas restaurer l’étape confirmation / pièces sans token valide
      const maxStep = draft.token ? Math.min(draft.step ?? 0, 6) : Math.min(draft.step ?? 0, 4);
      setStep(Number.isFinite(maxStep) ? maxStep : 0);
      toast({ title: t('apply.draftRestoredTitle'), description: t('apply.draftRestoredBody') });
    } catch {
      /* ignore corrupt draft */
    } finally {
      setDraftHydrated(true);
    }
  }, [draftHydrated, t, toast]);

  useEffect(() => {
    if (!token || step < 5) return;
    fetchAdmissionPacket(token)
      .then((pkt) => {
        setPacket(pkt);
        setStorageMode(pkt.storageMode);
      })
      .catch(() => undefined);
  }, [token, step]);

  useEffect(() => {
    if (!institutionId) {
      setClasses([]);
      setCampuses([]);
      return;
    }
    fetchAdmissionClasses(institutionId).then(({ classes: list }) => setClasses(list));
    fetchAdmissionCampuses(institutionId)
      .then(({ campuses: list }) => setCampuses(list))
      .catch(() => setCampuses([]));
  }, [institutionId]);

  const canNext = () => {
    if (step === 0) return !!institutionId;
    if (step === 1) return !!academicYear;
    if (step === 2) return !!studentFirstName && !!studentLastName && !!studentBirthDate && !!studentGender;
    if (step === 3) return !!guardian.firstName && !!guardian.lastName && !!guardian.email;
    return true;
  };

  const buildDraftPayload = (nextStep = step): AdmissionDraftV1 => ({
    v: 1,
    step: nextStep,
    institutionId,
    classId,
    academicYear,
    applicationKind,
    level,
    foreignStudent,
    assignedStudent,
    scholarshipStudent,
    campus,
    campusId,
    studentFirstName,
    studentLastName,
    studentBirthDate,
    studentGender,
    guardian,
    token: token || undefined,
    applicationId: applicationId || undefined,
  });

  const persistDraft = (nextStep = step) => {
    try {
      localStorage.setItem(ADMISSION_DRAFT_KEY, JSON.stringify(buildDraftPayload(nextStep)));
    } catch {
      /* quota / private mode */
    }
  };

  const saveForLater = () => {
    persistDraft(step);
    if (token) {
      toast({
        title: t('apply.savedRemoteTitle'),
        description: t('apply.savedRemoteBody', { email: guardian.email || '—' }),
      });
      return;
    }
    toast({
      title: t('apply.savedLocalTitle'),
      description: t('apply.savedLocalBody'),
    });
  };

  const goPrevious = () => setStep((s) => Math.max(0, s - 1));

  const createDraft = async () => {
    setBusy(true);
    try {
      const { application, followEmailSent: emailOk, storageMode: mode } = await createAdmission({
        institutionId,
        classId: classId || undefined,
        academicYear,
        applicationKind,
        level: level || undefined,
        campus: campus || undefined,
        campusId: campusId || undefined,
        profileFlags: [
          ...(foreignStudent ? ['foreign_student'] : []),
          ...(assignedStudent ? ['assigned'] : []),
          ...(scholarshipStudent ? ['scholarship'] : []),
        ],
        studentFirstName,
        studentLastName,
        studentBirthDate,
        studentGender,
        guardians: [guardian],
        contactEmail: guardian.email,
      });
      setToken(application.publicToken);
      setApplicationId(application.id);
      setFollowEmailSent(emailOk ?? null);
      setStorageMode(mode === 's3' || mode === 'local' ? mode : 'local');
      const pkt = await fetchAdmissionPacket(application.publicToken);
      setPacket(pkt);
      setStorageMode(pkt.storageMode);
      setStep(5);
      try {
        localStorage.setItem(
          ADMISSION_DRAFT_KEY,
          JSON.stringify({
            ...buildDraftPayload(5),
            token: application.publicToken,
            applicationId: application.id,
          })
        );
      } catch {
        /* ignore */
      }
    } catch (error) {
      toast({
        title: tc('status.error'),
        description: error instanceof ApiError ? error.message : t('apply.createError'),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const handlePacketFile = async (itemId: string, file: File | undefined) => {
    if (!file || !token) return;
    setUploadingItemId(itemId);
    setBusy(true);
    try {
      const pkt = await attachAdmissionPacketItem(token, itemId, file);
      setPacket(pkt);
      toast({ title: t('apply.docAdded'), description: file.name });
    } catch (error) {
      toast({
        title: tc('status.error'),
        description: error instanceof ApiError ? error.message : t('apply.docError'),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
      setUploadingItemId(null);
    }
  };

  const handleSubmit = async () => {
    if (!token) return;
    if (packet && !packet.completeness.canSubmit) {
      toast({
        title: t('apply.packetIncompleteTitle'),
        description: t('apply.packetIncompleteBody', { count: packet.completeness.missingRequired }),
        variant: 'destructive',
      });
      return;
    }
    setBusy(true);
    try {
      const { followEmailSent: emailOk } = await submitAdmission(token);
      if (typeof emailOk === 'boolean') setFollowEmailSent(emailOk);
      try {
        localStorage.removeItem(ADMISSION_DRAFT_KEY);
      } catch {
        /* ignore */
      }
      setStep(7);
    } catch (error) {
      toast({
        title: tc('status.error'),
        description: error instanceof ApiError ? error.message : t('apply.submitError'),
        variant: 'destructive',
      });
      if (error instanceof ApiError && error.code === 'packet_incomplete' && token) {
        const pkt = await fetchAdmissionPacket(token).catch(() => null);
        if (pkt) setPacket(pkt);
        setStep(5);
      }
    } finally {
      setBusy(false);
    }
  };

  const selectedInstitution = institutions.find((i) => i.id === institutionId);

  return (
    <PublicShell>
      <main className="relative isolate flex-1 overflow-hidden">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute -left-20 top-10 h-72 w-72 rounded-full bg-[#1D70D8]/10 blur-3xl" />
          <div className="absolute right-[-6%] top-32 h-64 w-64 rounded-full bg-sky-200/30 blur-3xl" />
        </div>

        <div className="relative mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
          <FadeIn>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#05335C]">{t('apply.eyebrow')}</p>
            <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-[#0B1F3A] sm:text-[2.75rem] sm:leading-[1.1]">
              {t('apply.title')}
            </h1>
            <p className="mt-3 max-w-lg text-base leading-relaxed text-slate-600 sm:text-lg">{t('apply.subtitle')}</p>
          </FadeIn>

          <FadeIn delay={0.06} className="mt-8">
            <AdmissionStepper steps={steps} current={step} progressLabel={t('apply.progressLabel')} />
            <p className="mt-4 text-sm font-medium text-slate-500">
              {t('apply.stepOf', { current: step + 1, label: steps[step] })}
            </p>
          </FadeIn>

          <FadeIn delay={0.1} className="mt-6">
            <section
              className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_1px_0_rgba(11,31,58,0.04)] backdrop-blur-sm sm:p-7"
              aria-labelledby="admission-step-title"
            >
              <div className="mb-6 flex items-start gap-3 border-b border-slate-100 pb-5">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
                  style={{ backgroundColor: BLUE }}
                  aria-hidden
                >
                  <School className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 id="admission-step-title" className="font-display text-xl font-semibold text-[#0B1F3A]">
                    {steps[step]}
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-slate-500">{t('apply.description')}</p>
                </div>
              </div>

              <div className="space-y-4">
                {step === 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="admission-institution">{steps[0]}</Label>
                    <p className="text-sm text-slate-500">{t('apply.institutionHelp')}</p>
                    <Select value={institutionId} onValueChange={setInstitutionId}>
                      <SelectTrigger id="admission-institution" className="h-11">
                        <SelectValue placeholder={t('apply.choose')} />
                      </SelectTrigger>
                      <SelectContent>
                        {institutions.map((inst) => (
                          <SelectItem key={inst.id} value={inst.id}>
                            {inst.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedInstitution && (
                      <p className="text-sm font-medium text-[#05335C]">{selectedInstitution.name}</p>
                    )}
                  </div>
                )}

                {step === 1 && (
                  <>
                    <div className="space-y-2">
                      <Label>{t('config.kind')}</Label>
                      <Select
                        value={applicationKind}
                        onValueChange={(v) =>
                          setApplicationKind(v as typeof applicationKind)
                        }
                      >
                        <SelectTrigger className="h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pre_registration">{t('config.kinds.pre_registration')}</SelectItem>
                          <SelectItem value="first_enrollment">{t('config.kinds.first_enrollment')}</SelectItem>
                          <SelectItem value="re_enrollment">{t('config.kinds.re_enrollment')}</SelectItem>
                          <SelectItem value="transfer">{t('config.kinds.transfer')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="admission-level">{t('config.level')}</Label>
                      <Input
                        id="admission-level"
                        className="h-11"
                        value={level}
                        onChange={(e) => setLevel(e.target.value)}
                        placeholder={t('config.levelPlaceholder')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('apply.classOptional')}</Label>
                      <Select value={classId} onValueChange={setClassId}>
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder={t('apply.classUnspecified')} />
                        </SelectTrigger>
                        <SelectContent>
                          {classes.map((klass) => (
                            <SelectItem key={klass.id} value={klass.id}>
                              {klass.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="admission-year">{t('apply.academicYear')}</Label>
                      <Input
                        id="admission-year"
                        className="h-11"
                        value={academicYear}
                        onChange={(e) => setAcademicYear(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="admission-campus">{t('apply.campus')}</Label>
                      {campuses.length > 0 ? (
                        <Select
                          value={campusId}
                          onValueChange={(id) => {
                            setCampusId(id);
                            const found = campuses.find((c) => c.id === id);
                            setCampus(found?.name ?? '');
                          }}
                        >
                          <SelectTrigger id="admission-campus" className="h-11">
                            <SelectValue placeholder={t('apply.campusPlaceholder')} />
                          </SelectTrigger>
                          <SelectContent>
                            {campuses.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          id="admission-campus"
                          className="h-11"
                          value={campus}
                          onChange={(e) => {
                            setCampus(e.target.value);
                            setCampusId('');
                          }}
                          placeholder={t('apply.campusPlaceholder')}
                        />
                      )}
                    </div>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={foreignStudent}
                        onChange={(e) => setForeignStudent(e.target.checked)}
                      />
                      {t('apply.foreignStudent')}
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={assignedStudent}
                        onChange={(e) => setAssignedStudent(e.target.checked)}
                      />
                      {t('apply.assignedStudent')}
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={scholarshipStudent}
                        onChange={(e) => setScholarshipStudent(e.target.checked)}
                      />
                      {t('apply.scholarshipStudent')}
                    </label>
                  </>
                )}

                {step === 2 && (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="student-first">{t('apply.firstName')}</Label>
                        <Input
                          id="student-first"
                          className="h-11"
                          value={studentFirstName}
                          onChange={(e) => setStudentFirstName(e.target.value)}
                          autoComplete="given-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="student-last">{t('apply.lastName')}</Label>
                        <Input
                          id="student-last"
                          className="h-11"
                          value={studentLastName}
                          onChange={(e) => setStudentLastName(e.target.value)}
                          autoComplete="family-name"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="student-birth">{t('apply.birthDate')}</Label>
                      <Input
                        id="student-birth"
                        type="date"
                        className="h-11"
                        value={studentBirthDate}
                        onChange={(e) => setStudentBirthDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-3">
                      <Label id="student-gender-label">{t('apply.gender')}</Label>
                      <RadioGroup
                        aria-labelledby="student-gender-label"
                        value={studentGender}
                        onValueChange={setStudentGender}
                        className="flex flex-wrap gap-4"
                      >
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="female" id="student-gender-female" />
                          <Label htmlFor="student-gender-female" className="font-normal cursor-pointer">
                            {t('apply.genderFemale')}
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="male" id="student-gender-male" />
                          <Label htmlFor="student-gender-male" className="font-normal cursor-pointer">
                            {t('apply.genderMale')}
                          </Label>
                        </div>
                      </RadioGroup>
                    </div>
                  </>
                )}

                {step === 3 && (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="guardian-first">{t('apply.guardianFirstName')}</Label>
                        <Input
                          id="guardian-first"
                          className="h-11"
                          value={guardian.firstName}
                          onChange={(e) => setGuardian({ ...guardian, firstName: e.target.value })}
                          autoComplete="given-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="guardian-last">{t('apply.lastName')}</Label>
                        <Input
                          id="guardian-last"
                          className="h-11"
                          value={guardian.lastName}
                          onChange={(e) => setGuardian({ ...guardian, lastName: e.target.value })}
                          autoComplete="family-name"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="guardian-email">{t('apply.email')}</Label>
                      <p className="text-sm text-slate-500">{t('apply.emailHelp')}</p>
                      <Input
                        id="guardian-email"
                        type="email"
                        className="h-11"
                        value={guardian.email}
                        onChange={(e) => setGuardian({ ...guardian, email: e.target.value })}
                        autoComplete="email"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="guardian-phone">{t('apply.phone')}</Label>
                      <Input
                        id="guardian-phone"
                        className="h-11"
                        value={guardian.phone}
                        onChange={(e) => setGuardian({ ...guardian, phone: e.target.value })}
                        autoComplete="tel"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('apply.relationship')}</Label>
                      <Select
                        value={guardian.relationship}
                        onValueChange={(v) =>
                          setGuardian({ ...guardian, relationship: v as AdmissionGuardianInput['relationship'] })
                        }
                      >
                        <SelectTrigger className="h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="father">{t('apply.relFather')}</SelectItem>
                          <SelectItem value="mother">{t('apply.relMother')}</SelectItem>
                          <SelectItem value="tutor">{t('apply.relTutor')}</SelectItem>
                          <SelectItem value="payer">{t('apply.relPayer')}</SelectItem>
                          <SelectItem value="other_authorized">{t('apply.relOther')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                {step === 4 && (
                  <div className="space-y-4 text-sm text-slate-700">
                    <dl className="space-y-3 rounded-xl bg-slate-50 px-4 py-3">
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                          {t('apply.summaryStudent')}
                        </dt>
                        <dd className="mt-0.5 font-medium">
                          {studentFirstName} {studentLastName} ({studentBirthDate})
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                          {t('apply.summaryGuardian')}
                        </dt>
                        <dd className="mt-0.5 font-medium">
                          {guardian.firstName} {guardian.lastName} — {guardian.email}
                        </dd>
                      </div>
                    </dl>
                    <p className="text-slate-500">{t('apply.draftHint')}</p>
                  </div>
                )}

                {step === 5 && (
                  <div className="space-y-4">
                    <p className="text-sm text-slate-500">{t('apply.docsHintTyped')}</p>
                    {storageMode === 'local' && (
                      <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        {t('apply.localStorageHint')}
                      </p>
                    )}
                    {packet && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium text-slate-700">
                            {t('apply.completeness', { percent: packet.completeness.percent })}
                          </span>
                          <span className="text-slate-500">
                            {packet.completeness.requiredDone}/{packet.completeness.requiredTotal}{' '}
                            {t('apply.requiredShort')}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-[#1D70D8] transition-all"
                            style={{ width: `${packet.completeness.percent}%` }}
                          />
                        </div>
                        {packet.template && (
                          <p className="text-xs text-slate-500">{packet.template.name}</p>
                        )}
                      </div>
                    )}
                    <ul className="space-y-3">
                      {(packet?.items ?? []).map((item) => {
                        const isUploading = uploadingItemId === item.id;
                        const done = ['uploaded', 'in_review', 'compliant', 'original_pending', 'finalized'].includes(
                          item.status
                        );
                        const physicalOnly = item.originalMode === 'physical_only';
                        const originalPending = item.status === 'original_pending';
                        const isComplete = done && !originalPending;
                        const statusLabel = isUploading
                          ? t('apply.docStateUploading')
                          : physicalOnly
                            ? t('apply.docStatePhysical')
                            : originalPending
                              ? t('apply.docStatePartial')
                              : isComplete
                                ? t('apply.docStateProvided')
                                : t('apply.docStateMissing');

                        return (
                          <li
                            key={item.id}
                            className={cn(
                              'rounded-2xl border px-4 py-3.5 transition-colors duration-200',
                              isUploading && 'border-[#1D70D8]/40 bg-sky-50/70',
                              !isUploading && isComplete && 'border-emerald-200 bg-emerald-50/50',
                              !isUploading && originalPending && 'border-amber-200 bg-amber-50/40',
                              !isUploading && physicalOnly && !done && 'border-slate-200 bg-slate-50/80',
                              !isUploading && !done && !physicalOnly && 'border-slate-200 bg-white'
                            )}
                          >
                            <div className="flex gap-3">
                              <div
                                className={cn(
                                  'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                                  isUploading && 'bg-[#1D70D8]/10 text-[#1D70D8]',
                                  !isUploading && isComplete && 'bg-emerald-100 text-emerald-700',
                                  !isUploading && originalPending && 'bg-amber-100 text-amber-700',
                                  !isUploading && physicalOnly && !done && 'bg-slate-200/80 text-slate-500',
                                  !isUploading && !done && !physicalOnly && 'bg-slate-100 text-slate-400'
                                )}
                                aria-hidden
                              >
                                {isUploading ? (
                                  <Loader2 className="h-5 w-5 animate-spin" />
                                ) : isComplete ? (
                                  <CheckCircle2 className="h-5 w-5" strokeWidth={2.25} />
                                ) : originalPending ? (
                                  <Clock3 className="h-5 w-5" strokeWidth={2.25} />
                                ) : (
                                  <Circle className="h-5 w-5" strokeWidth={2} />
                                )}
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="min-w-0 space-y-1">
                                    <p className="font-medium text-[#0B1F3A]">
                                      {item.documentType.label}
                                      {(item.obligation === 'required' || item.obligation === 'conditional') && (
                                        <span className="ml-2 text-xs font-semibold text-rose-600">
                                          {t('apply.requiredBadge')}
                                        </span>
                                      )}
                                      {item.reusedFromItemId && (
                                        <span className="ml-2 text-xs font-semibold text-emerald-700">
                                          {t('apply.reusedBadge')}
                                        </span>
                                      )}
                                    </p>
                                    <p
                                      className={cn(
                                        'text-xs font-medium',
                                        isComplete && 'text-emerald-700',
                                        originalPending && 'text-amber-700',
                                        !done && !physicalOnly && 'text-slate-500',
                                        physicalOnly && 'text-slate-600'
                                      )}
                                    >
                                      <span className="sr-only">{statusLabel}. </span>
                                      {physicalOnly
                                        ? t('apply.docStatusPhysicalOnly')
                                        : originalPending
                                          ? t('apply.docStatusOriginalPending', { name: item.fileName || '—' })
                                          : isComplete
                                            ? t('apply.docStatusUploaded', { name: item.fileName || '—' })
                                            : t('apply.docStatusMissing')}
                                      {item.rejectionReason ? ` — ${item.rejectionReason}` : ''}
                                    </p>
                                    {item.helpText && (
                                      <p className="text-xs text-slate-400">{item.helpText}</p>
                                    )}
                                  </div>

                                  {!physicalOnly && (
                                    <div className="flex flex-col items-end gap-1">
                                      <Input
                                        type="file"
                                        accept={item.documentType.allowedMime.join(',')}
                                        disabled={busy}
                                        aria-label={
                                          done
                                            ? `${item.documentType.label} — ${t('apply.docReplaceHint')}`
                                            : item.documentType.label
                                        }
                                        onChange={(e) => void handlePacketFile(item.id, e.target.files?.[0])}
                                        className={cn(
                                          'h-10 max-w-[14rem] cursor-pointer text-xs file:mr-2 file:rounded-md file:border-0 file:px-2 file:py-1',
                                          done
                                            ? 'file:bg-emerald-100 file:text-emerald-800'
                                            : 'file:bg-slate-100 file:text-slate-700'
                                        )}
                                      />
                                      {done && !isUploading && (
                                        <span className="text-[11px] text-slate-400">{t('apply.docReplaceHint')}</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    {!packet?.items.length && (
                      <p className="text-sm text-slate-500">{t('apply.noPacketItems')}</p>
                    )}
                  </div>
                )}

                {step === 6 && (
                  <div className="space-y-4">
                    <p className="text-sm leading-relaxed text-slate-600">{t('apply.submitHint')}</p>
                  </div>
                )}

                {step === 7 && (
                  <AdmissionConfirmation
                    token={token}
                    applicationId={applicationId}
                    contactEmail={guardian.email}
                    followEmailSent={followEmailSent}
                  />
                )}
                {step < 7 && (
                  <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap gap-2">
                      {step > 0 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          className="text-slate-600"
                          onClick={goPrevious}
                          disabled={busy}
                        >
                          {t('apply.previous')}
                        </Button>
                      ) : null}
                      <Button type="button" variant="outline" onClick={saveForLater} disabled={busy}>
                        {t('apply.saveForLater')}
                      </Button>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      {step < 4 && (
                        <Button
                          type="button"
                          className={cn('min-w-[8.5rem]', primaryBtn)}
                          onClick={() => {
                            persistDraft(step + 1);
                            setStep((s) => s + 1);
                          }}
                          disabled={!canNext() || busy}
                        >
                          {t('apply.next')}
                        </Button>
                      )}
                      {step === 4 && (
                        <Button
                          type="button"
                          className={cn('min-w-[8.5rem]', primaryBtn)}
                          onClick={() => void createDraft()}
                          disabled={busy}
                        >
                          {busy ? t('apply.creating') : t('apply.createDraft')}
                        </Button>
                      )}
                      {step === 5 && (
                        <Button
                          type="button"
                          className={cn('min-w-[8.5rem]', primaryBtn)}
                          onClick={() => {
                            persistDraft(6);
                            setStep(6);
                          }}
                          disabled={busy || !token}
                        >
                          {t('apply.next')}
                        </Button>
                      )}
                      {step === 6 && (
                        <Button
                          type="button"
                          className={cn('min-w-[8.5rem]', primaryBtn)}
                          onClick={() => void handleSubmit()}
                          disabled={busy || !token}
                        >
                          {busy ? t('apply.submitting') : t('apply.submit')}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </FadeIn>

          <p className="mt-8 flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 font-medium text-[#05335C] transition-colors hover:text-[#1D70D8]"
              onClick={() => navigate('/')}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              {t('apply.backHome')}
            </button>
            <Link to="/admissions/retrouver" className="font-medium text-[#1D70D8] hover:underline">
              {t('apply.recoverLink')}
            </Link>
          </p>
        </div>
      </main>
    </PublicShell>
  );
};

export default AdmissionApplyPage;
