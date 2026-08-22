import Anthropic from '@anthropic-ai/sdk';
import { areExternalServicesDisabled } from './testMode.js';

/**
 * Client Claude pour l'assistant IA des exercices (remplace l'edge function
 * Supabase `ai-exercise-helper`, qui appelait OpenAI). Clé requise :
 * ANTHROPIC_API_KEY. Si absente, les routes /exercises/ai/* répondent 501
 * plutôt que d'échouer silencieusement (même principe que le stub Stripe de
 * subscriptions.routes.ts).
 */

let client: Anthropic | null = null;

export const isAiConfigured = (): boolean =>
  !areExternalServicesDisabled() && !!process.env.ANTHROPIC_API_KEY;

export const getAnthropicClient = (): Anthropic => {
  if (!client) {
    client = new Anthropic();
  }
  return client;
};

export const AI_MODEL = 'claude-opus-5';
