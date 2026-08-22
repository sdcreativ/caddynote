
// Types existants
export interface Institution {
  id: string;
  name: string;
  type: 'university' | 'high_school' | 'school' | 'training_center' | 'middle_school';
  address?: string;
  phone?: string;
  email?: string;
  logo?: string;
  adminId?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'school_admin' | 'teacher' | 'student';
  profileImage?: string;
  institutionId?: string;
}

// Interfaces mise à jour avec les propriétés manquantes
export interface Student {
  id: string;
  name: string;
  email: string;
  institutionId: string;
  classId?: string;
  profileImage?: string;
  // Propriétés additionnelles utilisées dans les composants
  class?: string;  // Pour la compatibilité avec les composants existants
  attendanceRate?: number;  // Pour afficher les taux de présence
}

export interface Teacher {
  id: string;
  name: string;
  email: string;
  institutionId: string;
  profileImage?: string;
  subjects?: string[];
  // Propriété additionnelle pour la compatibilité
  subject?: string;
}

export interface Class {
  id: string;
  name: string;
  teacherId?: string;
  institutionId: string;
  students?: Student[];
  schedule?: Schedule[];
  // Propriété additionnelle pour la compatibilité
  teacherName?: string;
}

export interface Absence {
  id: string;
  studentId: string;
  date: string;
  duration: number;
  reason?: string;
  justified: boolean;
  justificationId?: string;
  // Propriétés additionnelles pour la compatibilité
  studentName?: string;
  class?: string;
  type?: 'absence' | 'lateness';
  justification?: string;
  createdBy?: string;
  institutionId?: string;
}

export interface Signature {
  id: string;
  // Make optional properties that are not used in mock data
  title?: string;
  description?: string;
  senderId?: string;
  recipientId?: string;
  status: 'pending' | 'completed' | 'rejected' | 'expired';
  createdAt?: string;
  completedAt?: string;
  documentUrl?: string;
  signatureUrl?: string;
  // Propriétés additionnelles pour la compatibilité
  studentId?: string;
  studentName?: string;
  date?: string;
  type?: 'entry' | 'exit';
  timestamp?: string;
  verified?: boolean;
  emailSentAt?: string;
  expiresAt?: string;
  institutionId?: string;
}

export interface Schedule {
  id: string;
  classId: string;
  teacherId: string;
  subject?: string;
  dayOfWeek?: number;
  startTime: string;
  endTime: string;
  room?: string;
  // Propriétés additionnelles pour la compatibilité
  title?: string;
  date?: string;
  institutionId?: string;
  className?: string;
  teacherName?: string;
}

export interface Justification {
  id: string;
  absenceId: string;
  studentId: string;
  documentUrl: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedDate: string;
  reviewedDate?: string;
  reviewerId?: string;
  comments?: string;
}

export interface Stats {
  totalStudents: number;
  totalTeachers: number;
  totalAbsences: number;
  totalJustifications: number;
  totalSignatures: number;
  totalLatenesses?: number;
  attendanceRate?: number;
}

export interface Course {
  id: string;
  name: string;
  teacherId: string;
  classId: string;
  description?: string;
  // Propriétés additionnelles pour la compatibilité
  status?: 'active' | 'upcoming' | 'completed';
  room?: string;
  materials?: number | CourseMaterial[];
  students?: number | CourseStudent[];
  schedule?: {
    day?: string;
    time?: string;
    duration?: number;
  } | string; // Allow string type for backward compatibility
  // Propriétés étendues
  day?: string;
  time?: string;
  duration?: number;
}

export interface CourseMaterial {
  id: string;
  courseId: string;
  title: string;
  type: string;
  content?: string;
  fileUrl?: string;
  createdAt: string;
  description?: string;
}

export interface Assignment {
  id: string;
  courseId: string;
  title: string;
  description: string;
  dueDate: string;
  createdAt: string;
  points?: number;
  // Propriétés additionnelles
  status?: 'draft' | 'published' | 'graded';
}

export interface CourseStudent {
  id: string;
  courseId: string;
  studentId: string;
  enrollmentDate: string;
  grade?: number;
  // Propriétés additionnelles
  studentName?: string;
  email?: string;
  profileImage?: string;
  attendanceRate?: number;
  progress?: number;
  lastAttendance?: string;
}
