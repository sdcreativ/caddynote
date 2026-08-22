
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { PlusCircle, Users, GraduationCap, Search, Eye, Edit, Trash, Download, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useStrkClasses } from '@/hooks/useStrkClasses';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { CreateClassDialog } from '@/components/admin/CreateClassDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { apiClient, ApiError } from '@/lib/apiClient';
import { previewCsvRows } from '@/lib/csvPreview';
import { hasAnyRole, SECRETARIAT_ROLES } from '@/lib/roles';
import { useTranslation } from 'react-i18next';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';

const CLASS_CSV_TEMPLATE =
  'name,academicYear,description,maxStudents,teacherEmail\n6ème A,2025-2026,Classe de 6ème,30,jean.dupont@ecole.fr\n5ème B,2025-2026,,,marie.martin@ecole.fr\n';

// Modèle pour un cours
interface Course {
  id: string;
  name: string;
  teacher: string;
  schedule: string;
}

const Classes = () => {
  const { t } = useTranslation('classes');
  const { t: tc } = useTranslation('common');
  const confirm = useConfirmDialog();
  const { user } = useStrkAuth();
  const { classes, isLoading, loadClassesByInstitution, removeClass } = useStrkClasses();
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddClassDialog, setShowAddClassDialog] = useState(false);
  const [selectedClass, setSelectedClass] = useState<any | null>(null);
  const [showManageCourses, setShowManageCourses] = useState(false);
  const [coursesList, setCoursesList] = useState<Course[]>([]);
  const [showAddCourseDialog, setShowAddCourseDialog] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [newCourse, setNewCourse] = useState<Course>({ id: '', name: '', teacher: '', schedule: '' });
  const [importPreview, setImportPreview] = useState<{ csv: string; rows: string[][] } | null>(null);
  const [importing, setImporting] = useState(false);
  const { toast } = useToast();
  const canImport = hasAnyRole(user?.role, SECRETARIAT_ROLES);

  useEffect(() => {
    if (user?.institutionId) {
      loadClassesByInstitution(user.institutionId);
    }
  }, [user?.institutionId, loadClassesByInstitution]);

  const handleAddClass = () => {
    setShowAddClassDialog(true);
  };

  const handleDeleteClass = async (classId: string) => {
    const ok = await confirm({
      title: tc('actions.confirm'),
      description: t('deleteConfirm'),
      variant: 'destructive',
      confirmLabel: tc('actions.delete'),
    });
    if (ok) {
      const success = await removeClass(classId);
      if (success) {
        toast({
          title: t('deletedTitle'),
          description: t('deletedBody'),
        });
      }
    }
  };

  const handleViewDetails = (classItem: any) => {
    setSelectedClass(classItem);
  };

  const handleManageCourses = () => {
    setShowManageCourses(true);
    setSelectedClass(null); // Ferme la boîte de dialogue des détails
  };

  // Gérer l'ajout d'un nouveau cours
  const handleAddCourse = () => {
    setEditingCourse(null);
    setNewCourse({ id: Date.now().toString(), name: '', teacher: '', schedule: '' });
    setShowAddCourseDialog(true);
  };

  // Gérer la modification d'un cours existant
  const handleEditCourse = (course: Course) => {
    setEditingCourse(course);
    setNewCourse(course);
    setShowAddCourseDialog(true);
  };

  // Gérer la suppression d'un cours
  const handleDeleteCourse = (courseId: string) => {
    setCoursesList(coursesList.filter(course => course.id !== courseId));
    
    toast({
      title: t('courses.deletedTitle'),
      description: t('courses.deletedBody'),
    });
  };

  // Sauvegarder un nouveau cours ou mettre à jour un cours existant
  const handleSaveCourse = () => {
    if (editingCourse) {
      // Mettre à jour un cours existant
      setCoursesList(coursesList.map(course => 
        course.id === editingCourse.id ? newCourse : course
      ));
      
      toast({
        title: t('courses.updatedTitle'),
        description: t('courses.updatedBody'),
      });
    } else {
      // Ajouter un nouveau cours
      setCoursesList([...coursesList, newCourse]);
      
      toast({
        title: t('courses.addedTitle'),
        description: t('courses.addedBody'),
      });
    }
    
    setShowAddCourseDialog(false);
  };

  // Gérer les modifications du formulaire de cours
  const handleCourseInputChange = (field: keyof Course, value: string) => {
    setNewCourse({
      ...newCourse,
      [field]: value
    });
  };

  // Sauvegarder les modifications des cours
  const handleSaveAllCourses = () => {
    setShowManageCourses(false);
    toast({
      title: t('courses.savedTitle'),
      description: t('courses.savedBody'),
    });
  };

  // Filtrer les classes en fonction du terme de recherche
  const filteredClasses = classes.filter(cls =>
    cls.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (cls.teacher_name && cls.teacher_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const downloadImportTemplate = () => {
    const blob = new Blob([CLASS_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modele-import-classes.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File) => {
    const csv = await file.text();
    setImportPreview({ csv, rows: previewCsvRows(csv) });
  };

  const confirmImport = async () => {
    if (!importPreview || !user?.institutionId) return;
    setImporting(true);
    try {
      const summary = await apiClient.post<{
        created: number;
        skipped: number;
        errors: number;
        results: { row: number; key: string; status: string; error?: string }[];
      }>('/classes/import', { csv: importPreview.csv, institutionId: user.institutionId });

      toast({
        title: t('importDoneTitle'),
        description: t('importDoneBody', {
          created: summary.created,
          skipped: summary.skipped,
          errors: summary.errors,
        }),
        variant: summary.errors > 0 ? 'destructive' : undefined,
      });
      if (summary.errors > 0) {
        console.warn('Lignes en erreur :', summary.results.filter((r) => r.status === 'error'));
      }
      loadClassesByInstitution(user.institutionId);
      setImportPreview(null);
    } catch (error) {
      toast({
        title: t('importErrorTitle'),
        description: error instanceof ApiError || error instanceof Error ? error.message : t('importErrorBody'),
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6 py-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="text-gray-500 mt-1">
            {t('subtitle')}
          </p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {canImport && (
            <>
              <Button variant="outline" onClick={downloadImportTemplate}>
                <Download className="mr-2 h-4 w-4" />
                {t('templateCsv')}
              </Button>
              <Button variant="outline" asChild>
                <label className="cursor-pointer">
                  <Upload className="mr-2 h-4 w-4" />
                  {tc('actions.import')}
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
            </>
          )}
          <Button 
            className="bg-edusign-600 hover:bg-edusign-700"
            onClick={handleAddClass}
          >
            <PlusCircle className="mr-2 h-5 w-5" />
            {t('addClass')}
          </Button>
        </div>
      </div>
      
      <div className="bg-white shadow-sm rounded-lg p-6">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center mb-6">
          <div className="relative w-full sm:max-w-xs">
            <Input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
            <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
          </div>
        </div>
        
        {isLoading ? (
          <LoadingState label={t('loading')} />
        ) : filteredClasses.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredClasses.map((cls) => (
              <Card key={cls.id} className="overflow-hidden hover:shadow-md transition-shadow">
                <CardHeader className="pb-4">
                  <CardTitle>{cls.name}</CardTitle>
                  <CardDescription>
                    {t('homeroomTeacher', { name: cls.teacher_name || t('unassigned') })}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pb-4">
                  <div className="space-y-3">
                    <div className="flex items-center">
                      <Users className="h-5 w-5 text-gray-500 mr-2" />
                      <span className="text-sm">{t('studentCount', { count: cls.student_count || 0 })}</span>
                    </div>
                    <div className="text-sm text-slate-600 pl-7">
                      {t('genderHeadcount', {
                        girls: cls.female_count || 0,
                        boys: cls.male_count || 0,
                      })}
                    </div>
                    <div className="flex items-center">
                      <GraduationCap className="h-5 w-5 text-gray-500 mr-2" />
                      <span className="text-sm">{t('courseCount', { count: cls.total_courses || 0 })}</span>
                    </div>
                    {cls.academic_year && (
                      <div>
                        <span className="text-sm text-gray-500">{t('yearLabel', { year: cls.academic_year })}</span>
                      </div>
                    )}
                    {cls.max_students && (
                      <div>
                        <span className="text-sm text-gray-500">{t('maxCapacity', { max: cls.max_students })}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
                <CardFooter className="pt-2 pb-4 flex justify-between">
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/students?class=${cls.name}`}>
                      {t('viewStudents')}
                    </Link>
                  </Button>
                  <div className="flex gap-2">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleViewDetails(cls)}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      {t('details')}
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => handleDeleteClass(cls.id)}
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            title={classes.length === 0 ? t('emptyTitle') : t('noResultTitle')}
            description={
              classes.length === 0
                ? t('emptyBody')
                : t('noResultBody')
            }
          />
        )}
      </div>

      <Dialog open={!!importPreview} onOpenChange={(open) => { if (!open) setImportPreview(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('importTitle')}</DialogTitle>
            <DialogDescription>
              {t('importDescription')}
            </DialogDescription>
          </DialogHeader>
          {importPreview && (
            <div className="max-h-64 overflow-auto rounded border text-xs">
              <table className="w-full">
                <tbody>
                  {importPreview.rows.map((row, i) => (
                    <tr key={i} className={i === 0 ? 'bg-muted font-medium' : ''}>
                      {row.map((cell, j) => (
                        <td key={j} className="border-b px-2 py-1">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportPreview(null)}>
              {tc('actions.cancel')}
            </Button>
            <Button onClick={() => void confirmImport()} disabled={importing}>
              {importing ? t('importing') : tc('actions.import')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialogue pour ajouter une nouvelle classe */}
      <CreateClassDialog 
        open={showAddClassDialog} 
        onOpenChange={setShowAddClassDialog}
        institutionId={user?.institutionId || ''}
      />

      {/* Dialogue pour les détails d'une classe */}
      <Dialog open={!!selectedClass} onOpenChange={() => setSelectedClass(null)}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{t('detailsDialog.title', { name: selectedClass?.name })}</DialogTitle>
            <DialogDescription>
              {t('detailsDialog.description')}
            </DialogDescription>
          </DialogHeader>

          {selectedClass && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">{t('detailsDialog.className')}</p>
                  <p className="font-medium">{selectedClass.name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">{t('detailsDialog.studentCount')}</p>
                  <p className="font-medium">{selectedClass.student_count || 0}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">{t('detailsDialog.genderHeadcount')}</p>
                  <p className="font-medium">
                    {t('detailsDialog.genderHeadcountValue', {
                      girls: selectedClass.female_count || 0,
                      boys: selectedClass.male_count || 0,
                    })}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-500">{t('detailsDialog.homeroom')}</p>
                <p className="font-medium">{selectedClass.teacher_name || t('unassigned')}</p>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-500">{t('detailsDialog.extraInfo')}</p>
                <div className="space-y-2 mt-2">
                  {selectedClass.academic_year && (
                    <div>
                      <span className="text-sm">{t('detailsDialog.academicYear', { year: selectedClass.academic_year })}</span>
                    </div>
                  )}
                  {selectedClass.max_students && (
                    <div>
                      <span className="text-sm">{t('detailsDialog.maxCapacity', { max: selectedClass.max_students })}</span>
                    </div>
                  )}
                  {selectedClass.description && (
                    <div>
                      <span className="text-sm">{t('detailsDialog.classDescription', { description: selectedClass.description })}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-sm">{t('detailsDialog.totalCourses', { count: selectedClass.total_courses || 0 })}</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex flex-col gap-2">
                <Button asChild>
                  <Link to={`/students?class=${selectedClass.name}`}>
                    <Users className="mr-2 h-5 w-5" />
                    {t('detailsDialog.viewAllStudents')}
                  </Link>
                </Button>
                <Button 
                  variant="outline" 
                  onClick={handleManageCourses}
                >
                  <GraduationCap className="mr-2 h-5 w-5" />
                  {t('detailsDialog.manageCourses')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialogue pour gérer les cours */}
      <Dialog open={showManageCourses} onOpenChange={setShowManageCourses}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>{t('courses.manageTitle')}</DialogTitle>
            <DialogDescription>
              {t('courses.manageDescription')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">{t('courses.list')}</h3>
              <Button size="sm" onClick={handleAddCourse}>
                <PlusCircle className="mr-2 h-4 w-4" />
                {t('courses.add')}
              </Button>
            </div>
            
            <div className="border rounded-md">
              {coursesList.map((course) => (
                <div key={course.id} className="flex justify-between items-center border-b last:border-b-0 p-4">
                  <div className="flex-1">
                    <h4 className="font-medium">{course.name}</h4>
                    <p className="text-sm text-gray-500">{course.teacher} - {course.schedule}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => handleEditCourse(course)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-500" onClick={() => handleDeleteCourse(course.id)}>
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              
              {coursesList.length === 0 && (
                <div className="p-4 text-center text-gray-500">
                  {t('courses.empty')}
                </div>
              )}
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowManageCourses(false)}>
                {tc('actions.close')}
              </Button>
              <Button onClick={handleSaveAllCourses}>
                {tc('actions.save')}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialogue pour ajouter/modifier un cours */}
      <Dialog open={showAddCourseDialog} onOpenChange={setShowAddCourseDialog}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>{editingCourse ? t('courses.editTitle') : t('courses.addTitle')}</DialogTitle>
            <DialogDescription>
              {editingCourse ? t('courses.editDescription') : t('courses.addDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="courseName">{t('courses.name')}</Label>
              <Input 
                id="courseName" 
                placeholder={t('courses.namePlaceholder')} 
                value={newCourse.name}
                onChange={(e) => handleCourseInputChange('name', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="courseTeacher">{t('courses.teacher')}</Label>
              <Select value={newCourse.teacher} onValueChange={(value) => handleCourseInputChange('teacher', value)}>
                <SelectTrigger id="courseTeacher">
                  <SelectValue placeholder={t('courses.teacherPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Dr. Konaté">Dr. Konaté</SelectItem>
                  <SelectItem value="Dr. Diallo">Dr. Diallo</SelectItem>
                  <SelectItem value="Dr. Touré">Dr. Touré</SelectItem>
                  <SelectItem value="Dr. Camara">Dr. Camara</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="courseSchedule">{t('courses.schedule')}</Label>
              <Input 
                id="courseSchedule" 
                placeholder={t('courses.schedulePlaceholder')} 
                value={newCourse.schedule}
                onChange={(e) => handleCourseInputChange('schedule', e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddCourseDialog(false)}>{tc('actions.cancel')}</Button>
            <Button onClick={handleSaveCourse}>{editingCourse ? t('courses.update') : tc('actions.add')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Classes;
