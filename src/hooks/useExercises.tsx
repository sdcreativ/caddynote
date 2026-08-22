import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/apiClient';
import { useStrkAuth } from './useStrkAuth';
import { StrkExercise, StrkExerciseProgress, StrkExerciseAttempt, AttemptStatus } from '@/types/exercises';

// L'API (Prisma) renvoie du camelCase ; les types/composants existants
// (hérités de Supabase) attendent du snake_case — ces fonctions font le pont,
// comme pour les autres domaines déjà basculés (cf. strkScheduleService.ts).

const mapExerciseFromApi = (e: any): StrkExercise & { questionsCount: number; assignments: any[] } => ({
  id: e.id,
  title: e.title,
  description: e.description ?? undefined,
  institution_id: e.institutionId,
  teacher_id: e.teacherId,
  class_id: e.classId ?? undefined,
  subject: e.subject ?? undefined,
  exercise_type: e.exerciseType,
  difficulty_level: e.difficultyLevel ?? 1,
  time_limit: e.timeLimit ?? undefined,
  max_attempts: e.maxAttempts ?? 3,
  due_date: e.dueDate ?? undefined,
  is_published: !!e.isPublished,
  points: e.points ?? 100,
  created_at: e.createdAt,
  updated_at: e.updatedAt,
  questionsCount: e._count?.questions ?? 0,
  assignments: e.assignments ?? [],
});

const mapExercisePayloadToApi = (data: Partial<StrkExercise>) => {
  const payload: Record<string, unknown> = {};
  if (data.title !== undefined) payload.title = data.title;
  if (data.description !== undefined) payload.description = data.description;
  if (data.class_id !== undefined) payload.classId = data.class_id;
  if (data.subject !== undefined) payload.subject = data.subject;
  if (data.exercise_type !== undefined) payload.exerciseType = data.exercise_type;
  if (data.difficulty_level !== undefined) payload.difficultyLevel = data.difficulty_level;
  if (data.time_limit !== undefined) payload.timeLimit = data.time_limit;
  if (data.max_attempts !== undefined) payload.maxAttempts = data.max_attempts;
  if (data.due_date !== undefined) payload.dueDate = data.due_date;
  if (data.is_published !== undefined) payload.isPublished = data.is_published;
  if (data.points !== undefined) payload.points = data.points;
  return payload;
};

export const useExercises = () => {
  const { user } = useStrkAuth();
  const [exercises, setExercises] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExercises = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { exercises: data } = await apiClient.get<{ exercises: any[] }>('/exercises');
      setExercises((data || []).map(mapExerciseFromApi));
    } catch (err) {
      console.error('Error fetching exercises:', err);
      setError(err instanceof Error ? err.message : 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchExercises();
    }
  }, [user, fetchExercises]);

  const createExercise = async (exerciseData: Partial<StrkExercise>) => {
    try {
      const { exercise } = await apiClient.post<{ exercise: any }>('/exercises', {
        exerciseType: 'quiz',
        difficultyLevel: 1,
        maxAttempts: 3,
        points: 100,
        ...mapExercisePayloadToApi(exerciseData),
      });
      await fetchExercises();
      return mapExerciseFromApi(exercise);
    } catch (err) {
      console.error('Error creating exercise:', err);
      throw err;
    }
  };

  // Bug réel trouvé et corrigé (module IA, §4.16) : `CreateExerciseDialog.tsx`
  // collecte les questions saisies par l'enseignant (ou générées par l'IA)
  // dans un état local, mais rien n'appelait jamais `POST /exercises/:id/
  // questions` — l'exercice était créé, les questions silencieusement
  // perdues. `addQuestion` comble ce trou, avec le même pont camelCase que
  // le reste du fichier.
  const addQuestion = async (
    exerciseId: string,
    question: {
      question_text: string;
      question_type: string;
      points: number;
      options?: string[];
      correct_answer: string;
      explanation?: string;
      question_order?: number;
    }
  ) => {
    const { question: created } = await apiClient.post<{ question: any }>(`/exercises/${exerciseId}/questions`, {
      questionText: question.question_text,
      questionType: question.question_type,
      points: question.points,
      options: question.options,
      correctAnswer: question.correct_answer,
      explanation: question.explanation,
      questionOrder: question.question_order,
    });
    return created;
  };

  const updateExercise = async (id: string, updates: Partial<StrkExercise>) => {
    try {
      await apiClient.patch(`/exercises/${id}`, mapExercisePayloadToApi(updates));
      await fetchExercises();
    } catch (err) {
      console.error('Error updating exercise:', err);
      throw err;
    }
  };

  const deleteExercise = async (id: string) => {
    try {
      await apiClient.delete(`/exercises/${id}`);
      await fetchExercises();
    } catch (err) {
      console.error('Error deleting exercise:', err);
      throw err;
    }
  };

  const publishExercise = async (id: string) => {
    await updateExercise(id, { is_published: true });
  };

  return {
    exercises,
    loading,
    error,
    fetchExercises,
    createExercise,
    addQuestion,
    updateExercise,
    deleteExercise,
    publishExercise,
  };
};

const mapProgressFromApi = (p: any): StrkExerciseProgress | null => {
  if (!p) return null;
  return {
    id: p.id,
    student_id: p.studentId,
    exercise_id: p.exerciseId,
    progress_percentage: Number(p.progressPercentage ?? 0),
    questions_answered: p.questionsAnswered ?? 0,
    total_questions: p.totalQuestions ?? 0,
    current_question_id: p.currentQuestionId ?? undefined,
    last_activity: p.lastActivity ?? undefined,
    streak_count: p.streakCount ?? 0,
    badges_earned: p.badgesEarned ?? [],
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
};

export const useExerciseProgress = (exerciseId: string) => {
  const { user } = useStrkAuth();
  const [progress, setProgress] = useState<StrkExerciseProgress | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProgress = useCallback(async () => {
    try {
      setLoading(true);
      const { progress: data } = await apiClient.get<{ progress: any }>(`/exercises/${exerciseId}/progress`);
      setProgress(mapProgressFromApi(data));
    } catch (err) {
      console.error('Error fetching progress:', err);
    } finally {
      setLoading(false);
    }
  }, [exerciseId]);

  useEffect(() => {
    if (user && exerciseId) {
      fetchProgress();
    }
  }, [user, exerciseId, fetchProgress]);

  const updateProgress = async (updates: Partial<StrkExerciseProgress>) => {
    try {
      const payload: Record<string, unknown> = {};
      if (updates.current_question_id !== undefined) payload.currentQuestionId = updates.current_question_id;
      if (updates.questions_answered !== undefined) payload.questionsAnswered = updates.questions_answered;
      if (updates.total_questions !== undefined) payload.totalQuestions = updates.total_questions;
      if (updates.progress_percentage !== undefined) payload.progressPercentage = updates.progress_percentage;
      if (updates.streak_count !== undefined) payload.streakCount = updates.streak_count;
      if (updates.badges_earned !== undefined) payload.badgesEarned = updates.badges_earned;
      if (updates.last_activity !== undefined) payload.lastActivity = updates.last_activity;

      const { progress: data } = await apiClient.patch<{ progress: any }>(`/exercises/${exerciseId}/progress`, payload);
      const mapped = mapProgressFromApi(data);
      setProgress(mapped);
      return mapped;
    } catch (err) {
      console.error('Error updating progress:', err);
      throw err;
    }
  };

  return {
    progress,
    loading,
    updateProgress,
    refreshProgress: fetchProgress,
  };
};

const mapAttemptFromApi = (a: any): StrkExerciseAttempt => ({
  id: a.id,
  exercise_id: a.exerciseId,
  student_id: a.studentId,
  attempt_number: a.attemptNumber ?? 1,
  started_at: a.startedAt,
  submitted_at: a.submittedAt ?? undefined,
  score: Number(a.score ?? 0),
  max_score: Number(a.maxScore ?? 0),
  time_spent: a.timeSpent ?? 0,
  status: (a.status ?? 'in_progress') as AttemptStatus,
  answers: a.answers ?? {},
  feedback: a.feedback ?? undefined,
  created_at: a.createdAt,
  updated_at: a.updatedAt,
});

export const useExerciseAttempts = (exerciseId: string) => {
  const { user } = useStrkAuth();
  const [attempts, setAttempts] = useState<StrkExerciseAttempt[]>([]);
  const [currentAttempt, setCurrentAttempt] = useState<StrkExerciseAttempt | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAttempts = useCallback(async () => {
    try {
      setLoading(true);
      const { attempts: data } = await apiClient.get<{ attempts: any[] }>(`/exercises/${exerciseId}/attempts`);
      const mapped = (data || []).map(mapAttemptFromApi);
      setAttempts(mapped);

      // Trouver la tentative en cours
      const inProgress = mapped.find((attempt) => attempt.status === 'in_progress');
      setCurrentAttempt(inProgress || null);
    } catch (err) {
      console.error('Error fetching attempts:', err);
    } finally {
      setLoading(false);
    }
  }, [exerciseId]);

  useEffect(() => {
    if (user && exerciseId) {
      fetchAttempts();
    }
  }, [user, exerciseId, fetchAttempts]);

  const startAttempt = async () => {
    try {
      const { attempt } = await apiClient.post<{ attempt: any }>(`/exercises/${exerciseId}/attempts`);
      const mapped = mapAttemptFromApi(attempt);
      setCurrentAttempt(mapped);
      await fetchAttempts();
      return mapped;
    } catch (err) {
      console.error('Error starting attempt:', err);
      throw err;
    }
  };

  const submitAttempt = async (attemptId: string, answers: Record<string, any>, score: number) => {
    try {
      await apiClient.patch(`/exercises/attempts/${attemptId}`, { answers, score });
      await fetchAttempts();
    } catch (err) {
      console.error('Error submitting attempt:', err);
      throw err;
    }
  };

  return {
    attempts,
    currentAttempt,
    loading,
    startAttempt,
    submitAttempt,
    refreshAttempts: fetchAttempts,
  };
};
