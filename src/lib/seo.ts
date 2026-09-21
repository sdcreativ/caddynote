import { FEATURES } from '@/data/features';
import { EXPERIENCES } from '@/data/experiences';

export const CANONICAL_PROD_ORIGIN = 'https://caddynote.com';
export const CANONICAL_HOSTINGER_ORIGIN = 'https://caddynote.sdcreativ.com';

/** Normalise l’origine publique : HTTPS + hôte connu. */
export function normalizePublicOrigin(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, '');
  try {
    const withProtocol = /^[a-zA-Z][a-zA-Z+\-.]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProtocol);
    const host = url.hostname.replace(/^www\./i, '').toLowerCase();
    if (host === 'caddynote.com') return CANONICAL_PROD_ORIGIN;
    if (host === 'caddynote.sdcreativ.com') return CANONICAL_HOSTINGER_ORIGIN;
    return `${url.protocol}//${url.host}`.replace(/\/$/, '');
  } catch {
    return trimmed;
  }
}

/** URL canonique du site (sans slash final). */
export function getSiteUrl(): string {
  const fromEnv = import.meta.env.VITE_SITE_URL as string | undefined;
  if (fromEnv?.trim()) return normalizePublicOrigin(fromEnv);
  if (typeof window !== 'undefined' && window.location?.origin) {
    return normalizePublicOrigin(window.location.origin);
  }
  return CANONICAL_PROD_ORIGIN;
}

export const DEFAULT_OG_IMAGE = '/og-caddynote.jpg';

export type SeoPage = {
  path: string;
  title: string;
  description: string;
  /** noindex pour zones auth / app */
  noIndex?: boolean;
  type?: 'website' | 'article';
};

export const DEFAULT_SEO: SeoPage = {
  path: '/',
  title: 'CaddyNote : La gestion scolaire, simplifiée',
  description:
    'CaddyNote connecte directions, enseignants et familles : présences, notes, paiements Mobile Money, documents et pilotage multi-établissements.',
};

/** Pages marketing / publiques indexables. */
export const PUBLIC_SEO_PAGES: SeoPage[] = [
  DEFAULT_SEO,
  {
    path: '/about',
    title: 'À propos : CaddyNote',
    description:
      'Découvrez la mission de CaddyNote : une plateforme de gestion scolaire moderne, pensée pour le terrain.',
  },
  {
    path: '/contact',
    title: 'Contact : CaddyNote',
    description:
      'Contactez l’équipe CaddyNote pour une démonstration, un devis ou un accompagnement de déploiement.',
  },
  {
    path: '/mentions-legales',
    title: 'Mentions légales : CaddyNote',
    description:
      'Éditeur, hébergement et conditions d’utilisation du site et de la plateforme CaddyNote.',
  },
  {
    path: '/confidentialite',
    title: 'Politique de confidentialité : CaddyNote',
    description:
      'Comment CaddyNote et les établissements traitent les données personnelles : finalités, droits et conservation.',
  },
  {
    path: '/signup',
    title: 'Obtenir un compte CaddyNote',
    description:
      'Les comptes CaddyNote sont créés par l’établissement : espaces élève et parent séparés, identifiants remis par la direction. Pas d’inscription libre en ligne.',
  },
  {
    path: '/espace-parent',
    title: 'Espace parent : CaddyNote',
    description:
      'Suivez notes, absences et documents de vos enfants dans un espace parent CaddyNote, avec un compte fourni par l’école.',
  },
  {
    path: '/sign',
    title: 'Connexion à votre espace : CaddyNote',
    description:
      'Connectez-vous à CaddyNote pour accéder à la gestion scolaire de votre établissement : présences, notes, familles et pilotage sécurisé.',
    noIndex: true,
  },
  {
    path: '/forgot-password',
    title: 'Mot de passe oublié : CaddyNote',
    description: 'Réinitialisez votre mot de passe CaddyNote.',
    noIndex: true,
  },
  {
    path: '/reset-password',
    title: 'Réinitialiser le mot de passe : CaddyNote',
    description: 'Choisissez un nouveau mot de passe pour votre compte CaddyNote.',
    noIndex: true,
  },
  {
    path: '/aide',
    title: 'Centre d’aide : CaddyNote',
    description: 'Guides et ressources pour administrateurs, enseignants, parents et établissements.',
  },
  {
    path: '/aide/guide-enseignants',
    title: 'Guide enseignants : CaddyNote',
    description: 'Guide CaddyNote pour les enseignants : présences, notes, devoirs et communication.',
  },
  {
    path: '/aide/guide-etudiants',
    title: 'Guide étudiants : CaddyNote',
    description: 'Guide CaddyNote pour les étudiants : cours, devoirs, notes et absences.',
  },
  {
    path: '/aide/guide-ecoles',
    title: 'Guide établissements : CaddyNote',
    description: 'Guide CaddyNote pour les établissements scolaires : organisation, finance et vie scolaire.',
  },
  {
    path: '/aide/guide-admin',
    title: 'Guide administrateurs : CaddyNote',
    description: 'Guide CaddyNote pour les administrateurs : pilotage, utilisateurs et configuration.',
  },
  {
    path: '/aide/guide-parents',
    title: 'Guide parents : CaddyNote',
    description: 'Guide CaddyNote pour les parents : suivi des enfants, absences, notes et paiements.',
  },
  {
    path: '/admissions',
    title: 'Préinscription : CaddyNote',
    description: 'Déposez une demande de préinscription scolaire via CaddyNote.',
  },
  ...FEATURES.map((f) => ({
    path: `/fonctionnalites/${f.slug}`,
    title: `${f.title} : CaddyNote`,
    description: f.short,
    type: 'article' as const,
  })),
  ...EXPERIENCES.map((e) => ({
    path: `/experiences/${e.slug}`,
    title: `${e.label} · ${e.title.replace(/\.$/, '')} · CaddyNote`,
    description: e.body,
    type: 'article' as const,
  })),
];

export function absoluteUrl(path: string): string {
  const base = getSiteUrl();
  if (!path || path === '/') return base;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function absoluteAsset(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return absoluteUrl(path);
}
