import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fetchStudentsByClass, type ClassRosterStudent, type StrkAttendance } from '@/services/strkAttendanceService';
import { QuickAttendance } from './QuickAttendance';
import type { CourseWithDetails } from '@/services/strkCourseService';

/**
 * NFR-004 : ce dialogue ("Faire l'appel" depuis `TeacherAttendancePage.tsx`)
 * était un stub — champ "classe" en texte libre jamais relié à une vraie
 * classe, `setStudents([])` inconditionnel (commentaire "In real app, this
 * would fetch students..."), et une redirection `window.location.href`
 * vers `?class=...` alors que la page cible lit `?course=` (paramètre non
 * concordant : la redirection n'aurait de toute façon jamais présélectionné
 * le bon cours). Remplacé par le vrai flux — sélection d'un cours réel du
 * professeur, chargement du vrai effectif (`fetchStudentsByClass`, mis en
 * cache — voir `strkAttendanceService.ts`), et réutilisation de
 * `QuickAttendance`, le composant d'appel réellement fonctionnel déjà
 * utilisé par `/attendance` (hors ligne compris, PRS-003).
 */
interface AttendanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courses: CourseWithDetails[];
  institutionId?: string;
  onAttendanceSubmitted?: (attendance: StrkAttendance[]) => void;
}

export function AttendanceDialog({ open, onOpenChange, courses, institutionId, onAttendanceSubmitted }: AttendanceDialogProps) {
  const { t } = useTranslation('attendance');
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [roster, setRoster] = useState<ClassRosterStudent[]>([]);
  const [isRosterLoading, setIsRosterLoading] = useState(false);

  const coursesWithClass = courses.filter((c) => !!c.class_id);
  const selectedCourse = coursesWithClass.find((c) => c.id === selectedCourseId);

  useEffect(() => {
    if (!open) {
      setSelectedCourseId('');
      setRoster([]);
    }
  }, [open]);

  useEffect(() => {
    if (!selectedCourse?.class_id) {
      setRoster([]);
      return;
    }
    let cancelled = false;
    setIsRosterLoading(true);
    fetchStudentsByClass(selectedCourse.class_id).then((list) => {
      if (!cancelled) {
        setRoster(list);
        setIsRosterLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedCourse?.class_id]);

  const handleSubmitted = (attendance: StrkAttendance[]) => {
    onAttendanceSubmitted?.(attendance);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('dialog.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="course">{t('dialog.course')}</Label>
            {coursesWithClass.length > 0 ? (
              <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
                <SelectTrigger id="course">
                  <SelectValue placeholder={t('dialog.coursePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {coursesWithClass.map((course) => (
                    <SelectItem key={course.id} value={course.id}>
                      {course.class_name
                        ? t('dialog.courseWithClass', { name: course.name, className: course.class_name })
                        : course.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t('dialog.noCourse')}
              </p>
            )}
          </div>

          {selectedCourse?.class_id && (
            isRosterLoading ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t('dialog.loadingRoster')}</p>
            ) : roster.length > 0 ? (
              <QuickAttendance
                classId={selectedCourse.class_id}
                institutionId={institutionId ?? selectedCourse.institution_id}
                courseId={selectedCourse.id}
                students={roster}
                onAttendanceSubmitted={handleSubmitted}
              />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                {t('dialog.emptyRoster')}
              </p>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
