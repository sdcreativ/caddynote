import { apiClient } from '@/lib/apiClient';

export type Observation = {
  id: string;
  studentId: string;
  category: 'positive' | 'negative' | 'neutral';
  title: string;
  description: string;
  date: string;
  visibleToFamily: boolean;
  authorId: string;
};

export type DisciplinaryIncident = {
  id: string;
  studentId: string;
  title: string;
  description: string;
  status: string;
  severity?: string | null;
  reportedAt: string;
};

export type TimelineEntry = {
  kind: 'observation' | 'incident';
  date: string;
  entry: {
    id: string;
    title: string;
    description?: string;
    category?: string;
    status?: string;
  };
};

export const listObservations = async (studentId: string) => {
  const { observations } = await apiClient.get<{ observations: Observation[] }>(
    `/observations?studentId=${encodeURIComponent(studentId)}`
  );
  return observations;
};

export const createObservation = async (payload: {
  studentId: string;
  title: string;
  description: string;
  category?: 'positive' | 'negative' | 'neutral';
  visibleToFamily?: boolean;
  courseId?: string;
}) => {
  const { observation } = await apiClient.post<{ observation: Observation }>('/observations', payload);
  return observation;
};

export const getStudentTimeline = async (studentId: string) => {
  const { timeline } = await apiClient.get<{ timeline: TimelineEntry[] }>(
    `/observations/timeline?studentId=${encodeURIComponent(studentId)}`
  );
  return timeline;
};

export const listIncidents = async (studentId?: string) => {
  const q = studentId ? `?studentId=${encodeURIComponent(studentId)}` : '';
  const { incidents } = await apiClient.get<{ incidents: DisciplinaryIncident[] }>(
    `/discipline/incidents${q}`
  );
  return incidents;
};

export const createIncident = async (payload: {
  studentId: string;
  title: string;
  description: string;
  severity?: string;
}) => {
  const { incident } = await apiClient.post<{ incident: DisciplinaryIncident }>(
    '/discipline/incidents',
    payload
  );
  return incident;
};

export const updateIncidentStatus = async (id: string, status: string) => {
  const { incident } = await apiClient.patch<{ incident: DisciplinaryIncident }>(
    `/discipline/incidents/${id}/status`,
    { status }
  );
  return incident;
};
