import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Search, Edit, Trash2, BookOpen } from 'lucide-react';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { useStrkSubjects } from '@/hooks/useStrkSubjects';
import { StrkSubject } from '@/services/strkSubjectService';
import CreateSubjectDialog from '@/components/admin/CreateSubjectDialog';
import EditSubjectDialog from '@/components/admin/EditSubjectDialog';
import { useTranslation } from 'react-i18next';

const SubjectsManagement = () => {
  const { t } = useTranslation('subjects');
  const { t: tc } = useTranslation('common');
  const { user } = useStrkAuth();
  const { subjects, isLoading, loadSubjectsByInstitution, deleteSubject } = useStrkSubjects();
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<StrkSubject | null>(null);

  useEffect(() => {
    if (user?.institutionId) {
      loadSubjectsByInstitution(user.institutionId);
    }
  }, [user?.institutionId, loadSubjectsByInstitution]);

  const filteredSubjects = subjects.filter(subject =>
    subject.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    subject.code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDeleteSubject = async () => {
    if (!selectedSubject) return;
    
    const success = await deleteSubject(selectedSubject.id);
    if (success) {
      setShowDeleteDialog(false);
      setSelectedSubject(null);
    }
  };

  return (
    <div className="space-y-6 py-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('subtitle')}
          </p>
        </div>
        
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 h-5 w-5" />
          {t('newSubject')}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            {t('listTitle', { count: filteredSubjects.length })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-center mb-6">
            <div className="relative w-full sm:max-w-xs">
              <Input
                type="text"
                placeholder={t('searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
              <Search className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
            </div>
          </div>
          
          {isLoading ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">{t('loading')}</p>
            </div>
          ) : filteredSubjects.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('colName')}</TableHead>
                  <TableHead>{t('colCode')}</TableHead>
                  <TableHead>{t('colDescription')}</TableHead>
                  <TableHead>{t('colCreated')}</TableHead>
                  <TableHead className="text-right">{t('colActions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSubjects.map((subject) => (
                  <TableRow key={subject.id}>
                    <TableCell>
                      <div className="font-medium">{subject.name}</div>
                    </TableCell>
                    <TableCell>
                      {subject.code ? (
                        <Badge variant="outline">{subject.code}</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="max-w-xs truncate">
                        {subject.description || '-'}
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Date(subject.created_at).toLocaleDateString('fr-FR')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedSubject(subject);
                            setShowEditDialog(true);
                          }}
                          aria-label={t('editAria', { name: subject.name })}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedSubject(subject);
                            setShowDeleteDialog(true);
                          }}
                          aria-label={t('deleteAria', { name: subject.name })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12 border border-dashed rounded-lg">
              <BookOpen className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {searchTerm ? t('emptySearch') : t('emptyNone')}
              </p>
              {!searchTerm && (
                <Button 
                  onClick={() => setShowCreateDialog(true)}
                  className="mt-4"
                  variant="outline"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {t('createFirst')}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateSubjectDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        institutionId={user?.institutionId || ''}
        onSubjectCreated={() => {
          if (user?.institutionId) {
            loadSubjectsByInstitution(user.institutionId);
          }
        }}
      />

      <EditSubjectDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        subject={selectedSubject}
        onSubjectUpdated={() => {
          if (user?.institutionId) {
            loadSubjectsByInstitution(user.institutionId);
          }
        }}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedSubject
                ? t('deleteDescriptionNamed', { name: selectedSubject.name })
                : t('deleteDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleDeleteSubject}
            >
              {tc('actions.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SubjectsManagement;
