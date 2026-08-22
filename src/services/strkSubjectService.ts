import { apiClient } from '@/lib/apiClient';
import { invalidateClassRoster } from '@/services/strkAttendanceService';

export interface StrkSubject {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  institution_id: string;
  created_at: string;
  updated_at: string;
}

export interface CreateSubjectData {
  name: string;
  code?: string;
  description?: string;
  institutionId: string;
}

export interface UpdateSubjectData {
  name?: string;
  code?: string;
  description?: string;
}

interface ApiSubject {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  institutionId: string | null;
  createdAt: string;
  updatedAt: string;
}

const mapApiSubject = (s: ApiSubject): StrkSubject => ({
  id: s.id,
  name: s.name,
  code: s.code,
  description: s.description,
  institution_id: s.institutionId || '',
  created_at: s.createdAt,
  updated_at: s.updatedAt,
});

export const createStrkSubject = async (data: CreateSubjectData): Promise<StrkSubject | null> => {
  try {
    const { subject } = await apiClient.post<{ subject: ApiSubject }>('/subjects', data);
    return mapApiSubject(subject);
  } catch (error) {
    console.error('Error creating subject:', error);
    return null;
  }
};

export const fetchStrkSubjectsByInstitution = async (institutionId: string): Promise<StrkSubject[]> => {
  try {
    const { subjects } = await apiClient.get<{ subjects: ApiSubject[] }>(
      `/subjects?institutionId=${encodeURIComponent(institutionId)}`
    );
    return subjects.map(mapApiSubject);
  } catch (error) {
    console.error('Error fetching subjects:', error);
    return [];
  }
};

export const updateStrkSubject = async (id: string, data: UpdateSubjectData): Promise<StrkSubject | null> => {
  try {
    const { subject } = await apiClient.patch<{ subject: ApiSubject }>(`/subjects/${id}`, data);
    return mapApiSubject(subject);
  } catch (error) {
    console.error('Error updating subject:', error);
    return null;
  }
};

export const deleteStrkSubject = async (id: string): Promise<boolean> => {
  await apiClient.delete(`/subjects/${id}`);
  return true;
};

// Class-Subject relationships
export interface ClassSubject {
  id: string;
  class_id: string;
  subject_id: string;
  teacher_id: string | null;
  created_at: string;
  subject?: StrkSubject;
  teacher?: {
    id: string;
    first_name: string;
    last_name: string;
  };
}

interface ApiClassSubject {
  id: string;
  classId: string;
  subjectId: string;
  teacherId: string | null;
  createdAt: string;
  subject?: ApiSubject;
  teacher?: { id: string; firstName: string | null; lastName: string | null } | null;
}

const mapApiClassSubject = (cs: ApiClassSubject): ClassSubject => ({
  id: cs.id,
  class_id: cs.classId,
  subject_id: cs.subjectId,
  teacher_id: cs.teacherId,
  created_at: cs.createdAt,
  subject: cs.subject ? mapApiSubject(cs.subject) : undefined,
  teacher: cs.teacher
    ? { id: cs.teacher.id, first_name: cs.teacher.firstName || '', last_name: cs.teacher.lastName || '' }
    : undefined,
});

export const assignSubjectToClass = async (classId: string, subjectId: string, teacherId?: string): Promise<ClassSubject | null> => {
  try {
    const { classSubject } = await apiClient.post<{ classSubject: ApiClassSubject }>('/subjects/class-subjects', {
      classId,
      subjectId,
      teacherId,
    });
    return mapApiClassSubject(classSubject);
  } catch (error) {
    console.error('Error assigning subject to class:', error);
    return null;
  }
};

export const fetchClassSubjects = async (classId: string): Promise<ClassSubject[]> => {
  try {
    const { classSubjects } = await apiClient.get<{ classSubjects: ApiClassSubject[] }>(
      `/subjects/class-subjects/${classId}`
    );
    return classSubjects.map(mapApiClassSubject);
  } catch (error) {
    console.error('Error fetching class subjects:', error);
    return [];
  }
};

export const removeSubjectFromClass = async (classId: string, subjectId: string): Promise<boolean> => {
  try {
    await apiClient.delete(`/subjects/class-subjects/${classId}/${subjectId}`);
    return true;
  } catch (error) {
    console.error('Error removing subject from class:', error);
    return false;
  }
};

// Student-Class relationships (historique)
export interface StudentClass {
  id: string;
  student_id: string;
  class_id: string;
  enrolled_at: string;
}

export const assignStudentToClass = async (studentId: string, classId: string): Promise<StudentClass | null> => {
  try {
    const { studentClass } = await apiClient.post<{
      studentClass: { id: string; studentId: string; classId: string; enrolledAt: string };
    }>('/subjects/student-classes', { studentId, classId });
    // NFR-004 : sans ça, la liste d'appel mise en cache pourrait rester
    // périmée jusqu'à 5 minutes après l'ajout de cet élève à la classe.
    invalidateClassRoster(classId);
    return {
      id: studentClass.id,
      student_id: studentClass.studentId,
      class_id: studentClass.classId,
      enrolled_at: studentClass.enrolledAt,
    };
  } catch (error) {
    console.error('Error assigning student to class:', error);
    return null;
  }
};

export const removeStudentFromClass = async (studentId: string, classId: string): Promise<boolean> => {
  try {
    await apiClient.delete(`/subjects/student-classes/${studentId}/${classId}`);
    invalidateClassRoster(classId);
    return true;
  } catch (error) {
    console.error('Error removing student from class:', error);
    return false;
  }
};

export const fetchStudentsByClass = async (classId: string) => {
  try {
    const { students } = await apiClient.get<{ students: unknown[] }>(`/subjects/student-classes/by-class/${classId}`);
    return students;
  } catch (error) {
    console.error('Error fetching students by class:', error);
    return [];
  }
};
