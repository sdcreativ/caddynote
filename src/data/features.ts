import type { LucideIcon } from 'lucide-react';
import {
  Bell,
  GraduationCap,
  BookOpen,
  CircleDollarSign,
  MessageCircle,
  Shield,
  WifiOff,
  Smartphone,
  FileText,
  Users,
  BarChart3,
  Lock,
} from 'lucide-react';

export type FeatureSlug =
  | 'presences'
  | 'vie-scolaire'
  | 'notes'
  | 'paiements'
  | 'familles'
  | 'pilotage';

export type FeatureDetail = {
  slug: FeatureSlug;
  title: string;
  short: string;
  eyebrow: string;
  hero: string;
  body: string;
  tone: string;
  icon: LucideIcon;
  highlights: { icon: LucideIcon; title: string; text: string }[];
  bullets: string[];
};

export const FEATURES: FeatureDetail[] = [
  {
    slug: 'presences',
    title: 'Présences & alertes familles',
    short:
      'Enregistrez les présences en quelques secondes et prévenez automatiquement les parents par SMS ou notification.',
    eyebrow: 'Assiduité',
    hero: 'L’appel en classe, sans friction — même hors connexion.',
    body: 'CaddyNote accélère la prise de présence et alerte les familles dès l’enregistrement. Les enseignants gagnent du temps ; la direction dispose d’une vision fiable de l’assiduité.',
    tone: 'bg-[#E8F1FF] text-[#1D70D8]',
    icon: Bell,
    highlights: [
      {
        icon: WifiOff,
        title: 'Mode hors ligne',
        text: 'Saisissez l’appel même sans réseau : la synchronisation se fait dès le retour de la connexion.',
      },
      {
        icon: Smartphone,
        title: 'Alertes SMS & push',
        text: 'Les parents sont informés rapidement d’une absence ou d’un retard (selon canaux et consentements).',
      },
      {
        icon: BarChart3,
        title: 'Indicateurs clairs',
        text: 'Taux de présence par classe, seuils d’alerte et historique pour le suivi disciplinaire.',
      },
    ],
    bullets: [
      'Appel rapide par classe ou par cours',
      'Justificatifs et workflow de validation',
      'Seuils d’alerte configurables',
      'Export des rapports d’assiduité',
    ],
  },
  {
    slug: 'vie-scolaire',
    title: 'Vie scolaire centralisée',
    short:
      'Inscriptions, dossiers élèves, emplois du temps, discipline et suivi pédagogique réunis dans un seul espace.',
    eyebrow: 'Organisation',
    hero: 'Toute la vie de l’établissement, dans un seul espace de travail.',
    body: 'Admissions, dossiers, planning, discipline et suivi : CaddyNote remplace les tableurs dispersés par une base unique, partagée entre directions, enseignants et secrétariat.',
    tone: 'bg-[#F3E8FF] text-[#7C3AED]',
    icon: GraduationCap,
    highlights: [
      {
        icon: Users,
        title: 'Dossiers élèves',
        text: 'Identité, tuteurs, santé, parcours scolaire — accessibles selon les droits de chacun.',
      },
      {
        icon: FileText,
        title: 'Admissions & inscriptions',
        text: 'Préinscriptions en ligne, suivi des dossiers et bascule vers l’année scolaire.',
      },
      {
        icon: GraduationCap,
        title: 'Emplois du temps',
        text: 'Cours, salles, disponibilités enseignants et détection des conflits.',
      },
    ],
    bullets: [
      'Multi-établissements pour les groupes scolaires',
      'Discipline et observations centralisées',
      'Classes, matières et affectations',
      'Historique et traçabilité des actions',
    ],
  },
  {
    slug: 'notes',
    title: 'Notes & évaluations',
    short:
      'Créez les évaluations, calculez les moyennes et publiez des bulletins clairs, accessibles aux familles.',
    eyebrow: 'Pédagogie',
    hero: 'Des évaluations justes, des bulletins prêts à publier.',
    body: 'Saisie des notes, barèmes, coefficients et bulletins : le moteur de notes de CaddyNote s’adapte aux pratiques locales et rend les résultats lisibles pour les familles.',
    tone: 'bg-[#ECFDF5] text-[#059669]',
    icon: BookOpen,
    highlights: [
      {
        icon: BookOpen,
        title: 'Évaluations & barèmes',
        text: 'Créez des devoirs, contrôles et moyennes avec des échelles adaptées à votre établissement.',
      },
      {
        icon: FileText,
        title: 'Bulletins & relevés',
        text: 'Générez et publiez des documents clairs, prêts à partager ou à imprimer.',
      },
      {
        icon: Users,
        title: 'Visibilité familles',
        text: 'Les parents consultent notes et commentaires dès leur publication.',
      },
    ],
    bullets: [
      'Saisie guidée et corrections traçables',
      'Périodes académiques et coefficients',
      'Commentaires enseignants',
      'Exports PDF et tableaux de bord',
    ],
  },
  {
    slug: 'paiements',
    title: 'Paiements simplifiés',
    short:
      'Suivez les frais de scolarité et acceptez les paiements Mobile Money avec des reçus instantanés.',
    eyebrow: 'Finance',
    hero: 'La scolarité encaissée, suivie et justifiée — en FCFA.',
    body: 'Factures, échéances, Mobile Money et rapprochement : CaddyNote donne à la direction une vision nette des encaissements, sans tableurs parallèles.',
    tone: 'bg-[#FFFBEB] text-[#D97706]',
    icon: CircleDollarSign,
    highlights: [
      {
        icon: CircleDollarSign,
        title: 'Mobile Money',
        text: 'Acceptez les paiements via les canaux locaux et confirmez les reçus automatiquement.',
      },
      {
        icon: FileText,
        title: 'Factures & échéances',
        text: 'Émettez des factures, suivez les retards et appliquez des relances ciblées.',
      },
      {
        icon: BarChart3,
        title: 'Pilotage financier',
        text: 'Tableaux de bord, remises et consolidation multi-établissements.',
      },
    ],
    bullets: [
      'Reçus instantanés pour les familles',
      'Suivi des impayés et pénalités',
      'Rapprochement bancaire',
      'Exports comptables',
    ],
  },
  {
    slug: 'familles',
    title: 'Familles connectées',
    short:
      'Partagez devoirs, annonces et résultats dans un canal fiable entre l’école et les parents.',
    eyebrow: 'Communication',
    hero: 'Un canal unique entre l’école et chaque famille.',
    body: 'Notifications, devoirs, annonces et résultats : les parents restent informés sans multiplier WhatsApp, SMS et appels. L’école garde la maîtrise du message.',
    tone: 'bg-[#FDF2F8] text-[#DB2777]',
    icon: MessageCircle,
    highlights: [
      {
        icon: MessageCircle,
        title: 'Messagerie & annonces',
        text: 'Diffusez des informations ciblées par classe, niveau ou établissement.',
      },
      {
        icon: Bell,
        title: 'Alertes utiles',
        text: 'Absences, devoirs et paiements notifiés au bon moment.',
      },
      {
        icon: Smartphone,
        title: 'Espace parent',
        text: 'Un suivi clair de chaque enfant : présence, notes, scolarité.',
      },
    ],
    bullets: [
      'Multi-enfants pour un même foyer',
      'SMS pour joindre tous les parents',
      'Historique des échanges',
      'Respect des rôles et de la confidentialité',
    ],
  },
  {
    slug: 'pilotage',
    title: 'Pilotage sécurisé',
    short:
      'Contrôles d’accès, traçabilité et tableaux de bord permettent de diriger chaque établissement sereinement.',
    eyebrow: 'Gouvernance',
    hero: 'Dirigez avec des données fiables et des accès maîtrisés.',
    body: 'Rôles, journal d’audit, tableaux de bord et quotas : CaddyNote protège les données scolaires tout en offrant à la direction une vision opérationnelle complète.',
    tone: 'bg-[#EFF6FF] text-[#2563EB]',
    icon: Shield,
    highlights: [
      {
        icon: Lock,
        title: 'Contrôle d’accès',
        text: 'Rôles fins (direction, enseignants, parents, admin) et isolation multi-tenant.',
      },
      {
        icon: FileText,
        title: 'Traçabilité',
        text: 'Journal d’audit des actions sensibles pour la conformité et la confiance.',
      },
      {
        icon: BarChart3,
        title: 'Tableaux de bord',
        text: 'Effectifs, assiduité, résultats et finances en un coup d’œil.',
      },
    ],
    bullets: [
      'Sessions et sécurité renforcée',
      'Sauvegardes et diagnostics',
      'Quotas et flags SaaS',
      'Support et accompagnement',
    ],
  },
];

export function getFeatureBySlug(slug: string | undefined): FeatureDetail | undefined {
  return FEATURES.find((f) => f.slug === slug);
}
