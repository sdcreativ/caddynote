import { apiClient } from '@/lib/apiClient';

export type AuthSession = {
  id: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  current: boolean;
};

export const listSessions = async () => {
  const { sessions } = await apiClient.get<{ sessions: AuthSession[] }>('/auth/sessions');
  return sessions;
};

export const revokeSession = async (id: string) => {
  await apiClient.delete(`/auth/sessions/${id}`);
};

export const revokeOtherSessions = async () => {
  const { revoked } = await apiClient.delete<{ revoked: number }>('/auth/sessions');
  return revoked;
};
