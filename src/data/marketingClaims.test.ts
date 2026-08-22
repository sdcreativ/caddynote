import { describe, it, expect } from 'vitest';
import { FEATURES } from '@/data/features';
import { EXPERIENCES } from '@/data/experiences';
import {
  FORBIDDEN_MARKETING_PHRASES,
  MARKETING_CLAIMS,
} from '@/data/marketingClaims';
import featuresFr from '@/i18n/locales/fr/features.json';
import experiencesFr from '@/i18n/locales/fr/experiences.json';
import guidesFr from '@/i18n/locales/fr/guides.json';
import aboutFr from '@/i18n/locales/fr/about.json';

const flattenStrings = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(flattenStrings);
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(flattenStrings);
  }
  return [];
};

describe('Cohérence copy marketing (§6)', () => {
  it('chaque claim a un statut et une preuve', () => {
    expect(MARKETING_CLAIMS.length).toBeGreaterThanOrEqual(5);
    for (const c of MARKETING_CLAIMS) {
      expect(c.evidence.trim().length).toBeGreaterThan(3);
      expect(['shipped', 'partial', 'sandbox']).toContain(c.status);
    }
  });

  it('le catalogue FR ne promet pas de chat live / temps réel / géoloc', () => {
    const blobs = [
      ...flattenStrings(featuresFr),
      ...flattenStrings(experiencesFr),
      ...flattenStrings(aboutFr),
      ...flattenStrings(guidesFr),
    ]
      .join('\n')
      .toLowerCase();

    for (const phrase of FORBIDDEN_MARKETING_PHRASES) {
      expect(blobs, `phrase interdite encore présente: ${phrase}`).not.toContain(phrase);
    }
  });

  it('FEATURES / EXPERIENCES data restent alignés (slugs uniques)', () => {
    const fSlugs = FEATURES.map((f) => f.slug);
    expect(new Set(fSlugs).size).toBe(fSlugs.length);
    const eSlugs = EXPERIENCES.map((e) => e.slug);
    expect(new Set(eSlugs).size).toBe(eSlugs.length);
  });
});
