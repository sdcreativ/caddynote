import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PublicMobileCtaBar } from './PublicMobileCtaBar';
import { checkA11y } from '@/test/a11y';

describe('PublicMobileCtaBar', () => {
  it('affiche Connexion (icône) et Démo sur les pages marketing', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <PublicMobileCtaBar />
      </MemoryRouter>
    );

    const login = screen.getByRole('link', { name: 'Se connecter' });
    expect(login).toHaveAttribute('href', '/sign');
    expect(login.querySelector('svg')).toBeTruthy();
    expect(login).not.toHaveTextContent('Se connecter');

    const demo = screen.getByRole('link', { name: /Demander une démo/i });
    expect(demo).toBeInTheDocument();
    expect(demo).toHaveAttribute('href', expect.stringContaining('/contact'));
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
