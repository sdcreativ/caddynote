import { useState, useEffect, useCallback } from 'react';
import { Institution } from '@/types/strk';
import { useToast } from '@/hooks/use-toast';
import { ApiError } from '@/lib/apiClient';
import {
  fetchStrkInstitutions,
  fetchStrkInstitutionById,
  createStrkInstitution,
  updateStrkInstitution,
  deleteStrkInstitution,
} from '@/services/strkInstitutionService';

const errorMessage = (err: unknown, fallback: string) =>
  err instanceof ApiError ? err.message : fallback;

export const useStrkInstitutions = () => {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const loadInstitutions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchStrkInstitutions();
      setInstitutions(data);
    } catch (err) {
      const message = errorMessage(err, 'Impossible de charger les établissements');
      setError(message);
      toast({ title: 'Erreur', description: message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const getInstitutionById = useCallback(
    async (id: string): Promise<Institution | null> => {
      setIsLoading(true);
      setError(null);
      try {
        return await fetchStrkInstitutionById(id);
      } catch (err) {
        const message = errorMessage(err, "Impossible de charger les détails de l'établissement");
        setError(message);
        toast({ title: 'Erreur', description: message, variant: 'destructive' });
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [toast]
  );

  const addInstitution = useCallback(
    async (institution: Omit<Institution, 'id'>): Promise<Institution | null> => {
      setIsLoading(true);
      setError(null);
      try {
        const newInstitution = await createStrkInstitution(institution);
        setInstitutions((prev) => [...prev, newInstitution]);
        toast({
          title: 'Établissement ajouté',
          description: "L'établissement a été ajouté avec succès",
        });
        return newInstitution;
      } catch (err) {
        const message = errorMessage(err, "Impossible d'ajouter l'établissement");
        setError(message);
        toast({ title: 'Erreur', description: message, variant: 'destructive' });
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [toast]
  );

  const editInstitution = useCallback(
    async (id: string, institution: Partial<Institution>): Promise<Institution | null> => {
      setIsLoading(true);
      setError(null);
      try {
        const updatedInstitution = await updateStrkInstitution(id, institution);
        setInstitutions((prev) => prev.map((inst) => (inst.id === id ? updatedInstitution : inst)));
        toast({
          title: 'Établissement mis à jour',
          description: "L'établissement a été mis à jour avec succès",
        });
        return updatedInstitution;
      } catch (err) {
        const message = errorMessage(err, "Impossible de mettre à jour l'établissement");
        setError(message);
        toast({ title: 'Erreur', description: message, variant: 'destructive' });
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [toast]
  );

  const removeInstitution = useCallback(
    async (id: string): Promise<boolean> => {
      setIsLoading(true);
      setError(null);
      try {
        await deleteStrkInstitution(id);
        setInstitutions((prev) => prev.filter((inst) => inst.id !== id));
        toast({
          title: 'Établissement supprimé',
          description: "L'établissement a été supprimé avec succès",
        });
        return true;
      } catch (err) {
        const message = errorMessage(err, "Impossible de supprimer l'établissement");
        setError(message);
        toast({ title: 'Erreur', description: message, variant: 'destructive' });
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    void loadInstitutions();
  }, [loadInstitutions]);

  return {
    institutions,
    isLoading,
    error,
    loadInstitutions,
    getInstitutionById,
    addInstitution,
    editInstitution,
    removeInstitution,
  };
};
