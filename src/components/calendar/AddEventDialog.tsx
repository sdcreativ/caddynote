import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Event } from '@/types/calendar';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { useStrkClasses } from '@/hooks/useStrkClasses';
import { useStrkUsers } from '@/hooks/useStrkUsers';
import { useStrkCourses } from '@/hooks/useStrkCourses';
import { createSchedule } from '@/services/strkScheduleService';
import { ApiError } from '@/lib/apiClient';
import type { CourseWithDetails } from '@/services/strkCourseService';

interface AddEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddEvent: (event: Omit<Event, 'id'>) => void;
  initialDate?: Date | null;
}

const toDateOnly = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** Regroupe les dates sélectionnées par jour de semaine → une règle EDT
 * (dayOfWeek + plage startDate/endDate) au lieu d’un POST par date (qui
 * provoquait des 409 conflits et un courseId invalide). */
const groupDatesByWeekday = (dates: Date[]) => {
  const groups = new Map<number, { start: Date; end: Date; samples: Date[] }>();
  for (const date of dates) {
    const dow = date.getDay();
    const existing = groups.get(dow);
    if (!existing) {
      groups.set(dow, { start: date, end: date, samples: [date] });
    } else {
      if (date < existing.start) existing.start = date;
      if (date > existing.end) existing.end = date;
      existing.samples.push(date);
    }
  }
  return groups;
};

const AddEventDialog = ({ open, onOpenChange, onAddEvent, initialDate }: AddEventDialogProps) => {
  const { t } = useTranslation('calendar');
  const { t: tc } = useTranslation('common');
  const [newEvent, setNewEvent] = useState<Partial<Event>>({
    date: initialDate || new Date(),
    type: 'cours',
    color: '#10b981',
    startTime: '08:30',
    endTime: '09:30',
  });
  const [selectedDates, setSelectedDates] = useState<Date[]>(initialDate ? [initialDate] : []);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const { toast } = useToast();
  const { user } = useStrkAuth();
  const { classes: classesData, loadClassesByInstitution } = useStrkClasses();
  const { users, loadUsersByInstitution } = useStrkUsers();
  const { courses, loadCoursesByInstitution } = useStrkCourses();

  useEffect(() => {
    if (initialDate && open) {
      setNewEvent((prev) => ({ ...prev, date: initialDate }));
      setSelectedDates([initialDate]);
    }
  }, [initialDate, open]);

  useEffect(() => {
    const institutionId = user?.institutionId;
    if (open && institutionId) {
      setIsLoading(true);
      Promise.all([
        loadClassesByInstitution(institutionId),
        loadUsersByInstitution(institutionId),
        loadCoursesByInstitution(institutionId),
      ])
        .catch((error) => {
          console.error('Error loading data:', error);
          toast({
            title: tc('status.error'),
            description: t('add.loadError'),
            variant: 'destructive',
          });
        })
        .finally(() => setIsLoading(false));
    }
  }, [open, user?.institutionId, loadClassesByInstitution, loadUsersByInstitution, loadCoursesByInstitution, toast, t, tc]);

  const teachers = useMemo(() => users.filter((u) => u.role === 'teacher'), [users]);

  const filteredCourses = useMemo(() => {
    return courses.filter((c: CourseWithDetails) => {
      if (selectedClassId && c.class_id && c.class_id !== selectedClassId) return false;
      if (selectedTeacherId && c.teacher_id && c.teacher_id !== selectedTeacherId) return false;
      return true;
    });
  }, [courses, selectedClassId, selectedTeacherId]);

  const selectedCourse = courses.find((c) => c.id === selectedCourseId);

  const handleCourseChange = (courseId: string) => {
    setSelectedCourseId(courseId);
    const course = courses.find((c) => c.id === courseId);
    if (!course) return;
    setNewEvent((prev) => ({
      ...prev,
      title: course.name,
      className: course.class_name || prev.className,
      teacherName: course.teacher_name || prev.teacherName,
      location: course.room || prev.location,
    }));
    if (course.class_id) setSelectedClassId(course.class_id);
    if (course.teacher_id) setSelectedTeacherId(course.teacher_id);
  };

  const handleAddEvent = async () => {
    const institutionId = user?.institutionId || selectedCourse?.institution_id;
    if (!selectedCourseId || !selectedClassId || !selectedTeacherId || !institutionId) {
      toast({
        title: tc('status.error'),
        description: t('add.required'),
        variant: 'destructive',
      });
      return;
    }

    const datesToUse = selectedDates.length > 0 ? selectedDates : newEvent.date ? [newEvent.date] : [];
    if (datesToUse.length === 0) {
      toast({
        title: tc('status.error'),
        description: t('add.dateRequired'),
        variant: 'destructive',
      });
      return;
    }

    if (!newEvent.startTime || !newEvent.endTime) {
      toast({
        title: tc('status.error'),
        description: t('add.required'),
        variant: 'destructive',
      });
      return;
    }

    let eventColor = newEvent.color;
    if (!eventColor) {
      switch (newEvent.type) {
        case 'cours':
          eventColor = '#10b981';
          break;
        case 'examen':
          eventColor = '#f97316';
          break;
        case 'reunion':
          eventColor = '#3b82f6';
          break;
        case 'devoir':
          eventColor = '#8b5cf6';
          break;
        default:
          eventColor = '#10b981';
      }
    }

    const weekdayGroups = groupDatesByWeekday(datesToUse);
    setIsLoading(true);
    let successCount = 0;
    let lastError: string | null = null;

    for (const [dayOfWeek, range] of weekdayGroups) {
      try {
        await createSchedule({
          course_id: selectedCourseId,
          class_id: selectedClassId,
          institution_id: institutionId,
          teacher_id: selectedTeacherId,
          day_of_week: dayOfWeek,
          start_time: newEvent.startTime,
          end_time: newEvent.endTime,
          room: newEvent.location,
          is_active: true,
          effective_from: toDateOnly(range.start),
          effective_until: toDateOnly(range.end),
        });
        successCount++;

        for (const date of range.samples) {
          onAddEvent({
            title: newEvent.title || selectedCourse?.name || t('courseFallback'),
            date,
            startTime: newEvent.startTime || '09:00',
            endTime: newEvent.endTime || '10:00',
            type: (newEvent.type as Event['type']) || 'cours',
            className: newEvent.className || '',
            teacherName: newEvent.teacherName || '',
            location: newEvent.location || '',
            description: newEvent.description || '',
            color: eventColor,
          });
        }
      } catch (error) {
        console.error('Error adding schedule:', error);
        lastError =
          error instanceof ApiError && error.message
            ? error.message
            : t('add.createError');
      }
    }

    setIsLoading(false);

    if (successCount > 0) {
      toast({
        title: t('add.createdTitle'),
        description: t('add.createdBody', { count: successCount }),
      });

      setNewEvent({
        date: new Date(),
        type: 'cours',
        color: '#10b981',
        startTime: '08:30',
        endTime: '09:30',
      });
      setSelectedClassId('');
      setSelectedTeacherId('');
      setSelectedCourseId('');
      setSelectedDates([]);
      onOpenChange(false);
    } else {
      toast({
        title: tc('status.error'),
        description: lastError || t('add.createError'),
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('add.title')}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="course">{t('add.course')}</Label>
            <Select
              value={selectedCourseId}
              onValueChange={handleCourseChange}
              disabled={isLoading || filteredCourses.length === 0}
            >
              <SelectTrigger id="course" className="h-9">
                <SelectValue placeholder={t('add.coursePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {filteredCourses.map((course) => (
                  <SelectItem key={course.id} value={course.id}>
                    {course.class_name
                      ? `${course.name} — ${course.class_name}`
                      : course.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filteredCourses.length === 0 && !isLoading && (
              <p className="text-xs text-muted-foreground">{t('add.noCourse')}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">{t('add.titleLabel')}</Label>
            <Input
              id="title"
              placeholder={t('add.titlePlaceholder')}
              value={newEvent.title || ''}
              onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
              className="h-9"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="class">{t('add.class')}</Label>
              <Select
                value={selectedClassId}
                onValueChange={(value) => {
                  setSelectedClassId(value);
                  const selectedClass = classesData.find((c) => c.id === value);
                  if (selectedClass) {
                    setNewEvent({ ...newEvent, className: selectedClass.name });
                  }
                  if (selectedCourse && selectedCourse.class_id && selectedCourse.class_id !== value) {
                    setSelectedCourseId('');
                  }
                }}
                disabled={isLoading || classesData.length === 0}
              >
                <SelectTrigger id="class" className="h-9">
                  <SelectValue placeholder={t('add.classPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {classesData.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      {cls.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="teacher">{t('add.teacher')}</Label>
              <Select
                value={selectedTeacherId}
                onValueChange={(value) => {
                  setSelectedTeacherId(value);
                  const selectedTeacher = teachers.find((item) => item.id === value);
                  if (selectedTeacher) {
                    setNewEvent({ ...newEvent, teacherName: selectedTeacher.name });
                  }
                  if (selectedCourse && selectedCourse.teacher_id && selectedCourse.teacher_id !== value) {
                    setSelectedCourseId('');
                  }
                }}
                disabled={isLoading || teachers.length === 0}
              >
                <SelectTrigger id="teacher" className="h-9">
                  <SelectValue placeholder={t('add.teacherPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {teachers.map((teacher) => (
                    <SelectItem key={teacher.id} value={teacher.id}>
                      {teacher.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="event-type">{t('add.type')}</Label>
            <Select
              value={(newEvent.type as string) || 'cours'}
              onValueChange={(value) => {
                let color = '';
                switch (value) {
                  case 'cours':
                    color = '#10b981';
                    break;
                  case 'examen':
                    color = '#f97316';
                    break;
                  case 'reunion':
                    color = '#3b82f6';
                    break;
                  case 'devoir':
                    color = '#8b5cf6';
                    break;
                }
                setNewEvent({
                  ...newEvent,
                  type: value as 'cours' | 'examen' | 'reunion' | 'devoir',
                  color,
                });
              }}
            >
              <SelectTrigger id="event-type" className="h-9">
                <SelectValue placeholder={t('add.typePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cours">{t('add.types.cours')}</SelectItem>
                <SelectItem value="examen">{t('add.types.examen')}</SelectItem>
                <SelectItem value="reunion">{t('add.types.reunion')}</SelectItem>
                <SelectItem value="devoir">{t('add.types.devoir')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="event-date">{t('add.dates')}</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="event-date"
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal h-9',
                    selectedDates.length === 0 && !newEvent.date && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDates.length > 0
                    ? t('add.datesSelectedCount', { count: selectedDates.length })
                    : newEvent.date
                      ? format(newEvent.date, 'PP', { locale: fr })
                      : <span>{t('add.selectDates')}</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="multiple"
                  selected={selectedDates}
                  onSelect={(dates) => setSelectedDates(dates || [])}
                  initialFocus
                  className={cn('pointer-events-auto')}
                />
                <div className="p-3 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedDates([])}
                    className="w-full"
                  >
                    {t('add.clearSelection')}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            {selectedDates.length > 0 && (
              <div className="text-sm text-muted-foreground">
                {t('add.selectedDates', {
                  dates: selectedDates.map((date) => format(date, 'dd/MM/yyyy')).join(', '),
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start-time">{t('add.startTime')}</Label>
              <Input
                id="start-time"
                type="time"
                className="h-9"
                value={newEvent.startTime || ''}
                onChange={(e) => setNewEvent({ ...newEvent, startTime: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="end-time">{t('add.endTime')}</Label>
              <Input
                id="end-time"
                type="time"
                className="h-9"
                value={newEvent.endTime || ''}
                onChange={(e) => setNewEvent({ ...newEvent, endTime: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">{t('add.location')}</Label>
            <Input
              id="location"
              placeholder={t('add.locationPlaceholder')}
              className="h-9"
              value={newEvent.location || ''}
              onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc('actions.cancel')}
          </Button>
          <Button onClick={() => void handleAddEvent()} disabled={isLoading}>
            {tc('actions.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddEventDialog;
