import { useState, useCallback } from 'react';
import { CourseWithDetails } from '@/services/strkCourseService';
import { useToast } from '@/hooks/use-toast';
import { 
  fetchCoursesByTeacher,
  fetchCoursesByInstitution,
  fetchCourseById,
  createCourse,
  updateCourse,
  deleteCourse
} from '@/services/strkCourseService';

export const useStrkCourses = () => {
  const [courses, setCourses] = useState<CourseWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const loadCoursesByTeacher = useCallback(async (teacherId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchCoursesByTeacher(teacherId);
      setCourses(data);
      return data;
    } catch (err) {
      setError('Erreur lors du chargement des cours');
      toast({
        title: "Erreur",
        description: "Impossible de charger les cours",
        variant: "destructive",
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const loadCoursesByInstitution = useCallback(async (institutionId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchCoursesByInstitution(institutionId);
      setCourses(data);
      return data;
    } catch (err) {
      setError('Erreur lors du chargement des cours');
      toast({
        title: "Erreur",
        description: "Impossible de charger les cours",
        variant: "destructive",
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const getCourseById = async (id: string): Promise<CourseWithDetails | null> => {
    setIsLoading(true);
    setError(null);
    try {
      return await fetchCourseById(id);
    } catch (err) {
      setError('Erreur lors du chargement du cours');
      toast({
        title: "Erreur",
        description: "Impossible de charger les détails du cours",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const addCourse = async (courseData: Omit<CourseWithDetails, "id" | "created_at" | "updated_at" | "teacher_name" | "class_name" | "institution_name" | "student_count">): Promise<CourseWithDetails | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const newCourse = await createCourse(courseData);
      
      if (newCourse) {
        setCourses(prev => [...prev, newCourse as CourseWithDetails]);
        toast({
          title: "Cours ajouté",
          description: "Le cours a été créé avec succès",
        });
        return newCourse as CourseWithDetails;
      }
      return null;
    } catch (err) {
      console.error("Error in addCourse:", err);
      setError('Erreur lors de l\'ajout du cours');
      toast({
        title: "Erreur",
        description: "Impossible d'ajouter le cours",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const editCourse = async (id: string, updates: Partial<CourseWithDetails>): Promise<CourseWithDetails | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const updatedCourse = await updateCourse(id, updates);
      if (updatedCourse) {
        setCourses(prev => 
          prev.map(course => course.id === id ? { ...course, ...updatedCourse } : course)
        );
        toast({
          title: "Cours mis à jour",
          description: "Le cours a été mis à jour avec succès",
        });
        return updatedCourse as CourseWithDetails;
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

  const removeCourse = async (id: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const success = await deleteCourse(id);
      if (success) {
        setCourses(prev => prev.filter(course => course.id !== id));
        toast({
          title: "Cours supprimé",
          description: "Le cours a été supprimé avec succès",
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
    courses,
    isLoading,
    error,
    loadCoursesByTeacher,
    loadCoursesByInstitution,
    getCourseById,
    addCourse,
    createCourse: addCourse, // Alias for consistency
    editCourse,
    removeCourse
  };
};