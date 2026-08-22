import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useStrkClasses } from '@/hooks/useStrkClasses';
import { useStrkUsers } from '@/hooks/useStrkUsers';
import { useStrkInstitutions } from '@/hooks/useStrkInstitutions';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';

interface CreateClassDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institutionId?: string;
  onClassCreated?: () => void;
}

export const CreateClassDialog = ({
  open,
  onOpenChange,
  institutionId = '',
  onClassCreated,
}: CreateClassDialogProps) => {
  const { t } = useTranslation('classes');
  const { t: tc } = useTranslation('common');
  const { toast } = useToast();
  const { institutions } = useStrkInstitutions();
  const [selectedInstitutionId, setSelectedInstitutionId] = useState(institutionId);
  const [formData, setFormData] = useState({
    name: '',
    teacher_id: 'none',
    academic_year: new Date().getFullYear().toString(),
    max_students: 30,
    description: '',
  });
  const [isLoading, setIsLoading] = useState(false);

  const { addClass } = useStrkClasses();
  const { users } = useStrkUsers();

  useEffect(() => {
    if (open) {
      setSelectedInstitutionId(institutionId || '');
    }
  }, [open, institutionId]);

  const effectiveInstitutionId = institutionId || selectedInstitutionId;
  const teachers = users.filter(
    (user) =>
      user.role === 'teacher' &&
      (!effectiveInstitutionId || user.institutionId === effectiveInstitutionId)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    if (!effectiveInstitutionId) {
      toast({
        title: 'Établissement requis',
        description: 'Choisissez un établissement pour créer la classe.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      await addClass({
        name: formData.name.trim(),
        institution_id: effectiveInstitutionId,
        teacher_id: formData.teacher_id === 'none' ? undefined : formData.teacher_id,
        academic_year: formData.academic_year,
        max_students: formData.max_students,
        description: formData.description.trim() || undefined,
        is_active: true,
      });

      setFormData({
        name: '',
        teacher_id: 'none',
        academic_year: new Date().getFullYear().toString(),
        max_students: 30,
        description: '',
      });
      onClassCreated?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Error creating class:', error);
      toast({
        title: 'Création impossible',
        description: error instanceof Error ? error.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>{t('create.title')}</DialogTitle>
          <DialogDescription>{t('create.description')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {!institutionId && (
              <div className="space-y-2">
                <Label>Établissement</Label>
                <Select value={selectedInstitutionId} onValueChange={setSelectedInstitutionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir un établissement" />
                  </SelectTrigger>
                  <SelectContent>
                    {institutions.map((inst) => (
                      <SelectItem key={inst.id} value={inst.id}>
                        {inst.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">{t('form.name')}</Label>
              <Input
                id="name"
                placeholder={t('form.namePlaceholder')}
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="teacher">{t('form.homeroom')}</Label>
              <Select
                value={formData.teacher_id}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, teacher_id: value }))}
              >
                <SelectTrigger id="teacher">
                  <SelectValue placeholder={t('form.homeroomPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('form.noTeacher')}</SelectItem>
                  {teachers.map((teacher) => (
                    <SelectItem key={teacher.id} value={teacher.id}>
                      {teacher.name || teacher.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="academic_year">{t('form.academicYear')}</Label>
                <Input
                  id="academic_year"
                  type="number"
                  value={formData.academic_year}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, academic_year: e.target.value }))
                  }
                  min="2020"
                  max="2030"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="max_students">{t('form.maxStudents')}</Label>
                <Input
                  id="max_students"
                  type="number"
                  value={formData.max_students}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      max_students: parseInt(e.target.value, 10) || 30,
                    }))
                  }
                  min="1"
                  max="50"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t('form.description')}</Label>
              <Input
                id="description"
                placeholder={t('form.descriptionPlaceholder')}
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, description: e.target.value }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc('actions.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !formData.name.trim() || !effectiveInstitutionId}
            >
              {isLoading ? t('create.submitting') : t('create.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
