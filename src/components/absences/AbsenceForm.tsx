
import { useState, useEffect } from 'react';
import { useStrkClasses } from '@/hooks/useStrkClasses';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Absence } from '@/types';
import { Calendar as CalendarIcon, Clock } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface AbsenceFormProps {
  onSubmit: (data: Partial<Absence>) => void;
}

const AbsenceForm = ({ onSubmit }: AbsenceFormProps) => {
  const [student, setStudent] = useState('');
  const [classe, setClasse] = useState('');
  const [type, setType] = useState<'absence' | 'lateness'>('absence');
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [duration, setDuration] = useState('');
  const [justified, setJustified] = useState(false);
  const [justification, setJustification] = useState('');
  
  const { user } = useStrkAuth();
  const { classes, isLoading: classesLoading, loadClassesByInstitution } = useStrkClasses();

  useEffect(() => {
    if (user?.institutionId) {
      loadClassesByInstitution(user.institutionId);
    }
  }, [user, loadClassesByInstitution]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const absenceData: Partial<Absence> = {
      studentId: '1', // Dans une application réelle, on utiliserait l'ID réel de l'étudiant
      studentName: student,
      class: classe,
      date: date ? format(date, 'yyyy-MM-dd') : '',
      type,
      duration: parseInt(duration) || 0,
      justified,
      justification: justified ? justification : undefined,
      createdBy: 'current-user', // Dans une application réelle, on utiliserait l'ID de l'utilisateur connecté
    };
    
    onSubmit(absenceData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="student">Étudiant</Label>
          <Select value={student} onValueChange={setStudent} required>
            <SelectTrigger id="student">
              <SelectValue placeholder="Sélectionner un étudiant" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Aminata Diallo">Aminata Diallo</SelectItem>
              <SelectItem value="Seydou Koné">Seydou Koné</SelectItem>
              <SelectItem value="Fatoumata Traoré">Fatoumata Traoré</SelectItem>
              <SelectItem value="Ibrahim Touré">Ibrahim Touré</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="class">Classe</Label>
          <Select value={classe} onValueChange={setClasse} required>
            <SelectTrigger id="class">
              <SelectValue placeholder="Sélectionner une classe" />
            </SelectTrigger>
            <SelectContent>
              {classesLoading ? (
                <SelectItem value="__loading__" disabled>Chargement des classes...</SelectItem>
              ) : classes.length > 0 ? (
                classes.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id}>
                    {cls.name}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="__empty__" disabled>Aucune classe disponible</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="date">Date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                id="date"
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !date && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date ? format(date, 'PPP', { locale: fr }) : "Sélectionner une date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label htmlFor="type">Type</Label>
          <Select value={type} onValueChange={(value: 'absence' | 'lateness') => setType(value)} required>
            <SelectTrigger id="type">
              <SelectValue placeholder="Sélectionner le type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="absence">Absence</SelectItem>
              <SelectItem value="lateness">Retard</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="duration">
          {type === 'absence' ? 'Durée (minutes)' : 'Retard (minutes)'}
        </Label>
        <div className="flex items-center">
          <Input
            id="duration"
            type="number"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-full"
            placeholder={type === 'absence' ? "Durée de l'absence" : "Durée du retard"}
            required
          />
          <Clock className="ml-2 h-5 w-5 text-gray-400" />
        </div>
        {type === 'absence' && (
          <p className="text-xs text-gray-500">
            Entrez 360 pour une demi-journée, 720 pour une journée complète
          </p>
        )}
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          id="justified"
          checked={justified}
          onCheckedChange={setJustified}
        />
        <Label htmlFor="justified">Justifié</Label>
      </div>

      {justified && (
        <div className="space-y-2">
          <Label htmlFor="justification">Justification</Label>
          <Input
            id="justification"
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            placeholder="Raison de l'absence/retard"
          />
        </div>
      )}

      <Button type="submit" className="w-full bg-edusign-600 hover:bg-edusign-700">
        Enregistrer
      </Button>
    </form>
  );
};

export default AbsenceForm;
