import { prisma } from './prisma.js';
import type { StrkCommChannel, StrkMessageTemplate } from '@prisma/client';

/**
 * Résolution + rendu des modèles de message versionnés (COM-002).
 *
 * Résolution : la version active la plus spécifique gagne — modèle propre à
 * l'établissement pour ce useCase/canal/langue, sinon modèle global
 * (`institutionId: null`) pour le même useCase/canal/langue, sinon `null`
 * (l'appelant compose alors un message ad-hoc au lieu d'utiliser un modèle).
 */
export const resolveTemplate = async (
  institutionId: string | null,
  useCase: string,
  channel: StrkCommChannel,
  locale = 'fr'
): Promise<StrkMessageTemplate | null> => {
  if (institutionId) {
    const specific = await prisma.strkMessageTemplate.findFirst({
      where: { institutionId, useCase, channel, locale, isActive: true },
      orderBy: { version: 'desc' },
    });
    if (specific) return specific;
  }
  return prisma.strkMessageTemplate.findFirst({
    where: { institutionId: null, useCase, channel, locale, isActive: true },
    orderBy: { version: 'desc' },
  });
};

/**
 * Remplace `{{variableName}}` par la valeur fournie — uniquement pour les
 * noms déclarés dans `template.variables` (liste blanche définie à la
 * création du modèle) : une variable non déclarée reste littéralement
 * "{{...}}" dans le rendu plutôt que d'injecter une valeur arbitraire non
 * prévue par l'auteur du modèle.
 */
export const renderTemplate = (
  template: Pick<StrkMessageTemplate, 'subject' | 'body' | 'variables'>,
  variables: Record<string, string>
): { subject: string | null; body: string } => {
  const allowed = new Set(Array.isArray(template.variables) ? (template.variables as string[]) : []);
  const substitute = (text: string): string =>
    text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) => (allowed.has(name) && name in variables ? variables[name] : match));
  return {
    subject: template.subject ? substitute(template.subject) : null,
    body: substitute(template.body),
  };
};
