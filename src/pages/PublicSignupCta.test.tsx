import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import FeatureDetailPage from '@/pages/FeatureDetailPage';
import ExperienceDetailPage from '@/pages/ExperienceDetailPage';
import { PresentationVideoModal } from '@/components/public/PresentationVideoModal';

describe('CTA publics vers /signup', () => {
  it('propose « Obtenir un compte » sur une page fonctionnalité', () => {
    render(
      <MemoryRouter initialEntries={['/fonctionnalites/presences']}>
        <Routes>
          <Route path="/fonctionnalites/:slug" element={<FeatureDetailPage />} />
        </Routes>
      </MemoryRouter>
    );
    const signupLinks = screen.getAllByRole('link', { name: 'Obtenir un compte' });
    expect(signupLinks.length).toBeGreaterThan(0);
    expect(signupLinks.every((el) => el.getAttribute('href') === '/signup')).toBe(true);
    expect(screen.queryAllByRole('link', { name: /essai gratuit|créer un compte/i })).toHaveLength(0);
  });

  it('propose « Obtenir un compte » sur une page expérience', () => {
    render(
      <MemoryRouter initialEntries={['/experiences/directions']}>
        <Routes>
          <Route path="/experiences/:slug" element={<ExperienceDetailPage />} />
        </Routes>
      </MemoryRouter>
    );
    const signupLinks = screen.getAllByRole('link', { name: 'Obtenir un compte' });
    expect(signupLinks.length).toBeGreaterThan(0);
    expect(signupLinks.every((el) => el.getAttribute('href') === '/signup')).toBe(true);
    expect(screen.queryAllByRole('link', { name: /essai gratuit|créer un compte/i })).toHaveLength(0);
  });

  it('propose « Obtenir un compte » dans la modal vidéo', () => {
    render(
      <MemoryRouter>
        <PresentationVideoModal open onOpenChange={() => {}} />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: 'Obtenir un compte' })).toHaveAttribute('href', '/signup');
    expect(screen.queryAllByRole('link', { name: /essai gratuit/i })).toHaveLength(0);
  });
});
