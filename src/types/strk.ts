
// Types pour CaddyNote avec les nouvelles tables strk_*
export type StrkUserRole = 'admin' | 'school_admin' | 'teacher' | 'student' | 'parent' | 'group_owner' | 'secretary' | 'accountant' | 'supervisor' | 'head_teacher';
// Lien de responsabilité entre un responsable (parent) et un élève (ELV-002)
export type StrkGuardianRelationship = 'father' | 'mother' | 'tutor' | 'payer' | 'other_authorized';
export type StrkGuardianStatus = 'active' | 'inactive';
export type StrkInstitutionType = 'elementary_school' | 'school' | 'high_school' | 'middle_school' | 'university' | 'training_center' | 'private_school';
export type StrkAbsenceType = 'absence' | 'lateness';
export type StrkSignatureType = 'entry' | 'exit' | 'document';
export type StrkSignatureStatus = 'pending' | 'completed' | 'expired';

export interface StrkProfile {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone_number?: string;
  profile_image?: string;
  role: StrkUserRole;
  institution_id?: string;
  created_at: string;
  updated_at: string;
}

export interface StrkInstitution {
  id: string;
  name: string;
  type: StrkInstitutionType;
  address?: string;
  phone?: string;
  email?: string;
  logo?: string;
  admin_id?: string;
  created_at: string;
  updated_at: string;
}

export interface StrkClass {
  id: string;
  name: string;
  institution_id: string;
  teacher_id?: string;
  created_at: string;
  updated_at: string;
}

export interface StrkStudent {
  id: string;
  student_number?: string;
  class_id?: string;
  institution_id: string;
  enrollment_date: string;
  attendance_rate: number;
  created_at: string;
  updated_at: string;
}

// Relation Élève <-> Responsable(s) avec droits différenciés (ELV-002)
export interface StrkStudentGuardian {
  id: string;
  institution_id: string;
  student_id: string;
  guardian_id: string;
  relationship: StrkGuardianRelationship;
  is_primary_contact: boolean;
  can_view_grades: boolean;
  can_view_attendance: boolean;
  can_view_billing: boolean;
  can_make_payments: boolean;
  can_receive_communications: boolean;
  can_authorize_pickup: boolean;
  can_view_discipline: boolean;
  can_view_health: boolean;
  status: StrkGuardianStatus;
  created_by?: string;
  created_at: string;
  updated_at: string;
  // Relations jointes (facultatives selon la requête)
  guardian?: {
    id: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone_number?: string;
  };
  student?: {
    id: string;
    first_name?: string;
    last_name?: string;
    email?: string;
  };
}

// Résumé d'un enfant pour l'espace parent (multi-enfants)
export interface GuardianChildSummary {
  guardianLinkId: string;
  studentId: string;
  firstName: string;
  lastName: string;
  email?: string;
  classId?: string;
  className?: string;
  institutionId: string;
  relationship: StrkGuardianRelationship;
  isPrimaryContact: boolean;
  canViewGrades: boolean;
  canViewAttendance: boolean;
  canViewBilling: boolean;
  canMakePayments: boolean;
  canViewDiscipline: boolean;
  canViewHealth: boolean;
  attendanceRate?: number;
}

export interface StrkTeacher {
  id: string;
  employee_number?: string;
  institution_id: string;
  subjects?: string[];
  hire_date: string;
  created_at: string;
  updated_at: string;
}

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
  created_at: string;
  updated_at: string;
}

export interface StrkAbsence {
  id: string;
  student_id: string;
  institution_id: string;
  course_id?: string;
  date: string;
  type: StrkAbsenceType;
  duration: number;
  justified: boolean;
  reason?: string;
  justification?: string;
  justification_file?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface StrkSignature {
  id: string;
  student_id: string;
  institution_id: string;
  title: string;
  type: StrkSignatureType;
  status: StrkSignatureStatus;
  date: string;
  timestamp?: string;
  signature_data?: string;
  verified: boolean;
  sender_id?: string;
  recipient_id?: string;
  expires_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

// Types de compatibilité avec l'ancien système
// Types pour les nouvelles tables
export interface StrkGrade {
  id: string;
  student_id: string;
  course_id: string;
  teacher_id: string;
  grade_value: number;
  max_grade: number;
  grade_type: string;
  title: string;
  description?: string;
  date: string;
  created_at: string;
  updated_at: string;
  /** EVA-004 : requis côté serveur pour toute nouvelle note (moteur de calcul de moyennes par période). */
  period_id?: string;
  /** EVA-002 : poids de cette note dans la moyenne de sa matière. */
  coefficient?: number;
}

export interface StrkAssignment {
  id: string;
  course_id: string;
  teacher_id: string;
  title: string;
  description?: string;
  instructions?: string;
  due_date: string;
  max_grade?: number;
  assignment_type: string;
  status: string;
  attachments: any;
  created_at: string;
  updated_at: string;
}

export interface StrkSubmission {
  id: string;
  assignment_id: string;
  student_id: string;
  content?: string;
  attachments: any;
  submitted_at?: string;
  grade?: number;
  feedback?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface StrkMessage {
  id: string;
  sender_id: string;
  recipient_id?: string;
  subject: string;
  content: string;
  message_type: string;
  priority: string;
  read_at?: string;
  replied_at?: string;
  parent_message_id?: string;
  attachments: any;
  created_at: string;
  updated_at: string;
}

export interface StrkNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  data: any;
  read: boolean;
  read_at?: string;
  priority?: string;
  action_url?: string;
  expires_at?: string;
  created_at: string;
}

export interface StrkAttendance {
  id: string;
  student_id: string;
  course_id: string;
  date: string;
  status: string;
  arrival_time?: string;
  departure_time?: string;
  notes?: string;
  recorded_by?: string;
  created_at: string;
  updated_at: string;
}

export interface StrkSchedule {
  id: string;
  course_id: string;
  class_id: string;
  teacher_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room?: string;
  is_active: boolean;
  effective_from: string;
  effective_until?: string;
  created_at: string;
  updated_at: string;
  course?: {
    id: string;
    name: string;
    description?: string | null;
    room?: string | null;
    teacher?: { first_name: string | null; last_name: string | null };
  };
}

export interface StrkClassStudent {
  id: string;
  class_id: string;
  student_id: string;
  enrollment_date: string;
  is_active: boolean;
  created_at: string;
}

// Types de compatibilité avec l'ancien système
export interface User {
  id: string;
  name?: string;
  email?: string;
  role: StrkUserRole;
  profileImage?: string;
  phoneNumber?: string;
  institutionId?: string;
  /** IAM-003 : double authentification (TOTP) activée sur ce compte. */
  mfaEnabled?: boolean;
  /** PER-005 : compte désactivé (connexion bloquée) mais jamais supprimé — voir deleteStrkUser/reactivateStrkUser. */
  isActive?: boolean;
}

export interface Institution {
  id: string;
  name: string;
  type: StrkInstitutionType;
  address: string;
  phone: string;
  email: string;
  logo?: string | null;
  adminId: string;
  /** Surcharges tenant (incl. `__ops_frozen` pour gel ops). */
  featureOverrides?: Record<string, boolean> | null;
}
