import { apiClient } from '@/lib/apiClient';

export type StudentHealthInfo = {
  id?: string;
  studentId: string;
  bloodType?: string | null;
  allergies?: string | null;
  medicalConditions?: string | null;
  medications?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  additionalNotes?: string | null;
  updatedAt?: string;
};

export const getStudentHealth = async (studentId: string) => {
  const { healthInfo } = await apiClient.get<{ healthInfo: StudentHealthInfo | null }>(
    `/students/${studentId}/health`
  );
  return healthInfo;
};

export const upsertStudentHealth = async (
  studentId: string,
  payload: Omit<StudentHealthInfo, 'id' | 'studentId' | 'updatedAt'>
) => {
  const { healthInfo } = await apiClient.put<{ healthInfo: StudentHealthInfo }>(
    `/students/${studentId}/health`,
    payload
  );
  return healthInfo;
};
