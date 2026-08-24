import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ParentDashboardHome from './ParentDashboardHome';

vi.mock('@/lib/navConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/navConfig')>();
  return { ...actual, roleLabel: () => 'Famille' };
});

describe('ParentDashboardHome', () => {
  it('propose Voir mes enfants et les raccourcis essentiels', () => {
    render(
      <MemoryRouter>
        <ParentDashboardHome
          userName="Léa"
          childrenCount={2}
          invoicesOpen={1}
          unpaidCents={4500000}
          state="ready"
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /Bonjour, Léa/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Voir mes enfants/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /^Finances$/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /^Messages$/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /Calendrier/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);
  });

  it('affiche l’état vide sans enfants', () => {
    render(
      <MemoryRouter>
        <ParentDashboardHome
          userName="Léa"
          childrenCount={0}
          invoicesOpen={null}
          unpaidCents={null}
          state="empty"
        />
      </MemoryRouter>
    );
    expect(screen.getByText(/Aucun enfant lié/i)).toBeInTheDocument();
  });
});
