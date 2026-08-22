import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PublicHeader } from './PublicHeader';
import { PublicFooter } from './PublicFooter';
import { checkA11y } from '@/test/a11y';

// UX-004 : en-tête et pied de page publics, présents sur toutes les pages
// marketing (accueil, à propos, contact, aide, tarifs) — leur régression
// impacte donc chaque visite d'un utilisateur non connecté.
describe('PublicHeader (UX-004)', () => {
  it("n'a aucune violation d'accessibilité détectable (hors contraste, cf. lib/a11y.ts)", async () => {
    const { container } = render(
      <MemoryRouter>
        <PublicHeader />
      </MemoryRouter>
    );
    const results = await checkA11y(container);
    expect(results).toHaveNoViolations();
  });

  it('le menu mobile est un bouton nommé, accessible au clavier', () => {
    const { getByRole } = render(
      <MemoryRouter>
        <PublicHeader />
      </MemoryRouter>
    );
    // NFR-009 : nom exact (pas juste /menu/i) — une clé i18n non résolue
    // (ex. "ariaMenu" au lieu de "Menu") contiendrait aussi "menu" et
    // passerait ce test par coïncidence sans que la traduction soit réelle.
    const menuButton = getByRole('button', { name: 'Menu' });
    expect(menuButton).toBeInTheDocument();
    expect(menuButton.tagName).toBe('BUTTON'); // focusable/activable au clavier nativement
  });
});

describe('PublicFooter (UX-004)', () => {
  it("n'a aucune violation d'accessibilité détectable", async () => {
    const { container } = render(
      <MemoryRouter>
        <PublicFooter />
      </MemoryRouter>
    );
    const results = await checkA11y(container);
    expect(results).toHaveNoViolations();
  });
});
