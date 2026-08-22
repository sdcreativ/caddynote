import i18n from '@/i18n/config';
import type { FeatureDetail } from '@/data/features';
import type { ExperienceDetail } from '@/data/experiences';

function tf(slug: string, path: string): string {
  return String(i18n.t(`${slug}.${path}`, { ns: 'features' }));
}

function te(slug: string, path: string): string {
  return String(i18n.t(`${slug}.${path}`, { ns: 'experiences' }));
}

/** Overlay i18n sur le catalogue fonctionnalités (icônes restent dans le data). */
export function localizeFeature(f: FeatureDetail): FeatureDetail {
  return {
    ...f,
    title: tf(f.slug, 'title'),
    short: tf(f.slug, 'short'),
    eyebrow: tf(f.slug, 'eyebrow'),
    hero: tf(f.slug, 'hero'),
    body: tf(f.slug, 'body'),
    highlights: f.highlights.map((h, i) => ({
      ...h,
      title: tf(f.slug, `highlights.${i}.title`),
      text: tf(f.slug, `highlights.${i}.text`),
    })),
    bullets: f.bullets.map((_, i) => tf(f.slug, `bullets.${i}`)),
  };
}

export function localizeExperience(e: ExperienceDetail): ExperienceDetail {
  return {
    ...e,
    label: te(e.slug, 'label'),
    title: te(e.slug, 'title'),
    body: te(e.slug, 'body'),
    hero: te(e.slug, 'hero'),
    statLabel: te(e.slug, 'statLabel'),
    pillars: e.pillars.map((p, i) => ({
      ...p,
      title: te(e.slug, `pillars.${i}.title`),
      text: te(e.slug, `pillars.${i}.text`),
    })),
    bullets: e.bullets.map((_, i) => te(e.slug, `bullets.${i}`)),
  };
}
