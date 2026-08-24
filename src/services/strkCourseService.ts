import { apiClient } from "@/lib/apiClient";

export interface StrkCourse {
  id: string;
  name: string;
  description?: string;
  teacher_id?: string;
  class_id?: string;
  institution_id: string;
  room?: string;
  schedule_day?: string;
  schedule_time?: string;
  duration?: number;
  status: string;
  created_at?: string;
  updated_at?: string;
}

export interface CourseWithDetails extends StrkCourse {
  teacher_name?: string;
  class_name?: string;
  institution_name?: string;
  student_count?: number;
  subject_id?: string;
  subject_name?: string;
}

interface ApiCourse {
  id: string;
  name: string;
  description?: string | null;
  teacherId?: string | null;
  classId?: string | null;
  institutionId: string;
  room?: string | null;
  scheduleDay?: string | null;
  scheduleTime?: string | null;
  duration?: number | null;
  status?: string | null;
  subjectId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  teacher?: { profile?: { firstName: string | null; lastName: string | null } | null } | null;
  class?: { name: string } | null;
  institution?: { name: string } | null;
  subject?: { id: string; name: string } | null;
}

const mapApiCourse = (c: ApiCourse): CourseWithDetails => ({
  id: c.id,
  name: c.name,
  description: c.description || undefined,
  teacher_id: c.teacherId || undefined,
  class_id: c.classId || undefined,
  institution_id: c.institutionId,
  room: c.room || undefined,
  schedule_day: c.scheduleDay || undefined,
  schedule_time: c.scheduleTime || undefined,
  duration: c.duration || undefined,
  status: c.status || 'active',
  created_at: c.createdAt,
  updated_at: c.updatedAt,
  teacher_name: c.teacher?.profile
    ? `${c.teacher.profile.firstName || ''} ${c.teacher.profile.lastName || ''}`.trim()
    : undefined,
  class_name: c.class?.name,
  institution_name: c.institution?.name,
  student_count: 0,
  subject_id: c.subjectId || c.subject?.id || undefined,
  subject_name: c.subject?.name || undefined,
});

export const fetchCoursesByTeacher = async (teacherId: string): Promise<CourseWithDetails[]> => {
  try {
    const { courses } = await apiClient.get<{ courses: ApiCourse[] }>(`/courses?teacherId=${encodeURIComponent(teacherId)}`);
    return courses.map(mapApiCourse);
  } catch (error) {
    console.error("Error in fetchCoursesByTeacher:", error);
    return [];
  }
};

export const fetchCoursesByInstitution = async (institutionId: string): Promise<CourseWithDetails[]> => {
  try {
    const { courses } = await apiClient.get<{ courses: ApiCourse[] }>(
      `/courses?institutionId=${encodeURIComponent(institutionId)}`
    );
    return courses.map(mapApiCourse);
  } catch (error) {
    console.error("Error in fetchCoursesByInstitution:", error);
    return [];
  }
};

export const fetchCoursesByStudent = async (studentId: string): Promise<CourseWithDetails[]> => {
  try {
    const { courses } = await apiClient.get<{ courses: ApiCourse[] }>(
      `/courses?studentId=${encodeURIComponent(studentId)}`
    );
    return courses.map(mapApiCourse);
  } catch (error) {
    console.error("Error in fetchCoursesByStudent:", error);
    return [];
  }
};

export const fetchCoursesByClass = async (classId: string): Promise<CourseWithDetails[]> => {
  try {
    const { courses } = await apiClient.get<{ courses: ApiCourse[] }>(
      `/courses?classId=${encodeURIComponent(classId)}`
    );
    return courses.map(mapApiCourse);
  } catch (error) {
    console.error("Error in fetchCoursesByClass:", error);
    return [];
  }
};

export const fetchCourseById = async (id: string): Promise<CourseWithDetails | null> => {
  try {
    const { course } = await apiClient.get<{ course: ApiCourse }>(`/courses/${id}`);
    return mapApiCourse(course);
  } catch (error) {
    console.error("Error in fetchCourseById:", error);
    return null;
  }
};

export const createCourse = async (courseData: Omit<StrkCourse, "id" | "created_at" | "updated_at">): Promise<StrkCourse> => {
  const { course } = await apiClient.post<{ course: ApiCourse }>('/courses', {
    name: courseData.name,
    description: courseData.description,
    teacherId: courseData.teacher_id,
    classId: courseData.class_id,
    institutionId: courseData.institution_id,
    room: courseData.room,
    scheduleDay: courseData.schedule_day,
    scheduleTime: courseData.schedule_time,
    duration: courseData.duration,
    status: courseData.status,
  });
  return mapApiCourse(course);
};

export const updateCourse = async (id: string, updates: Partial<StrkCourse>): Promise<StrkCourse | null> => {
  try {
    const { course } = await apiClient.patch<{ course: ApiCourse }>(`/courses/${id}`, {
      name: updates.name,
      description: updates.description,
      teacherId: updates.teacher_id,
      classId: updates.class_id,
      room: updates.room,
      scheduleDay: updates.schedule_day,
      scheduleTime: updates.schedule_time,
      duration: updates.duration,
      status: updates.status,
    });
    return mapApiCourse(course);
  } catch (error) {
    console.error("Error in updateCourse:", error);
    return null;
  }
};

export const deleteCourse = async (id: string): Promise<boolean> => {
  try {
    await apiClient.delete(`/courses/${id}`);
    return true;
  } catch (error) {
    console.error("Error in deleteCourse:", error);
    return false;
  }
};
