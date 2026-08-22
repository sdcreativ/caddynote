import { axe } from 'vitest-axe';
import type { RunOptions, AxeResults } from 'axe-core';

/**
 * UX-004 : aide de test d'accessibilité, partagée par tous les tests
 * `*.a11y.test.tsx`.
 *
 * La règle "color-contrast" est désactivée : elle a besoin d'un rendu réel
 * (calcul des couleurs effectivement peintes à l'écran), que jsdom ne
 * fournit pas — l'exécuter ici donnerait des résultats non fiables (faux
 * positifs/négatifs), pas une vérification honnête. Le contraste doit être
 * validé avec un outil de rendu réel (navigateur, Lighthouse...),
 * indisponible dans cet environnement — limite assumée et documentée dans
 * l'audit (§4.1 UX-004).
 */
export const checkA11y = (container: Element, options?: RunOptions): Promise<AxeResults> =>
  axe(container, {
    rules: { 'color-contrast': { enabled: false } },
    ...options,
  });
