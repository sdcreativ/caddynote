import { useState } from 'react';
import { StrkMessage } from '@/types/strk';
import { useToast } from '@/hooks/use-toast';
import {
  fetchReceivedMessages,
  fetchSentMessages,
  sendMessage,
  markAsRead,
  replyToMessage,
  fetchMessagableUsers
} from '@/services/strkMessageService';

export const useStrkMessages = () => {
  const [receivedMessages, setReceivedMessages] = useState<StrkMessage[]>([]);
  const [sentMessages, setSentMessages] = useState<StrkMessage[]>([]);
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const loadReceivedMessages = async (userId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchReceivedMessages(userId);
      setReceivedMessages(data);
      return data;
    } catch (err) {
      setError('Erreur lors du chargement des messages reçus');
      toast({
        title: "Erreur",
        description: "Impossible de charger les messages reçus",
        variant: "destructive",
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  const loadSentMessages = async (userId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchSentMessages(userId);
      setSentMessages(data);
      return data;
    } catch (err) {
      setError('Erreur lors du chargement des messages envoyés');
      toast({
        title: "Erreur",
        description: "Impossible de charger les messages envoyés",
        variant: "destructive",
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  const loadAvailableUsers = async (currentUserId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchMessagableUsers(currentUserId);
      setAvailableUsers(data);
      return data;
    } catch (err) {
      setError('Erreur lors du chargement des utilisateurs');
      toast({
        title: "Erreur",
        description: "Impossible de charger les utilisateurs",
        variant: "destructive",
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  const sendNewMessage = async (messageData: Omit<StrkMessage, "id" | "created_at" | "updated_at">): Promise<StrkMessage | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const newMessage = await sendMessage(messageData);
      if (newMessage) {
        setSentMessages(prev => [newMessage, ...prev]);
        toast({
          title: "Message envoyé",
          description: "Votre message a été envoyé avec succès",
        });
        return newMessage;
      }
      return null;
    } catch (err) {
      setError('Erreur lors de l\'envoi du message');
      toast({
        title: "Erreur",
        description: "Impossible d'envoyer le message",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const markMessageAsRead = async (messageId: string): Promise<boolean> => {
    try {
      const success = await markAsRead(messageId);
      if (success) {
        setReceivedMessages(prev =>
          prev.map(message =>
            message.id === messageId
              ? { ...message, read_at: new Date().toISOString() }
              : message
          )
        );
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error marking message as read:', err);
      return false;
    }
  };

  const replyToMsg = async (
    originalMessageId: string,
    replyData: Omit<StrkMessage, "id" | "created_at" | "updated_at" | "parent_message_id">
  ): Promise<StrkMessage | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const reply = await replyToMessage(originalMessageId, replyData);
      if (reply) {
        setSentMessages(prev => [reply, ...prev]);
        toast({
          title: "Réponse envoyée",
          description: "Votre réponse a été envoyée avec succès",
        });
        return reply;
      }
      return null;
    } catch (err) {
      setError('Erreur lors de l\'envoi de la réponse');
      toast({
        title: "Erreur",
        description: "Impossible d'envoyer la réponse",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const getUnreadCount = (): number => {
    return receivedMessages.filter(message => !message.read_at).length;
  };

  return {
    receivedMessages,
    sentMessages,
    availableUsers,
    isLoading,
    error,
    loadReceivedMessages,
    loadSentMessages,
    loadAvailableUsers,
    sendNewMessage,
    markMessageAsRead,
    replyToMsg,
    getUnreadCount
  };
};