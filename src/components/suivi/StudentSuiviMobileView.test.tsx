import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StudentSuiviMobileView } from './StudentSuiviMobileView';

vi.mock('@/hooks/useResolvedStoredUrl', () => ({
  useResolvedStoredUrl: () => null,
}));

vi.mock('@/hooks/useMobileShell', () => ({
  useMobileShell: () => ({ openMoreMenu: vi.fn() }),
}));

describe('StudentSuiviMobileView', () => {
  it('affiche la grille de raccourcis élève sans Message ni mini À traiter', () => {
    render(
      <MemoryRouter>
        <StudentSuiviMobileView
          headerTitle="Suivi de Esmone"
          firstName="Esmone"
          lastName="GNONZION"
          className="6e"
          absences={[]}
          actionsMode="student"
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: /Emploi du temps/i })).toHaveAttribute(
      'href',
      '/calendar'
    );
    expect(screen.getByText(/Horaires & salles/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Matières/i })).toHaveAttribute('href', '/my-courses');
    expect(screen.getByText(/Cours & contenus/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Notes$/i })).toHaveAttribute('href', '/my-grades');
    expect(screen.getByRole('link', { name: /^Absences$/i })).toHaveAttribute(
      'href',
      '/my-absences'
    );
    expect(screen.getByRole('link', { name: /^Devoirs$/i })).toHaveAttribute(
      'href',
      '/assignments'
    );
    expect(screen.queryByRole('link', { name: /^Message$/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/devoir\(s\) en cours/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('À traiter')).not.toBeInTheDocument();
  });

  it('conserve le CTA message pour le mode parent', () => {
    render(
      <MemoryRouter>
        <StudentSuiviMobileView
          headerTitle="Suivi de Esmone"
          firstName="Esmone"
          lastName="GNONZION"
          absences={[]}
          actionsMode="message"
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: /Envoyer un message/i })).toHaveAttribute(
      'href',
      '/messages'
    );
    expect(screen.queryByRole('link', { name: /Emploi du temps/i })).not.toBeInTheDocument();
  });
});
