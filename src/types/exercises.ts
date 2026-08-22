// Types pour le système d'exercices en ligne
export type ExerciseType = 'quiz' | 'homework' | 'assignment' | 'practice';
export type QuestionType = 'multiple_choice' | 'open_text' | 'numeric' | 'drag_drop' | 'true_false';
export type AttemptStatus = 'in_progress' | 'submitted' | 'graded' | 'abandoned';
export type AssignedToType = 'class' | 'student' | 'all';

export interface StrkExercise {
  id: string;
  title: string;
  description?: string;
  institution_id: string;
  teacher_id: string;
  class_id?: string;
  subject?: string;
  exercise_type: ExerciseType;
  difficulty_level: number; // 1-5
  time_limit?: number; // minutes
  max_attempts: number;
  due_date?: string;
  is_published: boolean;
  points: number;
  created_at: string;
  updated_at: string;
}

export interface StrkExerciseQuestion {
  id: string;
  exercise_id: string;
  question_text: string;
  question_type: QuestionType;
  question_order: number;
  points: number;
  options: any[]; // For multiple choice options
  correct_answer: any;
  explanation?: string;
  created_at: string;
}

export interface StrkExerciseAttempt {
  id: string;
  exercise_id: string;
  student_id: string;
  attempt_number: number;
  started_at: string;
  submitted_at?: string;
  score: number;
  max_score: number;
  time_spent: number; // seconds
  status: AttemptStatus;
  answers: Record<string, any>;
  feedback?: string;
  created_at: string;
  updated_at: string;
}

export interface StrkExerciseProgress {
  id: string;
  student_id: string;
  exercise_id: string;
  progress_percentage: number;
  questions_answered: number;
  total_questions: number;
  current_question_id?: string;
  last_activity: string;
  streak_count: number;
  badges_earned: string[];
  created_at: string;
  updated_at: string;
}

export interface StrkExerciseAssignment {
  id: string;
  exercise_id: string;
  assigned_to_type: AssignedToType;
  assigned_to_id?: string;
  assigned_by: string;
  assigned_at: string;
  due_date?: string;
  auto_grade: boolean;
  created_at: string;
}