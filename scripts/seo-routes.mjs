/**
 * Routes marketing indexables — partagé entre seo-build et prerender.
 */
export const SITE = (process.env.VITE_SITE_URL || 'https://caddynote.com').replace(/\/$/, '');
export const OG_IMAGE = `${SITE}/og-caddynote.jpg`;

const FEATURE_SLUGS = ['presences', 'vie-scolaire', 'notes', 'paiements', 'familles', 'pilotage'];
const EXPERIENCE_SLUGS = ['directions', 'enseignants', 'parents'];

export const SEO_PAGES = [
  {
    path: '/',
    title: 'CaddyNote — La gestion scolaire, simplifiée',
    description:
      'CaddyNote connecte directions, enseignants et familles : présences, notes, paiements Mobile Money, documents et pilotage multi-établissements.',
  },
  {
    path: '/about',
    title: 'À propos — CaddyNote',
    description:
      'Découvrez la mission de CaddyNote : une plateforme de gestion scolaire moderne, pensée pour le terrain.',
  },
  {
    path: '/contact',
    title: 'Contact — CaddyNote',
    description: 'Contactez l’équipe CaddyNote pour une démonstration, un devis ou un accompagnement de déploiement.',
  },
  {
    path: '/signup',
    title: 'Essai gratuit 30 jours — Créer un compte CaddyNote',
    description:
      'Créez votre compte CaddyNote et profitez de 30 jours d’essai gratuit : gestion scolaire, présences, notes et familles. Sans carte bancaire, sans engagement.',
  },
  {
    path: '/aide',
    title: 'Centre d’aide — CaddyNote',
    description: 'Guides et ressources pour administrateurs, enseignants, parents et établissements.',
  },
  {
    path: '/aide/guide-enseignants',
    title: 'Guide enseignants — CaddyNote',
    description: 'Guide CaddyNote pour les enseignants : présences, notes, devoirs et communication.',
  },
  {
    path: '/aide/guide-etudiants',
    title: 'Guide étudiants — CaddyNote',
    description: 'Guide CaddyNote pour les étudiants : cours, devoirs, notes et absences.',
  },
  {
    path: '/aide/guide-ecoles',
    title: 'Guide établissements — CaddyNote',
    description: 'Guide CaddyNote pour les établissements scolaires.',
  },
  {
    path: '/aide/guide-admin',
    title: 'Guide administrateurs — CaddyNote',
    description: 'Guide CaddyNote pour les administrateurs.',
  },
  {
    path: '/aide/guide-parents',
    title: 'Guide parents — CaddyNote',
    description: 'Guide CaddyNote pour les parents.',
  },
  {
    path: '/admissions',
    title: 'Préinscription — CaddyNote',
    description: 'Déposez une demande de préinscription scolaire via CaddyNote.',
  },
  ...FEATURE_SLUGS.map((slug) => {
    const titles = {
      presences: 'Présences & alertes familles — CaddyNote',
      'vie-scolaire': 'Vie scolaire centralisée — CaddyNote',
      notes: 'Notes & évaluations — CaddyNote',
      paiements: 'Paiements simplifiés — CaddyNote',
      familles: 'Familles connectées — CaddyNote',
      pilotage: 'Pilotage sécurisé — CaddyNote',
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
      directions: 'Directions : vision complète — CaddyNote',
      enseignants: 'Enseignants : appel et suivi — CaddyNote',
      parents: 'Parents : tout savoir au bon moment — CaddyNote',
    };
    const descriptions = {
      directions:
        'Des indicateurs fiables sur les effectifs, l’assiduité, les résultats et les finances de chaque établissement.',
      enseignants:
        'Présences hors ligne, saisie des notes et communication aux parents — pensé pour le quotidien en classe.',
      parents: 'Notes, absences, factures et messages de l’école dans un espace simple pour chaque enfant.',
    };
    return {
      path: `/experiences/${slug}`,
      title: titles[slug],
      description: descriptions[slug],
    };
  }),
];
