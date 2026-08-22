import { apiClient } from '@/lib/apiClient';
import { StrkNotification } from '@/types/strk';

export const createNotification = async (notificationData: Omit<StrkNotification, 'id' | 'created_at'>): Promise<StrkNotification> => {
  const { notification } = await apiClient.post<{ notification: StrkNotification }>('/notifications', notificationData);
  return notification;
};

export const markNotificationAsRead = async (notificationId: string): Promise<void> => {
  await apiClient.patch(`/notifications/${notificationId}/read`);
};

export const markAllNotificationsAsRead = async (userId: string): Promise<void> => {
  await apiClient.patch('/notifications/read-all', { userId });
};

export const fetchNotifications = async (userId: string): Promise<StrkNotification[]> => {
  const { notifications } = await apiClient.get<{ notifications: StrkNotification[] }>(
    `/notifications?userId=${encodeURIComponent(userId)}`
  );
  return notifications;
};

export const fetchUnreadNotifications = async (userId: string): Promise<StrkNotification[]> => {
  const { notifications } = await apiClient.get<{ notifications: StrkNotification[] }>(
    `/notifications?userId=${encodeURIComponent(userId)}&unread=true`
  );
  return notifications;
};

export const deleteNotification = async (notificationId: string): Promise<void> => {
  await apiClient.delete(`/notifications/${notificationId}`);
};

// Le nettoyage des notifications expirées devient une tâche planifiée côté
// serveur plutôt qu'un appel client (cf. server/, à ajouter en Lot 11 NFR).
export const deleteExpiredNotifications = async (): Promise<void> => {
  console.warn('deleteExpiredNotifications: à implémenter côté serveur (tâche planifiée)');
};

// Fonctions utilitaires pour créer des notifications courantes
export const notifyAssignmentDue = async (studentId: string, assignmentTitle: string, dueDate: string): Promise<void> => {
  await createNotification({
    user_id: studentId,
    title: 'Devoir à rendre bientôt',
    message: `Le devoir "${assignmentTitle}" est à rendre le ${new Date(dueDate).toLocaleDateString('fr-FR')}`,
    type: 'warning',
    read: false,
    data: { assignment_title: assignmentTitle, due_date: dueDate },
    expires_at: dueDate,
  });
};
