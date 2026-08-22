
import { useState, useCallback, useEffect } from 'react';
import { User } from '@/types/strk';
import { useToast } from '@/hooks/use-toast';
import {
  fetchStrkUserProfile,
  fetchStrkUsersByInstitution,
  fetchAllStrkUsers,
  updateStrkUserProfile,
  assignStrkUserToInstitution,
  createStrkUser,
  removeStrkUser,
  reactivateStrkUser
} from '@/services/strkUserService';

export const useStrkUsers = (defaultInstitutionId?: string) => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const loadUsersByInstitution = useCallback(async (institutionId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchStrkUsersByInstitution(institutionId);
      setUsers(prev => {
        // Merge without duplicates
        const existing = prev.filter(user => user.institutionId !== institutionId);
        return [...existing, ...data];
      });
      return data;
    } catch (err) {
      setError('Erreur lors du chargement des utilisateurs');
      toast({
        title: "Erreur",
        description: "Impossible de charger les utilisateurs de l'établissement",
        variant: "destructive",
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const loadAllUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAllStrkUsers();
      setUsers(data);
      return data;
    } catch (err) {
      console.error("❌ Error loading all users:", err);
      setError('Erreur lors du chargement de tous les utilisateurs');
      toast({
        title: "Erreur", 
        description: "Impossible de charger tous les utilisateurs",
        variant: "destructive",
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const getUserProfile = useCallback(async (userId: string): Promise<User | null> => {
    setIsLoading(true);
    setError(null);
    try {
      return await fetchStrkUserProfile(userId);
    } catch (err) {
      setError('Erreur lors du chargement du profil utilisateur');
      toast({
        title: "Erreur",
        description: "Impossible de charger le profil de l'utilisateur",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const updateUser = useCallback(async (userId: string, userData: Partial<User>): Promise<User | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const updatedUser = await updateStrkUserProfile(userId, userData);
      if (updatedUser) {
        setUsers(prev => 
          prev.map(user => user.id === userId ? updatedUser : user)
        );
        toast({
          title: "Profil mis à jour",
          description: "Le profil de l'utilisateur a été mis à jour avec succès",
        });
        return updatedUser;
      }
      return null;
    } catch (err: any) {
      console.error('Erreur lors de la mise à jour du profil:', err);
      setError('Erreur lors de la mise à jour du profil');
      const errorMessage = err.message?.includes('new row violates row-level security') 
        ? "Permissions insuffisantes pour modifier ce profil"
        : err.message || "Impossible de mettre à jour le profil";
      toast({
        title: "Erreur",
        description: errorMessage,
        variant: "destructive",
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const assignToInstitution = useCallback(async (userId: string, institutionId: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const success = await assignStrkUserToInstitution(userId, institutionId);
      if (success) {
        toast({
          title: "Utilisateur assigné",
          description: "L'utilisateur a été assigné à l'établissement avec succès",
        });
        return true;
      }
      return false;
    } catch (err) {
      setError('Erreur lors de l\'assignation de l\'utilisateur');
      toast({
        title: "Erreur",
        description: "Impossible d'assigner l'utilisateur à l'établissement",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const addUser = useCallback(async (userData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: string;
    institutionId?: string;
    phoneNumber?: string;
  }): Promise<User | null> => {
    setIsLoading(true);
    setError(null);

    // Validation des données
    if (!userData.email || !userData.password || !userData.firstName || !userData.lastName) {
      const errorMessage = "Tous les champs obligatoires doivent être remplis";
      setError(errorMessage);
      toast({
        title: "Erreur de validation",
        description: errorMessage,
        variant: "destructive",
      });
      setIsLoading(false);
      return null;
    }

    if (userData.password.length < 6) {
      const errorMessage = "Le mot de passe doit contenir au moins 6 caractères";
      setError(errorMessage);
      toast({
        title: "Erreur de validation",
        description: errorMessage,
        variant: "destructive",
      });
      setIsLoading(false);
      return null;
    }

    try {
      const newUser = await createStrkUser(userData);
      if (newUser) {
        setUsers(prev => [...prev, newUser]);
        toast({
          title: "Utilisateur créé",
          description: "L'utilisateur a été créé avec succès",
        });
        return newUser;
      } else {
        const errorMessage = "Erreur lors de la création: aucun utilisateur retourné";
        setError(errorMessage);
        toast({
          title: "Erreur",
          description: errorMessage,
          variant: "destructive",
        });
        return null;
      }
    } catch (err: any) {
      console.error('Error creating user:', err);
      const errorMessage = err.message || "Impossible de créer l'utilisateur";
      setError(errorMessage);
      toast({
        title: "Erreur de création",
        description: errorMessage,
        variant: "destructive",
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // PER-005 : ceci désactive le compte (connexion bloquée), ça ne le
  // supprime plus — on le laisse donc dans la liste (marqué inactif)
  // plutôt que de le faire disparaître comme s'il n'avait jamais existé.
  const deleteUser = useCallback(async (userId: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const success = await removeStrkUser(userId);
      if (success) {
        setUsers(prev => prev.map(user => user.id === userId ? { ...user, isActive: false } : user));
        toast({
          title: "Utilisateur désactivé",
          description: "Le compte a été désactivé ; son historique est conservé et il peut être réactivé.",
        });
        return true;
      }
      return false;
    } catch (err) {
      setError('Erreur lors de la désactivation de l\'utilisateur');
      toast({
        title: "Erreur",
        description: "Impossible de désactiver l'utilisateur",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const reactivateUser = useCallback(async (userId: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const updated = await reactivateStrkUser(userId);
      if (updated) {
        setUsers(prev => prev.map(user => user.id === userId ? { ...user, isActive: true } : user));
        toast({
          title: "Utilisateur réactivé",
          description: "Le compte peut de nouveau se connecter.",
        });
        return true;
      }
      return false;
    } catch (err) {
      setError('Erreur lors de la réactivation de l\'utilisateur');
      toast({
        title: "Erreur",
        description: "Impossible de réactiver l'utilisateur",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Automatically load users when defaultInstitutionId is provided
  useEffect(() => {
    if (defaultInstitutionId) {
      loadUsersByInstitution(defaultInstitutionId);
    }
  }, [defaultInstitutionId, loadUsersByInstitution]);

  return {
    users,
    isLoading,
    error,
    loadUsersByInstitution,
    loadAllUsers,
    getUserProfile,
    updateUser,
    assignToInstitution,
    addUser,
    deleteUser,
    reactivateUser
  };
};
