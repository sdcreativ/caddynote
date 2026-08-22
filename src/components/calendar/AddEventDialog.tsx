
import { useState, useEffect } from 'react';
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
import { useStrkSchedules } from '@/hooks/useStrkSchedules';

interface AddEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddEvent: (event: Omit<Event, 'id'>) => void;
  initialDate?: Date | null;
}

const AddEventDialog = ({ open, onOpenChange, onAddEvent, initialDate }: AddEventDialogProps) => {
  const { t } = useTranslation('calendar');
  const { t: tc } = useTranslation('common');
  const [newEvent, setNewEvent] = useState<Partial<Event>>({
    date: initialDate || new Date(),
    type: 'cours',
    color: '#10b981'
  });
  const [selectedDates, setSelectedDates] = useState<Date[]>(initialDate ? [initialDate] : []);
  const [classes, setClasses] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const { toast } = useToast();
  const { user } = useStrkAuth();
  const { classes: classesData, loadClassesByInstitution } = useStrkClasses();
  const { users, loadUsersByInstitution } = useStrkUsers();
  const { addSchedule } = useStrkSchedules();

  // Update the date when initialDate changes
  useEffect(() => {
    if (initialDate && open) {
      setNewEvent(prev => ({ ...prev, date: initialDate }));
      setSelectedDates([initialDate]);
    }
  }, [initialDate, open]);

  // Load classes and teachers when the dialog opens
  useEffect(() => {
    const institutionId = user?.institutionId;
    if (open && institutionId) {
      setIsLoading(true);

      // Load classes
      loadClassesByInstitution(institutionId)
        .then(() => {
          // Load teachers (users with role 'teacher')
          return loadUsersByInstitution(institutionId);
        })
        .catch(error => {
          console.error('Error loading data:', error);
          toast({
            title: tc('status.error'),
            description: t('add.loadError'),
            variant: "destructive"
          });
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [open, user, loadClassesByInstitution, loadUsersByInstitution, toast]);

  // Update classes and teachers when data changes
  useEffect(() => {
    setClasses(classesData);
  }, [classesData]);

  useEffect(() => {
    // Filter users to only include teachers
    const teachersList = users.filter(user => user.role === 'teacher');
    setTeachers(teachersList);
  }, [users]);

  const handleAddEvent = async () => {
    if (!newEvent.title || !selectedClassId || !selectedTeacherId) {
      toast({
        title: tc('status.error'),
        description: t('add.required'),
        variant: "destructive"
      });
      return;
    }

    const datesToUse = selectedDates.length > 0 ? selectedDates : [newEvent.date || new Date()];

    if (datesToUse.length === 0) {
      toast({
        title: tc('status.error'),
        description: t('add.dateRequired'),
        variant: "destructive"
      });
      return;
    }

    // Déterminer la couleur en fonction du type
    let eventColor = newEvent.color;
    if (!eventColor) {
      switch(newEvent.type) {
        case 'cours': eventColor = '#10b981'; break;
        case 'examen': eventColor = '#f97316'; break;
        case 'reunion': eventColor = '#3b82f6'; break;
        case 'devoir': eventColor = '#8b5cf6'; break;
        default: eventColor = '#10b981';
      }
    }

    setIsLoading(true);
    let successCount = 0;

    // Créer un événement pour chaque date sélectionnée
    for (const date of datesToUse) {
      // Convertir la date en jour de la semaine (0 = dimanche, 1 = lundi, etc.)
      const dayOfWeek = date.getDay();

      // Créer les données du schedule
      const scheduleData = {
        course_id: newEvent.title!, // Utiliser le titre comme ID de cours (à améliorer)
        class_id: selectedClassId,
        teacher_id: selectedTeacherId,
        day_of_week: dayOfWeek,
        start_time: newEvent.startTime || '09:00',
        end_time: newEvent.endTime || '10:00',
        room: newEvent.location,
        is_active: true,
        effective_from: date.toISOString().split('T')[0],
      };

      try {
        // Ajouter le schedule à la base de données
        const newSchedule = await addSchedule(scheduleData);

        if (newSchedule) {
          successCount++;

          // Créer l'événement pour l'affichage dans le calendrier
          const eventToAdd = {
            title: newEvent.title!,
            date: date,
            startTime: newEvent.startTime || '09:00',
            endTime: newEvent.endTime || '10:00',
            type: newEvent.type as 'cours' | 'examen' | 'reunion' | 'devoir',
            className: newEvent.className!,
            teacherName: newEvent.teacherName!,
            location: newEvent.location || '',
            description: newEvent.description || '',
            color: eventColor
          };

          // Appeler la fonction onAddEvent pour mettre à jour l'affichage
          onAddEvent(eventToAdd);
        }
      } catch (error) {
        console.error('Error adding schedule:', error);
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
        color: '#10b981'
      });
      setSelectedClassId('');
      setSelectedTeacherId('');
      setSelectedDates([]);
      onOpenChange(false);
    } else {
      toast({
        title: tc('status.error'),
        description: t('add.createError'),
        variant: "destructive"
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
            <Label htmlFor="title">{t('add.titleLabel')}</Label>
            <Input 
              id="title" 
              placeholder={t('add.titlePlaceholder')} 
              value={newEvent.title || ''}
              onChange={(e) => setNewEvent({...newEvent, title: e.target.value})}
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
                  const selectedClass = classes.find(c => c.id === value);
                  if (selectedClass) {
                    setNewEvent({...newEvent, className: selectedClass.name});
                  }
                }}
                disabled={isLoading || classes.length === 0}
              >
                <SelectTrigger id="class" className="h-9">
                  <SelectValue placeholder={t('add.classPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {classes.map(cls => (
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
                    setNewEvent({...newEvent, teacherName: selectedTeacher.name});
                  }
                }}
                disabled={isLoading || teachers.length === 0}
              >
                <SelectTrigger id="teacher" className="h-9">
                  <SelectValue placeholder={t('add.teacherPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {teachers.map(teacher => (
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
              value={newEvent.type as string || 'cours'} 
              onValueChange={(value) => {
                let color = '';
                switch(value) {
                  case 'cours': color = '#10b981'; break;
                  case 'examen': color = '#f97316'; break;
                  case 'reunion': color = '#3b82f6'; break;
                  case 'devoir': color = '#8b5cf6'; break;
                }
                setNewEvent({...newEvent, type: value as 'cours' | 'examen' | 'reunion' | 'devoir', color});
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
                    "w-full justify-start text-left font-normal h-9",
                    selectedDates.length === 0 && !newEvent.date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDates.length > 0 
                    ? t('add.datesSelectedCount', { count: selectedDates.length }) 
                    : newEvent.date 
                      ? format(newEvent.date, 'PP', { locale: fr }) 
                      : <span>{t('add.selectDates')}</span>
                  }
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="multiple"
                  selected={selectedDates}
                  onSelect={(dates) => setSelectedDates(dates || [])}
                  initialFocus
                  className={cn("pointer-events-auto")}
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
                {t('add.selectedDates', { dates: selectedDates.map(date => format(date, 'dd/MM/yyyy')).join(', ') })}
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
                onChange={(e) => setNewEvent({...newEvent, startTime: e.target.value})}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="end-time">{t('add.endTime')}</Label>
              <Input 
                id="end-time" 
                type="time" 
                className="h-9"
                value={newEvent.endTime || ''}
                onChange={(e) => setNewEvent({...newEvent, endTime: e.target.value})}
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
              onChange={(e) => setNewEvent({...newEvent, location: e.target.value})}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc('actions.cancel')}
          </Button>
          <Button onClick={handleAddEvent}>
            {tc('actions.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddEventDialog;
