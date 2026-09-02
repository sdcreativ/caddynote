import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StudentDashboardHome from './StudentDashboardHome';

vi.mock('@/lib/navConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/navConfig')>();
  return { ...actual, roleLabel: () => 'Élève' };
});

describe('StudentDashboardHome (Accueil = triage)', () => {
  it('affiche Bonsoir le soir', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T21:24:00'));
    render(
      <MemoryRouter>
        <StudentDashboardHome
          userName="Esmone"
          firstName="Esmone"
          lastName="GNONZION"
          className="6e"
          grades={0}
          absences={0}
          homework={0}
          absencesToday={[]}
          state="ready"
        />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: /Bonsoir, Esmone/i })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('expose À traiter sans photo/présence ni KPI', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T10:00:00'));
    render(
      <MemoryRouter>
        <StudentDashboardHome
          userName="Sam"
          firstName="Sam"
          lastName="Diallo"
          className="CM1 A"
          grades={12}
          absences={1}
          homework={3}
          absencesToday={[]}
          state="ready"
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /Bonjour, Sam/i })).toBeInTheDocument();
    expect(screen.getAllByText('À traiter').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/3 devoir\(s\) en cours/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ouvrir mon suivi/i })).toHaveAttribute(
      'href',
      '/my-suivi'
    );
    // Présence / identité → Suivi uniquement
    expect(screen.queryByText('Sam Diallo')).not.toBeInTheDocument();
    expect(screen.queryByText('CM1 A')).not.toBeInTheDocument();
    expect(screen.queryByText('Présence confirmée')).not.toBeInTheDocument();
    expect(screen.queryByTestId('student-accueil-kpis')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('oriente vers les absences depuis À traiter s’il n’y a pas de devoirs', () => {
    render(
      <MemoryRouter>
        <StudentDashboardHome
          userName="Sam"
          grades={8}
          absences={2}
          homework={0}
          state="ready"
        />
      </MemoryRouter>
    );

    expect(screen.getByText(/2 absence\(s\) sur 30 jours/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Traiter maintenant/i })).toHaveAttribute(
      'href',
      '/my-absences'
    );
  });

  it('ajoute les messages non lus dans À traiter', () => {
    render(
      <MemoryRouter>
        <StudentDashboardHome
          userName="Sam"
          grades={2}
          absences={0}
          homework={0}
          unreadMessages={4}
          state="ready"
        />
      </MemoryRouter>
    );

    expect(screen.getByText(/4 message\(s\) non lu\(s\)/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Traiter maintenant/i })).toHaveAttribute(
      'href',
      '/messages'
    );
  });

  it('affiche un empty calme sans devoirs ni absences', () => {
    render(
      <MemoryRouter>
        <StudentDashboardHome
          userName="Sam"
          grades={0}
          absences={0}
          homework={0}
          state="ready"
        />
      </MemoryRouter>
    );

    expect(screen.getByText(/Rien à traiter aujourd/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Traiter maintenant/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Aucune note pour l/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Aucun devoir en cours/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Aller où/i)).not.toBeInTheDocument();
  });
});
