import { useState } from 'react';
import { StrkGrade } from '@/types/strk';
import { useToast } from '@/hooks/use-toast';
import {
  fetchGradesByStudent,
  fetchGradesByCourse,
  createGrade,
  updateGrade,
  deleteGrade,
  calculateStudentCourseAverage
} from '@/services/strkGradeService';

export const useStrkGrades = () => {
  const [grades, setGrades] = useState<StrkGrade[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const loadGradesByStudent = async (studentId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchGradesByStudent(studentId);
      setGrades(data);
      return data;
    } catch (err) {
      setError('Erreur lors du chargement des notes');
      toast({
        title: "Erreur",
        description: "Impossible de charger les notes",
        variant: "destructive",
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  const loadGradesByCourse = async (courseId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchGradesByCourse(courseId);
      setGrades(data);
      return data;
    } catch (err) {
      setError('Erreur lors du chargement des notes');
      toast({
        title: "Erreur",
        description: "Impossible de charger les notes",
        variant: "destructive",
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  const addGrade = async (gradeData: Omit<StrkGrade, "id" | "created_at" | "updated_at">): Promise<StrkGrade | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const newGrade = await createGrade(gradeData);
      if (newGrade) {
        setGrades(prev => [newGrade, ...prev]);
        toast({
          title: "Note ajoutée",
          description: "La note a été ajoutée avec succès",
        });
        return newGrade;
      }
      return null;
    } catch (err) {
      setError('Erreur lors de l\'ajout de la note');
      toast({
        title: "Erreur",
        description: "Impossible d'ajouter la note",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const editGrade = async (id: string, updates: Partial<StrkGrade>): Promise<StrkGrade | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const updatedGrade = await updateGrade(id, updates);
      if (updatedGrade) {
        setGrades(prev =>
          prev.map(grade => grade.id === id ? { ...grade, ...updatedGrade } : grade)
        );
        toast({
          title: "Note mise à jour",
          description: "La note a été mise à jour avec succès",
        });
        return updatedGrade;
      }
      return null;
    } catch (err) {
      setError('Erreur lors de la mise à jour de la note');
      toast({
        title: "Erreur",
        description: "Impossible de mettre à jour la note",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const removeGrade = async (id: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const success = await deleteGrade(id);
      if (success) {
        setGrades(prev => prev.filter(grade => grade.id !== id));
        toast({
          title: "Note supprimée",
          description: "La note a été supprimée avec succès",
        });
        return true;
      }
      return false;
    } catch (err) {
      setError('Erreur lors de la suppression de la note');
      toast({
        title: "Erreur",
        description: "Impossible de supprimer la note",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const getStudentAverage = async (studentId: string, courseId: string): Promise<number> => {
    try {
      return await calculateStudentCourseAverage(studentId, courseId);
    } catch (err) {
      console.error('Error calculating average:', err);
      return 0;
    }
  };

  return {
    grades,
    isLoading,
    error,
    loadGradesByStudent,
    loadGradesByCourse,
    addGrade,
    editGrade,
    removeGrade,
    getStudentAverage
  };
};