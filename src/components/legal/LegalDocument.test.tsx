import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LegalDocument } from './LegalDocument';

describe('LegalDocument', () => {
  it('affiche les mentions légales et le lien vers la confidentialité', () => {
    render(
      <MemoryRouter>
        <LegalDocument kind="notice" />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Mentions légales' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'politique de confidentialité' })).toHaveAttribute(
      'href',
      '/confidentialite'
    );
  });

  it('affiche la politique de confidentialité et le lien vers les mentions', () => {
    render(
      <MemoryRouter>
        <LegalDocument kind="privacy" />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Politique de confidentialité' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'mentions légales' })).toHaveAttribute('href', '/mentions-legales');
  });
});
