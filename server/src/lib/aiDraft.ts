/**
 * Brouillons IA hors exercices (campagnes / messages direction).
 * Réutilise anthropicClient.completeJson + quota aiPerMonth.
 */
import { z } from 'zod';
import { completeJson } from './anthropicClient.js';

const draftSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(8000),
});

export type DraftMessageParams = {
  intent: string;
  audience?: string;
  tone?: string;
  locale?: string;
  context?: string;
};

export const draftCommunicationMessage = async (params: DraftMessageParams) => {
  const locale = params.locale === 'en' ? 'English' : 'French';
  const raw = await completeJson({
    schemaName: 'communication_draft',
    maxTokens: 1024,
    system:
      `You draft short school communications for staff. Language: ${locale}. ` +
      'No markdown. Keep body under 1200 characters. Professional and clear.',
    user: [
      `Intent: ${params.intent}`,
      params.audience ? `Audience: ${params.audience}` : null,
      params.tone ? `Tone: ${params.tone}` : 'Tone: professional, clear, respectful',
      params.context ? `Context: ${params.context}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
    schema: {
      type: 'object',
      properties: {
        subject: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['subject', 'body'],
      additionalProperties: false,
    },
  });
  const parsed = draftSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error('Réponse IA invalide pour le brouillon');
  }
  return parsed.data;
};
