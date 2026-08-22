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

export const sendMessage = async (messageData: Omit<StrkMessage, "id" | "created_at" | "updated_at">): Promise<StrkMessage | null> => {
  const { message } = await apiClient.post<{ message: StrkMessage }>('/messages', messageData);
  return message;
};

export const markAsRead = async (messageId: string): Promise<boolean> => {
  await apiClient.patch(`/messages/${messageId}/read`);
  return true;
};

export const replyToMessage = async (
  originalMessageId: string,
  replyData: Omit<StrkMessage, "id" | "created_at" | "updated_at" | "parent_message_id">
): Promise<StrkMessage | null> => {
  const { message } = await apiClient.post<{ message: StrkMessage }>(`/messages/${originalMessageId}/reply`, replyData);
  return message;
};

// Alias pour compatibilité
export const markMessageAsRead = markAsRead;

export const fetchMessagableUsers = async (currentUserId: string): Promise<any[]> => {
  const { users } = await apiClient.get<{ users: any[] }>('/messages/contacts');
  return users;
};
