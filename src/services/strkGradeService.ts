import { apiClient, ApiError } from "@/lib/apiClient";
import { StrkGrade } from "@/types/strk";

interface ApiGrade {
  id: string;
  studentId: string;
  courseId: string;
  teacherId: string;
  gradeValue: number;
  maxGrade: number;
  gradeType: string;
  title: string;
  description?: string | null;
  date: string;
  periodId?: string | null;
  coefficient?: number | null;
  createdAt: string;
  updatedAt: string;
  student?: { id: string; profile?: { firstName: string | null; lastName: string | null } | null } | null;
  course?: { id: string; name: string } | null;
}

export type StrkGradeWithRelations = StrkGrade & {
  student?: { first_name: string | null; last_name: string | null };
  course?: { id: string; name: string };
};

const mapApiGrade = (g: ApiGrade): StrkGradeWithRelations => ({
  id: g.id,
  student_id: g.studentId,
  course_id: g.courseId,
  teacher_id: g.teacherId,
  grade_value: Number(g.gradeValue),
  max_grade: Number(g.maxGrade),
  grade_type: g.gradeType,
  title: g.title,
  description: g.description || undefined,
  date: g.date,
  period_id: g.periodId || undefined,
  coefficient: g.coefficient !== undefined && g.coefficient !== null ? Number(g.coefficient) : undefined,
  created_at: g.createdAt,
  updated_at: g.updatedAt,
  student: g.student?.profile
    ? { first_name: g.student.profile.firstName, last_name: g.student.profile.lastName }
    : undefined,
  course: g.course ? { id: g.course.id, name: g.course.name } : undefined,
});

export const fetchGradesByStudent = async (studentId: string): Promise<StrkGradeWithRelations[]> => {
  const { grades } = await apiClient.get<{ grades: ApiGrade[] }>(
    `/grades?studentId=${encodeURIComponent(studentId)}`
  );
  return grades.map(mapApiGrade);
};

export const fetchGradesByCourse = async (courseId: string): Promise<StrkGrade[]> => {
  try {
    const { grades } = await apiClient.get<{ grades: ApiGrade[] }>(`/grades?courseId=${encodeURIComponent(courseId)}`);
    return grades.map(mapApiGrade);
  } catch (error) {
    console.error("Error in fetchGradesByCourse:", error);
    return [];
  }
};

export const createGrade = async (gradeData: Omit<StrkGrade, "id" | "created_at" | "updated_at">): Promise<StrkGrade | null> => {
  try {
    // EVA-004 : periodId est requis côté serveur (moteur de calcul de
    // moyennes par période) — jusqu'ici jamais envoyé, ce qui faisait
    // échouer (400) toute création de note depuis cette fonction.
    if (!gradeData.period_id) {
      throw new Error('period_id est requis pour créer une note');
    }
    const { grade } = await apiClient.post<{ grade: ApiGrade }>('/grades', {
      studentId: gradeData.student_id,
      courseId: gradeData.course_id,
      teacherId: gradeData.teacher_id,
      gradeValue: gradeData.grade_value,
      maxGrade: gradeData.max_grade,
      gradeType: gradeData.grade_type,
      title: gradeData.title,
      description: gradeData.description,
      date: gradeData.date,
      periodId: gradeData.period_id,
      coefficient: gradeData.coefficient,
    });
    return mapApiGrade(grade);
  } catch (error) {
    console.error("Error in createGrade:", error);
    return null;
  }
};

/**
 * EVA-003 : saisie en grille — un devoir, plusieurs élèves, un seul envoi
 * (POST /grades/bulk). Retourne le nombre de notes créées ; en cas de refus
 * (élève hors établissement...), rien n'est créé (tout ou rien).
 */
export const createGradesBulk = async (params: {
  course_id: string;
  teacher_id: string;
  period_id: string;
  title: string;
  grade_type?: string;
  max_grade?: number;
  coefficient?: number;
  date?: string;
  entries: { student_id: string; grade_value: number }[];
}): Promise<{ count: number } | { error: string }> => {
  try {
    const { count } = await apiClient.post<{ count: number }>('/grades/bulk', {
      courseId: params.course_id,
      teacherId: params.teacher_id,
      periodId: params.period_id,
      title: params.title,
      gradeType: params.grade_type,
      maxGrade: params.max_grade,
      coefficient: params.coefficient,
      date: params.date,
      entries: params.entries.map((e) => ({ studentId: e.student_id, gradeValue: e.grade_value })),
    });
    return { count };
  } catch (error) {
    console.error('Error in createGradesBulk:', error);
    const message =
      error instanceof ApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'La saisie en grille a été refusée.';
    return { error: message };
  }
};

/** EVA-003 : import CSV (studentNumber|email + gradeValue). */
export const importGradesCsv = async (params: {
  csv: string;
  courseId: string;
  teacherId: string;
  periodId: string;
  title: string;
  maxGrade?: number;
}): Promise<{ created: number; skipped: number; errors: number; results: unknown[] } | null> => {
  try {
    return await apiClient.post('/grades/import', params);
  } catch (error) {
    console.error('Error in importGradesCsv:', error);
    return null;
  }
};

export const updateGrade = async (id: string, updates: Partial<StrkGrade>): Promise<StrkGrade | null> => {
  try {
    const { grade } = await apiClient.patch<{ grade: ApiGrade }>(`/grades/${id}`, {
      gradeValue: updates.grade_value,
      maxGrade: updates.max_grade,
      gradeType: updates.grade_type,
      title: updates.title,
      description: updates.description,
      date: updates.date,
    });
    return mapApiGrade(grade);
  } catch (error) {
    console.error("Error in updateGrade:", error);
    return null;
  }
};

export const deleteGrade = async (id: string): Promise<boolean> => {
  try {
    await apiClient.delete(`/grades/${id}`);
    return true;
  } catch (error) {
    console.error("Error in deleteGrade:", error);
    return false;
  }
};

export const fetchGradesByTeacher = async (teacherId: string): Promise<StrkGrade[]> => {
  try {
    const { grades } = await apiClient.get<{ grades: ApiGrade[] }>(`/grades?teacherId=${encodeURIComponent(teacherId)}`);
    return grades.map(mapApiGrade);
  } catch {
    return [];
  }
};

export const calculateStudentCourseAverage = async (studentId: string, courseId: string): Promise<number> => {
  try {
    const { average } = await apiClient.get<{ average: number }>(
      `/grades/average?studentId=${encodeURIComponent(studentId)}&courseId=${encodeURIComponent(courseId)}`
    );
    return average;
  } catch (error) {
    console.error("Error in calculateStudentCourseAverage:", error);
    return 0;
  }
};

/** EVA-005 : publie toutes les notes brouillon d'un cours / période. */
export const publishGrades = async (courseId: string, periodId: string): Promise<number> => {
  const { published } = await apiClient.post<{ published: number }>('/grades/publish', {
    courseId,
    periodId,
  });
  return published;
};

/** EVA-004 : calcule moyennes/rangs pour une classe / période (direction). */
export const computeClassGrades = async (classId: string, periodId: string) => {
  const { computations } = await apiClient.post<{ computations: unknown[] }>('/grades/compute', {
    classId,
    periodId,
  });
  return computations;
};
