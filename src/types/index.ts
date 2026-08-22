
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'teacher' | 'student' | 'school_admin';
  profileImage?: string;
  institutionId?: string;
}

export interface Student {
  id: string;
  name: string;
  email: string;
  class: string;
  profileImage?: string;
  attendanceRate: number;
  institutionId: string;
}

export interface Teacher {
  id: string;
  name: string;
  email: string;
  subject: string;
  profileImage?: string;
  institutionId: string;
}

export interface Absence {
  id: string;
  studentId: string;
  studentName: string;
  class: string;
  date: string;
  type: 'absence' | 'lateness';
  duration: number; // minutes
  justified: boolean;
  justification?: string;
  createdBy: string;
  institutionId: string;
}

export interface Signature {
  id: string;
  studentId: string;
  studentName: string;
  date: string;
  type: 'entry' | 'exit';
  timestamp: string;
  verified: boolean;
  signatureData?: string; // Base64 encoded signature image
  ipAddress?: string;
  deviceInfo?: string;
  location?: string;
  emailSentAt?: string;
  completedAt?: string;
  expiresAt?: string;
  status: 'pending' | 'completed' | 'expired';
  token?: string;
  institutionId: string;
}

export interface Class {
  id: string;
  name: string;
  teacherId: string;
  teacherName: string;
  students: number;
  institutionId: string;
}

export interface Stats {
  totalStudents: number;
  totalAbsences: number;
  totalLatenesses: number;
  attendanceRate: number;
}

export interface Institution {
  id: string;
  name: string;
  type: 'school' | 'training_center' | 'university' | 'high_school' | 'middle_school';
  address: string;
  phone: string;
  email: string;
  logo?: string;
  adminId: string;
}

export interface Schedule {
  id: string;
  title: string;
  classId: string;
  className: string;
  teacherId: string;
  teacherName: string;
  date: string;
  startTime: string;
  endTime: string;
  room: string;
  institutionId: string;
}

export interface Justification {
  id: string;
  absenceId: string;
  studentId: string;
  studentName: string;
  date: string;
  document?: string; // Base64 encoded document
  status: 'pending' | 'approved' | 'rejected';
  comment?: string;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  institutionId: string;
}

// Types pour la gestion des cours et matériels pédagogiques
export interface Course {
  id: string;
  name: string;
  class: string;
  schedule: string;
  day: string;
  time: string;
  duration: number;
  students: number;
  materials: number;
  room: string;
  status: 'active' | 'upcoming' | 'completed';
  institutionId: string;
}

export interface CourseMaterial {
  id: string;
  courseId: string;
  title: string;
  description: string;
  type: 'document' | 'video' | 'link' | 'other';
  url?: string;
  file?: string;
  createdAt: string;
  updatedAt: string;
  qualiopiCompliant: boolean;
}

export interface CourseStudent {
  id: string;
  studentId: string;
  studentName: string;
  email: string;
  profileImage?: string;
  attendanceRate: number;
  lastAttendance?: string;
  progress: number;
}

export interface Assignment {
  id: string;
  courseId: string;
  title: string;
  description: string;
  dueDate: string;
  points: number;
  status: 'draft' | 'published' | 'closed';
  createdAt: string;
  requirements: string[];
  qualiopiCompliant: boolean;
  visible?: boolean;
  timeLimit?: number | null;
  file?: string;
}

