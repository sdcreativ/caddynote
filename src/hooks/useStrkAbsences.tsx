import { useState, useCallback } from 'react';
import {
  StrkAbsence,
  fetchAbsencesByInstitution,
  fetchAbsencesByStudent,
  createStrkAbsence,
  justifyAbsence,
  reviewAbsenceJustification
} from '@/services/strkAbsenceService';

export const useStrkAbsences = () => {
  const [absences, setAbsences] = useState<StrkAbsence[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAbsencesByInstitution = useCallback(async (institutionId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAbsencesByInstitution(institutionId);
      setAbsences(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement des absences');
      console.error('Error loading absences by institution:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadAbsencesByStudent = useCallback(async (studentId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAbsencesByStudent(studentId);
      setAbsences(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement des absences');
      console.error('Error loading absences by student:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createAbsence = useCallback(async (absenceData: {
    student_id: string;
    institution_id: string;
    type: 'absence' | 'lateness';
    date: string;
    start_time?: string;
    end_time?: string;
    duration_minutes: number;
    class_name?: string;
  }) => {
    setIsLoading(true);
    setError(null);
    try {
      const newAbsence = await createStrkAbsence(absenceData);
      if (newAbsence) {
        setAbsences(prev => [newAbsence, ...prev]);
        return newAbsence;
      }
      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création de l\'absence');
      console.error('Error creating absence:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateAbsenceJustification = useCallback(async (
    absenceId: string,
    justificationReason: string,
    justificationFile?: string
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      const updatedAbsence = await justifyAbsence(absenceId, justificationReason, justificationFile);
      if (updatedAbsence) {
        setAbsences(prev => 
          prev.map(absence => absence.id === absenceId ? updatedAbsence : absence)
        );
        return updatedAbsence;
      }
      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la justification');
      console.error('Error justifying absence:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // PRS-005 : décision du personnel (accepter/rejeter) sur un justificatif.
  const reviewJustification = useCallback(async (absenceId: string, justified: boolean) => {
    setIsLoading(true);
    setError(null);
    try {
      const updatedAbsence = await reviewAbsenceJustification(absenceId, justified);
      if (updatedAbsence) {
        setAbsences(prev =>
          prev.map(absence => absence.id === absenceId ? updatedAbsence : absence)
        );
        return updatedAbsence;
      }
      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la validation du justificatif');
      console.error('Error reviewing absence justification:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    absences,
    isLoading,
    error,
    loadAbsencesByInstitution,
    loadAbsencesByStudent,
    createAbsence,
    updateAbsenceJustification,
    reviewJustification
  };
};