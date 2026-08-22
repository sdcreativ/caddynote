
import { useState, useEffect } from 'react';
import { useStrkClasses } from '@/hooks/useStrkClasses';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Calendar as CalendarIcon, PlusCircle, Clock, Edit, Trash } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Class, Teacher, Schedule } from '@/types';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ScheduleTabProps {
  institutionId: string;
  classes: Class[];
  teachers: Teacher[];
}

// Données fictives pour le planning
const scheduleData: Schedule[] = [
  {
    id: "1",
    title: "Mathématiques",
    classId: "class123",
    className: "Terminale S2",
    teacherId: "teacher456",
    teacherName: "Prof. Martin",
    date: "2023-09-04",
    startTime: "08:00",
    endTime: "10:00",
    room: "Salle A104",
    institutionId: "inst123",
    subject: "Mathématiques",
    dayOfWeek: 1
  },
  {
    id: "2",
    title: "Cours de Physique",
    classId: "1",
    className: "Terminale S1",
    teacherId: "102",
    teacherName: "Dr. Diallo",
    date: "2023-05-15",
    startTime: "10:15",
    endTime: "12:15",
    room: "Laboratoire",
    institutionId: "1",
    subject: "Physique",
    dayOfWeek: 2
  },
  {
    id: "3",
    title: "Français",
    classId: "2",
    className: "Première L",
    teacherId: "103",
    teacherName: "Dr. Touré",
    date: "2023-05-16",
    startTime: "08:00",
    endTime: "10:00",
    room: "Salle B2",
    institutionId: "1",
    subject: "Français",
    dayOfWeek: 3
  },
];

export const ScheduleTab = ({ institutionId, classes, teachers }: ScheduleTabProps) => {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [schedules] = useState<Schedule[]>(scheduleData);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const { toast } = useToast();
  
  const { classes: dynamicClasses, isLoading: classesLoading, loadClassesByInstitution } = useStrkClasses();

  useEffect(() => {
    if (institutionId) {
      loadClassesByInstitution(institutionId);
    }
  }, [institutionId, loadClassesByInstitution]);

  // Utiliser les classes dynamiques si disponibles, sinon les classes passées en props
  const availableClasses = dynamicClasses.length > 0 ? dynamicClasses : classes;

  const handleAddSchedule = () => {
    toast({
      title: "Cours ajouté",
      description: "Le nouveau cours a été ajouté au planning.",
    });
    setShowAddDialog(false);
  };

  // Filtrer les événements pour la date sélectionnée
  const eventsForSelectedDate = schedules.filter(event => 
    date && event.date === format(date, 'yyyy-MM-dd') && 
    event.institutionId === institutionId
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-6">
        <div className="w-full md:w-auto">
          <div className="bg-white rounded-lg border p-4">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, 'PPP', { locale: fr }) : <span>Sélectionner une date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            <div className="mt-4">
              <Button onClick={() => setShowAddDialog(true)} className="w-full">
                <PlusCircle className="mr-2 h-5 w-5" />
                Ajouter un cours
              </Button>
            </div>
          </div>
        </div>
        
        <div className="flex-1">
          <h3 className="text-lg font-medium mb-4">
            {date ? `Planning du ${format(date, 'dd MMMM yyyy', { locale: fr })}` : 'Sélectionnez une date'}
          </h3>
          
          <div className="space-y-3">
            {eventsForSelectedDate.length > 0 ? (
              eventsForSelectedDate.map((event) => (
                <Card key={event.id} className="overflow-hidden hover:shadow-sm transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium">{event.title}</h4>
                        <p className="text-sm text-gray-500">{event.className} - {event.teacherName}</p>
                        <div className="flex items-center mt-2 text-sm">
                          <Clock className="h-4 w-4 mr-1 text-gray-500" />
                          <span>{event.startTime} - {event.endTime}</span>
                          <Badge variant="outline" className="ml-2">{event.room}</Badge>
                        </div>
                      </div>
                      <div className="flex items-center">
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Modifier ${event.title}`}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" aria-label={`Supprimer ${event.title}`}>
                          <Trash className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="text-center py-8 border border-dashed rounded-lg">
                <p className="text-gray-500">Aucun cours prévu pour cette date.</p>
                <Button 
                  variant="outline" 
                  className="mt-2"
                  onClick={() => setShowAddDialog(true)}
                >
                  Ajouter un cours
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dialogue pour ajouter un nouveau cours */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>Ajouter un nouveau cours</DialogTitle>
            <DialogDescription>
              Planifiez un nouveau cours pour la date sélectionnée
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Titre du cours</Label>
              <Input id="title" placeholder="Ex: Mathématiques - Algèbre" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="class">Classe</Label>
                <Select>
                  <SelectTrigger id="class">
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    {classesLoading ? (
                      <SelectItem value="__loading__" disabled>Chargement des classes...</SelectItem>
                    ) : availableClasses.length > 0 ? (
                      availableClasses.map(cls => (
                        <SelectItem key={cls.id} value={cls.id}>{cls.name}</SelectItem>
                      ))
                    ) : (
                      <SelectItem value="__empty__" disabled>Aucune classe disponible</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="teacher">Enseignant</Label>
                <Select>
                  <SelectTrigger id="teacher">
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    {teachers.map(teacher => (
                      <SelectItem key={teacher.id} value={teacher.id}>{teacher.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, 'PPP', { locale: fr }) : <span>Sélectionner une date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startTime">Heure de début</Label>
                <Input id="startTime" type="time" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endTime">Heure de fin</Label>
                <Input id="endTime" type="time" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="room">Salle</Label>
              <Input id="room" placeholder="Ex: Salle A1" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Annuler
            </Button>
            <Button onClick={handleAddSchedule}>
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
