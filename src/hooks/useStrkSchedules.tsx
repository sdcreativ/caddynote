import { useState } from 'react';
import { StrkSchedule } from '@/types/strk';
import { useToast } from '@/hooks/use-toast';
import { 
  fetchSchedulesByStudent,
  fetchSchedulesByTeacher,
  fetchSchedulesByClass,
  fetchSchedulesByInstitution,
  createSchedule,
  updateSchedule,
  deleteSchedule
} from '@/services/strkScheduleService';

export const useStrkSchedules = () => {
  const [schedules, setSchedules] = useState<StrkSchedule[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const loadSchedulesByStudent = async (studentId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchSchedulesByStudent(studentId);
      setSchedules(data);
      return data;
    } catch (err) {
      setError('Erreur lors du chargement de l\'emploi du temps');
      toast({
        title: "Erreur",
        description: "Impossible de charger l'emploi du temps",
        variant: "destructive",
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  const loadSchedulesByTeacher = async (teacherId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchSchedulesByTeacher(teacherId);
      setSchedules(data);
      return data;
    } catch (err) {
      setError('Erreur lors du chargement de l\'emploi du temps');
      toast({
        title: "Erreur",
        description: "Impossible de charger l'emploi du temps",
        variant: "destructive",
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  const loadSchedulesByClass = async (classId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchSchedulesByClass(classId);
      setSchedules(data);
      return data;
    } catch (err) {
      setError('Erreur lors du chargement de l\'emploi du temps');
      toast({
        title: "Erreur",
        description: "Impossible de charger l'emploi du temps",
        variant: "destructive",
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  const loadSchedulesByInstitution = async (institutionId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchSchedulesByInstitution(institutionId);
      setSchedules(data);
      return data;
    } catch (err) {
      setError("Erreur lors du chargement de l'emploi du temps");
      toast({
        title: 'Erreur',
        description: "Impossible de charger l'emploi du temps",
        variant: 'destructive',
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  const addSchedule = async (scheduleData: Omit<StrkSchedule, "id" | "created_at" | "updated_at">): Promise<StrkSchedule | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const newSchedule = await createSchedule(scheduleData);
      
      if (newSchedule) {
        setSchedules(prev => [...prev, newSchedule]);
        toast({
          title: "Cours ajouté",
          description: "Le cours a été ajouté à l'emploi du temps",
        });
        return newSchedule;
      }
      return null;
    } catch (err) {
      console.error("Error in addSchedule:", err);
      setError('Erreur lors de l\'ajout du cours');
      toast({
        title: "Erreur",
        description: "Impossible d'ajouter le cours à l'emploi du temps",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const editSchedule = async (id: string, updates: Partial<StrkSchedule>): Promise<StrkSchedule | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const updatedSchedule = await updateSchedule(id, updates);
      if (updatedSchedule) {
        setSchedules(prev => 
          prev.map(schedule => schedule.id === id ? { ...schedule, ...updatedSchedule } : schedule)
        );
        toast({
          title: "Cours mis à jour",
          description: "Le cours a été mis à jour dans l'emploi du temps",
        });
        return updatedSchedule;
      }
      return null;
    } catch (err) {
      setError('Erreur lors de la mise à jour du cours');
      toast({
        title: "Erreur",
        description: "Impossible de mettre à jour le cours",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const removeSchedule = async (id: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const success = await deleteSchedule(id);
      if (success) {
        setSchedules(prev => prev.filter(schedule => schedule.id !== id));
        toast({
          title: "Cours supprimé",
          description: "Le cours a été supprimé de l'emploi du temps",
        });
        return true;
      }
      return false;
    } catch (err) {
      setError('Erreur lors de la suppression du cours');
      toast({
        title: "Erreur",
        description: "Impossible de supprimer le cours",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    schedules,
    isLoading,
    error,
    loadSchedulesByStudent,
    loadSchedulesByTeacher,
    loadSchedulesByClass,
    loadSchedulesByInstitution,
    addSchedule,
    editSchedule,
    removeSchedule
  };
};