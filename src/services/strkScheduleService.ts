import { apiClient } from "@/lib/apiClient";
import { StrkSchedule } from "@/types/strk";

interface ApiSchedule {
  id: string;
  courseId: string;
  classId?: string | null;
  teacherId?: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: string | null;
  isActive: boolean;
  startDate?: string | null;
  endDate?: string | null;
  createdAt?: string;
  updatedAt?: string;
  course?: { id: string; name: string; description?: string | null; room?: string | null; teacher?: { profile?: { firstName: string | null; lastName: string | null } | null } | null } | null;
  class?: { name: string } | null;
  teacher?: { firstName: string | null; lastName: string | null } | null;
}

const mapApiSchedule = (s: ApiSchedule): StrkSchedule & Record<string, unknown> => ({
  id: s.id,
  course_id: s.courseId,
  class_id: s.classId || '',
  teacher_id: s.teacherId || '',
  day_of_week: s.dayOfWeek,
  start_time: s.startTime,
  end_time: s.endTime,
  room: s.room || undefined,
  is_active: s.isActive,
  effective_from: s.startDate || new Date().toISOString().split('T')[0],
  effective_until: s.endDate || undefined,
  created_at: s.createdAt || '',
  updated_at: s.updatedAt || '',
  course: s.course
    ? {
        id: s.course.id,
        name: s.course.name,
        description: s.course.description,
        room: s.course.room,
        teacher: s.course.teacher?.profile
          ? { first_name: s.course.teacher.profile.firstName, last_name: s.course.teacher.profile.lastName }
          : undefined,
      }
    : undefined,
  class: s.class ? { name: s.class.name } : undefined,
  teacher: s.teacher ? { first_name: s.teacher.firstName, last_name: s.teacher.lastName } : undefined,
});

export const fetchSchedulesByStudent = async (studentId: string): Promise<StrkSchedule[]> => {
  try {
    const { schedules } = await apiClient.get<{ schedules: ApiSchedule[] }>(
      `/schedules?studentId=${encodeURIComponent(studentId)}`
    );
    return schedules.map(mapApiSchedule);
  } catch (error) {
    console.error("Error in fetchSchedulesByStudent:", error);
    return [];
  }
};

export const fetchSchedulesByTeacher = async (teacherId: string): Promise<StrkSchedule[]> => {
  try {
    const { schedules } = await apiClient.get<{ schedules: ApiSchedule[] }>(
      `/schedules?teacherId=${encodeURIComponent(teacherId)}`
    );
    return schedules.map(mapApiSchedule);
  } catch (error) {
    console.error("Error in fetchSchedulesByTeacher:", error);
    return [];
  }
};

export const fetchSchedulesByClass = async (classId: string): Promise<StrkSchedule[]> => {
  try {
    const { schedules } = await apiClient.get<{ schedules: ApiSchedule[] }>(
      `/schedules?classId=${encodeURIComponent(classId)}`
    );
    return schedules.map(mapApiSchedule);
  } catch (error) {
    console.error("Error in fetchSchedulesByClass:", error);
    return [];
  }
};

/** Emploi du temps établissement (1 requête — évite N+1 par classe). */
export const fetchSchedulesByInstitution = async (
  institutionId: string,
  dayOfWeek?: number
): Promise<Array<StrkSchedule & Record<string, unknown>>> => {
  try {
    const qs = new URLSearchParams({ institutionId });
    if (dayOfWeek != null) qs.set('dayOfWeek', String(dayOfWeek));
    const { schedules } = await apiClient.get<{ schedules: ApiSchedule[] }>(`/schedules?${qs}`);
    return schedules.map(mapApiSchedule);
  } catch (error) {
    console.error('Error in fetchSchedulesByInstitution:', error);
    return [];
  }
};

export const createSchedule = async (scheduleData: any): Promise<StrkSchedule> => {
  const { schedule } = await apiClient.post<{ schedule: ApiSchedule }>('/schedules', {
    courseId: scheduleData.course_id,
    classId: scheduleData.class_id,
    institutionId: scheduleData.institution_id,
    teacherId: scheduleData.teacher_id,
    dayOfWeek: scheduleData.day_of_week,
    startTime: scheduleData.start_time,
    endTime: scheduleData.end_time,
    room: scheduleData.room,
    startDate: scheduleData.effective_from,
    endDate: scheduleData.effective_until,
    force: scheduleData.force,
  });
  return mapApiSchedule(schedule);
};

export const updateSchedule = async (id: string, updates: Partial<StrkSchedule>): Promise<StrkSchedule | null> => {
  try {
    const { schedule } = await apiClient.patch<{ schedule: ApiSchedule }>(`/schedules/${id}`, {
      dayOfWeek: updates.day_of_week,
      startTime: updates.start_time,
      endTime: updates.end_time,
      room: updates.room,
      startDate: updates.effective_from,
      endDate: updates.effective_until,
    });
    return mapApiSchedule(schedule);
  } catch (error) {
    console.error("Error in updateSchedule:", error);
    return null;
  }
};

export const deleteSchedule = async (id: string): Promise<boolean> => {
  try {
    await apiClient.delete(`/schedules/${id}`);
    return true;
  } catch (error) {
    console.error("Error in deleteSchedule:", error);
    return false;
  }
};
