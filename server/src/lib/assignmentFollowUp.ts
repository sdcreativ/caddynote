import { prisma } from './prisma.js';

/**
 * PED-004 — suivi de remise. Le roster est celui de la classe du cours
 * (même règle que les rappels PED-005) : une copie rendue par un élève
 * hors classe n'apparaît pas ici, et un élève sans copie apparaît quand même.
 */

export type AssignmentFollowUpStatus =
  | 'not_submitted'
  | 'draft'
  | 'submitted'
  | 'late'
  | 'missing'
  | 'graded';

type SubmissionSlice = {
  status: string;
  submittedAt: Date | null;
  grade: { toNumber?: () => number } | number | string | null;
};

export const resolveFollowUpStatus = (opts: {
  dueDate: Date;
  now: Date;
  submission: SubmissionSlice | null;
}): AssignmentFollowUpStatus => {
  const overdue = opts.now.getTime() > opts.dueDate.getTime();
  const sub = opts.submission;
  if (!sub || sub.status === 'draft' || sub.status === 'pending') {
    if (!sub || sub.status === 'pending') return overdue ? 'missing' : 'not_submitted';
    return overdue ? 'missing' : 'draft';
  }
  if (sub.status === 'graded' || sub.status === 'returned' || sub.grade != null) {
    return 'graded';
  }
  if (sub.status === 'late') return 'late';
  if (sub.submittedAt && sub.submittedAt.getTime() > opts.dueDate.getTime()) return 'late';
  return 'submitted';
};

const wasLate = (dueDate: Date, submittedAt: Date | null, status: string | null): boolean => {
  if (status === 'late') return true;
  if (!submittedAt) return false;
  return submittedAt.getTime() > dueDate.getTime();
};

export const buildAssignmentFollowUp = async (assignmentId: string) => {
  const assignment = await prisma.strkAssignment.findUnique({ where: { id: assignmentId } });
  if (!assignment) return null;

  const course = await prisma.strkCourse.findUnique({
    where: { id: assignment.courseId },
    select: { id: true, name: true, classId: true, class: { select: { id: true, name: true } } },
  });

  const students = course?.classId
    ? await prisma.strkStudent.findMany({
        where: { classId: course.classId },
        select: {
          id: true,
          studentNumber: true,
          profile: { select: { firstName: true, lastName: true } },
        },
      })
    : [];

  const submissions = await prisma.strkSubmission.findMany({ where: { assignmentId } });
  const byStudent = new Map(submissions.map((s) => [s.studentId, s]));
  const now = new Date();

  const rows = students
    .map((st) => {
      const sub = byStudent.get(st.id) ?? null;
      const followUpStatus = resolveFollowUpStatus({ dueDate: assignment.dueDate, now, submission: sub });
      return {
        studentId: st.id,
        firstName: st.profile.firstName,
        lastName: st.profile.lastName,
        studentNumber: st.studentNumber,
        followUpStatus,
        late: wasLate(assignment.dueDate, sub?.submittedAt ?? null, sub?.status ?? null),
        submissionId: sub?.id ?? null,
        submittedAt: sub?.submittedAt ?? null,
        grade: sub?.grade != null ? Number(sub.grade) : null,
        feedback: sub?.feedback ?? null,
        submissionStatus: sub?.status ?? null,
      };
    })
    .sort((a, b) => {
      const last = (a.lastName ?? '').localeCompare(b.lastName ?? '', 'fr');
      if (last !== 0) return last;
      return (a.firstName ?? '').localeCompare(b.firstName ?? '', 'fr');
    });

  const handedIn = (status: AssignmentFollowUpStatus) =>
    status === 'submitted' || status === 'late' || status === 'graded';

  const summary = {
    roster: rows.length,
    submitted: rows.filter((r) => handedIn(r.followUpStatus)).length,
    onTime: rows.filter((r) => handedIn(r.followUpStatus) && !r.late).length,
    late: rows.filter((r) => r.late && handedIn(r.followUpStatus)).length,
    missing: rows.filter((r) => r.followUpStatus === 'missing').length,
    pending: rows.filter((r) => r.followUpStatus === 'not_submitted' || r.followUpStatus === 'draft').length,
    draft: rows.filter((r) => r.followUpStatus === 'draft').length,
    toGrade: rows.filter((r) => r.followUpStatus === 'submitted' || r.followUpStatus === 'late').length,
    graded: rows.filter((r) => r.followUpStatus === 'graded').length,
  };

  return {
    assignment: {
      id: assignment.id,
      title: assignment.title,
      dueDate: assignment.dueDate,
      maxGrade: assignment.maxGrade != null ? Number(assignment.maxGrade) : 20,
      status: assignment.status,
    },
    course: course ? { id: course.id, name: course.name, classId: course.classId, className: course.class?.name ?? null } : null,
    summary,
    students: rows,
  };
};
