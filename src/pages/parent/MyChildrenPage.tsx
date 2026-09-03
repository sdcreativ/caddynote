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
import { GraduationCap, HeartPulse, School, Users } from 'lucide-react';
import { useGuardianChildren } from '@/hooks/useGuardianChildren';
import { useStrkAbsences } from '@/hooks/useStrkAbsences';
import { JustificationDialog } from '@/components/absences/JustificationDialog';
import { StudentHealthForm } from '@/components/students/StudentHealthForm';
import { ParentAttendancePanel } from '@/components/parent/ParentAttendancePanel';
import { ParentGradesPanel } from '@/components/parent/ParentGradesPanel';
import { ParentFinancePanel } from '@/components/parent/ParentFinancePanel';
import {
  ParentServicesPanel,
  type ParentServicesChild,
} from '@/components/parent/ParentServicesPanel';
import { fetchStudentGradeSummary, type StudentGradeSummary } from '@/services/strkGradeService';
import {
  fetchInvoicesByStudent,
  initiateCinetPayPayment,
  initiateStripePayment,
  type StrkInvoice,
} from '@/services/strkFinanceService';
import { apiClient, ApiError } from '@/lib/apiClient';
import { openAbsenceJustificationFile } from '@/services/strkAbsenceService';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
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
    if (selectedChild?.canViewBilling) return 'finance';
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
          <p className="mt-1 text-base text-slate-600 md:text-slate-500">
            Absences, notes et finances — santé et services dans Plus.
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

          <Tabs value={activeTab} onValueChange={handleTabChange} className="mt-2 w-full md:mt-0">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="-mx-1 min-w-0 flex-1 overflow-x-auto pb-1 sm:mx-0">
                <TabsList className="inline-flex h-auto w-max justify-start gap-1.5 p-1.5">
                  <TabsTrigger
                    value="attendance"
                    disabled={!selectedChild.canViewAttendance}
                    className="shrink-0 px-4 py-2.5 text-sm font-semibold"
                  >
                    Absences
                  </TabsTrigger>
                  <TabsTrigger
                    value="grades"
                    disabled={!selectedChild.canViewGrades}
                    className="shrink-0 px-4 py-2.5 text-sm font-semibold"
                  >
                    Notes
                  </TabsTrigger>
                  <TabsTrigger
                    value="finance"
                    disabled={!selectedChild.canViewBilling}
                    className="shrink-0 px-4 py-2.5 text-sm font-semibold"
                  >
                    Finances
                  </TabsTrigger>
                </TabsList>
              </div>
              <Select
                key={activeTab === 'health' || activeTab === 'services' ? activeTab : 'plus'}
                value={activeTab === 'health' || activeTab === 'services' ? activeTab : undefined}
                onValueChange={handleTabChange}
              >
                <SelectTrigger
                  aria-label="Autres rubriques"
                  className={cn(
                    'h-11 w-full sm:w-[10.5rem]',
                    (activeTab === 'health' || activeTab === 'services') &&
                      'border-primary text-foreground ring-1 ring-primary/30'
                  )}
                >
                  <SelectValue placeholder="Plus…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="health" disabled={!selectedChild.canViewHealth}>
                    Santé
                  </SelectItem>
                  <SelectItem value="services">Services</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <TabsContent value="attendance" className="space-y-4 pt-4">
              <ParentAttendancePanel
                canView={Boolean(selectedChild.canViewAttendance)}
                loading={absencesLoading}
                absences={absences}
                onJustify={handleJustifyAbsence}
                onOpenFile={(absenceId) => {
                  void (async () => {
                    try {
                      await openAbsenceJustificationFile(absenceId);
                    } catch {
                      toast({
                        title: 'Erreur',
                        description: 'Impossible d’ouvrir le justificatif.',
                        variant: 'destructive',
                      });
                    }
                  })();
                }}
              />
            </TabsContent>

            <TabsContent value="grades" className="space-y-4 pt-4">
              <ParentGradesPanel
                canView={Boolean(selectedChild.canViewGrades)}
                loading={gradesLoading}
                gradeSummary={gradeSummary}
              />
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
              <ParentFinancePanel
                canViewBilling={Boolean(selectedChild.canViewBilling)}
                canMakePayments={Boolean(selectedChild.canMakePayments)}
                loading={invoicesLoading}
                invoices={invoices}
                familyFinance={familyFinance}
                selectedChildId={selectedChildId}
                payingId={payingId}
                onSelectChild={setSelectedChildId}
                onPay={(invoiceId, provider) => void handlePay(invoiceId, provider)}
              />
            </TabsContent>

            <TabsContent value="services" className="space-y-4 pt-4">
              <ParentServicesPanel
                loading={servicesLoading}
                child={servicesChild}
                actionId={servicesActionId}
                onSubscribeCanteen={(planId) => void subscribeCanteen(planId)}
                onEnrollTransport={(routeId) => void enrollTransport(routeId)}
              />
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
