import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PublicShell } from './PublicShell';
import { checkA11y } from '@/test/a11y';

describe('PublicShell (UX-004)', () => {
  it('expose un lien « Aller au contenu principal » et une cible #main-content', async () => {
    const { getByRole, container } = render(
      <MemoryRouter>
        <PublicShell>
          <main>
            <h1>Accueil</h1>
          </main>
        </PublicShell>
      </MemoryRouter>
    );
    const skip = getByRole('link', { name: 'Aller au contenu principal' });
    expect(skip).toHaveAttribute('href', '#main-content');
    expect(container.querySelector('#main-content')).not.toBeNull();

    const results = await checkA11y(container);
    expect(results).toHaveNoViolations();
  });
});
