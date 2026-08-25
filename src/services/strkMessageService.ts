import { apiClient } from "@/lib/apiClient";
import { StrkMessage } from "@/types/strk";

export const fetchReceivedMessages = async (userId: string): Promise<StrkMessage[]> => {
  const { messages } = await apiClient.get<{ messages: StrkMessage[] }>(`/messages/received?userId=${encodeURIComponent(userId)}`);
  return messages;
};

export const fetchSentMessages = async (userId: string): Promise<StrkMessage[]> => {
  const { messages } = await apiClient.get<{ messages: StrkMessage[] }>(`/messages/sent?userId=${encodeURIComponent(userId)}`);
  return messages;
};

export type SendMessageInput = {
  recipientId: string;
  subject: string;
  content: string;
  messageType?: string;
  priority?: string;
  attachments?: string[];
};

export const sendMessage = async (messageData: SendMessageInput): Promise<StrkMessage | null> => {
  const { message } = await apiClient.post<{ message: StrkMessage }>('/messages', {
    recipientId: messageData.recipientId,
    subject: messageData.subject,
    content: messageData.content,
    messageType: messageData.messageType ?? 'general',
    priority: messageData.priority ?? 'normal',
    attachments: messageData.attachments ?? [],
  });
  return message;
};

export const markAsRead = async (messageId: string): Promise<boolean> => {
  await apiClient.patch(`/messages/${messageId}/read`);
  return true;
};

export const replyToMessage = async (
  originalMessageId: string,
  replyData: Omit<SendMessageInput, 'recipientId'>
): Promise<StrkMessage | null> => {
  const { message } = await apiClient.post<{ message: StrkMessage }>(`/messages/${originalMessageId}/reply`, {
    subject: replyData.subject,
    content: replyData.content,
    messageType: replyData.messageType ?? 'general',
    priority: replyData.priority ?? 'normal',
    attachments: replyData.attachments ?? [],
  });
  return message;
};

// Alias pour compatibilité
export const markMessageAsRead = markAsRead;

export const fetchMessagableUsers = async (_currentUserId: string): Promise<any[]> => {
  const { users } = await apiClient.get<{ users: any[] }>('/messages/contacts');
  return users;
};
