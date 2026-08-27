import { describe, it, expect } from 'vitest';
import { planHasFeature } from './planFeatures';

describe('planHasFeature', () => {
  it('lit la clé canonique advancedReports', () => {
    expect(planHasFeature({ advancedReports: true }, 'advanced_reports')).toBe(true);
    expect(planHasFeature({ advancedReports: true }, 'advancedReports')).toBe(true);
  });

  it('accepte l’alias legacy advanced_reports', () => {
    expect(planHasFeature({ advanced_reports: true }, 'advancedReports')).toBe(true);
  });

  it('ignore le marketing (featureList) et les booléens false', () => {
    expect(
      planHasFeature(
        { featureList: ['Rapports avancés'], advancedReports: false, slug: 'essentiel' },
        'advanced_reports'
      )
    ).toBe(false);
  });
});
