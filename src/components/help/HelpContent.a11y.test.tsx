import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelpContent } from './HelpContent';
import { checkA11y } from '@/test/a11y';

// Lot 12 / UX-004 : page d'aide publique (FAQ + liens vers les guides).
describe('HelpContent (UX-004)', () => {
  it("n'a aucune violation d'accessibilité détectable (hors contraste)", async () => {
    const { container } = render(
      <MemoryRouter>
        <HelpContent />
      </MemoryRouter>
    );
    const results = await checkA11y(container);
    expect(results).toHaveNoViolations();
  });

  it('pointe vers les guides réellement routés, pas vers des PDF absents', () => {
    const { getAllByRole, queryByRole } = render(
      <MemoryRouter>
        <HelpContent />
      </MemoryRouter>
    );
    const consultLinks = getAllByRole('link', { name: /consulter/i });
    expect(consultLinks.length).toBeGreaterThanOrEqual(5);
    expect(consultLinks.map((a) => a.getAttribute('href'))).toEqual(
      expect.arrayContaining([
        '/aide/guide-ecoles',
        '/aide/guide-admin',
        '/aide/guide-enseignants',
        '/aide/guide-etudiants',
        '/aide/guide-parents',
      ])
    );
    expect(queryByRole('link', { name: /^PDF$/i })).toBeNull();
  });
});
