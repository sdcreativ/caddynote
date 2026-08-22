import { getAnthropicClient, AI_MODEL } from './anthropicClient.js';

/**
 * Portage des 4 actions de l'edge function Supabase `ai-exercise-helper`
 * (qui appelait OpenAI/gpt-4o-mini) vers l'API Claude. Chaque fonction
 * utilise les sorties structurées (`output_config.format`) pour garantir un
 * JSON exploitable directement par le frontend, sans parsing fragile.
 */

const extractJson = (content: unknown): any => {
  const block = Array.isArray(content) ? content.find((b: any) => b.type === 'text') : null;
  if (!block?.text) {
    throw new Error('Réponse IA vide ou inattendue');
  }
  return JSON.parse(block.text);
};

export interface GenerateExerciseParams {
  subject: string;
  difficulty: number;
  topic: string;
  questionCount?: number;
  exerciseType?: string;
}

export const generateExercise = async (params: GenerateExerciseParams) => {
  const questionCount = params.questionCount ?? 5;
  const response = await getAnthropicClient().messages.create({
    model: AI_MODEL,
    max_tokens: 4096,
    system:
      "Tu es un assistant pédagogique qui conçoit des exercices scolaires en français, adaptés au niveau demandé. " +
      "Les questions doivent être variées, pédagogiquement pertinentes et sans ambiguïté.",
    messages: [
      {
        role: 'user',
        content:
          `Crée un exercice de type "${params.exerciseType ?? 'quiz'}" en ${params.subject}, ` +
          `sur le sujet "${params.topic}", niveau de difficulté ${params.difficulty}/5, ` +
          `avec exactement ${questionCount} questions.`,
      },
    ],
    output_config: {
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            questions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  questionText: { type: 'string' },
                  questionType: {
                    type: 'string',
                    enum: ['multiple_choice', 'true_false', 'open_text', 'numeric'],
                  },
                  options: { type: 'array', items: { type: 'string' } },
                  correctAnswer: { type: 'string' },
                  explanation: { type: 'string' },
                  points: { type: 'integer' },
                },
                required: ['questionText', 'questionType', 'options', 'correctAnswer', 'explanation', 'points'],
                additionalProperties: false,
              },
            },
          },
          required: ['title', 'description', 'questions'],
          additionalProperties: false,
        },
      },
    },
  });
  return extractJson(response.content);
};

export interface CorrectAnswerParams {
  question: string;
  studentAnswer: string;
  correctAnswer: string;
  subject: string;
}

export const correctOpenAnswer = async (params: CorrectAnswerParams) => {
  const response = await getAnthropicClient().messages.create({
    model: AI_MODEL,
    max_tokens: 1024,
    system:
      "Tu es un enseignant qui corrige la réponse ouverte d'un élève en français, avec bienveillance et précision.",
    messages: [
      {
        role: 'user',
        content:
          `Matière : ${params.subject}\nQuestion : ${params.question}\n` +
          `Réponse attendue : ${params.correctAnswer}\nRéponse de l'élève : ${params.studentAnswer}\n\n` +
          `Évalue la réponse de l'élève sur 10, indique si elle est correcte, donne un retour constructif et des suggestions d'amélioration.`,
      },
    ],
    output_config: {
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            score: { type: 'number' },
            isCorrect: { type: 'boolean' },
            feedback: { type: 'string' },
            suggestions: { type: 'array', items: { type: 'string' } },
          },
          required: ['score', 'isCorrect', 'feedback', 'suggestions'],
          additionalProperties: false,
        },
      },
    },
  });
  return extractJson(response.content);
};

export interface AdaptiveRecommendationsParams {
  studentLevel: number;
  weaknesses: string[];
  strengths: string[];
  subject: string;
}

export const getAdaptiveRecommendations = async (params: AdaptiveRecommendationsParams) => {
  const response = await getAnthropicClient().messages.create({
    model: AI_MODEL,
    max_tokens: 1024,
    system: "Tu es un conseiller pédagogique qui propose des recommandations d'apprentissage personnalisées en français.",
    messages: [
      {
        role: 'user',
        content:
          `Matière : ${params.subject}\nNiveau de l'élève : ${params.studentLevel}/5\n` +
          `Points faibles : ${params.weaknesses.join(', ') || 'aucun signalé'}\n` +
          `Points forts : ${params.strengths.join(', ') || 'aucun signalé'}\n\n` +
          `Propose 3 à 5 recommandations concrètes pour progresser.`,
      },
    ],
    output_config: {
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            recommendations: { type: 'array', items: { type: 'string' } },
          },
          required: ['recommendations'],
          additionalProperties: false,
        },
      },
    },
  });
  return extractJson(response.content);
};

export interface PedagogicalHelpParams {
  question: string;
  studentQuestion: string;
  context: string;
}

export const getPedagogicalHelp = async (params: PedagogicalHelpParams) => {
  const response = await getAnthropicClient().messages.create({
    model: AI_MODEL,
    max_tokens: 1024,
    system: "Tu es un tuteur pédagogique qui aide un élève bloqué sur un exercice, sans jamais donner directement la réponse finale.",
    messages: [
      {
        role: 'user',
        content:
          `Contexte de l'exercice : ${params.context}\nQuestion de l'exercice : ${params.question}\n` +
          `Question de l'élève : ${params.studentQuestion}\n\n` +
          `Donne une aide pédagogique qui guide l'élève vers la solution sans la révéler.`,
      },
    ],
    output_config: {
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: { help: { type: 'string' } },
          required: ['help'],
          additionalProperties: false,
        },
      },
    },
  });
  return extractJson(response.content);
};
