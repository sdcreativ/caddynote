import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Mail, Phone, Download, Upload, School } from 'lucide-react';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { useStrkUsers } from '@/hooks/useStrkUsers';
import { useToast } from '@/hooks/use-toast';
import { apiClient, ApiError } from '@/lib/apiClient';
import { previewCsvRows } from '@/lib/csvPreview';
import { hasAnyRole, SECRETARIAT_ROLES } from '@/lib/roles';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import CreateUserDialog from '@/components/admin/CreateUserDialog';
import {
  AssignTeacherClassDialog,
  TeacherHomeroomBadges,
} from '@/components/teachers/AssignTeacherClassDialog';
import { fetchClassesByInstitution, type ClassWithDetails } from '@/services/strkClassService';
import type { User as StrkUser } from '@/types/strk';
import { useTranslation } from 'react-i18next';

const TEACHER_CSV_TEMPLATE =
  'firstName,lastName,email,phoneNumber,role\nJean,Dupont,jean.dupont@ecole.fr,0600000000,teacher\nMarie,Martin,marie.martin@ecole.fr,,head_teacher\n';

/**
 * Chap. 22.1 — liste enseignants + import CSV + attribution classe titulaire.
 */
const TeachersPage = () => {
  const { t } = useTranslation('teachers');
  const { t: tc } = useTranslation('common');
  const { user } = useStrkAuth();
  const { toast } = useToast();
  const { users, isLoading, loadUsersByInstitution } = useStrkUsers();
  const [createOpen, setCreateOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<{ csv: string; rows: string[][] } | null>(null);
  const [importing, setImporting] = useState(false);
  const [classes, setClasses] = useState<ClassWithDetails[]>([]);
  const [assignTeacher, setAssignTeacher] = useState<StrkUser | null>(null);
  const canImport = hasAnyRole(user?.role, SECRETARIAT_ROLES);
  const canAssign = hasAnyRole(user?.role, SECRETARIAT_ROLES);

  const refreshClasses = useCallback(async () => {
    if (!user?.institutionId) {
      setClasses([]);
      return;
    }
    try {
      setClasses(await fetchClassesByInstitution(user.institutionId));
    } catch {
      setClasses([]);
    }
  }, [user?.institutionId]);

  useEffect(() => {
    if (user?.institutionId) {
      loadUsersByInstitution(user.institutionId);
      void refreshClasses();
    }
  }, [user?.institutionId, loadUsersByInstitution, refreshClasses]);

  const teachers = users.filter(
    (u) => (u.role === 'teacher' || u.role === 'head_teacher') && u.institutionId === user?.institutionId
  );

  const downloadImportTemplate = () => {
    const blob = new Blob([TEACHER_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modele-import-enseignants.csv';
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
        results: { row: number; email: string; status: string; error?: string }[];
      }>('/users/import', { csv: importPreview.csv, institutionId: user.institutionId });

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
        console.warn(
          'Lignes en erreur :',
          summary.results.filter((r) => r.status === 'error')
        );
      }
      loadUsersByInstitution(user.institutionId);
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
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
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t('newTeacher')}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <LoadingState label={t('loading')} />
      ) : teachers.length === 0 ? (
        <EmptyState
          title={t('emptyTitle')}
          description={t('emptyBody')}
          actionLabel={canImport ? t('templateCsv') : undefined}
          onAction={canImport ? downloadImportTemplate : undefined}
        />
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {teachers.map((teacher) => (
            <Card key={teacher.id}>
              <CardHeader>
                <CardTitle>{teacher.name || teacher.email}</CardTitle>
                <CardDescription>
                  {teacher.role === 'head_teacher' ? t('roleHeadTeacher') : t('roleTeacher')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {teacher.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    {teacher.email}
                  </div>
                )}
                {teacher.phoneNumber && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    {teacher.phoneNumber}
                  </div>
                )}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <School className="h-3.5 w-3.5" aria-hidden />
                    {t('assign.currentLabel')}
                  </div>
                  <TeacherHomeroomBadges teacherId={teacher.id} classes={classes} />
                </div>
                {teacher.isActive === false && <Badge variant="secondary">{t('inactive')}</Badge>}
                {canAssign && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setAssignTeacher(teacher)}
                  >
                    {t('assign.action')}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultRole="teacher"
        onUserCreated={() => {
          if (user?.institutionId) {
            loadUsersByInstitution(user.institutionId);
            void refreshClasses();
          }
        }}
      />

      <AssignTeacherClassDialog
        open={!!assignTeacher}
        onOpenChange={(open) => {
          if (!open) setAssignTeacher(null);
        }}
        teacher={assignTeacher}
        institutionId={user?.institutionId}
        onChanged={() => void refreshClasses()}
      />

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
    </div>
  );
};

export default TeachersPage;
