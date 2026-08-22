import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/components/public/FadeIn', () => ({
  FadeIn: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Stagger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  StaggerItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { AboutContent } from './AboutContent';

/**
 * §6 — a11y ciblée page À propos (hiérarchie titres).
 * Suite axe : PublicShell / PublicHeader ; contraste : `npm run a11y:paint`.
 */
describe('AboutContent a11y (§6)', () => {
  it(
    'expose un titre principal h1',
    () => {
      const { getByRole } = render(
        <MemoryRouter>
          <AboutContent />
        </MemoryRouter>
      );
      expect(getByRole('heading', { level: 1 })).toBeInTheDocument();
    },
    30_000
  );
});
