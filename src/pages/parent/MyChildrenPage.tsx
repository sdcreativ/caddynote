import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertCircle, Award, Bus, Calendar, Clock, CreditCard, FileText, GraduationCap, HeartPulse, School, Users, Utensils } from 'lucide-react';
import { useGuardianChildren } from '@/hooks/useGuardianChildren';
import { useStrkAbsences } from '@/hooks/useStrkAbsences';
import { JustificationDialog } from '@/components/absences/JustificationDialog';
import { StudentHealthForm } from '@/components/students/StudentHealthForm';
import { fetchStudentGradeSummary, type StudentGradeSummary } from '@/services/strkGradeService';
import {
  fetchInvoicesByStudent,
  initiateCinetPayPayment,
  initiateStripePayment,
  formatInvoiceMoney,
  type StrkInvoice,
} from '@/services/strkFinanceService';
import { apiClient, ApiError } from '@/lib/apiClient';
import { openAbsenceJustificationFile } from '@/services/strkAbsenceService';
import { useToast } from '@/hooks/use-toast';
import {
  fetchMyAdmissionApplications,
  type AdmissionApplication,
} from '@/services/strkAdmissionService';

const RELATIONSHIP_LABELS: Record<string, string> = {
  father: 'Père',
  mother: 'Mère',
  tutor: 'Tuteur/Tutrice',
  payer: 'Payeur',
  other_authorized: 'Autre personne autorisée',
};

type ParentServicesChild = {
  studentId: string;
  canteenEnabled?: boolean;
  canteenSubscriptions: Array<{
    id: string;
    planName: string;
    priceCents: number;
    currency: string;
    invoice?: { invoiceNumber: string; totalCents: number; status: string } | null;
  }>;
  transportEnrollments: Array<{ id: string; routeName: string }>;
  availableTransportRoutes?: Array<{
    id: string;
    name: string;
    capacity: number | null;
    seatsLeft: number | null;
  }>;
  availableCanteenPlans?: Array<{
    id: string;
    name: string;
    priceCents: number;
    currency: string;
  }>;
  servicesEnabled: boolean;
};

const MyChildrenPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { children, isLoading, selectedChildId, selectedChild, setSelectedChildId } = useGuardianChildren();
  const { absences, loadAbsencesByStudent, isLoading: absencesLoading } = useStrkAbsences();
  const [gradeSummary, setGradeSummary] = useState<StudentGradeSummary | null>(null);
  const [gradesLoading, setGradesLoading] = useState(false);
  const [invoices, setInvoices] = useState<StrkInvoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [familyFinance, setFamilyFinance] = useState<
    { studentId: string; name: string; unpaidCents: number; openCount: number; canView: boolean }[]
  >([]);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [servicesChild, setServicesChild] = useState<ParentServicesChild | null>(null);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [selectedAbsenceId, setSelectedAbsenceId] = useState<string | undefined>();
  const [justificationDialogOpen, setJustificationDialogOpen] = useState(false);
  const [myAdmissions, setMyAdmissions] = useState<AdmissionApplication[]>([]);
  const [activeTab, setActiveTab] = useState('attendance');

  const resolveDefaultTab = useCallback(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'finance' && selectedChild?.canViewBilling) return 'finance';
    if (tabParam === 'services') return 'services';
    if (tabParam === 'grades' && selectedChild?.canViewGrades) return 'grades';
    if (tabParam === 'attendance' && selectedChild?.canViewAttendance) return 'attendance';
    if (tabParam === 'health' && selectedChild?.canViewHealth) return 'health';
    if (selectedChild?.canViewAttendance) return 'attendance';
    if (selectedChild?.canViewGrades) return 'grades';
    return 'services';
  }, [searchParams, selectedChild]);

  useEffect(() => {
    if (!selectedChild) return;
    setActiveTab(resolveDefaultTab());
  }, [selectedChild, resolveDefaultTab]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value === 'finance') {
      navigate('/my-children?tab=finance', { replace: true });
    } else if (value === 'services') {
      navigate('/my-children?tab=services', { replace: true });
    } else if (value === 'grades') {
      navigate('/my-children?tab=grades', { replace: true });
    } else if (value === 'attendance') {
      navigate('/my-children?tab=attendance', { replace: true });
    } else if (value === 'health') {
      navigate('/my-children?tab=health', { replace: true });
    } else if (searchParams.get('tab')) {
      navigate('/my-children', { replace: true });
    }
  };

  useEffect(() => {
    fetchMyAdmissionApplications()
      .then(({ applications }) => setMyAdmissions(applications))
      .catch(() => setMyAdmissions([]));
  }, []);

  const loadGrades = useCallback(async (studentId: string) => {
    setGradesLoading(true);
    try {
      const data = await fetchStudentGradeSummary(studentId);
      setGradeSummary(data);
    } catch {
      setGradeSummary(null);
    } finally {
      setGradesLoading(false);
    }
  }, []);

  const loadInvoices = useCallback(async (studentId: string) => {
    setInvoicesLoading(true);
    try {
      const data = await fetchInvoicesByStudent(studentId);
      setInvoices(data);
    } finally {
      setInvoicesLoading(false);
    }
  }, []);

  const loadFamilyFinance = useCallback(async () => {
    const rows = await Promise.all(
      children.map(async (child) => {
        const name =
          [child.firstName, child.lastName].filter(Boolean).join(' ') || child.studentId;
        if (!child.canViewBilling) {
          return { studentId: child.studentId, name, unpaidCents: 0, openCount: 0, canView: false };
        }
        const invs = await fetchInvoicesByStudent(child.studentId);
        const open = invs.filter((i) => i.status !== 'paid' && i.status !== 'cancelled');
        const unpaidCents = open.reduce(
          (s, i) => s + Math.max(0, i.total_cents - i.paid_cents),
          0
        );
        return {
          studentId: child.studentId,
          name,
          unpaidCents,
          openCount: open.length,
          canView: true,
        };
      })
    );
    setFamilyFinance(rows);
  }, [children]);

  const loadServices = useCallback(async (studentId: string) => {
    setServicesLoading(true);
    try {
      const { children: list } = await apiClient.get<{ children: ParentServicesChild[] }>('/services/mine');
      setServicesChild(list.find((c) => c.studentId === studentId) ?? null);
    } catch {
      setServicesChild(null);
    } finally {
      setServicesLoading(false);
    }
  }, []);

  const [servicesActionId, setServicesActionId] = useState<string | null>(null);

  const enrollTransport = async (routeId: string) => {
    if (!selectedChildId) return;
    setServicesActionId(routeId);
    try {
      await apiClient.post('/services/mine/transport/enroll', {
        studentId: selectedChildId,
        routeId,
      });
      toast({ title: 'Inscription transport enregistrée' });
      await loadServices(selectedChildId);
    } catch (err) {
      toast({
        title: 'Inscription impossible',
        description: err instanceof ApiError ? err.message : 'Réessayez plus tard.',
        variant: 'destructive',
      });
    } finally {
      setServicesActionId(null);
    }
  };

  const subscribeCanteen = async (planId: string) => {
    if (!selectedChildId) return;
    setServicesActionId(planId);
    try {
      const res = await apiClient.post<{
        invoice?: { invoiceNumber?: string } | null;
      }>('/services/mine/canteen/subscribe', {
        studentId: selectedChildId,
        planId,
      });
      toast({
        title: 'Abonnement cantine enregistré',
        description: res.invoice?.invoiceNumber
          ? `Facture ${res.invoice.invoiceNumber} créée.`
          : undefined,
      });
      await loadServices(selectedChildId);
      if (selectedChild?.canViewBilling) await loadInvoices(selectedChildId);
    } catch (err) {
      toast({
        title: 'Souscription impossible',
        description: err instanceof ApiError ? err.message : 'Réessayez plus tard.',
        variant: 'destructive',
      });
    } finally {
      setServicesActionId(null);
    }
  };

  useEffect(() => {
    if (selectedChildId && selectedChild?.canViewAttendance) {
      loadAbsencesByStudent(selectedChildId);
    }
    if (selectedChildId && selectedChild?.canViewGrades) {
      loadGrades(selectedChildId);
    }
    if (selectedChildId && selectedChild?.canViewBilling) {
      loadInvoices(selectedChildId);
    }
    if (selectedChildId) {
      loadServices(selectedChildId);
    }
    if (children.length > 0) {
      void loadFamilyFinance();
    }
  }, [
    selectedChildId,
    selectedChild?.canViewAttendance,
    selectedChild?.canViewGrades,
    selectedChild?.canViewBilling,
    loadAbsencesByStudent,
    loadGrades,
    loadInvoices,
    loadServices,
    children.length,
    loadFamilyFinance,
  ]);

  const handlePay = async (invoiceId: string, method: 'cinetpay' | 'stripe') => {
    setPayingId(invoiceId);
    try {
      const url =
        method === 'cinetpay'
          ? await initiateCinetPayPayment(invoiceId)
          : await initiateStripePayment(invoiceId);
      window.location.href = url;
    } catch (e) {
      toast({
        title: 'Paiement indisponible',
        description: e instanceof ApiError ? e.message : 'Impossible d’initier le paiement.',
        variant: 'destructive',
      });
    } finally {
      setPayingId(null);
    }
  };

  const handleJustifyAbsence = (absenceId: string) => {
    setSelectedAbsenceId(absenceId);
    setJustificationDialogOpen(true);
  };

  const handleJustificationSubmitted = () => {
    if (selectedChildId) loadAbsencesByStudent(selectedChildId);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Chargement de vos enfants…</div>
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <div className="space-y-6 py-6">
        <div>
          <h1 className="text-3xl font-bold">Mes enfants</h1>
        </div>
        {myAdmissions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <School className="h-5 w-5" /> Préinscriptions
              </CardTitle>
              <CardDescription>Dossiers liés à votre adresse e-mail</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {myAdmissions.map((app) => (
                <div key={app.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                  <span>
                    {app.studentFirstName} {app.studentLastName} — {app.status}
                  </span>
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/admissions/suivi/${app.publicToken}`}>Suivre</Link>
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="text-center py-12">
            <Users className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun enfant rattaché à votre compte</h3>
            <p className="text-gray-500">
              Contactez le secrétariat de l'établissement pour vous faire déclarer comme responsable d'un élève.
            </p>
            <Button asChild className="mt-4" variant="outline">
              <Link to="/admissions">Nouvelle préinscription</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5 py-4 animate-fade-in md:space-y-6 md:py-6">
      {myAdmissions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <School className="h-5 w-5" /> Préinscriptions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {myAdmissions.map((app) => (
              <div key={app.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                <span>
                  {app.studentFirstName} {app.studentLastName} — {app.status}
                </span>
                <Button asChild size="sm" variant="outline">
                  <Link to={`/admissions/suivi/${app.publicToken}`}>Suivre</Link>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
        <div>
          <h1 className="font-display text-[1.75rem] font-semibold tracking-tight md:text-3xl">Mes enfants</h1>
          <p className="mt-1 text-base text-slate-600 md:text-base md:text-slate-500">
            Suivez la présence et les résultats de vos enfants
          </p>
        </div>

        {children.length > 1 && (
          <Select value={selectedChildId ?? undefined} onValueChange={setSelectedChildId}>
            <SelectTrigger className="w-full md:w-[260px]">
              <SelectValue placeholder="Choisir un enfant" />
            </SelectTrigger>
            <SelectContent>
              {children.map((child) => (
                <SelectItem key={child.studentId} value={child.studentId}>
                  {child.firstName} {child.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {selectedChild && (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center gap-3 p-4">
              <div className="rounded-full bg-blue-100 p-3">
                <GraduationCap className="h-6 w-6 text-blue-600" />
              </div>
              <div className="min-w-[180px] flex-1">
                <p className="font-semibold">
                  {selectedChild.firstName} {selectedChild.lastName}
                </p>
                <p className="text-sm text-gray-500">{selectedChild.className || 'Classe non assignée'}</p>
              </div>
              <Badge variant="secondary">
                {RELATIONSHIP_LABELS[selectedChild.relationship] || selectedChild.relationship}
              </Badge>
              {selectedChild.isPrimaryContact && (
                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Contact principal</Badge>
              )}
            </CardContent>
          </Card>

          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <div className="-mx-1 overflow-x-auto pb-1">
              <TabsList className="inline-flex h-auto min-w-full w-max justify-start gap-1.5 p-1.5 sm:min-w-0 sm:w-full">
                <TabsTrigger value="attendance" disabled={!selectedChild.canViewAttendance} className="shrink-0 px-4 py-2.5 text-sm font-semibold">
                  Absences
                </TabsTrigger>
                <TabsTrigger value="grades" disabled={!selectedChild.canViewGrades} className="shrink-0 px-4 py-2.5 text-sm font-semibold">
                  Notes
                </TabsTrigger>
                <TabsTrigger value="health" disabled={!selectedChild.canViewHealth} className="shrink-0 px-4 py-2.5 text-sm font-semibold">
                  Santé
                </TabsTrigger>
                <TabsTrigger value="finance" disabled={!selectedChild.canViewBilling} className="shrink-0 px-4 py-2.5 text-sm font-semibold">
                  Finances
                </TabsTrigger>
                <TabsTrigger value="services" className="shrink-0 px-4 py-2.5 text-sm font-semibold">
                  Services
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="attendance" className="space-y-4 pt-4">
              {!selectedChild.canViewAttendance ? (
                <p className="text-sm text-gray-500">Vous n'avez pas accès à la présence de cet enfant.</p>
              ) : absencesLoading ? (
                <p className="text-sm text-gray-500">Chargement…</p>
              ) : absences.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-12">
                    <AlertCircle className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Aucune absence</h3>
                    <p className="text-gray-500">Aucune absence enregistrée pour le moment.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4">
                  {absences.map((absence) => {
                    const isJustified = absence.justified;
                    const hasJustificationPending = absence.justification_reason && !isJustified;
                    const cardClass = !isJustified && !hasJustificationPending
                      ? 'border-red-200 bg-red-50'
                      : hasJustificationPending
                      ? 'border-orange-200 bg-orange-50'
                      : 'border-green-200 bg-green-50';

                    return (
                      <Card key={absence.id} className={cardClass}>
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <div>
                              <CardTitle className="flex items-center gap-2 text-base">
                                {!isJustified && !hasJustificationPending && <AlertCircle className="h-4 w-4" />}
                                {hasJustificationPending && <Clock className="h-4 w-4" />}
                                {isJustified && <FileText className="h-4 w-4" />}
                                {absence.type === 'absence' ? 'Absence' : 'Retard'}
                              </CardTitle>
                              <CardDescription>
                                {absence.course_name
                                  ? `Cours : ${absence.course_name}`
                                  : absence.class_name
                                    ? `Classe : ${absence.class_name}`
                                    : null}
                              </CardDescription>
                            </div>
                            <Badge variant={isJustified ? 'default' : hasJustificationPending ? 'secondary' : 'destructive'}>
                              {isJustified ? 'Justifiée' : hasJustificationPending ? 'En attente' : 'Non justifiée'}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              {new Date(absence.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              {absence.duration_minutes} minutes
                            </div>
                          </div>
                          {absence.justification_reason && (
                            <p className="text-sm text-muted-foreground">
                              <strong>Motif :</strong> {absence.justification_reason}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-2">
                            {!isJustified && (
                              <Button size="sm" onClick={() => handleJustifyAbsence(absence.id)}>
                                {hasJustificationPending ? 'Modifier le justificatif' : "Justifier l'absence"}
                              </Button>
                            )}
                            {absence.justification_file ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={async () => {
                                  try {
                                    await openAbsenceJustificationFile(absence.id);
                                  } catch {
                                    toast({
                                      title: 'Erreur',
                                      description: 'Impossible d’ouvrir le justificatif.',
                                      variant: 'destructive',
                                    });
                                  }
                                }}
                              >
                                Voir le document
                              </Button>
                            ) : null}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="grades" className="space-y-4 pt-4">
              {!selectedChild.canViewGrades ? (
                <p className="text-sm text-gray-500">Vous n'avez pas accès aux notes de cet enfant.</p>
              ) : gradesLoading ? (
                <p className="text-sm text-gray-500">Chargement…</p>
              ) : !gradeSummary || gradeSummary.subjects.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-12">
                    <Award className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Aucune note publiée</h3>
                    <p className="text-gray-500">Les notes apparaîtront ici dès qu'elles seront publiées.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {gradeSummary.overallAverageOutOf20 != null && (
                    <Card className="border-blue-100 bg-blue-50/40">
                      <CardContent className="flex items-center justify-between gap-3 p-4">
                        <div>
                          <p className="text-sm font-medium text-slate-600">Moyenne générale</p>
                          <p className="text-xs text-slate-500">
                            Pondérée par le coefficient de chaque matière
                          </p>
                        </div>
                        <p className="text-2xl font-bold text-blue-700">
                          {gradeSummary.overallAverageOutOf20.toLocaleString('fr-FR', {
                            maximumFractionDigits: 2,
                          })}
                          <span className="text-base font-semibold text-slate-500"> / 20</span>
                        </p>
                      </CardContent>
                    </Card>
                  )}

                  {gradeSummary.subjects.map((subject) => (
                    <Card key={subject.key}>
                      <CardHeader className="pb-2">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <CardTitle className="text-base">{subject.subjectName}</CardTitle>
                            {subject.courseName && subject.courseName !== subject.subjectName && (
                              <CardDescription>{subject.courseName}</CardDescription>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                              Moyenne
                            </p>
                            <p className="text-xl font-bold text-slate-900">
                              {subject.averageOutOf20 == null
                                ? '—'
                                : `${subject.averageOutOf20.toLocaleString('fr-FR', {
                                    maximumFractionDigits: 2,
                                  })} / 20`}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              Coeff. matière {subject.courseCoefficient}
                            </p>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {subject.grades.map((grade) => (
                          <div
                            key={grade.id}
                            className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-medium text-slate-900">{grade.title}</p>
                              <p className="text-xs text-slate-500">
                                {new Date(grade.date).toLocaleDateString('fr-FR')}
                                {grade.coefficient !== 1 ? ` · coeff. ${grade.coefficient}` : ''}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-lg font-semibold">
                                {grade.gradeValue}/{grade.maxGrade}
                              </p>
                              {grade.maxGrade !== 20 && (
                                <p className="text-[11px] text-slate-400">
                                  ≈ {grade.normalizedOutOf20}/20
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="health" className="space-y-4 pt-4">
              {!selectedChild.canViewHealth ? (
                <p className="text-sm text-gray-500">Vous n&apos;avez pas accès à la fiche santé de cet enfant.</p>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <HeartPulse className="h-4 w-4" />
                      Fiche santé / contact d&apos;urgence
                    </CardTitle>
                    <CardDescription>
                      Informations médicales et contacts d&apos;urgence partagés avec l&apos;établissement.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <StudentHealthForm studentId={selectedChild.studentId} />
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="finance" className="space-y-4 pt-4">
              {familyFinance.length > 1 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Vue famille</CardTitle>
                    <CardDescription>
                      Soldes par enfant (paiement multi-factures reporté — chaque facture se paie
                      séparément).
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {familyFinance.map((row) => (
                      <button
                        key={row.studentId}
                        type="button"
                        onClick={() => setSelectedChildId(row.studentId)}
                        className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                          selectedChildId === row.studentId
                            ? 'border-blue-300 bg-blue-50'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <span className="font-medium">{row.name}</span>
                        <span className="text-muted-foreground">
                          {!row.canView
                            ? 'Accès facturation fermé'
                            : row.openCount === 0
                              ? 'À jour'
                              : `${row.openCount} ouverte(s) · ${row.unpaidCents.toLocaleString('fr-FR')} ${
                                  invoices[0]?.currency || 'XOF'
                                }`}
                        </span>
                      </button>
                    ))}
                  </CardContent>
                </Card>
              )}

              {!selectedChild.canViewBilling ? (
                <p className="text-sm text-gray-500">Vous n&apos;avez pas accès à la facturation de cet enfant.</p>
              ) : invoicesLoading ? (
                <p className="text-sm text-gray-500">Chargement…</p>
              ) : invoices.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-12">
                    <CreditCard className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Aucune facture</h3>
                    <p className="text-gray-500">Les factures de scolarité apparaîtront ici.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {invoices.map((inv) => {
                    const remaining = Math.max(0, inv.total_cents - inv.paid_cents);
                    const canPay =
                      selectedChild.canMakePayments &&
                      remaining > 0 &&
                      inv.status !== 'cancelled' &&
                      inv.status !== 'paid';
                    const stateLines = inv.lines.filter(
                      (l) => l.line_type === 'fee' && l.fee_origin === 'state'
                    );
                    const schoolLines = inv.lines.filter(
                      (l) => l.line_type === 'fee' && l.fee_origin !== 'state'
                    );
                    const discountLines = inv.lines.filter((l) => l.line_type === 'discount');
                    const hasOriginSplit = inv.lines.some((l) => l.fee_origin);

                    return (
                      <Card key={inv.id}>
                        <CardContent className="space-y-3 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold">{inv.invoice_number}</p>
                              <p className="text-sm text-gray-500">
                                Émise le {new Date(inv.issued_at).toLocaleDateString('fr-FR')}
                                {inv.due_date
                                  ? ` · échéance ${new Date(inv.due_date).toLocaleDateString('fr-FR')}`
                                  : ''}
                                {inv.fee_schedule_id ? ' · grille tarifaire' : ''}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-bold">{formatInvoiceMoney(inv, inv.total_cents)}</p>
                              <Badge variant={inv.status === 'paid' ? 'default' : 'secondary'}>
                                {inv.status}
                              </Badge>
                              <p className="mt-1 text-xs text-slate-500">
                                Payé {formatInvoiceMoney(inv, inv.paid_cents)}
                              </p>
                            </div>
                          </div>

                          {hasOriginSplit && (
                            <div className="grid gap-2 text-sm md:grid-cols-2">
                              <div className="rounded-md border bg-slate-50/80 p-3">
                                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  Frais officiels (État)
                                </p>
                                {stateLines.length === 0 ? (
                                  <p className="text-muted-foreground">Aucun</p>
                                ) : (
                                  <ul className="space-y-1">
                                    {stateLines.map((l) => (
                                      <li key={l.id} className="flex justify-between gap-2">
                                        <span>{l.label}</span>
                                        <span>{formatInvoiceMoney(inv, l.amount_cents * l.quantity)}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                              <div className="rounded-md border bg-slate-50/80 p-3">
                                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  Frais établissement
                                </p>
                                {schoolLines.length === 0 ? (
                                  <p className="text-muted-foreground">Aucun</p>
                                ) : (
                                  <ul className="space-y-1">
                                    {schoolLines.map((l) => (
                                      <li key={l.id} className="flex justify-between gap-2">
                                        <span>{l.label}</span>
                                        <span>{formatInvoiceMoney(inv, l.amount_cents * l.quantity)}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                              {discountLines.length > 0 && (
                                <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3 md:col-span-2">
                                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
                                    Remises / prises en charge
                                  </p>
                                  <ul className="space-y-1">
                                    {discountLines.map((l) => (
                                      <li key={l.id} className="flex justify-between gap-2">
                                        <span>{l.label}</span>
                                        <span>− {formatInvoiceMoney(inv, l.amount_cents * l.quantity)}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}

                          {canPay && (
                            <div className="flex flex-wrap gap-2 pt-1">
                              <Button
                                size="sm"
                                disabled={payingId === inv.id}
                                onClick={() => void handlePay(inv.id, 'cinetpay')}
                              >
                                Payer par Mobile Money
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={payingId === inv.id}
                                onClick={() => void handlePay(inv.id, 'stripe')}
                              >
                                Payer par carte
                              </Button>
                            </div>
                          )}
                          {!selectedChild.canMakePayments && remaining > 0 && inv.status !== 'cancelled' && (
                            <p className="text-xs text-muted-foreground">
                              Consultation seule — le paiement en ligne n’est pas autorisé pour votre lien.
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="services" className="space-y-4 pt-4">
              {servicesLoading ? (
                <p className="text-sm text-gray-500">Chargement…</p>
              ) : !servicesChild?.servicesEnabled ? (
                <Card>
                  <CardContent className="text-center py-12 text-sm text-gray-500">
                    Aucun service établissement actif pour cet enfant.
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Utensils className="h-4 w-4" /> Cantine
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      {(servicesChild.canteenSubscriptions?.length ?? 0) === 0 ? (
                        <p className="text-muted-foreground">Pas d’abonnement cantine</p>
                      ) : (
                        servicesChild.canteenSubscriptions.map((s) => (
                          <div key={s.id} className="flex justify-between gap-2 rounded border px-3 py-2">
                            <span>{s.planName}</span>
                            <span className="text-right">
                              {(s.priceCents / 100).toLocaleString('fr-FR')} {s.currency}
                              {s.invoice?.invoiceNumber ? (
                                <Badge className="ml-2" variant="secondary">
                                  {s.invoice.invoiceNumber}
                                </Badge>
                              ) : null}
                            </span>
                          </div>
                        ))
                      )}
                      {servicesChild.canteenEnabled !== false &&
                      (servicesChild.availableCanteenPlans?.length ?? 0) > 0 ? (
                        <div className="space-y-2 border-t pt-3">
                          <p className="text-xs font-medium text-muted-foreground">Formules disponibles</p>
                          {servicesChild.availableCanteenPlans!.map((plan) => (
                            <div
                              key={plan.id}
                              className="flex items-center justify-between gap-2 rounded border px-3 py-2"
                            >
                              <span>
                                {plan.name}
                                <span className="ml-2 text-muted-foreground">
                                  {(plan.priceCents / 100).toLocaleString('fr-FR')} {plan.currency}
                                </span>
                              </span>
                              <Button
                                size="sm"
                                disabled={servicesActionId === plan.id}
                                onClick={() => void subscribeCanteen(plan.id)}
                              >
                                {servicesActionId === plan.id ? '…' : 'Souscrire'}
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Bus className="h-4 w-4" /> Transport
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      {(servicesChild.transportEnrollments?.length ?? 0) === 0 ? (
                        <p className="text-muted-foreground">Pas d’inscription transport</p>
                      ) : (
                        servicesChild.transportEnrollments.map((e) => (
                          <div key={e.id} className="rounded border px-3 py-2">
                            {e.routeName}
                          </div>
                        ))
                      )}
                      {(servicesChild.availableTransportRoutes?.length ?? 0) > 0 ? (
                        <div className="space-y-2 border-t pt-3">
                          <p className="text-xs font-medium text-muted-foreground">Circuits disponibles</p>
                          {servicesChild.availableTransportRoutes!.map((route) => (
                            <div
                              key={route.id}
                              className="flex items-center justify-between gap-2 rounded border px-3 py-2"
                            >
                              <span>
                                {route.name}
                                {route.seatsLeft != null ? (
                                  <span className="ml-2 text-muted-foreground">
                                    {route.seatsLeft} place{route.seatsLeft > 1 ? 's' : ''}
                                  </span>
                                ) : null}
                              </span>
                              <Button
                                size="sm"
                                disabled={servicesActionId === route.id}
                                onClick={() => void enrollTransport(route.id)}
                              >
                                {servicesActionId === route.id ? '…' : 'Inscrire'}
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}

      <JustificationDialog
        open={justificationDialogOpen}
        onOpenChange={setJustificationDialogOpen}
        absenceId={selectedAbsenceId}
        onJustificationSubmitted={handleJustificationSubmitted}
      />
    </div>
  );
};

export default MyChildrenPage;
