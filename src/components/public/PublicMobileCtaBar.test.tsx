import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PublicMobileCtaBar } from './PublicMobileCtaBar';
import { checkA11y } from '@/test/a11y';

describe('PublicMobileCtaBar', () => {
  it('affiche Connexion et Démo sur les pages marketing', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <PublicMobileCtaBar />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Se connecter' })).toHaveAttribute('href', '/sign');
    expect(screen.getByRole('link', { name: /Demander une démo/i })).toBeInTheDocument();
    expect(await checkA11y(container)).toHaveNoViolations();
  });

  it('est masquée sur /sign', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/sign']}>
        <PublicMobileCtaBar />
      </MemoryRouter>
    );
    expect(container).toBeEmptyDOMElement();
  });
});
