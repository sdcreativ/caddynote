import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useStrkClasses } from '@/hooks/useStrkClasses';
import { useStrkUsers } from '@/hooks/useStrkUsers';
import { ClassWithDetails } from '@/services/strkClassService';
import { useTranslation } from 'react-i18next';

interface EditClassDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classData: any;
  onClassUpdated?: () => void;
}

export const EditClassDialog = ({ open, onOpenChange, classData, onClassUpdated }: EditClassDialogProps) => {
  const { t } = useTranslation('classes');
  const { t: tc } = useTranslation('common');
  const [formData, setFormData] = useState({
    name: '',
    teacher_id: 'none',
    academic_year: new Date().getFullYear().toString(),
    max_students: 30,
    description: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  
  const { editClass } = useStrkClasses();
  const { users } = useStrkUsers();

  // Filtrer les enseignants
  const teachers = users.filter(user => user.role === 'teacher');

  // Initialiser le formulaire quand classData change
  useEffect(() => {
    if (classData) {
      setFormData({
        name: classData.name || '',
        teacher_id: classData.teacher_id || 'none',
        academic_year: classData.academic_year || new Date().getFullYear().toString(),
        max_students: classData.max_students || 30,
        description: classData.description || ''
      });
    }
  }, [classData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !classData) return;

    setIsLoading(true);
    try {
      await editClass(classData.id, {
        name: formData.name.trim(),
        // null = détacher le titulaire (≠ undefined qui omettait le champ).
        teacher_id: formData.teacher_id === 'none' ? null : formData.teacher_id,
        academic_year: formData.academic_year,
        max_students: formData.max_students,
        description: formData.description.trim() || undefined,
      });

      onClassUpdated?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating class:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>{t('edit.title')}</DialogTitle>
          <DialogDescription>
            {t('edit.description')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('form.name')}</Label>
              <Input
                id="name"
                placeholder={t('form.namePlaceholder')}
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="teacher">{t('form.homeroom')}</Label>
              <Select
                value={formData.teacher_id}
                onValueChange={(value) => setFormData(prev => ({ ...prev, teacher_id: value }))}
              >
                <SelectTrigger id="teacher">
                  <SelectValue placeholder={t('form.homeroomPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('form.noTeacher')}</SelectItem>
                  {teachers.map(teacher => (
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
                  onChange={(e) => setFormData(prev => ({ ...prev, academic_year: e.target.value }))}
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
                  onChange={(e) => setFormData(prev => ({ ...prev, max_students: parseInt(e.target.value) || 30 }))}
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
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc('actions.cancel')}
            </Button>
            <Button type="submit" disabled={isLoading || !formData.name.trim()}>
              {isLoading ? t('edit.submitting') : t('edit.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};