import { useState } from 'react';
import { StrkAssignment, StrkSubmission } from '@/types/strk';
import { useToast } from '@/hooks/use-toast';
import {
  fetchAssignmentsByTeacher,
  fetchAssignmentsByStudent,
  createAssignment,
  fetchSubmissionsByAssignment,
  submitAssignment,
  gradeSubmission
} from '@/services/strkAssignmentService';

export const useStrkAssignments = () => {
  const [assignments, setAssignments] = useState<StrkAssignment[]>([]);
  const [submissions, setSubmissions] = useState<StrkSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const loadAssignmentsByTeacher = async (teacherId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAssignmentsByTeacher(teacherId);
      setAssignments(data);
      return data;
    } catch (err) {
      setError('Erreur lors du chargement des devoirs');
      toast({
        title: "Erreur",
        description: "Impossible de charger les devoirs",
        variant: "destructive",
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  const loadAssignmentsByStudent = async (studentId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAssignmentsByStudent(studentId);
      setAssignments(data);
      return data;
    } catch (err) {
      setError('Erreur lors du chargement des devoirs');
      toast({
        title: "Erreur",
        description: "Impossible de charger les devoirs",
        variant: "destructive",
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  const addAssignment = async (assignmentData: Omit<StrkAssignment, "id" | "created_at" | "updated_at">): Promise<StrkAssignment | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const newAssignment = await createAssignment(assignmentData);
      if (newAssignment) {
        setAssignments(prev => [newAssignment, ...prev]);
        toast({
          title: "Devoir créé",
          description: "Le devoir a été créé avec succès",
        });
        return newAssignment;
      }
      return null;
    } catch (err) {
      setError('Erreur lors de la création du devoir');
      toast({
        title: "Erreur",
        description: "Impossible de créer le devoir",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const loadSubmissions = async (assignmentId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchSubmissionsByAssignment(assignmentId);
      setSubmissions(data);
      return data;
    } catch (err) {
      setError('Erreur lors du chargement des soumissions');
      toast({
        title: "Erreur",
        description: "Impossible de charger les soumissions",
        variant: "destructive",
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  const submitWork = async (submissionData: Omit<StrkSubmission, "id" | "created_at" | "updated_at">): Promise<StrkSubmission | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const newSubmission = await submitAssignment(submissionData);
      if (newSubmission) {
        setSubmissions(prev => [newSubmission, ...prev.filter(s => s.assignment_id !== submissionData.assignment_id || s.student_id !== submissionData.student_id)]);
        toast({
          title: "Devoir rendu",
          description: "Votre devoir a été rendu avec succès",
        });
        return newSubmission;
      }
      return null;
    } catch (err) {
      setError('Erreur lors du rendu du devoir');
      toast({
        title: "Erreur",
        description: "Impossible de rendre le devoir",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const gradeWork = async (submissionId: string, grade: number, feedback?: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const success = await gradeSubmission(submissionId, grade, feedback);
      if (success) {
        setSubmissions(prev =>
          prev.map(submission =>
            submission.id === submissionId
              ? { ...submission, grade, feedback, status: 'graded' }
              : submission
          )
        );
        toast({
          title: "Note attribuée",
          description: "La note a été attribuée avec succès",
        });
        return true;
      }
      return false;
    } catch (err) {
      setError('Erreur lors de l\'attribution de la note');
      toast({
        title: "Erreur",
        description: "Impossible d'attribuer la note",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    assignments,
    submissions,
    isLoading,
    error,
    loadAssignmentsByTeacher,
    loadAssignmentsByStudent,
    addAssignment,
    loadSubmissions,
    submitWork,
    gradeWork
  };
};