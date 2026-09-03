import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { useStrkAuth } from "@/hooks/useStrkAuth";
import { usePermissions } from "@/hooks/usePermissions";
import {
  fetchGradesByTeacher,
  fetchGradesByInstitution,
  createGrade,
  createGradesBulk,
  importGradesCsv,
  publishGrades,
  computeClassGrades,
} from "@/services/strkGradeService";
import { fetchCoursesByTeacher, fetchCoursesByInstitution, type CourseWithDetails } from "@/services/strkCourseService";
import { fetchAcademicPeriods, type StrkAcademicPeriod } from "@/services/strkAcademicPeriodService";
import { fetchGradingScales, type StrkGradingScale } from "@/services/strkGradingScaleService";
import { fetchStudentsByClass, type ClassRosterStudent } from "@/services/strkAttendanceService";
import { ExportDialog } from "@/components/export/ExportDialog";
import { GradesEntryPanel } from "@/components/grades/GradesEntryPanel";
import { GradesWorkflowPanel } from "@/components/grades/GradesWorkflowPanel";
import { useToast } from "@/hooks/use-toast";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { useTranslation } from 'react-i18next';
import { StrkGrade } from "@/types/strk";
import { previewCsvRows } from "@/lib/csvPreview";
import { trackProductEvent } from "@/lib/productTelemetry";
import { hasAnyRole, TEACHING_ROLES } from "@/lib/roles";

const GRADE_CSV_TEMPLATE = 'studentNumber,gradeValue\nMAT-001,14.5\nMAT-002,12\n';

type GradeImportRow = { row: number; key: string; status: string; error?: string };

const GradesPage = () => {
  const { t } = useTranslation('grades');
  const { t: tc } = useTranslation('common');
  const { user } = useStrkAuth();
  const { hasPermission } = usePermissions();
  const { toast } = useToast();
  const confirm = useConfirmDialog();
  const [grades, setGrades] = useState<StrkGrade[]>([]);
  const [filteredGrades, setFilteredGrades] = useState<StrkGrade[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isAddGradeOpen, setIsAddGradeOpen] = useState(false);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importCsv, setImportCsv] = useState('');
  const [importPreviewRows, setImportPreviewRows] = useState<string[][]>([]);
  const [importReport, setImportReport] = useState<{ created: number; skipped: number; errors: number; results: GradeImportRow[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importCourseId, setImportCourseId] = useState('');
  const [importPeriodId, setImportPeriodId] = useState('');
  const [importTitle, setImportTitle] = useState('');
  const [bulkTitle, setBulkTitle] = useState('');
  const [bulkCourseId, setBulkCourseId] = useState('');
  const [bulkPeriodId, setBulkPeriodId] = useState('');
  const [bulkMax, setBulkMax] = useState('20');
  const [bulkType, setBulkType] = useState('evaluation');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkValues, setBulkValues] = useState<Record<string, string>>({});
  const [bulkRoster, setBulkRoster] = useState<ClassRosterStudent[]>([]);
  const [newGrade, setNewGrade] = useState({
    student_id: "",
    course_id: "",
    period_id: "",
    grade_value: "",
    max_grade: "20",
    grade_type: "evaluation",
    title: "",
    description: "",
    date: new Date().toISOString().split('T')[0]
  });
  // EVA-004 : period_id est requis côté serveur pour créer une note — le
  // formulaire n'avait jusqu'ici ni sélecteur de cours, ni d'élève, ni de
  // période, ce qui faisait échouer (400) toute création réelle.
  const [courses, setCourses] = useState<CourseWithDetails[]>([]);
  const [periods, setPeriods] = useState<StrkAcademicPeriod[]>([]);
  const [rosterStudents, setRosterStudents] = useState<ClassRosterStudent[]>([]);
  // EVA-002 : barèmes configurés par l'établissement (Paramètres > Barèmes) —
  // remplacent la saisie libre de "Note sur" quand ils existent.
  const [gradingScales, setGradingScales] = useState<StrkGradingScale[]>([]);

  const canCreateGrades = hasPermission('grades', 'create') || user?.role === 'school_admin' || user?.role === 'head_teacher';
  const canPublish = canCreateGrades;
  const canCompute = user?.role === 'school_admin' || user?.role === 'admin';
  const isTeacher = user?.role === 'teacher' || user?.role === 'head_teacher';
  const isDirection = user?.role === 'school_admin' || user?.role === 'admin';
  /** Pas de CTA de création sans cours : sinon Direction voit une boîte vide + boutons inutilisables. */
  const canShowCreateActions = canCreateGrades && courses.length > 0;
  const [publishCourseId, setPublishCourseId] = useState('');
  const [publishPeriodId, setPublishPeriodId] = useState('');
  const [computeClassId, setComputeClassId] = useState('');
  const [computePeriodId, setComputePeriodId] = useState('');
  const [workflowBusy, setWorkflowBusy] = useState(false);

  useEffect(() => {
    trackProductEvent('grades', 'Ouverture notes');
  }, []);

  useEffect(() => {
    loadGrades();
  }, [user]);

  useEffect(() => {
    filterGrades();
  }, [grades, searchTerm, filterType]);

  // Cours et périodes nécessaires au formulaire de saisie — chargés une
  // fois que l'établissement de l'utilisateur est connu.
  useEffect(() => {
    if (!user?.institutionId || !canCreateGrades) return;
    (async () => {
      const [coursesData, periodsData, scalesData] = await Promise.all([
        isTeacher ? fetchCoursesByTeacher(user.id) : fetchCoursesByInstitution(user.institutionId!),
        fetchAcademicPeriods(user.institutionId!),
        fetchGradingScales(user.institutionId!),
      ]);
      setCourses(coursesData);
      setPeriods(periodsData);
      setGradingScales(scalesData);
      const defaultScale = scalesData.find((s) => s.is_default);
      if (defaultScale) {
        setNewGrade((prev) => ({ ...prev, max_grade: String(defaultScale.max_value) }));
      }
    })();
  }, [user, isTeacher, canCreateGrades]);

  // La liste des élèves dépend du cours choisi (via sa classe).
  useEffect(() => {
    const course = courses.find((c) => c.id === newGrade.course_id);
    if (!course?.class_id) {
      setRosterStudents([]);
      return;
    }
    fetchStudentsByClass(course.class_id).then(setRosterStudents);
  }, [newGrade.course_id, courses]);

  useEffect(() => {
    const course = courses.find((c) => c.id === bulkCourseId);
    if (!course?.class_id) {
      setBulkRoster([]);
      return;
    }
    fetchStudentsByClass(course.class_id).then(setBulkRoster);
  }, [bulkCourseId, courses]);

  const handleBulkSubmit = async () => {
    if (!user || !bulkCourseId || !bulkPeriodId || !bulkTitle.trim()) {
      toast({ title: t('toast.missingFields'), description: t('toast.bulkRequired'), variant: 'destructive' });
      return;
    }
    const entries = bulkRoster
      .map((s) => ({ student_id: s.id, grade_value: Number(bulkValues[s.id]) }))
      .filter((e) => Number.isFinite(e.grade_value));
    if (entries.length === 0) {
      toast({ title: t('toast.noGrade'), description: t('toast.enterOneGrade'), variant: 'destructive' });
      return;
    }
    const skipped = bulkRoster.length - entries.length;
    if (skipped > 0) {
      const ok = await confirm({
        description: t('bulk.confirmSkip', { count: entries.length, skipped }),
        variant: 'default',
      });
      if (!ok) return;
    }
    setBulkSaving(true);
    const result = await createGradesBulk({
      course_id: bulkCourseId,
      teacher_id: user.id,
      period_id: bulkPeriodId,
      title: bulkTitle.trim(),
      grade_type: bulkType,
      max_grade: Number(bulkMax) || 20,
      entries,
    });
    setBulkSaving(false);
    if ('error' in result) {
      toast({ title: tc('status.error'), description: result.error, variant: 'destructive' });
      return;
    }
    toast({ title: t('toast.gradesSaved'), description: t('toast.gradesCreated', { count: result.count }) });
    setIsBulkOpen(false);
    setBulkValues({});
    setBulkTitle('');
    loadGrades();
  };

  const handleImportFile = async (file: File) => {
    const csv = await file.text();
    setImportCsv(csv);
    setImportPreviewRows(previewCsvRows(csv));
    setImportReport(null);
  };

  const downloadGradeTemplate = () => {
    const blob = new Blob([GRADE_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = t('import.templateFilename');
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleImportCsv = async () => {
    if (!user || !importCourseId || !importPeriodId || !importTitle.trim() || !importCsv.trim()) {
      toast({ title: t('toast.missingFields'), description: t('toast.importRequired'), variant: 'destructive' });
      return;
    }
    setImporting(true);
    const summary = await importGradesCsv({
      csv: importCsv,
      courseId: importCourseId,
      teacherId: user.id,
      periodId: importPeriodId,
      title: importTitle.trim(),
    });
    setImporting(false);
    if (!summary) {
      toast({ title: tc('status.error'), description: t('toast.importImpossible'), variant: 'destructive' });
      return;
    }
    setImportReport({
      created: summary.created,
      skipped: summary.skipped,
      errors: summary.errors,
      results: (summary.results as GradeImportRow[]) ?? [],
    });
    toast({
      title: t('toast.importDone'),
      description: t('toast.importSummary', { created: summary.created, errors: summary.errors, skipped: summary.skipped }),
    });
    loadGrades();
  };

  const loadGrades = async () => {
    if (!user) return;

    try {
      let data: StrkGrade[] = [];
      if (isTeacher) {
        data = await fetchGradesByTeacher(user.id);
      } else if (isDirection) {
        data = await fetchGradesByInstitution(
          user.role === 'admin' ? user.institutionId ?? undefined : undefined
        );
      }
      setGrades(data);
    } catch (error) {
      toast({
        title: tc('status.error'),
        description: t('toast.loadImpossible'),
        variant: "destructive",
      });
    }
  };

  const filterGrades = () => {
    let filtered = grades;

    if (searchTerm) {
      filtered = filtered.filter(grade => 
        grade.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        grade.grade_type.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (filterType !== "all") {
      filtered = filtered.filter(grade => grade.grade_type === filterType);
    }

    setFilteredGrades(filtered);
  };

  const handleCreateGrade = async () => {
    if (!user || !canCreateGrades) return;

    if (!newGrade.course_id || !newGrade.student_id || !newGrade.period_id || !newGrade.title || !newGrade.grade_value) {
      toast({
        title: t('toast.formIncomplete'),
        description: t('toast.addRequired'),
        variant: 'destructive',
      });
      return;
    }

    // createGrade avale ses propres erreurs et renvoie null plutôt que de
    // lever une exception — sans ce contrôle explicite, un échec silencieux
    // (400, permissions...) affichait quand même le toast de succès.
    const created = await createGrade({
      ...newGrade,
      teacher_id: user.id,
      grade_value: parseFloat(newGrade.grade_value),
      max_grade: parseFloat(newGrade.max_grade),
    });

    if (!created) {
      toast({
        title: tc('status.error'),
        description: t('toast.addImpossible'),
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: t('toast.gradeAdded'),
      description: t('toast.gradeSaved'),
    });

    setIsAddGradeOpen(false);
    setNewGrade({
      student_id: "",
      course_id: "",
      period_id: "",
      grade_value: "",
      max_grade: "20",
      grade_type: "evaluation",
      title: "",
      description: "",
      date: new Date().toISOString().split('T')[0]
    });
    loadGrades();
  };

  const handlePublish = async () => {
    if (!publishCourseId || !publishPeriodId) {
      toast({ title: t('toast.publishRequired'), variant: 'destructive' });
      return;
    }
    setWorkflowBusy(true);
    try {
      const count = await publishGrades(publishCourseId, publishPeriodId);
      toast({ title: t('toast.published', { count }) });
      loadGrades();
    } catch {
      toast({ title: t('toast.publishImpossible'), variant: 'destructive' });
    } finally {
      setWorkflowBusy(false);
    }
  };

  const handleCompute = async () => {
    if (!computeClassId || !computePeriodId) {
      toast({ title: t('toast.computeRequired'), variant: 'destructive' });
      return;
    }
    setWorkflowBusy(true);
    try {
      const computations = await computeClassGrades(computeClassId, computePeriodId);
      toast({ title: t('toast.computed', { count: computations.length }) });
    } catch {
      toast({
        title: t('toast.computeImpossible'),
        description: t('toast.computeImpossibleBody'),
        variant: 'destructive',
      });
    } finally {
      setWorkflowBusy(false);
    }
  };

  const getGradeColor = (grade: number, maxGrade: number) => {
    const percentage = (grade / maxGrade) * 100;
    if (percentage >= 75) return "text-green-600 bg-green-50";
    if (percentage >= 50) return "text-orange-600 bg-orange-50";
    return "text-red-600 bg-red-50";
  };

  const calculateAverage = () => {
    if (filteredGrades.length === 0) return 0;
    const total = filteredGrades.reduce((sum, grade) => sum + (grade.grade_value / grade.max_grade) * 20, 0);
    return (total / filteredGrades.length).toFixed(2);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">
            {isDirection && !isTeacher ? t('subtitleDirection') : t('subtitleTeacher')}
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-3 sm:items-end">
          {canShowCreateActions && (
            <div className="flex flex-wrap justify-end gap-2">
            <Dialog open={isBulkOpen} onOpenChange={setIsBulkOpen}>
              <DialogTrigger asChild>
                <Button variant="secondary">{t('gridEntry')}</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[720px] max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{t('gridEntry')}</DialogTitle>
                  <DialogDescription>
                    {t('bulk.description')}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>{t('course')}</Label>
                      <Select value={bulkCourseId} onValueChange={setBulkCourseId}>
                        <SelectTrigger><SelectValue placeholder={t('course')} /></SelectTrigger>
                        <SelectContent>
                          {courses.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.class_name ? t('courseWithClass', { name: c.name, className: c.class_name }) : c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t('period')}</Label>
                      <Select value={bulkPeriodId} onValueChange={setBulkPeriodId}>
                        <SelectTrigger><SelectValue placeholder={t('period')} /></SelectTrigger>
                        <SelectContent>
                          {periods.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label>{t('titleLabel')}</Label>
                      <Input value={bulkTitle} onChange={(e) => setBulkTitle(e.target.value)} placeholder={t('bulk.titlePlaceholder')} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('type')}</Label>
                      <Select value={bulkType} onValueChange={setBulkType}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="evaluation">{t('types.evaluation')}</SelectItem>
                          <SelectItem value="devoir">{t('types.devoir')}</SelectItem>
                          <SelectItem value="expose">{t('types.expose')}</SelectItem>
                          <SelectItem value="participation">{t('types.participation')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t('maxGrade')}</Label>
                      <Input type="number" value={bulkMax} onChange={(e) => setBulkMax(e.target.value)} />
                    </div>
                  </div>
                  {bulkRoster.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('bulk.emptyRoster')}</p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        {t('bulk.filled', {
                          filled: Object.values(bulkValues).filter((v) => v !== '' && Number.isFinite(Number(v))).length,
                          total: bulkRoster.length,
                        })}
                      </p>
                      <div className="rounded-md border divide-y max-h-[40vh] overflow-y-auto">
                        {bulkRoster.map((s, idx) => (
                          <div key={s.id} className="flex items-center gap-3 px-3 py-2">
                            <Label className="flex-1 text-sm font-medium" htmlFor={`bulk-grade-${s.id}`}>
                              {s.name}
                            </Label>
                            <Input
                              id={`bulk-grade-${s.id}`}
                              className="w-24"
                              type="number"
                              step="0.5"
                              inputMode="decimal"
                              value={bulkValues[s.id] ?? ''}
                              onChange={(e) => setBulkValues((prev) => ({ ...prev, [s.id]: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key !== 'Enter') return;
                                e.preventDefault();
                                const next = bulkRoster[idx + 1];
                                if (next) document.getElementById(`bulk-grade-${next.id}`)?.focus();
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <Button onClick={() => void handleBulkSubmit()} disabled={bulkSaving || bulkRoster.length === 0}>
                    {bulkSaving ? t('bulk.saving') : t('bulk.save')}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={isAddGradeOpen} onOpenChange={setIsAddGradeOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('newGrade')}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>{t('add.title')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="course_id">{t('course')}</Label>
                      <Select
                        value={newGrade.course_id}
                        onValueChange={(value) => setNewGrade({ ...newGrade, course_id: value, student_id: '' })}
                      >
                        <SelectTrigger id="course_id">
                          <SelectValue placeholder={t('chooseCourse')} />
                        </SelectTrigger>
                        <SelectContent>
                          {courses.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="student_id">{t('student')}</Label>
                      <Select
                        value={newGrade.student_id}
                        onValueChange={(value) => setNewGrade({ ...newGrade, student_id: value })}
                        disabled={!newGrade.course_id}
                      >
                        <SelectTrigger id="student_id">
                          <SelectValue placeholder={t('chooseStudent')} />
                        </SelectTrigger>
                        <SelectContent>
                          {rosterStudents.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="period_id">{t('period')}</Label>
                    <Select value={newGrade.period_id} onValueChange={(value) => setNewGrade({ ...newGrade, period_id: value })}>
                      <SelectTrigger id="period_id">
                        <SelectValue placeholder={t('choosePeriod')} />
                      </SelectTrigger>
                      <SelectContent>
                        {periods.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{t('periodWithYear', { name: p.name, year: p.academic_year })}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">{t('add.evalTitle')}</Label>
                      <Input
                        id="title"
                        value={newGrade.title}
                        onChange={(e) => setNewGrade({ ...newGrade, title: e.target.value })}
                        placeholder={t('add.evalTitlePlaceholder')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="grade_type">{t('type')}</Label>
                      <Select value={newGrade.grade_type} onValueChange={(value) => setNewGrade({ ...newGrade, grade_type: value })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="evaluation">{t('types.evaluation')}</SelectItem>
                          <SelectItem value="devoir">{t('types.devoir')}</SelectItem>
                          <SelectItem value="exposé">{t('types.expose')}</SelectItem>
                          <SelectItem value="participation">{t('types.participation')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="grade_value">{t('add.gradeValue')}</Label>
                      <Input
                        id="grade_value"
                        type="number"
                        step="0.5"
                        value={newGrade.grade_value}
                        onChange={(e) => setNewGrade({ ...newGrade, grade_value: e.target.value })}
                        placeholder="15"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="max_grade">{t('maxGrade')}</Label>
                      {gradingScales.length > 0 ? (
                        <Select value={newGrade.max_grade} onValueChange={(value) => setNewGrade({ ...newGrade, max_grade: value })}>
                          <SelectTrigger id="max_grade">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {gradingScales.map((s) => (
                              <SelectItem key={s.id} value={String(s.max_value)}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          id="max_grade"
                          type="number"
                          value={newGrade.max_grade}
                          onChange={(e) => setNewGrade({ ...newGrade, max_grade: e.target.value })}
                          placeholder="20"
                        />
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="date">{t('date')}</Label>
                      <Input
                        id="date"
                        type="date"
                        value={newGrade.date}
                        onChange={(e) => setNewGrade({ ...newGrade, date: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">{t('add.comments')}</Label>
                    <Textarea
                      id="description"
                      value={newGrade.description}
                      onChange={(e) => setNewGrade({ ...newGrade, description: e.target.value })}
                      placeholder={t('add.commentsPlaceholder')}
                    />
                  </div>
                  <Button onClick={handleCreateGrade} className="w-full">
                    {t('add.save')}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            </div>
          )}
          
        </div>
      </div>


      <Tabs defaultValue="entry" className="space-y-4">
        <TabsList>
          <TabsTrigger value="entry">{t('panels.entry')}</TabsTrigger>
          <TabsTrigger value="workflow">{t('panels.workflow')}</TabsTrigger>
        </TabsList>

        <TabsContent value="entry" className="space-y-6">
          <GradesEntryPanel
            filteredGrades={filteredGrades}
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            filterType={filterType}
            onFilterTypeChange={setFilterType}
            coursesCount={courses.length}
            canCreateGrades={canCreateGrades}
          />
        </TabsContent>

        <TabsContent value="workflow" className="space-y-4">
          <GradesWorkflowPanel
            courses={courses}
            periods={periods}
            canPublish={canPublish}
            canCompute={canCompute}
            canShowCreateActions={canShowCreateActions}
            workflowBusy={workflowBusy}
            onOpenExport={() => setIsExportOpen(true)}
            publishCourseId={publishCourseId}
            onPublishCourseIdChange={setPublishCourseId}
            publishPeriodId={publishPeriodId}
            onPublishPeriodIdChange={setPublishPeriodId}
            onPublish={handlePublish}
            computeClassId={computeClassId}
            onComputeClassIdChange={setComputeClassId}
            computePeriodId={computePeriodId}
            onComputePeriodIdChange={setComputePeriodId}
            onCompute={handleCompute}
            isImportOpen={isImportOpen}
            onImportOpenChange={setIsImportOpen}
            importCourseId={importCourseId}
            onImportCourseIdChange={setImportCourseId}
            importPeriodId={importPeriodId}
            onImportPeriodIdChange={setImportPeriodId}
            importTitle={importTitle}
            onImportTitleChange={setImportTitle}
            importCsv={importCsv}
            onImportCsvChange={(value) => {
              setImportCsv(value);
              setImportPreviewRows(previewCsvRows(value));
              setImportReport(null);
            }}
            importPreviewRows={importPreviewRows}
            importReport={importReport}
            importing={importing}
            onDownloadTemplate={downloadGradeTemplate}
            onImportFile={(file) => void handleImportFile(file)}
            onImportCsv={() => void handleImportCsv()}
          />
        </TabsContent>
      </Tabs>

      <ExportDialog
        open={isExportOpen}
        onOpenChange={setIsExportOpen}
        dataType="grades"
        data={filteredGrades}
      />
    </div>
  );
};

/**
 * Entrée `/grades` : l’élève est renvoyé vers Mes notes ; hors rôles
 * enseignant/direction → dashboard ; admin (ou staff) sans établissement →
 * institutions / dashboard (évite une surface notes vide).
 */
const GradesPageEntry = () => {
  const { user } = useStrkAuth();

  if (user?.role === 'student') {
    return <Navigate to="/my-grades" replace />;
  }
  if (!user || !hasAnyRole(user.role, TEACHING_ROLES)) {
    return <Navigate to="/dashboard" replace />;
  }
  if (!user.institutionId) {
    return <Navigate to={user.role === 'admin' ? '/institutions' : '/dashboard'} replace />;
  }
  return <GradesPage />;
};

export default GradesPageEntry;
