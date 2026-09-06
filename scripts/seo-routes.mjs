/**
 * Routes marketing indexables : partagé entre seo-build et prerender.
 */
function normalizePublicOrigin(raw) {
  const trimmed = String(raw).trim().replace(/\/$/, '');
  try {
    const withProtocol = /^[a-zA-Z][a-zA-Z+\-.]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProtocol);
    const host = url.hostname.replace(/^www\./i, '').toLowerCase();
    if (host === 'caddynote.com') return 'https://caddynote.com';
    return `${url.protocol}//${url.host}`.replace(/\/$/, '');
  } catch {
    return trimmed;
  }
}

export const SITE = normalizePublicOrigin(process.env.VITE_SITE_URL || 'https://caddynote.com');
export const OG_IMAGE = `${SITE}/og-caddynote.jpg`;

const FEATURE_SLUGS = ['presences', 'vie-scolaire', 'notes', 'paiements', 'familles', 'pilotage'];
const EXPERIENCE_SLUGS = ['directions', 'enseignants', 'parents'];

export const SEO_PAGES = [
  {
    path: '/',
    title: 'CaddyNote : La gestion scolaire, simplifiée',
    description:
      'CaddyNote connecte directions, enseignants et familles : présences, notes, paiements Mobile Money, documents et pilotage multi-établissements.',
  },
  {
    path: '/about',
    title: 'À propos : CaddyNote',
    description:
      'Découvrez la mission de CaddyNote : une plateforme de gestion scolaire moderne, pensée pour le terrain.',
  },
  {
    path: '/contact',
    title: 'Contact : CaddyNote',
    description: 'Contactez l’équipe CaddyNote pour une démonstration, un devis ou un accompagnement de déploiement.',
  },
  {
    path: '/mentions-legales',
    title: 'Mentions légales : CaddyNote',
    description: 'Éditeur, hébergement et conditions d’utilisation du site et de la plateforme CaddyNote.',
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
    description: 'Guide CaddyNote pour les établissements scolaires.',
  },
  {
    path: '/aide/guide-admin',
    title: 'Guide administrateurs : CaddyNote',
    description: 'Guide CaddyNote pour les administrateurs.',
  },
  {
    path: '/aide/guide-parents',
    title: 'Guide parents : CaddyNote',
    description: 'Guide CaddyNote pour les parents.',
  },
  {
    path: '/admissions',
    title: 'Préinscription : CaddyNote',
    description: 'Déposez une demande de préinscription scolaire via CaddyNote.',
  },
  ...FEATURE_SLUGS.map((slug) => {
    const titles = {
      presences: 'Présences & alertes familles : CaddyNote',
      'vie-scolaire': 'Vie scolaire centralisée : CaddyNote',
      notes: 'Notes & évaluations : CaddyNote',
      paiements: 'Paiements simplifiés : CaddyNote',
      familles: 'Familles connectées : CaddyNote',
      pilotage: 'Pilotage sécurisé : CaddyNote',
    };
    const descriptions = {
      presences:
        'Enregistrez les présences en quelques secondes et prévenez automatiquement les parents par SMS ou notification.',
      'vie-scolaire':
        'Inscriptions, dossiers élèves, emplois du temps, discipline et suivi pédagogique réunis dans un seul espace.',
      notes: 'Créez les évaluations, calculez les moyennes et publiez des bulletins clairs, accessibles aux familles.',
      paiements:
        'Suivez les frais de scolarité et acceptez les paiements Mobile Money avec des reçus instantanés.',
      familles: 'Partagez devoirs, annonces et résultats dans un canal fiable entre l’école et les parents.',
      pilotage:
        'Contrôles d’accès, traçabilité et tableaux de bord permettent de diriger chaque établissement sereinement.',
    };
    return {
      path: `/fonctionnalites/${slug}`,
      title: titles[slug],
      description: descriptions[slug],
    };
  }),
  ...EXPERIENCE_SLUGS.map((slug) => {
    const titles = {
      directions: 'Directions · Décidez avec une vision complète · CaddyNote',
      enseignants: 'Enseignants · L’appel et le suivi, sans friction · CaddyNote',
      parents: 'Parents · Tout savoir, au bon moment · CaddyNote',
    };
    const descriptions = {
      directions:
        'Des indicateurs fiables sur les effectifs, l’assiduité, les résultats et les finances de chaque établissement.',
      enseignants:
        'Présences hors ligne, saisie des notes et communication aux parents : pensé pour le quotidien en classe.',
      parents: 'Notes, absences, factures et messages de l’école dans un espace simple pour chaque enfant.',
    };
    return {
      path: `/experiences/${slug}`,
      title: titles[slug],
      description: descriptions[slug],
    };
  }),
];
