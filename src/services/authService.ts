import { apiClient, ApiError } from '@/lib/apiClient';

export interface PasswordChangeResult {
  success: boolean;
  error?: string;
}

export class AuthService {
  static async changePassword(currentPassword: string, newPassword: string): Promise<PasswordChangeResult> {
    try {
      await apiClient.post('/auth/change-password', { currentPassword, newPassword });
      return { success: true };
    } catch (error) {
      if (error instanceof ApiError) {
        return { success: false, error: error.message };
      }
      return { success: false, error: 'Erreur lors de la modification du mot de passe' };
    }
  }
}
