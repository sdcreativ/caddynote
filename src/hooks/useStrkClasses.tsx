import { useState, useCallback } from 'react';
import { ClassWithDetails } from '@/services/strkClassService';
import { useToast } from '@/hooks/use-toast';
import { 
  fetchClassesByInstitution,
  fetchClassesByTeacher,
  fetchClassById,
  createClass,
  updateClass,
  deleteClass,
  assignStudentsToClass,
  removeStudentFromClass
} from '@/services/strkClassService';

export const useStrkClasses = () => {
  const [classes, setClasses] = useState<ClassWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadKey, setLastLoadKey] = useState<string | null>(null);
  const { toast } = useToast();

  const loadClassesByInstitution = useCallback(async (institutionId: string) => {
    const cacheKey = `institution:${institutionId}`;
    
    // Éviter de recharger si déjà chargé avec la même clé
    if (lastLoadKey === cacheKey && classes.length > 0) {
      return;
    }
    
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchClassesByInstitution(institutionId);
      setClasses(data);
      setLastLoadKey(cacheKey);
    } catch (err) {
      setError('Erreur lors du chargement des classes');
      toast({
        title: "Erreur",
        description: "Impossible de charger les classes",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast, lastLoadKey, classes.length]);

  const loadClassesByTeacher = useCallback(async (teacherId: string) => {
    const cacheKey = `teacher:${teacherId}`;
    
    // Éviter de recharger si déjà chargé avec la même clé
    if (lastLoadKey === cacheKey && classes.length > 0) {
      return;
    }
    
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchClassesByTeacher(teacherId);
      setClasses(data);
      setLastLoadKey(cacheKey);
    } catch (err) {
      setError('Erreur lors du chargement des classes');
      toast({
        title: "Erreur",
        description: "Impossible de charger les classes",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast, lastLoadKey, classes.length]);

  const getClassById = async (id: string): Promise<ClassWithDetails | null> => {
    setIsLoading(true);
    setError(null);
    try {
      return await fetchClassById(id);
    } catch (err) {
      setError('Erreur lors du chargement de la classe');
      toast({
        title: "Erreur",
        description: "Impossible de charger les détails de la classe",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const addClass = async (classData: Omit<ClassWithDetails, "id" | "created_at" | "updated_at" | "institution_name" | "teacher_name" | "student_count" | "total_courses">): Promise<ClassWithDetails | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const newClass = await createClass(classData);
      
      if (newClass) {
        setClasses(prev => [...prev, newClass as ClassWithDetails]);
        toast({
          title: "Classe ajoutée",
          description: "La classe a été créée avec succès",
        });
        return newClass as ClassWithDetails;
      }
      return null;
    } catch (err) {
      console.error("Error in addClass:", err);
      setError('Erreur lors de l\'ajout de la classe');
      toast({
        title: "Erreur",
        description: "Impossible d'ajouter la classe",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const editClass = async (
    id: string,
    updates: Partial<Omit<ClassWithDetails, 'teacher_id'>> & { teacher_id?: string | null }
  ): Promise<ClassWithDetails | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const updatedClass = await updateClass(id, updates);
      if (updatedClass) {
        setClasses(prev => 
          prev.map(cls => cls.id === id ? { ...cls, ...updatedClass } : cls)
        );
        toast({
          title: "Classe mise à jour",
          description: "La classe a été mise à jour avec succès",
        });
        return updatedClass as ClassWithDetails;
      }
      return null;
    } catch (err) {
      setError('Erreur lors de la mise à jour de la classe');
      toast({
        title: "Erreur",
        description: "Impossible de mettre à jour la classe",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const removeClass = async (id: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const success = await deleteClass(id);
      if (success) {
        setClasses(prev => prev.filter(cls => cls.id !== id));
        toast({
          title: "Classe supprimée",
          description: "La classe a été supprimée avec succès",
        });
        return true;
      }
      return false;
    } catch (err) {
      setError('Erreur lors de la suppression de la classe');
      toast({
        title: "Erreur",
        description: "Impossible de supprimer la classe",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const assignStudents = async (classId: string, studentIds: string[]): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const success = await assignStudentsToClass(classId, studentIds);
      if (success) {
        toast({
          title: "Étudiants assignés",
          description: "Les étudiants ont été assignés à la classe avec succès",
        });
        return true;
      }
      return false;
    } catch (err) {
      setError('Erreur lors de l\'assignation des étudiants');
      toast({
        title: "Erreur",
        description: "Impossible d'assigner les étudiants à la classe",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const removeStudent = async (classId: string, studentId: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const success = await removeStudentFromClass(classId, studentId);
      if (success) {
        toast({
          title: "Étudiant retiré",
          description: "L'étudiant a été retiré de la classe avec succès",
        });
        return true;
      }
      return false;
    } catch (err) {
      setError('Erreur lors du retrait de l\'étudiant');
      toast({
        title: "Erreur",
        description: "Impossible de retirer l'étudiant de la classe",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Fonction pour forcer le rechargement
  const forceReload = useCallback(() => {
    setLastLoadKey(null);
    setClasses([]);
  }, []);

  return {
    classes,
    isLoading,
    error,
    loadClassesByInstitution,
    loadClassesByTeacher,
    getClassById,
    addClass,
    editClass,
    removeClass,
    assignStudents,
    removeStudent,
    forceReload
  };
};