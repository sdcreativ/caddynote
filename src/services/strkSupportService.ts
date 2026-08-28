import { apiClient } from '@/lib/apiClient';

/**
 * SAA-006 — support client structuré (chap. 23/Lot 10). Jusqu'ici
 * totalement absent du produit : `CriticalAlertsCenter`/`LogsCenter`
 * (admin) sont de la supervision technique, pas un canal pour qu'un
 * établissement signale un problème et en suive la résolution.
 */
export type SupportTicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type SupportTicketStatus = 'open' | 'in_progress' | 'waiting_on_customer' | 'resolved' | 'closed';

export interface SupportTicket {
  id: string;
  institutionId: string | null;
  createdBy: string;
  assignedTo: string | null;
  subject: string;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  slaDueAt?: string;
  slaBreached?: boolean;
  creator?: { firstName: string | null; lastName: string | null; email: string | null };
  institution?: { id: string; name: string } | null;
}

export interface SupportTicketMessage {
  id: string;
  ticketId: string;
  authorId: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
  author?: { firstName: string | null; lastName: string | null; role: string };
}

export const fetchSupportTickets = async (params?: {
  unassigned?: boolean;
  status?: string;
  institutionId?: string;
}): Promise<SupportTicket[]> => {
  const qs = new URLSearchParams();
  if (params?.unassigned) qs.set('unassigned', '1');
  if (params?.status) qs.set('status', params.status);
  if (params?.institutionId) qs.set('institutionId', params.institutionId);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const { tickets } = await apiClient.get<{ tickets: SupportTicket[] }>(`/support/tickets${suffix}`);
  return tickets;
};

export const fetchSupportTicket = async (
  id: string
): Promise<{
  ticket: SupportTicket;
  messages: SupportTicketMessage[];
  prospect?: { name: string; email: string; subject: string };
}> =>
  apiClient.get<{
    ticket: SupportTicket;
    messages: SupportTicketMessage[];
    prospect?: { name: string; email: string; subject: string };
  }>(`/support/tickets/${id}`);

export const createSupportTicket = async (data: {
  subject: string;
  body: string;
  priority?: SupportTicketPriority;
  institutionId?: string;
  onBehalfOfUserId?: string;
  escalate?: boolean;
}): Promise<SupportTicket> => {
  const { ticket } = await apiClient.post<{ ticket: SupportTicket }>('/support/tickets', data);
  return ticket;
};

export const replySupportTicket = async (
  ticketId: string,
  body: string,
  isInternal = false
): Promise<{
  message: SupportTicketMessage;
  prospectEmail: string | null;
  prospectEmailed: boolean;
}> =>
  apiClient.post<{
    message: SupportTicketMessage;
    prospectEmail: string | null;
    prospectEmailed: boolean;
  }>(`/support/tickets/${ticketId}/messages`, {
    body,
    isInternal,
  });

export const updateSupportTicket = async (
  ticketId: string,
  data: { status?: SupportTicketStatus; priority?: SupportTicketPriority; assignedTo?: string | null }
): Promise<SupportTicket> => {
  const { ticket } = await apiClient.patch<{ ticket: SupportTicket }>(`/support/tickets/${ticketId}`, data);
  return ticket;
};

export const escalateSupportTicket = async (ticketId: string): Promise<SupportTicket> => {
  const { ticket } = await apiClient.post<{ ticket: SupportTicket }>(`/support/tickets/${ticketId}/escalate`, {});
  return ticket;
};

export type ContactOpsMessage = {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: string;
  convertedTicketId: string | null;
  convertedInstitutionId?: string | null;
  createdAt: string;
};

export const fetchContactOpsMessages = async (status = 'new'): Promise<ContactOpsMessage[]> => {
  const { messages } = await apiClient.get<{ messages: ContactOpsMessage[] }>(
    `/admin/contact-messages?status=${encodeURIComponent(status)}`
  );
  return messages;
};

export const convertContactToTicket = async (
  id: string
): Promise<{ ticket: SupportTicket; message: ContactOpsMessage; alreadyConverted?: boolean }> =>
  apiClient.post(`/admin/contact-messages/${id}/convert`, {});

export type ProvisionDemoPayload = {
  institutionName: string;
  institutionType:
    | 'school'
    | 'high_school'
    | 'middle_school'
    | 'university'
    | 'training_center'
    | 'elementary_school'
    | 'private_school';
  adminEmail?: string;
  adminFirstName?: string;
  adminLastName?: string;
  adminPhone?: string;
};

export type ProvisionDemoResult = {
  alreadyProvisioned?: boolean;
  institution: { id: string; name: string; type: string; email: string | null };
  admin: { id: string; email: string; firstName: string; lastName: string };
  tempPassword: string;
  emailSent: boolean;
  smsSent: boolean;
  ticketId: string | null;
  message: ContactOpsMessage;
};

export const provisionDemoFromContact = async (
  id: string,
  payload: ProvisionDemoPayload
): Promise<ProvisionDemoResult> => apiClient.post(`/admin/contact-messages/${id}/provision-demo`, payload);

export const updateContactOpsMessage = async (
  id: string,
  status: 'new' | 'acknowledged' | 'converted' | 'closed'
): Promise<ContactOpsMessage> => {
  const { message } = await apiClient.patch<{ message: ContactOpsMessage }>(`/admin/contact-messages/${id}`, {
    status,
  });
  return message;
};
