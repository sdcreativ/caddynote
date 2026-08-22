import { apiClient } from "@/lib/apiClient";

export interface StrkClass {
  id: string;
  name: string;
  institution_id: string;
  teacher_id?: string;
  description?: string;
  academic_year: string;
  max_students?: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ClassWithDetails extends StrkClass {
  institution_name?: string;
  teacher_name?: string;
  student_count?: number;
  total_courses?: number;
  female_count?: number;
  male_count?: number;
  unknown_gender_count?: number;
}

interface ApiClass {
  id: string;
  name: string;
  institutionId: string;
  teacherId?: string | null;
  description?: string | null;
  academicYear?: string | null;
  maxStudents?: number | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  institution?: { name: string } | null;
  teacher?: { firstName: string | null; lastName: string | null } | null;
  _count?: { students?: number };
  genderHeadcount?: { female: number; male: number; unknown: number; total: number };
}

const mapApiClass = (c: ApiClass): ClassWithDetails => ({
  id: c.id,
  name: c.name,
  institution_id: c.institutionId,
  teacher_id: c.teacherId || undefined,
  description: c.description || undefined,
  academic_year: c.academicYear || '',
  max_students: c.maxStudents || undefined,
  is_active: c.isActive,
  created_at: c.createdAt,
  updated_at: c.updatedAt,
  institution_name: c.institution?.name,
  teacher_name: c.teacher ? `${c.teacher.firstName || ''} ${c.teacher.lastName || ''}`.trim() : undefined,
  student_count: c._count?.students ?? c.genderHeadcount?.total ?? 0,
  total_courses: 0,
  female_count: c.genderHeadcount?.female ?? 0,
  male_count: c.genderHeadcount?.male ?? 0,
  unknown_gender_count: c.genderHeadcount?.unknown ?? 0,
});

export const fetchClassesByInstitution = async (institutionId: string): Promise<ClassWithDetails[]> => {
  try {
    const { classes } = await apiClient.get<{ classes: ApiClass[] }>(
      `/classes?institutionId=${encodeURIComponent(institutionId)}`
    );
    return classes.map(mapApiClass);
  } catch (error) {
    console.error("Error in fetchClassesByInstitution:", error);
    return [];
  }
};

export const fetchClassesByTeacher = async (teacherId: string): Promise<ClassWithDetails[]> => {
  try {
    const { classes } = await apiClient.get<{ classes: ApiClass[] }>(
      `/classes?teacherId=${encodeURIComponent(teacherId)}`
    );
    return classes.map(mapApiClass);
  } catch (error) {
    console.error("Error in fetchClassesByTeacher:", error);
    return [];
  }
};

export const fetchClassById = async (id: string): Promise<ClassWithDetails | null> => {
  try {
    const { class: klass } = await apiClient.get<{ class: ApiClass }>(`/classes/${id}`);
    return mapApiClass(klass);
  } catch (error) {
    console.error("Error in fetchClassById:", error);
    return null;
  }
};

export const createClass = async (classData: Omit<StrkClass, "id" | "created_at" | "updated_at">): Promise<StrkClass | null> => {
  try {
    const { class: klass } = await apiClient.post<{ class: ApiClass }>('/classes', {
      name: classData.name,
      institutionId: classData.institution_id,
      teacherId: classData.teacher_id,
      description: classData.description,
      academicYear: classData.academic_year,
      maxStudents: classData.max_students,
    });
    return mapApiClass(klass);
  } catch (error) {
    console.error("Error in createClass:", error);
    return null;
  }
};

export const updateClass = async (
  id: string,
  updates: Partial<Omit<StrkClass, 'teacher_id'>> & { teacher_id?: string | null }
): Promise<StrkClass | null> => {
  try {
    // `teacher_id: null` détache le titulaire ; `undefined` laisse inchangé.
    const body: Record<string, unknown> = {
      name: updates.name,
      description: updates.description,
      academicYear: updates.academic_year,
      maxStudents: updates.max_students,
    };
    if (updates.teacher_id !== undefined) {
      body.teacherId = updates.teacher_id;
    }
    const { class: klass } = await apiClient.patch<{ class: ApiClass }>(`/classes/${id}`, body);
    return mapApiClass(klass);
  } catch (error) {
    console.error("Error in updateClass:", error);
    return null;
  }
};

export const deleteClass = async (id: string): Promise<boolean> => {
  try {
    await apiClient.delete(`/classes/${id}`);
    return true;
  } catch (error) {
    console.error("Error in deleteClass:", error);
    return false;
  }
};

export const assignStudentsToClass = async (classId: string, studentIds: string[]): Promise<boolean> => {
  try {
    await apiClient.post(`/classes/${classId}/students`, { studentIds });
    return true;
  } catch (error) {
    console.error('Error in assignStudentsToClass:', error);
    return false;
  }
};

export const removeStudentFromClass = async (classId: string, studentId: string): Promise<boolean> => {
  try {
    await apiClient.delete(`/classes/${classId}/students/${studentId}`);
    return true;
  } catch (error) {
    console.error('Error in removeStudentFromClass:', error);
    return false;
  }
};

export const assignTeacherToClass = async (classId: string, teacherId: string): Promise<boolean> => {
  try {
    await apiClient.patch(`/classes/${classId}/teacher`, { teacherId });
    return true;
  } catch (error) {
    console.error("Error in assignTeacherToClass:", error);
    return false;
  }
};

export const unassignTeacherFromClass = async (classId: string): Promise<boolean> => {
  try {
    await apiClient.patch(`/classes/${classId}/teacher`, { teacherId: null });
    return true;
  } catch (error) {
    console.error("Error in unassignTeacherFromClass:", error);
    return false;
  }
};

export const fetchStudentCountByClass = async (classId: string): Promise<number> => {
  try {
    const { count } = await apiClient.get<{ count: number }>(`/classes/${classId}/student-count`);
    return count;
  } catch (error) {
    console.error("Error in fetchStudentCountByClass:", error);
    return 0;
  }
};
