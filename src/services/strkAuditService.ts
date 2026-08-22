import { apiClient } from '@/lib/apiClient';

export interface AuditLogEntry {
  id: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  createdAt: string;
  actor?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    role?: string | null;
  } | null;
  institution?: { name: string } | null;
}

export const fetchAuditLog = async (params: {
  institutionId?: string;
  action?: string;
  limit?: number;
}): Promise<AuditLogEntry[]> => {
  const q = new URLSearchParams();
  if (params.institutionId) q.set('institutionId', params.institutionId);
  if (params.action) q.set('action', params.action);
  if (params.limit) q.set('limit', String(params.limit));
  const qs = q.toString();
  const { logs } = await apiClient.get<{ logs: AuditLogEntry[] }>(`/audit-log${qs ? `?${qs}` : ''}`);
  return logs;
};
