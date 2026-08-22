import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { fetchGradesByStudent } from '@/services/strkGradeService';
import { fetchInvoicesByStudent, type StrkInvoice } from '@/services/strkFinanceService';
import { apiClient } from '@/lib/apiClient';
import {
  fetchMyAdmissionApplications,
  type AdmissionApplication,
} from '@/services/strkAdmissionService';
import { StrkGrade } from '@/types/strk';
import { Link } from 'react-router-dom';

const RELATIONSHIP_LABELS: Record<string, string> = {
  father: 'Père',
  mother: 'Mère',
  tutor: 'Tuteur/Tutrice',
  payer: 'Payeur',
  other_authorized: 'Autre personne autorisée',
};

type ParentServicesChild = {
  studentId: string;
  canteenSubscriptions: Array<{
    id: string;
    planName: string;
    priceCents: number;
    currency: string;
    invoice?: { invoiceNumber: string; totalCents: number; status: string } | null;
  }>;
  transportEnrollments: Array<{ id: string; routeName: string }>;
  servicesEnabled: boolean;
};

const MyChildrenPage = () => {
  const [searchParams] = useSearchParams();
  const initialTab =
    searchParams.get('tab') === 'finance'
      ? 'finance'
      : searchParams.get('tab') === 'services'
        ? 'services'
        : undefined;
  const { children, isLoading, selectedChildId, selectedChild, setSelectedChildId } = useGuardianChildren();
  const { absences, loadAbsencesByStudent, isLoading: absencesLoading } = useStrkAbsences();
  const [grades, setGrades] = useState<StrkGrade[]>([]);
  const [gradesLoading, setGradesLoading] = useState(false);
  const [invoices, setInvoices] = useState<StrkInvoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [servicesChild, setServicesChild] = useState<ParentServicesChild | null>(null);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [selectedAbsenceId, setSelectedAbsenceId] = useState<string | undefined>();
  const [justificationDialogOpen, setJustificationDialogOpen] = useState(false);
  const [myAdmissions, setMyAdmissions] = useState<AdmissionApplication[]>([]);

  useEffect(() => {
    fetchMyAdmissionApplications()
      .then(({ applications }) => setMyAdmissions(applications))
      .catch(() => setMyAdmissions([]));
  }, []);

  const loadGrades = useCallback(async (studentId: string) => {
    setGradesLoading(true);
    try {
      const data = await fetchGradesByStudent(studentId);
      setGrades(data);
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
  }, [
    selectedChildId,
    selectedChild?.canViewAttendance,
    selectedChild?.canViewGrades,
    selectedChild?.canViewBilling,
    loadAbsencesByStudent,
    loadGrades,
    loadInvoices,
    loadServices,
  ]);

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
    <div className="space-y-6 py-6 animate-fade-in">
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
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Mes enfants</h1>
          <p className="text-gray-500 mt-1">Suivez la présence et les résultats de vos enfants</p>
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
            <CardContent className="p-4 flex flex-wrap items-center gap-3">
              <div className="rounded-full bg-blue-100 p-3">
                <GraduationCap className="h-6 w-6 text-blue-600" />
              </div>
              <div className="flex-1 min-w-[180px]">
                <p className="font-semibold">{selectedChild.firstName} {selectedChild.lastName}</p>
                <p className="text-sm text-gray-500">{selectedChild.className || 'Classe non assignée'}</p>
              </div>
              <Badge variant="secondary">{RELATIONSHIP_LABELS[selectedChild.relationship] || selectedChild.relationship}</Badge>
              {selectedChild.isPrimaryContact && (
                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Contact principal</Badge>
              )}
            </CardContent>
          </Card>

          <Tabs
            defaultValue={
              initialTab === 'finance' && selectedChild.canViewBilling
                ? 'finance'
                : initialTab === 'services'
                  ? 'services'
                  : selectedChild.canViewAttendance
                    ? 'attendance'
                    : 'grades'
            }
            className="w-full"
          >
            <TabsList>
              <TabsTrigger value="attendance" disabled={!selectedChild.canViewAttendance}>
                Absences
              </TabsTrigger>
              <TabsTrigger value="grades" disabled={!selectedChild.canViewGrades}>
                Notes
              </TabsTrigger>
              <TabsTrigger value="health" disabled={!selectedChild.canViewHealth}>
                Santé
              </TabsTrigger>
              <TabsTrigger value="finance" disabled={!selectedChild.canViewBilling}>
                Finances
              </TabsTrigger>
              <TabsTrigger value="services">Services</TabsTrigger>
            </TabsList>

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
                                {absence.class_name && `Cours : ${absence.class_name}`}
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
                          {!isJustified && (
                            <Button size="sm" onClick={() => handleJustifyAbsence(absence.id)}>
                              {hasJustificationPending ? 'Modifier le justificatif' : "Justifier l'absence"}
                            </Button>
                          )}
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
              ) : grades.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-12">
                    <Award className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Aucune note publiée</h3>
                    <p className="text-gray-500">Les notes apparaîtront ici dès qu'elles seront publiées.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {grades.map((grade) => (
                    <Card key={grade.id}>
                      <CardContent className="p-4 flex items-center justify-between">
                        <div>
                          <p className="font-semibold">{grade.title}</p>
                          <p className="text-sm text-gray-500">
                            {(grade as any).course?.name && `${(grade as any).course.name} • `}
                            {new Date(grade.date).toLocaleDateString('fr-FR')}
                          </p>
                        </div>
                        <div className="text-xl font-bold">
                          {grade.grade_value}/{grade.max_grade}
                        </div>
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
                  {invoices.map((inv) => (
                    <Card key={inv.id}>
                      <CardContent className="flex items-center justify-between p-4">
                        <div>
                          <p className="font-semibold">{inv.invoice_number}</p>
                          <p className="text-sm text-gray-500">
                            Émise le {new Date(inv.issued_at).toLocaleDateString('fr-FR')}
                            {inv.due_date ? ` · échéance ${new Date(inv.due_date).toLocaleDateString('fr-FR')}` : ''}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold">
                            {(inv.total_cents / 100).toLocaleString('fr-FR')} {inv.currency}
                          </p>
                          <Badge variant={inv.status === 'paid' ? 'default' : 'secondary'}>{inv.status}</Badge>
                          <p className="mt-1 text-xs text-slate-500">
                            Payé {(inv.paid_cents / 100).toLocaleString('fr-FR')} /{' '}
                            {(inv.total_cents / 100).toLocaleString('fr-FR')}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
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
                    <CardContent className="space-y-2 text-sm">
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
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Bus className="h-4 w-4" /> Transport
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      {(servicesChild.transportEnrollments?.length ?? 0) === 0 ? (
                        <p className="text-muted-foreground">Pas d’inscription transport</p>
                      ) : (
                        servicesChild.transportEnrollments.map((e) => (
                          <div key={e.id} className="rounded border px-3 py-2">
                            {e.routeName}
                          </div>
                        ))
                      )}
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
