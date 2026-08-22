import { apiClient } from '@/lib/apiClient';

export interface LessonEntry {
  id: string;
  courseId: string;
  lessonDate: string;
  title: string | null;
  contentCovered: string | null;
  homeworkGiven: string | null;
  assignmentIds: string[];
  createdAt: string;
}

export const fetchLessons = async (courseId: string): Promise<LessonEntry[]> => {
  const { lessons } = await apiClient.get<{ lessons: LessonEntry[] }>(`/courses/${courseId}/lessons`);
  return lessons;
};

export const createLesson = async (
  courseId: string,
  data: {
    lessonDate: string;
    title?: string;
    contentCovered?: string;
    homeworkGiven?: string;
    assignmentIds?: string[];
  }
): Promise<LessonEntry> => {
  const { lesson } = await apiClient.post<{ lesson: LessonEntry }>(`/courses/${courseId}/lessons`, data);
  return lesson;
};

export const deleteLesson = async (courseId: string, lessonId: string): Promise<void> => {
  await apiClient.delete(`/courses/${courseId}/lessons/${lessonId}`);
};
