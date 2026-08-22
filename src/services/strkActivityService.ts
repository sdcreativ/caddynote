import { apiClient } from '@/lib/apiClient';

export type StrkActivity = {
  id: string;
  type: string;
  institution_id: string | null;
  user_id: string | null;
  target_id: string | null;
  target_type: string | null;
  description: string;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
};

export type ActivityType = 'user_created' | 'institution_created' | 'login' | 'attendance_taken' | 'signature_requested' | 'report_generated';

export interface ActivityRequest {
  type: ActivityType;
  institutionId?: string;
  userId?: string;
  targetId?: string;
  targetType?: string;
  description: string;
  metadata?: Record<string, any>;
}

const mapApiActivity = (a: any): StrkActivity => ({
  id: a.id,
  type: a.type,
  institution_id: a.institutionId,
  user_id: a.userId,
  target_id: a.targetId,
  target_type: a.targetType,
  description: a.description,
  metadata: a.metadata,
  created_at: a.createdAt,
});

export class StrkActivityService {
  static async createActivity(request: ActivityRequest): Promise<StrkActivity> {
    const { activity } = await apiClient.post<{ activity: any }>('/activity', {
      type: request.type,
      institutionId: request.institutionId,
      userId: request.userId,
      targetId: request.targetId,
      targetType: request.targetType,
      description: request.description,
      metadata: request.metadata || {},
    });
    return mapApiActivity(activity);
  }

  static async getActivities(institutionId?: string, limit: number = 50): Promise<StrkActivity[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (institutionId) params.set('institutionId', institutionId);
    const { activities } = await apiClient.get<{ activities: any[] }>(`/activity?${params.toString()}`);
    return activities.map(mapApiActivity);
  }

  static async logUserCreated(userId: string, institutionId?: string, userRole?: string): Promise<void> {
    await this.createActivity({
      type: 'user_created',
      userId,
      institutionId,
      description: `Nouvel utilisateur créé${userRole ? ` (${userRole})` : ''}`,
      metadata: { role: userRole }
    });
  }

  static async logInstitutionCreated(institutionId: string, institutionName: string, createdBy: string): Promise<void> {
    await this.createActivity({
      type: 'institution_created',
      userId: createdBy,
      institutionId,
      description: `Nouvelle institution créée: ${institutionName}`,
      metadata: { institutionName }
    });
  }

  static async logLogin(userId: string, institutionId?: string): Promise<void> {
    await this.createActivity({
      type: 'login',
      userId,
      institutionId,
      description: 'Connexion utilisateur',
      metadata: { loginTime: new Date().toISOString() }
    });
  }

  static async logAttendanceTaken(teacherId: string, classId: string, institutionId: string): Promise<void> {
    await this.createActivity({
      type: 'attendance_taken',
      userId: teacherId,
      institutionId,
      targetId: classId,
      targetType: 'class',
      description: 'Appel effectué',
      metadata: { classId }
    });
  }

  static async logSignatureRequested(requesterId: string, institutionId: string, signatureType: string): Promise<void> {
    await this.createActivity({
      type: 'signature_requested',
      userId: requesterId,
      institutionId,
      description: `Demande de signature: ${signatureType}`,
      metadata: { signatureType }
    });
  }

  static async logReportGenerated(userId: string, reportId: string, reportType: string, institutionId?: string): Promise<void> {
    await this.createActivity({
      type: 'report_generated',
      userId,
      institutionId,
      targetId: reportId,
      targetType: 'report',
      description: `Rapport généré: ${reportType}`,
      metadata: { reportType, reportId }
    });
  }

  // Le nettoyage des activités anciennes devient une tâche planifiée côté
  // serveur plutôt qu'un appel client (cf. Lot 11 NFR).
  static async deleteOldActivities(daysOld: number = 90): Promise<void> {
    console.warn('deleteOldActivities: à implémenter côté serveur (tâche planifiée)', daysOld);
  }
}

export const fetchActivities = (institutionId?: string, limit?: number) =>
  StrkActivityService.getActivities(institutionId, limit);

export const createActivity = (request: ActivityRequest) =>
  StrkActivityService.createActivity(request);

export const createStrkActivity = createActivity;

export const fetchStrkActivitiesByInstitution = (institutionId: string, limit?: number) =>
  StrkActivityService.getActivities(institutionId, limit);

export const fetchStrkActivitiesByUser = async (userId: string, limit: number = 50): Promise<StrkActivity[]> => {
  const { activities } = await apiClient.get<{ activities: any[] }>(`/activity/by-user/${userId}?limit=${limit}`);
  return activities.map(mapApiActivity);
};
