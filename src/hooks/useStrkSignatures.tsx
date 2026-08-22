import { useState, useCallback } from 'react';
import { StrkSignature, StrkSignatureType, StrkSignatureStatus } from '@/types/strk';
import { 
  createStrkSignature, 
  fetchStrkSignaturesByInstitution, 
  fetchStrkSignaturesByStudent,
  updateStrkSignatureStatus,
  deleteStrkSignature,
  fetchStrkSignatureById
} from '@/services/strkSignatureService';

export const useStrkSignatures = () => {
  const [signatures, setSignatures] = useState<StrkSignature[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSignaturesByInstitution = useCallback(async (institutionId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchStrkSignaturesByInstitution(institutionId);
      setSignatures(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement des signatures');
      console.error('Error loading signatures by institution:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadSignaturesByStudent = useCallback(async (studentId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchStrkSignaturesByStudent(studentId);
      setSignatures(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement des signatures');
      console.error('Error loading signatures by student:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createSignature = useCallback(async (signatureData: {
    student_id: string;
    institution_id: string;
    title: string;
    type: StrkSignatureType;
    date: string;
    timestamp?: string;
    sender_id?: string;
    recipient_id?: string;
    expires_at?: string;
  }) => {
    setIsLoading(true);
    setError(null);
    try {
      const newSignature = await createStrkSignature(signatureData);
      if (newSignature) {
        setSignatures(prev => [newSignature, ...prev]);
        return newSignature;
      }
      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création de la signature');
      console.error('Error creating signature:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateSignatureStatus = useCallback(async (
    signatureId: string, 
    status: StrkSignatureStatus,
    signatureData?: string
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      const updatedSignature = await updateStrkSignatureStatus(signatureId, status, signatureData);
      if (updatedSignature) {
        setSignatures(prev => 
          prev.map(sig => sig.id === signatureId ? updatedSignature : sig)
        );
        return updatedSignature;
      }
      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la mise à jour de la signature');
      console.error('Error updating signature status:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const removeSignature = useCallback(async (signatureId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const success = await deleteStrkSignature(signatureId);
      if (success) {
        setSignatures(prev => prev.filter(sig => sig.id !== signatureId));
        return true;
      }
      return false;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression de la signature');
      console.error('Error removing signature:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getSignatureById = useCallback(async (signatureId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const signature = await fetchStrkSignatureById(signatureId);
      return signature;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la récupération de la signature');
      console.error('Error getting signature by ID:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    signatures,
    isLoading,
    error,
    loadSignaturesByInstitution,
    loadSignaturesByStudent,
    createSignature,
    updateSignatureStatus,
    removeSignature,
    getSignatureById
  };
};