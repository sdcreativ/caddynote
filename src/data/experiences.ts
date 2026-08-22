import type { LucideIcon } from 'lucide-react';
import {
  Building2,
  GraduationCap,
  Heart,
  Users,
  ClipboardCheck,
  BarChart3,
  Wallet,
  BookOpen,
  WifiOff,
  Bell,
  CircleDollarSign,
  MessageCircle,
  Shield,
} from 'lucide-react';

export type ExperienceSlug = 'directions' | 'enseignants' | 'parents';

export type ExperienceDetail = {
  slug: ExperienceSlug;
  label: string;
  icon: LucideIcon;
  title: string;
  body: string;
  hero: string;
  stat: string;
  statLabel: string;
  pillars: { icon: LucideIcon; title: string; text: string }[];
  bullets: string[];
};

export const EXPERIENCES: ExperienceDetail[] = [
  {
    slug: 'directions',
    label: 'Directions',
    icon: Building2,
    title: 'Décidez avec une vision complète.',
    body: 'Des indicateurs fiables sur les effectifs, l’assiduité, les résultats et les finances de chaque établissement.',
    hero: 'Pilotez votre établissement avec une vision claire — effectifs, assiduité, résultats et finances au même endroit.',
    stat: '100%',
    statLabel: 'De visibilité',
    pillars: [
      {
        icon: Users,
        title: 'Effectifs',
        text: 'Suivez les inscriptions, les classes et les mouvements d’élèves, établissement par établissement.',
      },
      {
        icon: ClipboardCheck,
        title: 'Assiduité',
        text: 'Taux de présence, absences répétées et seuils d’alerte pour intervenir avant que la situation ne s’aggrave.',
      },
      {
        icon: BarChart3,
        title: 'Résultats',
        text: 'Moyennes, périodes et tendances pédagogiques pour orienter les décisions de direction.',
      },
      {
        icon: Wallet,
        title: 'Finances',
        text: 'Encaissements, impayés et Mobile Money : une trésorerie lisible sans tableurs parallèles.',
      },
    ],
    bullets: [
      'Tableaux de bord consolidés multi-établissements',
      'Droits d’accès fins pour l’équipe de direction',
      'Rapports exportables pour le conseil d’administration',
      'Traçabilité des actions sensibles',
    ],
  },
  {
    slug: 'enseignants',
    label: 'Enseignants',
    icon: GraduationCap,
    title: 'L’appel et le suivi, sans friction.',
    body: 'Présences hors ligne, saisie des notes et communication aux parents — pensé pour le quotidien en classe.',
    hero: 'Concentrez-vous sur la classe : l’appel, les notes et les échanges avec les familles sont simplifiés.',
    stat: '3×',
    statLabel: 'Plus rapide',
    pillars: [
      {
        icon: WifiOff,
        title: 'Présences hors ligne',
        text: 'Faites l’appel même sans réseau. Tout se synchronise automatiquement dès le retour de la connexion.',
      },
      {
        icon: BookOpen,
        title: 'Notes & évaluations',
        text: 'Saisissez les notes, appliquez les coefficients et publiez les résultats en quelques minutes.',
      },
      {
        icon: MessageCircle,
        title: 'Lien avec les familles',
        text: 'Informez les parents d’une absence, d’un devoir ou d’une observation sans multiplier les canaux.',
      },
      {
        icon: ClipboardCheck,
        title: 'Planning du jour',
        text: 'Cours, salles et classes à portée de main pour démarrer chaque séance sereinement.',
      },
    ],
    bullets: [
      'Interface légère sur smartphone et tablette',
      'Devoirs et ressources de cours',
      'Observations et suivi pédagogique',
      'Gain de temps sur les tâches répétitives',
    ],
  },
  {
    slug: 'parents',
    label: 'Parents',
    icon: Heart,
    title: 'Tout savoir, au bon moment.',
    body: 'Notes, absences, factures et messages de l’école dans un espace simple pour chaque enfant.',
    hero: 'Suivez la scolarité de vos enfants : présences, devoirs, notes et paiements, sans stress.',
    stat: '24/7',
    statLabel: 'Informés',
    pillars: [
      {
        icon: Bell,
        title: 'Présences & alertes',
        text: 'Recevez une confirmation ou une alerte dès qu’une absence ou un retard est enregistré.',
      },
      {
        icon: BookOpen,
        title: 'Devoirs & résultats',
        text: 'Consultez les devoirs à venir et les notes publiées pour chaque enfant.',
      },
      {
        icon: CircleDollarSign,
        title: 'Scolarité & paiements',
        text: 'Suivez les échéances, payez en Mobile Money et conservez vos reçus.',
      },
      {
        icon: Shield,
        title: 'Espace sécurisé',
        text: 'Un accès dédié aux tuteurs, avec multi-enfants et confidentialité respectée.',
      },
    ],
    bullets: [
      'Notifications SMS et push',
      'Vue claire par enfant',
      'Annonces de l’établissement',
      'Disponible sur mobile',
    ],
  },
];

export function getExperienceBySlug(slug: string | undefined): ExperienceDetail | undefined {
  return EXPERIENCES.find((e) => e.slug === slug);
}
