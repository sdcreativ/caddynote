import { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useStrkUsers } from '@/hooks/useStrkUsers';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { useStrkClasses } from '@/hooks/useStrkClasses';
import StudentCard from '@/components/students/StudentCard';
import { StudentDetailsDialog } from '@/components/students/StudentDetailsDialog';
import { CreateStudentDialog } from '@/components/students/CreateStudentDialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Filter, Search, UserPlus, Download, Upload, CheckSquare, ClipboardList, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { apiClient } from '@/lib/apiClient';
import { previewCsvRows } from '@/lib/csvPreview';
import { hasAnyRole, INSTITUTION_STAFF_ROLES, SECRETARIAT_ROLES } from '@/lib/roles';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { QuickActionsManager } from '@/components/quick-actions/QuickActionsManager';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const STUDENT_CSV_TEMPLATE =
  'firstName,lastName,email,phoneNumber,className,studentNumber\nMarie,Koné,marie.kone@ecole.edu,+2250700000000,6ème A,MAT-001\n';

const Students = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [importPreview, setImportPreview] = useState<{ csv: string; rows: string[][] } | null>(null);
  const [importing, setImporting] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation('students');
  const { t: tc } = useTranslation('common');
  const confirm = useConfirmDialog();
  const { user } = useStrkAuth();
  const { users: students, isLoading, loadUsersByInstitution, updateUser, deleteUser, reactivateUser } = useStrkUsers();
  const { classes, isLoading: classesLoading, loadClassesByInstitution } = useStrkClasses();

  useEffect(() => {
    if (user?.institutionId && hasAnyRole(user.role, INSTITUTION_STAFF_ROLES) && !hasLoaded) {
      loadUsersByInstitution(user.institutionId);
      loadClassesByInstitution(user.institutionId);
      setHasLoaded(true);
    }
  }, [user?.institutionId, user?.role, hasLoaded, loadUsersByInstitution, loadClassesByInstitution]);

  const canManageStudents = hasAnyRole(user?.role, SECRETARIAT_ROLES);

  if (user && !user.institutionId) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!hasAnyRole(user?.role, INSTITUTION_STAFF_ROLES)) {
    return (
      <div className="space-y-6 py-6 animate-fade-in">
        <div className="text-center py-12">
          <Search className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-lg font-semibold text-gray-900">{t('forbiddenTitle')}</h3>
          <p className="mt-1 text-sm text-gray-500">
            {t('forbiddenBody')}
          </p>
        </div>
      </div>
    );
  }

  const studentUsers = students.filter(u => u.role === 'student');
  
  // Transformer les étudiants pour ajouter les propriétés manquantes
  const studentsWithStatus = studentUsers.map(student => ({
    ...student,
    name: student.name || t('unnamed'),
    email: student.email || t('noEmail'),
    loginEmail: student.email || null,
    hasLogin: Boolean(student.email),
    class: t('unassigned'), // Pour l'instant, pas de classe assignée
    // PER-005 : reflète l'état réel du compte (désactivé n'est plus un état
    // fictif — c'était toujours "active" en dur avant, quel que soit le
    // statut réel, et les actions Suspendre/Réactiver n'avaient aucun effet).
    status: student.isActive === false ? 'suspended' as const : 'active' as const,
    phone: student.phoneNumber,
    dateOfBirth: undefined,
    address: undefined,
    attendanceRate: 95 // Valeur par défaut
  }));
  
  // Filtrer les étudiants en fonction des critères
  const filteredStudents = studentsWithStatus.filter(student => {
    const matchesSearch = (student.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (student.email || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesClass = classFilter === 'all' || student.class === classFilter;
    const matchesStatus = statusFilter === 'all' || student.status === statusFilter;
    
    return matchesSearch && matchesClass && matchesStatus;
  });

  // Créer une liste de filtres de classes basée sur les vraies classes
  const classFilters = ['all', ...classes.map(cls => cls.name)];

  const handleViewDetails = (studentId: string) => {
    const student = studentsWithStatus.find(s => s.id === studentId);
    if (student) {
      setSelectedStudent(student);
    }
  };

  const handleEditStudent = (studentId: string) => {
    const student = studentsWithStatus.find(s => s.id === studentId);
    if (student) {
      setSelectedStudent({ ...student, isEditing: true });
    }
  };

  const handleSaveStudent = async (studentData: any) => {
    try {
      await updateUser(selectedStudent.id, {
        name: studentData.name,
        email: studentData.email,
        phoneNumber: studentData.phone,
        // Note: Le statut et la classe nécessitent une logique supplémentaire
      });

      toast({
        title: t('updatedTitle'),
        description: t('updatedBody'),
      });

      // Recharger les données
      if (user?.institutionId) {
        loadUsersByInstitution(user.institutionId);
      }
      
      setSelectedStudent(null);
    } catch (error) {
      toast({
        title: tc('status.error'),
        description: t('saveError'),
        variant: "destructive",
      });
    }
  };

  // PER-005 : "supprimer" et "suspendre" pointent vers la même action
  // côté serveur (désactivation — le compte et son historique sont
  // conservés, seule la connexion est bloquée) : il n'existe pas de
  // distinction "suspendu temporairement" vs "désactivé" dans le modèle
  // de données, donc pas d'UI qui prétendrait le contraire.
  const handleDeleteStudent = async (studentId: string) => {
    const ok = await confirm({
      title: tc('actions.confirm'),
      description: t('deactivateConfirm'),
      variant: 'destructive',
      confirmLabel: tc('actions.delete'),
    });
    if (ok) {
      try {
        await deleteUser(studentId);
        toast({
          title: t('deactivatedTitle'),
          description: t('deactivatedBody'),
        });

        // Recharger les données
        if (user?.institutionId) {
          loadUsersByInstitution(user.institutionId);
        }
      } catch (error) {
        toast({
          title: tc('status.error'),
          description: t('deactivateError'),
          variant: "destructive",
        });
      }
    }
  };

  const handleSuspendStudent = async (studentId: string) => {
    await handleDeleteStudent(studentId);
  };

  const handleReactivateStudent = async (studentId: string) => {
    try {
      await reactivateUser(studentId);
      toast({
        title: t('reactivatedTitle'),
        description: t('reactivatedBody'),
      });
      if (user?.institutionId) {
        loadUsersByInstitution(user.institutionId);
      }
    } catch (error) {
      toast({
        title: tc('status.error'),
        description: t('reactivateError'),
        variant: "destructive",
      });
    }
  };

  const handleContact = (studentId: string) => {
    toast({
      title: t('contactTitle'),
      description: t('contactBody', { id: studentId }),
    });
  };

  const handleSelectStudent = (studentId: string, selected: boolean) => {
    if (selected) {
      setSelectedStudents(prev => [...prev, studentId]);
    } else {
      setSelectedStudents(prev => prev.filter(id => id !== studentId));
    }
  };

  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      setSelectedStudents(filteredStudents.map(s => s.id));
    } else {
      setSelectedStudents([]);
    }
  };

  const handleBatchAction = (action: string) => {
    toast({
      title: t('batchTitle', { action }),
      description: t('batchBody', { count: selectedStudents.length }),
    });
  };

  const exportStudents = () => {
    const csvContent = [
      ['Nom', 'Email', 'Classe', 'Statut', 'Téléphone'].join(','),
      ...filteredStudents.map(student => [
        student.name || '',
        student.email || '',
        student.class || t('unassigned'),
        student.status || 'active',
        student.phone || ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `etudiants-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // ELV-005 : import en masse (colonnes attendues :
  // firstName,lastName,email,phoneNumber,className,studentNumber).
  // Contrepartie de l'export ci-dessus, réellement traité côté serveur
  // (POST /students/import) — pas une simulation.
  const handleImportFile = async (file: File) => {
    const csv = await file.text();
    setImportPreview({ csv, rows: previewCsvRows(csv) });
  };

  const confirmImport = async () => {
    if (!importPreview || !user?.institutionId) return;
    setImporting(true);
    try {
      const { results, created, skipped, errors } = await apiClient.post<{
        results: { row: number; email: string; status: string; error?: string }[];
        created: number;
        skipped: number;
        errors: number;
      }>('/students/import', { csv: importPreview.csv, institutionId: user.institutionId });

      toast({
        title: t('importDoneTitle'),
        description: t('importDoneBody', { created, skipped, errors }),
        variant: errors > 0 ? 'destructive' : undefined,
      });
      if (errors > 0) {
        console.warn('Lignes en erreur lors de l’import :', results.filter((r) => r.status === 'error'));
      }
      loadUsersByInstitution(user.institutionId);
      setImportPreview(null);
    } catch (error) {
      toast({
        title: t('importErrorTitle'),
        description: error instanceof Error ? error.message : t('importErrorBody'),
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
    }
  };

  const downloadImportTemplate = () => {
    const blob = new Blob([STUDENT_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modele-import-eleves.csv';
    a.click();
    window.URL.revokeObjectURL(url);
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
          <Button variant="outline" asChild>
            <Link to="/admissions" target="_blank" rel="noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              {t('publicSignup')}
            </Link>
          </Button>

          <Button className="bg-[#1D70D8] hover:bg-[#1a63c2]" asChild>
            <Link to="/admissions/admin">
              <ClipboardList className="mr-2 h-4 w-4" />
              {t('admissionsQueue')}
            </Link>
          </Button>

          <Button variant="outline" onClick={exportStudents}>
            <Download className="mr-2 h-4 w-4" />
            {tc('actions.export')}
          </Button>

          {canManageStudents && (
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

              <Button variant="ghost" onClick={() => setShowCreateDialog(true)}>
                <UserPlus className="mr-2 h-4 w-4" />
                {t('manualCreate')}
              </Button>
            </>
          )}
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
          
          <div className="flex items-center space-x-4 w-full sm:w-auto">
            <div className="flex items-center space-x-2">
              <Filter className="h-5 w-5 text-gray-500" />
              <span className="text-gray-700">{t('filters')}</span>
            </div>
            
            <Select
              value={classFilter}
              onValueChange={setClassFilter}
            >
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder={t('classPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {classFilters.map((classItem) => (
                  <SelectItem key={classItem} value={classItem}>
                    {classItem === 'all' ? t('allClasses') : classItem}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={statusFilter}
              onValueChange={setStatusFilter}
            >
              <SelectTrigger className="w-full sm:w-[140px]">
                <SelectValue placeholder={t('statusPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allStatuses')}</SelectItem>
                <SelectItem value="active">{t('statusActive')}</SelectItem>
                <SelectItem value="inactive">{t('statusInactive')}</SelectItem>
                <SelectItem value="suspended">{t('statusSuspended')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Actions en lot */}
        {selectedStudents.length > 0 && (
          <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <CheckSquare className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-800">
                {t('selected', { count: selectedStudents.length })}
              </span>
            </div>
            <div className="flex space-x-2">
              <Button size="sm" variant="outline" onClick={() => handleBatchAction('export')}>
                {tc('actions.export')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleBatchAction('suspend')}>
                {t('suspend')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSelectedStudents([])}>
                {t('deselect')}
              </Button>
            </div>
          </div>
        )}
        
        {isLoading ? (
          <LoadingState label={t('loading')} />
        ) : filteredStudents.length > 0 ? (
          <div className="space-y-4">
            {/* Sélection globale */}
            <div className="flex items-center space-x-2 border-b pb-2">
              <Checkbox
                checked={selectedStudents.length === filteredStudents.length && filteredStudents.length > 0}
                onCheckedChange={handleSelectAll}
              />
              <span className="text-sm text-gray-600">
                {t('selectAll', { count: filteredStudents.length })}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredStudents.map((student) => (
                <div key={student.id} className="relative">
                  <div className="absolute top-2 left-2 z-10">
                    <Checkbox
                      checked={selectedStudents.includes(student.id)}
                      onCheckedChange={(checked) => handleSelectStudent(student.id, checked as boolean)}
                    />
                  </div>
                  <StudentCard 
                    student={student}
                    onViewDetails={handleViewDetails}
                    onContact={handleContact}
                    onEdit={handleEditStudent}
                    onDelete={handleDeleteStudent}
                    onSuspend={handleSuspendStudent}
                    onReactivate={handleReactivateStudent}
                    showActions={user?.role === 'school_admin' || user?.role === 'admin'}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState
            title={studentUsers.length === 0 ? t('emptyTitle') : t('noResultTitle')}
            description={
              studentUsers.length === 0
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
                        <td key={j} className="border-b px-2 py-1">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportPreview(null)}>{tc('actions.cancel')}</Button>
            <Button onClick={() => void confirmImport()} disabled={importing}>
              {importing ? t('importing') : tc('actions.import')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de création d'étudiant */}
      <CreateStudentDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreated={() => {
          if (user?.institutionId) void loadUsersByInstitution(user.institutionId);
        }}
        classes={classes}
        isLoading={classesLoading}
      />

      {/* Dialog de détails/édition d'étudiant */}
      <StudentDetailsDialog
        student={selectedStudent}
        isOpen={!!selectedStudent}
        onClose={() => setSelectedStudent(null)}
        onSave={handleSaveStudent}
        onAccessChanged={() => {
          if (user?.institutionId) void loadUsersByInstitution(user.institutionId);
        }}
        classes={classes}
        isEditing={selectedStudent?.isEditing}
      />
      
      <QuickActionsManager />
    </div>
  );
};

export default Students;
