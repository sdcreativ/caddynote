/**
 * Construction du jeu de données d’export (RPT-002) — partagé entre
 * `GET /reports/export` (sync) et la file d’exports planifiés (§5.15).
 */
import { prisma } from './prisma.js';
import type { CsvColumn } from './csvExport.js';

export type ReportExportType = 'students' | 'absences' | 'grades' | 'attendance';
export type ReportExportFormat = 'csv' | 'xlsx' | 'pdf';

export type ReportExportParams = {
  type: ReportExportType;
  institutionId: string;
  startDate?: string;
  endDate?: string;
  classId?: string;
  subjectId?: string;
};

export type PreparedReportExport = {
  title: string;
  baseFilename: string;
  rows: unknown[];
  columns: CsvColumn<any>[];
};

const REPORT_TITLES: Record<ReportExportType, string> = {
  students: 'Liste des élèves',
  absences: "Rapport d'absences",
  grades: 'Notes',
  attendance: 'Présence agrégée',
};

const studentName = (p: { firstName: string | null; lastName: string | null } | null | undefined) =>
  [p?.firstName, p?.lastName].filter(Boolean).join(' ') || 'Élève';

export const prepareReportExport = async (params: ReportExportParams): Promise<PreparedReportExport> => {
  const { type, institutionId, classId, subjectId } = params;
  const start = params.startDate ? new Date(params.startDate) : undefined;
  const end = params.endDate ? new Date(params.endDate) : undefined;
  const dateFilter = start || end ? { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } : undefined;

  if (type === 'students') {
    const students = await prisma.strkStudent.findMany({
      where: { institutionId, ...(classId ? { classId } : {}) },
      include: { profile: true, class: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return {
      title: REPORT_TITLES.students,
      baseFilename: `eleves_${institutionId}`,
      rows: students,
      columns: [
        { key: 'name', label: 'Nom', value: (s) => studentName(s.profile) },
        { key: 'email', label: 'E-mail', value: (s) => s.profile?.email },
        { key: 'class', label: 'Classe', value: (s) => s.class?.name },
        {
          key: 'enrollment_date',
          label: "Date d'inscription",
          value: (s) => s.enrollmentDate?.toISOString().split('T')[0],
        },
        { key: 'phone', label: 'Téléphone', value: (s) => s.profile?.phoneNumber },
        { key: 'student_number', label: 'Matricule', value: (s) => s.studentNumber },
      ],
    };
  }

  if (type === 'absences') {
    const absences = await prisma.strkAbsence.findMany({
      where: {
        institutionId,
        ...(dateFilter ? { date: dateFilter } : {}),
        ...(classId ? { student: { classId } } : {}),
        ...(subjectId ? { course: { subjectId } } : {}),
      },
      include: { student: { include: { profile: true, class: { select: { name: true } } } } },
      orderBy: { date: 'desc' },
    });
    return {
      title: REPORT_TITLES.absences,
      baseFilename: `absences_${institutionId}`,
      rows: absences,
      columns: [
        { key: 'date', label: 'Date', value: (a) => a.date.toISOString().split('T')[0] },
        { key: 'student_name', label: 'Élève', value: (a) => studentName(a.student?.profile) },
        { key: 'class', label: 'Classe', value: (a) => a.student?.class?.name },
        { key: 'type', label: 'Type', value: (a) => (a.type === 'absence' ? 'Absence' : 'Retard') },
        { key: 'duration', label: 'Durée (min)', value: (a) => a.duration },
        { key: 'justified', label: 'Justifiée', value: (a) => (a.justified ? 'Oui' : 'Non') },
        { key: 'justification_status', label: 'Statut du justificatif', value: (a) => a.justificationStatus },
        { key: 'reason', label: 'Motif', value: (a) => a.justification ?? a.reason },
      ],
    };
  }

  if (type === 'grades') {
    const courses = await prisma.strkCourse.findMany({
      where: { institutionId, ...(classId ? { classId } : {}), ...(subjectId ? { subjectId } : {}) },
      select: { id: true, name: true },
    });
    const courseIds = courses.map((c) => c.id);
    const courseById = new Map(courses.map((c) => [c.id, c]));
    const grades = await prisma.strkGrade.findMany({
      where: { courseId: { in: courseIds }, status: { not: 'draft' }, ...(dateFilter ? { date: dateFilter } : {}) },
      orderBy: { date: 'desc' },
    });
    const students = await prisma.strkStudent.findMany({
      where: { id: { in: [...new Set(grades.map((g) => g.studentId))] } },
      include: { profile: true },
    });
    const studentById = new Map(students.map((s) => [s.id, s]));
    return {
      title: REPORT_TITLES.grades,
      baseFilename: `notes_${institutionId}`,
      rows: grades,
      columns: [
        { key: 'student_name', label: 'Élève', value: (g) => studentName(studentById.get(g.studentId)?.profile) },
        { key: 'subject', label: 'Matière/cours', value: (g) => courseById.get(g.courseId)?.name },
        { key: 'grade', label: 'Note', value: (g) => g.gradeValue.toString() },
        { key: 'max_grade', label: 'Note maximale', value: (g) => g.maxGrade.toString() },
        { key: 'date', label: 'Date', value: (g) => g.date.toISOString().split('T')[0] },
        { key: 'type', label: 'Type', value: (g) => g.gradeType },
        { key: 'comments', label: 'Commentaire', value: (g) => g.description },
      ],
    };
  }

  // attendance
  const students = await prisma.strkStudent.findMany({
    where: { institutionId, ...(classId ? { classId } : {}) },
    include: { profile: true, class: { select: { name: true } } },
  });
  const absences = await prisma.strkAbsence.findMany({
    where: {
      institutionId,
      ...(dateFilter ? { date: dateFilter } : {}),
      studentId: { in: students.map((s) => s.id) },
    },
    select: { studentId: true, type: true, justified: true },
  });
  const rows = students.map((s) => {
    const own = absences.filter((a) => a.studentId === s.id);
    const absentCount = own.filter((a) => a.type === 'absence').length;
    const lateCount = own.filter((a) => a.type === 'lateness').length;
    const justifiedCount = own.filter((a) => a.justified).length;
    return { student: s, absentCount, lateCount, justifiedCount, totalCount: own.length };
  });
  return {
    title: REPORT_TITLES.attendance,
    baseFilename: `presence_${institutionId}`,
    rows,
    columns: [
      { key: 'student_name', label: 'Élève', value: (r) => studentName(r.student.profile) },
      { key: 'class', label: 'Classe', value: (r) => r.student.class?.name },
      { key: 'absence_count', label: "Nombre d'absences", value: (r) => r.absentCount },
      { key: 'late_count', label: 'Nombre de retards', value: (r) => r.lateCount },
      { key: 'justified_count', label: 'Dont justifiées', value: (r) => r.justifiedCount },
    ],
  };
};

export const REPORT_EXPORT_TITLES = REPORT_TITLES;
