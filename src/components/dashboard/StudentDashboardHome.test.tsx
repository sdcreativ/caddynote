import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StudentDashboardHome from './StudentDashboardHome';

vi.mock('@/lib/navConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/navConfig')>();
  return { ...actual, roleLabel: () => 'Élève' };
});

describe('StudentDashboardHome (cockpit Accueil maquette)', () => {
  it('expose À traiter, KPI Notes/Devoirs/Absences et CTA quand il y a des devoirs', () => {
    render(
      <MemoryRouter>
        <StudentDashboardHome
          userName="Sam"
          grades={12}
          absences={1}
          homework={3}
          state="ready"
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /Bonjour, Sam/i })).toBeInTheDocument();
    expect(screen.getByText(/Élève/i)).toBeInTheDocument();
    expect(screen.getByText('À traiter')).toBeInTheDocument();
    expect(screen.getByText(/Priorités du jour/i)).toBeInTheDocument();
    expect(screen.getByText(/3 devoir\(s\) en cours/i)).toBeInTheDocument();
    expect(screen.getByText(/1 absence\(s\) sur 30 jours/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Traiter maintenant/i })).toHaveAttribute(
      'href',
      '/assignments'
    );

    expect(screen.getAllByText('Notes').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Devoirs').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Absences/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('12').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1);

    expect(screen.getByText(/Aller où/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Voir mes devoirs/i }).length).toBeGreaterThanOrEqual(1);
  });

  it('oriente le CTA vers les absences s’il n’y a pas de devoirs', () => {
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
    expect(screen.getAllByRole('button', { name: /Voir mes absences/i }).length).toBeGreaterThanOrEqual(
      1
    );
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

  it('affiche un empty calme et CTA notes sans devoirs ni absences', () => {
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
    expect(screen.getAllByText(/Aucune note pour l/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Aucun devoir en cours/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /^Mes notes$/i }).length).toBeGreaterThanOrEqual(1);
  });
});
