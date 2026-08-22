import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { X } from 'lucide-react';
import { Button } from './button';
import { checkA11y } from '@/test/a11y';

// UX-004 : garde-fou de non-régression pour le motif le plus répandu de
// violation trouvé dans l'audit du 15/08/2026 — un bouton icône seule
// (`size="icon"`) sans nom accessible (26 occurrences corrigées dans 14
// fichiers). `axe` doit détecter l'un et laisser passer l'autre : sinon
// cette suite ne protégerait de rien.
describe('Button — bouton icône seule (UX-004)', () => {
  it('signale un bouton icône sans nom accessible', async () => {
    const { container } = render(
      <Button variant="ghost" size="icon">
        <X className="h-4 w-4" />
      </Button>
    );
    const results = await checkA11y(container);
    expect(results.violations.some((v) => v.id === 'button-name')).toBe(true);
  });

  it("n'a aucune violation une fois un aria-label posé", async () => {
    const { container } = render(
      <Button variant="ghost" size="icon" aria-label="Fermer">
        <X className="h-4 w-4" />
      </Button>
    );
    const results = await checkA11y(container);
    expect(results).toHaveNoViolations();
  });
});

// UX-004 : garde-fou de non-régression sur la cible tactile 44px (décision
// utilisateur du 15/08/2026 — `default` et `icon` doivent l'atteindre ;
// `sm` reste une exception assumée pour les contextes denses desktop).
// jsdom ne fait pas de layout réel : on vérifie les classes Tailwind
// porteuses de la hauteur/largeur plutôt qu'un `getBoundingClientRect`,
// qui renverrait toujours 0 ici.
describe('Button — cible tactile 44px (UX-004)', () => {
  it('size="default" fait au moins 44px de haut (h-11)', () => {
    const { container } = render(<Button>Valider</Button>);
    expect(container.querySelector('button')?.className).toMatch(/\bh-11\b/);
  });

  it('size="icon" fait au moins 44px de haut et de large (h-11 w-11)', () => {
    const { container } = render(
      <Button size="icon" aria-label="Fermer">
        <X className="h-4 w-4" />
      </Button>
    );
    const classes = container.querySelector('button')?.className ?? '';
    expect(classes).toMatch(/\bh-11\b/);
    expect(classes).toMatch(/\bw-11\b/);
  });
});
