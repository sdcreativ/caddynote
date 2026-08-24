import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { areExternalServicesDisabled } from './testMode.js';

/**
 * Assistant IA exercices : Anthropic (Claude) et/ou OpenAI.
 * Variables :
 * - ANTHROPIC_API_KEY
 * - OPENAI_API_KEY
 * - AI_PROVIDER=anthropic|openai (optionnel ; sinon Anthropic si présent, sinon OpenAI)
 */

export type AiProvider = 'anthropic' | 'openai';

export const isAiConfigured = (): boolean =>
  !areExternalServicesDisabled() &&
  (!!process.env.ANTHROPIC_API_KEY || !!process.env.OPENAI_API_KEY);

export const resolveAiProvider = (): AiProvider | null => {
  if (!isAiConfigured()) return null;
  const forced = (process.env.AI_PROVIDER || '').trim().toLowerCase();
  if (forced === 'anthropic' && process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (forced === 'openai' && process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return null;
};

export const aiMissingKeyMessage = (): string =>
  "L'assistant IA n'est pas configuré sur cette instance (clé ANTHROPIC_API_KEY ou OPENAI_API_KEY manquante). Contactez SDCREATIV.";

let anthropicClient: Anthropic | null = null;
let openaiClient: OpenAI | null = null;

export const getAnthropicClient = (): Anthropic => {
  if (!anthropicClient) {
    anthropicClient = new Anthropic();
  }
  return anthropicClient;
};

export const getOpenAiClient = (): OpenAI => {
  if (!openaiClient) {
    openaiClient = new OpenAI();
  }
  return openaiClient;
};

export const ANTHROPIC_AI_MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5';
export const OPENAI_AI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

/** @deprecated utiliser ANTHROPIC_AI_MODEL */
export const AI_MODEL = ANTHROPIC_AI_MODEL;

type JsonSchema = Record<string, unknown>;

type CompleteJsonParams = {
  system: string;
  user: string;
  schema: JsonSchema;
  schemaName: string;
  maxTokens?: number;
};

const extractAnthropicJson = (content: unknown): unknown => {
  const block = Array.isArray(content) ? content.find((b: { type?: string }) => b.type === 'text') : null;
  const text = (block as { text?: string } | null)?.text;
  if (!text) throw new Error('Réponse IA vide ou inattendue');
  return JSON.parse(text);
};

/**
 * Complétion JSON structurée via le provider actif (Anthropic ou OpenAI).
 */
export const completeJson = async (params: CompleteJsonParams): Promise<any> => {
  const provider = resolveAiProvider();
  if (!provider) {
    throw new Error(aiMissingKeyMessage());
  }

  const maxTokens = params.maxTokens ?? 2048;

  if (provider === 'openai') {
    const response = await getOpenAiClient().chat.completions.create({
      model: OPENAI_AI_MODEL,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: params.system },
        { role: 'user', content: params.user },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: params.schemaName,
          strict: true,
          schema: params.schema,
        },
      },
    });
    const text = response.choices[0]?.message?.content;
    if (!text) throw new Error('Réponse IA vide ou inattendue');
    return JSON.parse(text);
  }

  const response = await getAnthropicClient().messages.create({
    model: ANTHROPIC_AI_MODEL,
    max_tokens: maxTokens,
    system: params.system,
    messages: [{ role: 'user', content: params.user }],
    output_config: {
      format: {
        type: 'json_schema',
        schema: params.schema,
      },
    },
  });
  return extractAnthropicJson(response.content);
};
