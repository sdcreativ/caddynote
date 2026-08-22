import { describe, it, expect, beforeAll } from 'vitest';
import i18n from './config';
import { FEATURES } from '@/data/features';
import { EXPERIENCES } from '@/data/experiences';
import { localizeFeature, localizeExperience } from './localizeCatalog';

describe('localizeCatalog (NFR-009)', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) {
      await new Promise<void>((resolve) => i18n.on('initialized', () => resolve()));
    }
  });

  it('superpose les titres i18n sur chaque fonctionnalité du catalogue', () => {
    for (const f of FEATURES) {
      const loc = localizeFeature(f);
      expect(loc.title).toBe(i18n.t(`${f.slug}.title`, { ns: 'features' }));
      expect(loc.title).not.toBe(`${f.slug}.title`);
      expect(loc.icon).toBe(f.icon);
    }
  });

  it('superpose les libellés i18n sur chaque expérience du catalogue', () => {
    for (const e of EXPERIENCES) {
      const loc = localizeExperience(e);
      expect(loc.label).toBe(i18n.t(`${e.slug}.label`, { ns: 'experiences' }));
      expect(loc.label).not.toBe(`${e.slug}.label`);
    }
  });
});
