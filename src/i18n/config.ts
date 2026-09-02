import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import common from './locales/fr/common.json';
import publicHeader from './locales/fr/publicHeader.json';
import publicFooter from './locales/fr/publicFooter.json';
import auth from './locales/fr/auth.json';
import app from './locales/fr/app.json';
import nav from './locales/fr/nav.json';
import home from './locales/fr/home.json';
import about from './locales/fr/about.json';
import contact from './locales/fr/contact.json';
import help from './locales/fr/help.json';
import features from './locales/fr/features.json';
import experiences from './locales/fr/experiences.json';
import students from './locales/fr/students.json';
import profile from './locales/fr/profile.json';
import admissions from './locales/fr/admissions.json';
import finance from './locales/fr/finance.json';
import grades from './locales/fr/grades.json';
import exportNs from './locales/fr/export.json';
import attendance from './locales/fr/attendance.json';
import absences from './locales/fr/absences.json';
import classes from './locales/fr/classes.json';
import teachers from './locales/fr/teachers.json';
import subjects from './locales/fr/subjects.json';
import documents from './locales/fr/documents.json';
import communications from './locales/fr/communications.json';
import messages from './locales/fr/messages.json';
import settings from './locales/fr/settings.json';
import dashboard from './locales/fr/dashboard.json';
import users from './locales/fr/users.json';
import institutions from './locales/fr/institutions.json';
import calendar from './locales/fr/calendar.json';
import assignments from './locales/fr/assignments.json';
import followup from './locales/fr/followup.json';
import exports from './locales/fr/exports.json';
import teaching from './locales/fr/teaching.json';
import subscription from './locales/fr/subscription.json';
import support from './locales/fr/support.json';
import availability from './locales/fr/availability.json';
import audit from './locales/fr/audit.json';
import signatures from './locales/fr/signatures.json';
import services from './locales/fr/services.json';
import admin from './locales/fr/admin.json';
import notifications from './locales/fr/notifications.json';
import guides from './locales/fr/guides.json';
import superAdmin from './locales/fr/superAdmin.json';

/**
 * NFR-009 — architecture i18n, français initial. Jusqu'ici aucune librairie
 * d'internationalisation n'était présente : tous les textes de l'interface
 * (des centaines de composants) sont codés en dur en français directement
 * dans le JSX. Migrer l'intégralité de l'application est un chantier
 * mécanique de grande ampleur (chaque composant, un par un) — hors
 * périmètre raisonnable d'un seul passage : voir `docs/I18N.md` pour le
 * détail de ce qui est fait, ce qui reste, et comment poursuivre.
 *
 * Ce qui est livré ici est l'architecture réelle, pas une simulation :
 * - `i18next`/`react-i18next` (choix standard pour React, pas une solution
 *   maison à réinventer et maintenir) ;
 * - ressources organisées par namespace (un fichier JSON par domaine
 *   fonctionnel, pas un unique fichier fourre-tout qui deviendrait
 *   ingérable à mesure que la couverture grandit) ;
 * - une seule langue activée (`fr`) et déclarée comme telle
 *   (`supportedLngs`) — ajouter une langue plus tard ne demande qu'un
 *   nouveau dossier `locales/<code>/` avec les mêmes clés, aucun
 *   changement structurel ;
 * - le chrome public (`PublicHeader` / `PublicFooter`), le parcours
 *   d'authentification, le chrome authentifié (menus `navConfig` /
 *   `StrkSidebar` / `StrkNavbar`), les pages marketing (`home`, `about`,
 *   `contact`, `help`, catalogues `features` / `experiences`) et l'écran
 *   métier pilote Élèves (`students`) réellement migrés de bout en bout.
 */
export const defaultNS = 'common';

export const resources = {
  fr: {
    common,
    publicHeader,
    publicFooter,
    auth,
    app,
    nav,
    home,
    about,
    contact,
    help,
    features,
    experiences,
    students,
    profile,
    admissions,
    finance,
    grades,
    export: exportNs,
    attendance,
    absences,
    classes,
    teachers,
    subjects,
    documents,
    communications,
    messages,
    settings,
    dashboard,
    users,
    institutions,
    calendar,
    assignments,
    followup,
    exports,
    teaching,
    subscription,
    support,
    availability,
    audit,
    signatures,
    services,
    admin,
    notifications,
    guides,
    superAdmin,
  },
} as const;

i18n.use(initReactI18next).init({
  resources,
  lng: 'fr',
  fallbackLng: 'fr',
  supportedLngs: ['fr'],
  defaultNS,
  ns: Object.keys(resources.fr),
  interpolation: {
    // React échappe déjà les valeurs interpolées au rendu — l'échappement
    // fait ici en plus produirait des entités HTML doublées à l'affichage.
    escapeValue: false,
  },
  // Une clé manquante doit être immédiatement visible (la clé brute
  // s'affiche à l'écran) plutôt que silencieusement vide.
  returnNull: false,
  returnEmptyString: false,
});

/** Hors hook — primitives UI (Dialog / Sheet / Toast) après init. */
export function tCommon(key: string, options?: Record<string, unknown>): string {
  return String(i18n.t(key, { ns: 'common', ...options }));
}

export default i18n;
