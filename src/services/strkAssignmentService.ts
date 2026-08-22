import { apiClient } from "@/lib/apiClient";
import { StrkAssignment, StrkSubmission } from "@/types/strk";

export const fetchAssignmentsByTeacher = async (teacherId: string): Promise<StrkAssignment[]> => {
  try {
    const { assignments } = await apiClient.get<{ assignments: StrkAssignment[] }>(
      `/assignments?teacherId=${encodeURIComponent(teacherId)}`
    );
    return assignments;
  } catch (error) {
    console.error("Error in fetchAssignmentsByTeacher:", error);
    return [];
  }
};

export const fetchAssignmentsByStudent = async (studentId: string): Promise<StrkAssignment[]> => {
  try {
    const { assignments } = await apiClient.get<{ assignments: StrkAssignment[] }>(
      `/assignments?studentId=${encodeURIComponent(studentId)}`
    );
    return assignments;
  } catch (error) {
    console.error("Error in fetchAssignmentsByStudent:", error);
    return [];
  }
};

export const createAssignment = async (assignmentData: Omit<StrkAssignment, "id" | "created_at" | "updated_at">): Promise<StrkAssignment | null> => {
  try {
    const { assignment } = await apiClient.post<{ assignment: StrkAssignment }>('/assignments', assignmentData);
    return assignment;
  } catch (error) {
    console.error("Error in createAssignment:", error);
    return null;
  }
};

export type AssignmentFollowUpStatus =
  | 'not_submitted'
  | 'draft'
  | 'submitted'
  | 'late'
  | 'missing'
  | 'graded';

export interface AssignmentFollowUpRow {
  studentId: string;
  firstName: string | null;
  lastName: string | null;
  studentNumber: string | null;
  followUpStatus: AssignmentFollowUpStatus;
  late: boolean;
  submissionId: string | null;
  submittedAt: string | null;
  grade: number | null;
  feedback: string | null;
  submissionStatus: string | null;
}

export interface AssignmentFollowUp {
  assignment: { id: string; title: string; dueDate: string; maxGrade: number; status: string };
  course: { id: string; name: string; classId: string | null; className: string | null } | null;
  summary: {
    roster: number;
    submitted: number;
    onTime: number;
    late: number;
    missing: number;
    pending: number;
    draft: number;
    toGrade: number;
    graded: number;
  };
  students: AssignmentFollowUpRow[];
}

export const fetchAssignmentFollowUp = async (assignmentId: string): Promise<AssignmentFollowUp> => {
  return apiClient.get<AssignmentFollowUp>(`/assignments/${assignmentId}/follow-up`);
};

export const fetchSubmissionsByAssignment = async (assignmentId: string): Promise<StrkSubmission[]> => {
  try {
    const { submissions } = await apiClient.get<{ submissions: StrkSubmission[] }>(
      `/assignments/${assignmentId}/submissions`
    );
    return submissions;
  } catch (error) {
    console.error("Error in fetchSubmissionsByAssignment:", error);
    return [];
  }
};

export const submitAssignment = async (submissionData: Omit<StrkSubmission, "id" | "created_at" | "updated_at">): Promise<StrkSubmission | null> => {
  try {
    const { submission } = await apiClient.post<{ submission: StrkSubmission }>('/assignments/submissions', submissionData);
    return submission;
  } catch (error) {
    console.error("Error in submitAssignment:", error);
    return null;
  }
};

export const fetchAssignmentById = async (id: string): Promise<StrkAssignment | null> => {
  try {
    const { assignment } = await apiClient.get<{ assignment: StrkAssignment }>(`/assignments/${id}`);
    return assignment;
  } catch {
    return null;
  }
};

export const updateSubmission = async (id: string, updates: any): Promise<StrkSubmission | null> => {
  try {
    const { submission } = await apiClient.patch<{ submission: StrkSubmission }>(`/assignments/submissions/${id}`, updates);
    return submission;
  } catch {
    return null;
  }
};

// Alias pour compatibilité
export const createSubmission = submitAssignment;
export const fetchAssignmentsForStudent = fetchAssignmentsByStudent;
export const fetchSubmissionsByStudent = fetchSubmissionsByAssignment;

export const gradeSubmission = async (submissionId: string, grade: number, feedback?: string): Promise<boolean> => {
  try {
    await apiClient.patch(`/assignments/submissions/${submissionId}/grade`, { grade, feedback });
    return true;
  } catch (error) {
    console.error("Error in gradeSubmission:", error);
    return false;
  }
};
