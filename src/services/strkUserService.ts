import { apiClient, ApiError } from "@/lib/apiClient";
import { User, StrkUserRole } from "@/types/strk";

export type { User };

// Forme du profil telle que renvoyée par l'API (server/src/lib/profileSelect.ts).
interface ApiProfile {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phoneNumber: string | null;
  profileImage: string | null;
  role: StrkUserRole;
  institutionId: string | null;
  isActive?: boolean;
}

const mapApiProfileToUser = (profile: ApiProfile): User => ({
  id: profile.id,
  name: [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.email || 'Utilisateur',
  email: profile.email || undefined,
  role: profile.role,
  profileImage: profile.profileImage || undefined,
  phoneNumber: profile.phoneNumber || undefined,
  institutionId: profile.institutionId || undefined,
  isActive: profile.isActive ?? true,
});

// Créer un nouvel utilisateur (mot de passe temporaire généré côté serveur —
// remplace l'ancien flux Supabase Auth signUp + trigger handle_new_user).
export const createStrkUser = async (userData: {
  email: string;
  password: string; // conservé pour compatibilité d'appel ; ignoré : le mot de passe est temporaire et généré côté API
  firstName: string;
  lastName: string;
  role: string;
  institutionId?: string;
  phoneNumber?: string;
}): Promise<User | null> => {
  try {
    if (!userData.email || !userData.firstName || !userData.lastName) {
      throw new Error('Données utilisateur incomplètes');
    }

    const { user } = await apiClient.post<{ user: ApiProfile; tempPassword: string }>('/users', {
      email: userData.email,
      firstName: userData.firstName,
      lastName: userData.lastName,
      role: userData.role,
      institutionId: userData.institutionId,
      phoneNumber: userData.phoneNumber,
    });

    return mapApiProfileToUser(user);
  } catch (error) {
    console.error('Error in createStrkUser:', error);
    if (error instanceof ApiError && error.status === 409) {
      throw new Error('Un utilisateur avec cet email existe déjà');
    }
    throw error;
  }
};

export const fetchStrkUserProfile = async (userId: string): Promise<User | null> => {
  try {
    const { user } = await apiClient.get<{ user: ApiProfile }>(`/users/${userId}`);
    return mapApiProfileToUser(user);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    console.error("Error in fetchStrkUserProfile:", error);
    return null;
  }
};

export const fetchStrkUsersByInstitution = async (institutionId: string): Promise<User[]> => {
  try {
    const { users } = await apiClient.get<{ users: ApiProfile[] }>(
      `/users?institutionId=${encodeURIComponent(institutionId)}`
    );
    return users.map(mapApiProfileToUser);
  } catch (error) {
    console.error("Error in fetchStrkUsersByInstitution:", error);
    return [];
  }
};

// Réservé aux admins globaux (le backend applique la même restriction).
export const fetchAllStrkUsers = async (): Promise<User[]> => {
  try {
    const { users } = await apiClient.get<{ users: ApiProfile[] }>('/users');
    return users.map(mapApiProfileToUser);
  } catch (error) {
    console.error("Error in fetchAllStrkUsers:", error);
    return [];
  }
};

export const updateStrkUserProfile = async (userId: string, profileData: Partial<User>): Promise<User | null> => {
  try {
    const nameParts = profileData.name?.split(' ') ?? [];
    const { user } = await apiClient.patch<{ user: ApiProfile }>(`/users/${userId}`, {
      firstName: profileData.name !== undefined ? nameParts[0] || '' : undefined,
      lastName: profileData.name !== undefined ? nameParts.slice(1).join(' ') : undefined,
      email: profileData.email,
      role: profileData.role,
      profileImage: profileData.profileImage,
      phoneNumber: profileData.phoneNumber,
    });
    return mapApiProfileToUser(user);
  } catch (error) {
    console.error("Error in updateStrkUserProfile:", error);
    if (error instanceof ApiError && error.status === 403) {
      const enhancedError = new Error("Permissions insuffisantes pour modifier ce profil utilisateur");
      enhancedError.name = 'RLSError';
      throw enhancedError;
    }
    return null;
  }
};

export const assignStrkUserToInstitution = async (userId: string, institutionId: string): Promise<boolean> => {
  try {
    await apiClient.patch(`/users/${userId}/institution`, { institutionId });
    return true;
  } catch (error) {
    console.error("Error in assignStrkUserToInstitution:", error);
    return false;
  }
};

// PER-005 : malgré son nom (conservé pour compatibilité d'appel), ceci
// désactive le compte côté serveur — il n'est jamais supprimé pour de vrai,
// afin de ne jamais casser son historique (notes, absences, factures...).
// Voir reactivateStrkUser pour revenir en arrière.
export const deleteStrkUser = async (userId: string): Promise<boolean> => {
  try {
    await apiClient.delete(`/users/${userId}`);
    return true;
  } catch (error) {
    console.error("Error in deleteStrkUser:", error);
    if (error instanceof ApiError && error.status === 403) {
      const enhancedError = new Error("Permissions insuffisantes pour désactiver ce profil utilisateur");
      enhancedError.name = 'RLSError';
      throw enhancedError;
    }
    return false;
  }
};

export const removeStrkUser = async (userId: string): Promise<boolean> => {
  return deleteStrkUser(userId);
};

export const reactivateStrkUser = async (userId: string): Promise<User | null> => {
  try {
    const { user } = await apiClient.post<{ user: ApiProfile }>(`/users/${userId}/reactivate`, {});
    return mapApiProfileToUser(user);
  } catch (error) {
    console.error("Error in reactivateStrkUser:", error);
    return null;
  }
};
