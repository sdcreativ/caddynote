import { apiClient } from '@/lib/apiClient';

export type TeacherAvailability = {
  id: string;
  teacherId: string;
  institutionId: string;
  startDate: string;
  endDate: string;
  reason?: string | null;
  status: 'requested' | 'approved' | 'rejected';
};

export const listTeacherAvailabilities = async (params: {
  teacherId?: string;
  institutionId?: string;
  status?: string;
}) => {
  const q = new URLSearchParams();
  if (params.teacherId) q.set('teacherId', params.teacherId);
  if (params.institutionId) q.set('institutionId', params.institutionId);
  if (params.status) q.set('status', params.status);
  const { availabilities } = await apiClient.get<{ availabilities: TeacherAvailability[] }>(
    `/teacher-availability?${q}`
  );
  return availabilities;
};

export const createTeacherAvailability = async (payload: {
  teacherId: string;
  institutionId: string;
  startDate: string;
  endDate: string;
  reason?: string;
}) => {
  const { availability } = await apiClient.post<{ availability: TeacherAvailability }>(
    '/teacher-availability',
    payload
  );
  return availability;
};

export const updateAvailabilityStatus = async (id: string, status: 'approved' | 'rejected') => {
  const { availability } = await apiClient.patch<{ availability: TeacherAvailability }>(
    `/teacher-availability/${id}/status`,
    { status }
  );
  return availability;
};

export const getAvailabilityConflicts = async (id: string) => {
  const { conflicts } = await apiClient.get<{ conflicts: unknown[] }>(
    `/teacher-availability/${id}/conflicts`
  );
  return conflicts;
};
