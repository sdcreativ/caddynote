import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { useStrkCourses } from '@/hooks/useStrkCourses';
import { useStrkClasses } from '@/hooks/useStrkClasses';
import { useStrkUsers } from '@/hooks/useStrkUsers';
import { useTranslation } from 'react-i18next';
import { tCommon } from '@/i18n/config';
import { ApiError } from '@/lib/apiClient';
import { hasAnyRole, DIRECTION_ROLES } from '@/lib/roles';

interface CreateCourseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCourseCreated?: () => void;
  /** Préremplit la classe (ex. depuis l’écran Classes Direction). */
  defaultClassId?: string;
}

const CreateCourseDialog = ({
  open,
  onOpenChange,
  onCourseCreated,
  defaultClassId,
}: CreateCourseDialogProps) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    class_id: 'none',
    teacher_id: '',
    room: '',
    schedule_day: '',
    schedule_time: '',
    duration: 60,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { toast } = useToast();
  const { t } = useTranslation('teaching');
  const { user } = useStrkAuth();
  const { createCourse } = useStrkCourses();
  const {
    classes,
    loadClassesByInstitution,
    loadClassesByTeacher,
    isLoading: classesLoading,
    error: classesError,
    forceReload,
  } = useStrkClasses();
  const { users, loadUsersByInstitution } = useStrkUsers();

  const needsTeacherSelect =
    hasAnyRole(user?.role, DIRECTION_ROLES) || user?.role === 'secretary';

  const teachers = users.filter(
    (u) => u.role === 'teacher' || u.role === 'head_teacher'
  );

  const loadClasses = useCallback(async () => {
    if (!user?.id) return;

    try {
      if (user.role === 'teacher') {
        await loadClassesByTeacher(user.id);
      } else if (user?.institutionId) {
        await loadClassesByInstitution(user.institutionId);
      } else {
        console.warn('User has no institutionId and is not a teacher, cannot load classes');
      }
    } catch (error) {
      console.error('Error loading classes:', error);
    }
  }, [user?.id, user?.role, user?.institutionId, loadClassesByTeacher, loadClassesByInstitution]);

  useEffect(() => {
    if (!open || !user?.id) return;
    void loadClasses();
    if (needsTeacherSelect && user.institutionId) {
      void loadUsersByInstitution(user.institutionId);
    }
  }, [open, user?.id, user?.institutionId, needsTeacherSelect, loadClasses, loadUsersByInstitution]);

  useEffect(() => {
    if (!open) return;
    setFormData((prev) => ({
      ...prev,
      class_id: defaultClassId || prev.class_id || 'none',
      teacher_id: needsTeacherSelect ? prev.teacher_id : user?.id || '',
    }));
  }, [open, defaultClassId, needsTeacherSelect, user?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !user?.id) return;

    const teacherId = needsTeacherSelect ? formData.teacher_id : user.id;
    if (!teacherId) {
      toast({
        title: tCommon('status.error'),
        description: t('createCourse.teacherRequired'),
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      let institutionId = user.institutionId;
      if (formData.class_id !== 'none' && classes.length > 0) {
        const selectedClass = classes.find((c) => c.id === formData.class_id);
        if (selectedClass?.institution_id) {
          institutionId = selectedClass.institution_id;
        }
      }

      if (!institutionId) {
        toast({
          title: tCommon('status.error'),
          description: t('createCourse.institutionError'),
          variant: 'destructive',
        });
        return;
      }

      const course = await createCourse({
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        teacher_id: teacherId,
        class_id: formData.class_id === 'none' ? undefined : formData.class_id,
        institution_id: institutionId,
        room: formData.room.trim() || undefined,
        schedule_day: formData.schedule_day || undefined,
        schedule_time: formData.schedule_time || undefined,
        duration: formData.duration,
        status: 'active',
      });

      if (!course) {
        return;
      }

      setFormData({
        name: '',
        description: '',
        class_id: defaultClassId || 'none',
        teacher_id: '',
        room: '',
        schedule_day: '',
        schedule_time: '',
        duration: 60,
      });
      onOpenChange(false);
      onCourseCreated?.();
      toast({
        title: t('createCourse.createdTitle'),
        description: t('createCourse.createdBody'),
      });
    } catch (error) {
      toast({
        title: tCommon('status.error'),
        description: error instanceof ApiError ? error.message : t('createCourse.createError'),
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const daysOfWeek = [
    { value: 'Lundi', label: t('createCourse.days.monday') },
    { value: 'Mardi', label: t('createCourse.days.tuesday') },
    { value: 'Mercredi', label: t('createCourse.days.wednesday') },
    { value: 'Jeudi', label: t('createCourse.days.thursday') },
    { value: 'Vendredi', label: t('createCourse.days.friday') },
    { value: 'Samedi', label: t('createCourse.days.saturday') },
    { value: 'Dimanche', label: t('createCourse.days.sunday') },
  ];

  const canSubmit =
    Boolean(formData.name.trim()) &&
    !isSubmitting &&
    (!needsTeacherSelect || Boolean(formData.teacher_id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>{t('createCourse.title')}</DialogTitle>
          <DialogDescription>{t('createCourse.description')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('createCourse.name')}</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder={t('createCourse.namePlaceholder')}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t('createCourse.desc')}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder={t('createCourse.descPlaceholder')}
                rows={3}
              />
            </div>

            {needsTeacherSelect && (
              <div className="space-y-2">
                <Label htmlFor="teacher">{t('createCourse.teacher')}</Label>
                <Select
                  value={formData.teacher_id || undefined}
                  onValueChange={(value) => handleInputChange('teacher_id', value)}
                >
                  <SelectTrigger id="teacher">
                    <SelectValue placeholder={t('createCourse.selectTeacher')} />
                  </SelectTrigger>
                  <SelectContent>
                    {teachers.length === 0 ? (
                      <SelectItem value="__none__" disabled>
                        {t('createCourse.noTeachers')}
                      </SelectItem>
                    ) : (
                      teachers.map((teacher) => (
                        <SelectItem key={teacher.id} value={teacher.id}>
                          {teacher.name || teacher.email || teacher.id}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="class">{t('createCourse.class')}</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      forceReload();
                      void loadClasses();
                    }}
                    disabled={classesLoading}
                    className="h-6 px-2"
                  >
                    <RefreshCw className={`h-3 w-3 ${classesLoading ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
                <Select
                  value={formData.class_id}
                  onValueChange={(value) => handleInputChange('class_id', value)}
                >
                  <SelectTrigger id="class">
                    <SelectValue
                      placeholder={
                        classesLoading
                          ? t('createCourse.loadingClasses')
                          : classes.length === 0
                            ? t('createCourse.noClassAvailable')
                            : t('createCourse.selectClass')
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('createCourse.noClass')}</SelectItem>
                    {classesLoading && (
                      <SelectItem value="loading" disabled>
                        {tCommon('actions.loading')}
                      </SelectItem>
                    )}
                    {!classesLoading && classes.length === 0 && (
                      <SelectItem value="no-classes" disabled>
                        {user?.role === 'teacher'
                          ? t('createCourse.noneAssigned')
                          : t('createCourse.noneFound')}
                      </SelectItem>
                    )}
                    {!classesLoading &&
                      classes.map((classe) => (
                        <SelectItem key={classe.id} value={classe.id}>
                          {classe.name}{' '}
                          {classe.institution_name && `(${classe.institution_name})`}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {classesError && (
                  <div className="text-sm text-destructive">
                    {t('createCourse.loadError')}
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      onClick={() => {
                        forceReload();
                        void loadClasses();
                      }}
                      className="h-auto p-0 ml-2 text-xs"
                    >
                      {tCommon('actions.retry')}
                    </Button>
                  </div>
                )}
                {user?.role === 'teacher' &&
                  classes.length === 0 &&
                  !classesLoading &&
                  !classesError && (
                    <div className="text-sm text-muted-foreground">
                      {t('createCourse.noneAssignedHint')}
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        onClick={() => {
                          forceReload();
                          void loadClasses();
                        }}
                        className="h-auto p-0 ml-1 text-xs"
                      >
                        {t('createCourse.refresh')}
                      </Button>
                    </div>
                  )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="room">{t('createCourse.room')}</Label>
                <Input
                  id="room"
                  value={formData.room}
                  onChange={(e) => handleInputChange('room', e.target.value)}
                  placeholder={t('createCourse.roomPlaceholder')}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="schedule_day">{t('createCourse.day')}</Label>
                <Select
                  value={formData.schedule_day}
                  onValueChange={(value) => handleInputChange('schedule_day', value)}
                >
                  <SelectTrigger id="schedule_day">
                    <SelectValue placeholder={t('createCourse.dayPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {daysOfWeek.map((day) => (
                      <SelectItem key={day.value} value={day.value}>
                        {day.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="schedule_time">{t('createCourse.time')}</Label>
                <Input
                  id="schedule_time"
                  type="time"
                  value={formData.schedule_time}
                  onChange={(e) => handleInputChange('schedule_time', e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration">{t('createCourse.duration')}</Label>
              <Input
                id="duration"
                type="number"
                min="15"
                max="480"
                step="15"
                value={formData.duration}
                onChange={(e) => handleInputChange('duration', parseInt(e.target.value) || 60)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              {tCommon('actions.cancel')}
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {isSubmitting ? t('createCourse.creating') : t('createCourse.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateCourseDialog;
