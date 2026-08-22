import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import 'vitest-axe/extend-expect';
// NFR-009 : `main.tsx` initialise i18next avant le premier rendu, mais aucun
// test ne passe par `main.tsx` — sans cet import ici, un composant utilisant
// `useTranslation()` dans un test affiche la clé brute (ex. "ariaMenu") au
// lieu de la vraie traduction, ce qu'un test comme
// `PublicHeader.a11y.test.tsx` (qui cherche un bouton nommé « menu ») ne
// détecte pas forcément — "ariaMenu" contient "menu" par coïncidence.
import '@/i18n/config';

// `globals: false` (vitest.config.ts) signifie que le nettoyage automatique
// de @testing-library/react (qui s'accroche au `afterEach` global s'il
// existe) ne se déclenche jamais : un composant rendu par un test reste
// monté dans le `document` pour les tests suivants du même fichier. Sans
// filet, un fichier qui appelle `render()` plusieurs fois (p. ex. plusieurs
// `it()`, ou plusieurs rendus dans un même test) voit ses requêtes
// `getByRole`/`getByText` etc. remonter des doublons hérités des rendus
// précédents. On l'enregistre explicitement ici pour tous les fichiers.
afterEach(() => {
  cleanup();
});

// Node 22+ expose un `localStorage` natif global qui, sans l'option
// `--localstorage-file=<chemin>`, existe mais n'implémente aucune méthode
// (avertissement au démarrage). jsdom hérite de ce global cassé au lieu d'en
// créer un vrai pour `window`, ce qui casse silencieusement tout code
// dépendant de `window.localStorage` (dont `src/lib/apiClient.ts`). On le
// remplace ici par une implémentation en mémoire, avant que les tests
// s'exécutent.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

for (const target of new Set([globalThis, typeof window !== 'undefined' ? window : undefined])) {
  if (!target) continue;
  Object.defineProperty(target, 'localStorage', {
    value: new MemoryStorage(),
    writable: true,
    configurable: true,
  });
}

// jsdom n'implémente pas `IntersectionObserver` — `FadeIn`/`Stagger`
// (src/components/public/FadeIn.tsx) s'en servent via `whileInView` de
// framer-motion pour l'entrée en fondu au scroll des pages publiques.
// Sans ce stub, tout composant qui les utilise (Index, AboutContent,
// HelpContent, les guides...) fait planter React en test avec
// "ReferenceError: IntersectionObserver is not defined" dès qu'un test le
// monte — trouvé en ajoutant l'animation à `HelpContent`, dont le test
// d'accessibilité existait déjà. Un stub minimal (jamais vraiment
// déclenché en test, `whileInView` reste simplement dans son état
// `initial`) suffit : ces tests vérifient l'accessibilité/le contenu, pas
// le comportement de scroll réel.
class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

for (const target of new Set([globalThis, typeof window !== 'undefined' ? window : undefined])) {
  if (!target) continue;
  Object.defineProperty(target, 'IntersectionObserver', {
    value: MockIntersectionObserver,
    writable: true,
    configurable: true,
  });
}
