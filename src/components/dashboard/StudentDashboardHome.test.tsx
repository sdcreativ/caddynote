import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StudentDashboardHome from './StudentDashboardHome';

vi.mock('@/lib/navConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/navConfig')>();
  return { ...actual, roleLabel: () => 'Élève' };
});

describe('StudentDashboardHome (cockpit deux clics)', () => {
  it('expose À traiter, KPI et CTA + raccourcis quand il y a des devoirs', () => {
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
    expect(screen.getByText('À traiter')).toBeInTheDocument();
    expect(screen.getByText(/3 devoir\(s\) en cours/i)).toBeInTheDocument();
    expect(screen.getByText(/1 absence\(s\) sur 30 jours/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Traiter maintenant/i })).toHaveAttribute(
      'href',
      '/assignments'
    );

    expect(screen.getAllByText('12').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1);

    expect(screen.getAllByRole('button', { name: /Voir mes devoirs/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /Mes notes/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /^Devoirs$/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /^Absences$/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /^Messages$/i }).length).toBeGreaterThanOrEqual(1);
  });

  it('affiche un empty calme et CTA notes sans devoirs ni absences', () => {
    render(
      <MemoryRouter>
        <StudentDashboardHome
          userName="Sam"
          grades={8}
          absences={0}
          homework={0}
          state="ready"
        />
      </MemoryRouter>
    );

    expect(screen.getByText(/Rien à traiter aujourd/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Traiter maintenant/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Mes notes$/i }).length).toBeGreaterThanOrEqual(1);
  });
});
