import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useStrkAbsences } from '@/hooks/useStrkAbsences';

interface CreateAbsenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institutionId: string;
}

export function CreateAbsenceDialog({ open, onOpenChange, institutionId }: CreateAbsenceDialogProps) {
  const [studentId, setStudentId] = useState('');
  const [type, setType] = useState<'absence' | 'lateness'>('absence');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [className, setClassName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const { toast } = useToast();
  const { createAbsence } = useStrkAbsences();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId || !date) return;

    setIsLoading(true);
    
    const startDateTime = startTime ? new Date(`${date}T${startTime}`) : new Date(date);
    const endDateTime = endTime ? new Date(`${date}T${endTime}`) : new Date(date);
    const durationMinutes = endTime && startTime 
      ? Math.abs(endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60)
      : type === 'absence' ? 120 : 15;

    const result = await createAbsence({
      student_id: studentId,
      institution_id: institutionId,
      type,
      date,
      start_time: startTime,
      end_time: endTime,
      duration_minutes: Math.round(durationMinutes),
      class_name: className || undefined
    });

    if (result) {
      toast({
        title: "Absence créée",
        description: `L'absence a été enregistrée avec succès.`,
      });
      onOpenChange(false);
      // Reset form
      setStudentId('');
      setType('absence');
      setDate('');
      setStartTime('');
      setEndTime('');
      setClassName('');
    }
    
    setIsLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Nouvelle absence</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="studentId">ID de l'étudiant</Label>
              <Input
                id="studentId"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="ID de l'étudiant"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select value={type} onValueChange={(value: 'absence' | 'lateness') => setType(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="absence">Absence</SelectItem>
                  <SelectItem value="lateness">Retard</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="startTime">Heure de début</Label>
              <Input
                id="startTime"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="endTime">Heure de fin</Label>
              <Input
                id="endTime"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="className">Classe/Cours</Label>
            <Input
              id="className"
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              placeholder="Nom de la classe ou du cours"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Création...' : 'Créer l\'absence'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}