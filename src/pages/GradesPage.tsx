import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Filter, FileDown, TrendingUp, Award, Send, Calculator, Download, Upload } from "lucide-react";
import { useStrkAuth } from "@/hooks/useStrkAuth";
import { usePermissions } from "@/hooks/usePermissions";
import {
  fetchGradesByStudent,
  fetchGradesByTeacher,
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
import { useToast } from "@/hooks/use-toast";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { useTranslation } from 'react-i18next';
import { EmptyState } from "@/components/ui/EmptyState";
import { StrkGrade } from "@/types/strk";
import { previewCsvRows } from "@/lib/csvPreview";
import { trackProductEvent } from "@/lib/productTelemetry";

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
  const isStudent = user?.role === 'student';
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
      if (isStudent) {
        data = await fetchGradesByStudent(user.id);
      } else if (isTeacher) {
        data = await fetchGradesByTeacher(user.id);
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
            {isStudent ? t('subtitleStudent') : t('subtitleTeacher')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setIsExportOpen(true)}>
            <FileDown className="mr-2 h-4 w-4" />
            {tc('actions.export')}
          </Button>
          {canPublish && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Send className="mr-2 h-4 w-4" />
                  {t('publish')}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('publishDialog.title')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>{t('course')}</Label>
                    <Select value={publishCourseId} onValueChange={setPublishCourseId}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('chooseCourse')} />
                      </SelectTrigger>
                      <SelectContent>
                        {courses.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('period')}</Label>
                    <Select value={publishPeriodId} onValueChange={setPublishPeriodId}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('period')} />
                      </SelectTrigger>
                      <SelectContent>
                        {periods.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handlePublish} disabled={workflowBusy} className="w-full">
                    {t('publishDialog.action')}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
          {canCompute && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Calculator className="mr-2 h-4 w-4" />
                  {t('computeAverages')}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('computeDialog.title')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>{t('computeDialog.classId')}</Label>
                    <Input
                      value={computeClassId}
                      onChange={(e) => setComputeClassId(e.target.value)}
                      placeholder={t('computeDialog.classUuidPlaceholder')}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('computeDialog.classHint')}
                    </p>
                    <Select
                      onValueChange={(courseId) => {
                        const c = courses.find((x) => x.id === courseId);
                        if (c?.class_id) setComputeClassId(c.class_id);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('computeDialog.fillFromCourse')} />
                      </SelectTrigger>
                      <SelectContent>
                        {courses.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('period')}</Label>
                    <Select value={computePeriodId} onValueChange={setComputePeriodId}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('period')} />
                      </SelectTrigger>
                      <SelectContent>
                        {periods.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleCompute} disabled={workflowBusy} className="w-full">
                    {t('computeDialog.action')}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
          {canCreateGrades && (
            <>
            <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">{t('importCsv')}</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[640px]">
                <DialogHeader>
                  <DialogTitle>{t('import.title')}</DialogTitle>
                  <DialogDescription>
                    {t('import.description')}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={downloadGradeTemplate}>
                      <Download className="mr-2 h-4 w-4" />
                      {t('import.template')}
                    </Button>
                    <Button type="button" variant="outline" size="sm" asChild>
                      <label className="cursor-pointer">
                        <Upload className="mr-2 h-4 w-4" />
                        {t('import.chooseFile')}
                        <input
                          type="file"
                          accept=".csv,text/csv"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void handleImportFile(file);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>{t('course')}</Label>
                      <Select value={importCourseId} onValueChange={setImportCourseId}>
                        <SelectTrigger><SelectValue placeholder={t('course')} /></SelectTrigger>
                        <SelectContent>
                          {courses.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>{t('period')}</Label>
                      <Select value={importPeriodId} onValueChange={setImportPeriodId}>
                        <SelectTrigger><SelectValue placeholder={t('period')} /></SelectTrigger>
                        <SelectContent>
                          {periods.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>{t('import.evalTitle')}</Label>
                    <Input value={importTitle} onChange={(e) => setImportTitle(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>{t('import.csvPaste')}</Label>
                    <Textarea
                      rows={6}
                      value={importCsv}
                      onChange={(e) => {
                        setImportCsv(e.target.value);
                        setImportPreviewRows(previewCsvRows(e.target.value));
                        setImportReport(null);
                      }}
                      placeholder="studentNumber,gradeValue"
                    />
                  </div>
                  {importPreviewRows.length > 0 && (
                    <div className="max-h-40 overflow-auto rounded border text-xs">
                      <table className="w-full">
                        <tbody>
                          {importPreviewRows.map((row, i) => (
                            <tr key={i} className={i === 0 ? 'bg-muted font-medium' : ''}>
                              {row.map((cell, j) => (
                                <td key={j} className="border-b px-2 py-1">{cell}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {importReport && (
                    <div className="rounded border bg-muted/40 p-3 text-sm">
                      <p>
                        {t('import.report', { created: importReport.created, skipped: importReport.skipped, errors: importReport.errors })}
                      </p>
                      {importReport.errors > 0 && (
                        <ul className="mt-2 max-h-24 overflow-auto text-xs text-destructive">
                          {importReport.results
                            .filter((r) => r.status === 'error')
                            .slice(0, 8)
                            .map((r) => (
                              <li key={`${r.row}-${r.key}`}>
                                {t('import.rowError', { row: r.row, key: r.key, error: r.error || t('import.errorFallback') })}
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>
                  )}
                  <Button onClick={() => void handleImportCsv()} disabled={importing}>
                    {importing ? t('import.importing') : tc('actions.import')}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
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
            </>
          )}
        </div>
      </div>

      {/* Statistiques */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('stats.average')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{t('outOf20', { value: calculateAverage() })}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('stats.count')}</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredGrades.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('stats.best')}</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {t('outOf20', {
                value: filteredGrades.length > 0
                  ? Math.max(...filteredGrades.map(g => (g.grade_value / g.max_grade) * 20)).toFixed(1)
                  : 0,
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtres */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[200px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filter.all')}</SelectItem>
            <SelectItem value="evaluation">{t('filter.evaluation')}</SelectItem>
            <SelectItem value="devoir">{t('filter.devoir')}</SelectItem>
            <SelectItem value="exposé">{t('filter.expose')}</SelectItem>
            <SelectItem value="participation">{t('filter.participation')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Liste des notes */}
      <div className="grid gap-4">
        {filteredGrades.map((grade) => (
          <Card key={grade.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">{grade.title}</CardTitle>
                  <CardDescription>
                    {new Date(grade.date).toLocaleDateString('fr-FR')} • {grade.grade_type}
                  </CardDescription>
                </div>
                <div className="text-right">
                  <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getGradeColor(grade.grade_value, grade.max_grade)}`}>
                    {grade.grade_value}/{grade.max_grade}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {t('outOf20', { value: ((grade.grade_value / grade.max_grade) * 20).toFixed(1) })}
                  </div>
                </div>
              </div>
            </CardHeader>
            {grade.description && (
              <CardContent>
                <p className="text-sm text-muted-foreground">{grade.description}</p>
              </CardContent>
            )}
          </Card>
        ))}

        {filteredGrades.length === 0 && (
          <EmptyState
            title={t('empty.title')}
            description={
              searchTerm || filterType !== 'all'
                ? t('empty.noMatch')
                : t('empty.none')
            }
          />
        )}
      </div>

      <ExportDialog
        open={isExportOpen}
        onOpenChange={setIsExportOpen}
        dataType="grades"
        data={filteredGrades}
      />
    </div>
  );
};

export default GradesPage;
