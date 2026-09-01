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
  it('affiche les raccourcis élève à la place du CTA message unique', () => {
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

    expect(screen.getByRole('link', { name: /Emploi du temps/i })).toHaveAttribute('href', '/calendar');
    expect(screen.getByRole('link', { name: /^Cours$/i })).toHaveAttribute('href', '/my-courses');
    expect(screen.getByRole('link', { name: /^Notes$/i })).toHaveAttribute('href', '/my-grades');
    expect(screen.getByRole('link', { name: /^Absences$/i })).toHaveAttribute('href', '/my-absences');
    expect(screen.getByRole('link', { name: /^Devoirs$/i })).toHaveAttribute('href', '/assignments');
    expect(screen.getByRole('link', { name: /^Message$/i })).toHaveAttribute('href', '/messages');
    expect(screen.queryByRole('link', { name: /Envoyer un message/i })).not.toBeInTheDocument();
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
