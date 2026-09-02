import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ParentDashboardHome from './ParentDashboardHome';

vi.mock('@/lib/navConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/navConfig')>();
  return { ...actual, roleLabel: () => 'Famille' };
});

vi.mock('@/services/strkAdmissionService', () => ({
  fetchMyAdmissionApplications: vi.fn().mockResolvedValue({ applications: [] }),
}));

describe('ParentDashboardHome (Accueil = triage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('expose À traiter et un CTA vers Mes enfants, sans grille KPI/raccourcis', async () => {
    render(
      <MemoryRouter>
        <ParentDashboardHome
          userName="Léa"
          childrenCount={2}
          invoicesOpen={0}
          unpaidCents={0}
          unjustifiedAbsences={0}
          selectedChildName="Awa Koné"
          state="ready"
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /(?:Bonjour|Bonsoir), Léa/i })).toBeInTheDocument();
    expect(screen.getByText(/Enfant : Awa Koné/i)).toBeInTheDocument();
    expect(screen.getByText('À traiter')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/Rien à traiter aujourd/i)).toBeInTheDocument();
    });

    expect(screen.getAllByRole('button', { name: /Voir mes enfants/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: /^Mes enfants$/i })).toBeInTheDocument();
    // Plus de grille Mes enfants / Absences / Notes / Finances / Messages / EDT
    expect(screen.queryByRole('button', { name: /^Absences$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Notes$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Finances$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Messages$/i })).not.toBeInTheDocument();
  });

  it('oriente le CTA vers les finances s’il y a un reste à payer', async () => {
    render(
      <MemoryRouter>
        <ParentDashboardHome
          userName="Léa"
          childrenCount={2}
          invoicesOpen={1}
          unpaidCents={4500000}
          unjustifiedAbsences={2}
          state="ready"
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/facture\(s\)/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/2 absence\(s\) à justifier/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Régler les frais/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('link', { name: /Traiter maintenant/i })).toHaveAttribute(
      'href',
      '/my-children?tab=finance'
    );
  });

  it('oriente le CTA vers les absences s’il n’y a pas d’impayé', async () => {
    render(
      <MemoryRouter>
        <ParentDashboardHome
          userName="Léa"
          childrenCount={1}
          invoicesOpen={0}
          unpaidCents={0}
          unjustifiedAbsences={3}
          state="ready"
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/3 absence\(s\) à justifier/i)).toBeInTheDocument();
    });
    expect(screen.getAllByRole('button', { name: /Justifier les absences/i }).length).toBeGreaterThanOrEqual(
      1
    );
    expect(screen.getByRole('link', { name: /Traiter maintenant/i })).toHaveAttribute(
      'href',
      '/my-children?tab=attendance'
    );
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
