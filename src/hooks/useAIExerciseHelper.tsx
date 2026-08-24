import { useState } from 'react';
import { apiClient, ApiError } from '@/lib/apiClient';

// Routes /exercises/ai/* (Anthropic et/ou OpenAI). Sans clé → 501.
// Flag établissement `exercises_ai` (opt-in) désactivé → 403.

export const useAIExerciseHelper = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateExercise = async (params: {
    subject: string;
    difficulty: number;
    topic: string;
    questionCount?: number;
    exerciseType?: string;
  }) => {
    setLoading(true);
    setError(null);

    try {
      return await apiClient.post<any>('/exercises/ai/generate', params);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur de génération');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const correctOpenAnswer = async (params: {
    question: string;
    studentAnswer: string;
    correctAnswer: string;
    subject: string;
  }) => {
    try {
      return await apiClient.post('/exercises/ai/correct-answer', params);
    } catch (err) {
      console.error('AI correction error:', err);
      return {
        score: 5,
        isCorrect: false,
        feedback: "Correction automatique non disponible",
        suggestions: []
      };
    }
  };

  const getAdaptiveRecommendations = async (params: {
    studentLevel: number;
    weaknesses: string[];
    strengths: string[];
    subject: string;
  }) => {
    try {
      return await apiClient.post('/exercises/ai/adaptive-recommendations', params);
    } catch (err) {
      console.error('AI recommendations error:', err);
      return { recommendations: [] };
    }
  };

  const getPedagogicalHelp = async (params: {
    question: string;
    studentQuestion: string;
    context: string;
  }) => {
    try {
      return await apiClient.post('/exercises/ai/pedagogical-help', params);
    } catch (err) {
      console.error('AI help error:', err);
      return { help: "Assistance non disponible pour le moment." };
    }
  };

  return {
    generateExercise,
    correctOpenAnswer,
    getAdaptiveRecommendations,
    getPedagogicalHelp,
    loading,
    error,
  };
};
