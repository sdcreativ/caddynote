import { apiClient } from '@/lib/apiClient';

export type ComChannel = 'email' | 'sms' | 'whatsapp' | 'push';

export type CommunicationLog = {
  id: string;
  channel: ComChannel;
  status: string;
  useCase?: string | null;
  subject?: string | null;
  body?: string | null;
  recipientId: string;
  requestedAt: string;
  sentAt?: string | null;
  deliveredAt?: string | null;
  acknowledgedAt?: string | null;
  errorMessage?: string | null;
};

export type MessageTemplate = {
  id: string;
  useCase: string;
  channel: ComChannel;
  locale: string;
  subject?: string | null;
  body: string;
  isActive: boolean;
};

export type ChannelPreference = {
  id: string;
  channel: ComChannel;
  optedIn: boolean;
};

export const listCommunicationLogs = async (params?: { institutionId?: string }) => {
  const q = new URLSearchParams();
  if (params?.institutionId) q.set('institutionId', params.institutionId);
  const qs = q.toString();
  const { logs } = await apiClient.get<{ logs: CommunicationLog[] }>(
    `/communications/logs${qs ? `?${qs}` : ''}`
  );
  return logs;
};

export const listMessageTemplates = async (institutionId?: string) => {
  const q = institutionId ? `?institutionId=${encodeURIComponent(institutionId)}` : '';
  const { templates } = await apiClient.get<{ templates: MessageTemplate[] }>(
    `/communications/templates${q}`
  );
  return templates;
};

export const sendCommunication = async (payload: {
  recipientId: string;
  channel: ComChannel;
  subject?: string;
  body?: string;
  useCase?: string;
  isCritical?: boolean;
  variables?: Record<string, string>;
}) => {
  const res = await apiClient.post<{ log: CommunicationLog }>('/communications/send', payload);
  return res.log;
};

export const getCommunicationPreferences = async () => {
  const { preferences } = await apiClient.get<{ preferences: ChannelPreference[] }>(
    '/communications/preferences'
  );
  return preferences;
};

export const setCommunicationPreference = async (channel: ComChannel, optedIn: boolean) => {
  const { preference } = await apiClient.put<{ preference: ChannelPreference }>(
    `/communications/preferences/${channel}`,
    { optedIn }
  );
  return preference;
};

export const acknowledgeCommunication = async (logId: string) => {
  const { log } = await apiClient.post<{ log: CommunicationLog }>(
    `/communications/logs/${logId}/acknowledge`,
    {}
  );
  return log;
};
