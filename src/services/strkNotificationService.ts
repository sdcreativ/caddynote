import { apiClient } from '@/lib/apiClient';
import { StrkNotification } from '@/types/strk';

type NotificationRaw = Record<string, unknown>;

/**
 * Normalise la réponse API (camelCase Prisma) et d’éventuels reliquats snake_case.
 * `read` est la seule source de vérité (pas de colonne `read_at` en base).
 */
export function normalizeNotification(raw: NotificationRaw | StrkNotification): StrkNotification {
  const row = raw as NotificationRaw;
  const readFlag = row.read;
  const legacyReadAt = row.read_at;
  const read =
    typeof readFlag === 'boolean'
      ? readFlag
      : legacyReadAt != null && String(legacyReadAt).length > 0;

  const createdAt = String(row.createdAt ?? row.created_at ?? '');
  const actionUrlRaw = row.actionUrl ?? row.action_url;
  const expiresAtRaw = row.expiresAt ?? row.expires_at;
  const userId = String(row.userId ?? row.user_id ?? '');

  return {
    id: String(row.id ?? ''),
    userId,
    title: String(row.title ?? ''),
    message: String(row.message ?? ''),
    type: String(row.type ?? 'info'),
    data: row.data,
    read,
    actionUrl: actionUrlRaw == null || actionUrlRaw === '' ? null : String(actionUrlRaw),
    expiresAt: expiresAtRaw == null || expiresAtRaw === '' ? null : String(expiresAtRaw),
    createdAt: createdAt || new Date(0).toISOString(),
    priority: typeof row.priority === 'string' ? row.priority : undefined,
  };
}

const normalizeList = (rows: unknown): StrkNotification[] => {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => normalizeNotification((row ?? {}) as NotificationRaw));
};

export type CreateNotificationInput = {
  userId: string;
  title: string;
  message: string;
  type?: string;
  actionUrl?: string;
  data?: unknown;
  expiresAt?: string;
};

export const createNotification = async (
  notificationData: CreateNotificationInput
): Promise<StrkNotification> => {
  const { notification } = await apiClient.post<{ notification: NotificationRaw }>(
    '/notifications',
    {
      userId: notificationData.userId,
      title: notificationData.title,
      message: notificationData.message,
      type: notificationData.type ?? 'info',
      actionUrl: notificationData.actionUrl,
      data: notificationData.data,
      expiresAt: notificationData.expiresAt,
    }
  );
  return normalizeNotification(notification);
};

export const markNotificationAsRead = async (notificationId: string): Promise<void> => {
  await apiClient.patch(`/notifications/${notificationId}/read`);
};

export const markAllNotificationsAsRead = async (userId: string): Promise<void> => {
  await apiClient.patch('/notifications/read-all', { userId });
};

export const fetchNotifications = async (userId: string): Promise<StrkNotification[]> => {
  const { notifications } = await apiClient.get<{ notifications: NotificationRaw[] }>(
    `/notifications?userId=${encodeURIComponent(userId)}`
  );
  return normalizeList(notifications);
};

export const fetchUnreadNotifications = async (userId: string): Promise<StrkNotification[]> => {
  const { notifications } = await apiClient.get<{ notifications: NotificationRaw[] }>(
    `/notifications?userId=${encodeURIComponent(userId)}&unread=true`
  );
  return normalizeList(notifications);
};

export const deleteNotification = async (notificationId: string): Promise<void> => {
  await apiClient.delete(`/notifications/${notificationId}`);
};

// Purge gérée côté serveur (cron quotidien `notification-activity-retention`).
export const deleteExpiredNotifications = async (): Promise<void> => {
  /* no-op client — cf. server/src/lib/notificationActivityRetention.ts */
};

export const notifyAssignmentDue = async (
  studentId: string,
  assignmentTitle: string,
  dueDate: string
): Promise<void> => {
  await createNotification({
    userId: studentId,
    title: 'Devoir à rendre bientôt',
    message: `Le devoir "${assignmentTitle}" est à rendre le ${new Date(dueDate).toLocaleDateString('fr-FR')}`,
    type: 'warning',
    data: { assignmentTitle, dueDate },
    expiresAt: dueDate,
  });
};
