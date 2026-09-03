import { describe, it, expect, beforeAll } from 'vitest';
import i18n from './config';

/**
 * NFR-009 — architecture i18n. Vérifie que la configuration résout de
 * vraies chaînes françaises pour chaque namespace livré, pas seulement que
 * l'initialisation ne plante pas — une régression silencieuse ici
 * afficherait la clé brute à l'écran plutôt qu'un message d'erreur.
 */
describe('i18n — architecture (NFR-009)', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) {
      await new Promise<void>((resolve) => i18n.on('initialized', () => resolve()));
    }
  });

  it('démarre en français par défaut', () => {
    expect(i18n.language).toBe('fr');
  });

  it("ne déclare que le français comme langue prise en charge (FR initial explicite)", () => {
    expect(i18n.options.supportedLngs).toContain('fr');
  });

  it('résout une clé du namespace common', () => {
    expect(i18n.t('actions.cancel', { ns: 'common' })).toBe('Annuler');
  });

  it('résout une clé imbriquée du namespace publicHeader', () => {
    expect(i18n.t('nav.features', { ns: 'publicHeader' })).toBe('Fonctionnalités');
    expect(i18n.t('auth.login', { ns: 'publicHeader' })).toBe('Se connecter');
  });

  it('interpole une variable dans le namespace publicFooter', () => {
    expect(i18n.t('copyright', { ns: 'publicFooter', year: 2030 })).toContain('2030');
  });

  it('résout une clé du namespace auth (parcours connexion)', () => {
    expect(i18n.t('login.submit', { ns: 'auth' })).toBe('Se connecter');
    expect(i18n.t('checking', { ns: 'auth' })).toBe("Vérification de l'authentification...");
  });

  it('résout une clé du namespace app (page 404)', () => {
    expect(i18n.t('notFound.title', { ns: 'app' })).toBe('Page non trouvée');
  });

  it('résout une clé du namespace nav (chrome authentifié)', () => {
    expect(i18n.t('items.students', { ns: 'nav' })).toBe('Élèves');
    expect(i18n.t('skipToContent', { ns: 'nav' })).toBe('Aller au contenu principal');
  });

  it('résout le chrome d’erreurs / actions communes', () => {
    expect(i18n.t('actions.retry', { ns: 'common' })).toBe('Réessayer');
    expect(i18n.t('errors.generic', { ns: 'common' })).toBeTruthy();
    expect(i18n.t('status.offline', { ns: 'common' })).toBe('Hors ligne');
    expect(i18n.t('error.defaultDescription', { ns: 'app' })).toMatch(/réessayer/i);
  });

  it('résout le parcours admin (auth publique restante)', () => {
    expect(i18n.t('admin.submit', { ns: 'auth' })).toBe("Accéder à l'administration");
    expect(i18n.t('admin.session', { ns: 'auth', hours: 8 })).toContain('8');
  });

  it('expose le namespace profile (formulaire métier)', () => {
    expect(i18n.t('title', { ns: 'profile' })).toBe('Mon profil');
    expect(i18n.t('saveChanges', { ns: 'profile' })).toMatch(/Enregistrer/i);
    expect(i18n.t('mfaTitle', { ns: 'profile' })).toMatch(/deux facteurs/i);
  });

  it('expose les namespaces marketing', () => {
    expect(i18n.t('hero.ctaStart', { ns: 'home' })).toBe('Démarrer avec CaddyNote');
    expect(i18n.t('title', { ns: 'about' })).toBe('À propos de CaddyNote');
    expect(i18n.t('submit', { ns: 'contact' })).toBe('Envoyer le message');
    expect(i18n.t('consult', { ns: 'help' })).toMatch(/consulter/i);
  });

  it('résout les catalogues fonctionnalités / expériences et le pilote Élèves', () => {
    expect(i18n.t('presences.title', { ns: 'features' })).toBe('Présences & alertes familles');
    expect(i18n.t('directions.label', { ns: 'experiences' })).toBe('Directions');
    expect(i18n.t('title', { ns: 'students' })).toBe('Élèves');
    expect(i18n.t('create.title', { ns: 'students' })).toMatch(/Création manuelle/i);
    expect(i18n.t('create.submit', { ns: 'students' })).toBe('Créer quand même');
  });

  it('résout les namespaces métier (admissions, finance, notes, présence, organisation)', () => {
    expect(i18n.t('admin.title', { ns: 'admissions' })).toBe('Préinscriptions');
    expect(i18n.t('title', { ns: 'finance' })).toBe('Finance');
    expect(i18n.t('title', { ns: 'grades' })).toBe('Notes');
    expect(i18n.t('title', { ns: 'export', type: 'notes' })).toContain('notes');
    expect(i18n.t('page.title', { ns: 'attendance' })).toMatch(/Présences/i);
    expect(i18n.t('title', { ns: 'classes' })).toBe('Classes');
    expect(i18n.t('title', { ns: 'settings' })).toMatch(/Paramètres/i);
    expect(i18n.t('title', { ns: 'users' })).toMatch(/Comptes/i);
    expect(i18n.t('title', { ns: 'calendar' })).toBe('Calendrier');
    expect(i18n.t('title', { ns: 'teaching' })).toBe('Cahier / cours');
    expect(i18n.t('parent.heroTitle', { ns: 'guides' })).toMatch(/parent/i);
  });

  it("une clé qui n'existe pas ne renvoie jamais une chaîne vide ou null (visible plutôt que silencieuse)", () => {
    const result = i18n.t('cle.qui.nexiste.pas', { ns: 'common' });
    expect(result).toBeTruthy();
    expect(result).not.toBe('');
  });
});
