import { useState, useCallback } from 'react';
import { 
  StrkSubject, 
  CreateSubjectData, 
  UpdateSubjectData,
  createStrkSubject,
  fetchStrkSubjectsByInstitution,
  updateStrkSubject,
  deleteStrkSubject
} from '@/services/strkSubjectService';
import { useToast } from '@/hooks/use-toast';

export const useStrkSubjects = () => {
  const [subjects, setSubjects] = useState<StrkSubject[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const loadSubjectsByInstitution = useCallback(async (institutionId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchStrkSubjectsByInstitution(institutionId);
      setSubjects(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors du chargement des matières';
      setError(message);
      console.error('Error loading subjects:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createSubject = useCallback(async (data: CreateSubjectData) => {
    try {
      const newSubject = await createStrkSubject(data);
      if (newSubject) {
        setSubjects(prev => [...prev, newSubject]);
        toast({
          title: "Matière créée",
          description: "La matière a été créée avec succès"
        });
        return newSubject;
      }
      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la création de la matière';
      toast({
        title: "Erreur",
        description: message,
        variant: "destructive"
      });
      return null;
    }
  }, [toast]);

  const updateSubject = useCallback(async (id: string, data: UpdateSubjectData) => {
    try {
      const updatedSubject = await updateStrkSubject(id, data);
      if (updatedSubject) {
        setSubjects(prev => prev.map(subject => 
          subject.id === id ? updatedSubject : subject
        ));
        toast({
          title: "Matière mise à jour",
          description: "La matière a été mise à jour avec succès"
        });
        return updatedSubject;
      }
      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la mise à jour de la matière';
      toast({
        title: "Erreur",
        description: message,
        variant: "destructive"
      });
      return null;
    }
  }, [toast]);

  const deleteSubject = useCallback(async (id: string) => {
    try {
      const success = await deleteStrkSubject(id);
      if (success) {
        setSubjects(prev => prev.filter(subject => subject.id !== id));
        toast({
          title: "Matière supprimée",
          description: "La matière a été supprimée avec succès"
        });
        return true;
      }
      return false;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la suppression de la matière';
      toast({
        title: "Erreur",
        description: message,
        variant: "destructive"
      });
      return false;
    }
  }, [toast]);

  return {
    subjects,
    isLoading,
    error,
    loadSubjectsByInstitution,
    createSubject,
    updateSubject,
    deleteSubject
  };
};