import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { checkA11y } from '@/test/a11y';

vi.mock('@/hooks/useStrkAuth', () => ({
  useStrkAuth: () => ({
    user: {
      id: 'u1',
      name: 'Ada Lovelace',
      role: 'teacher',
      email: 'ada@test.caddynote',
    },
    logout: vi.fn(),
  }),
}));

vi.mock('@/lib/navConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/navConfig')>();
  return { ...actual, isSchoolShellRole: () => false };
});

import StrkNavbar from './StrkNavbar';

describe('StrkNavbar (UX-004)', () => {
  it('nomme le menu compte et respecte les cibles 44px des icônes', async () => {
    const { container } = render(
      <MemoryRouter>
        <StrkNavbar onToggleSidebar={() => {}} />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: 'Menu compte' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Messages' }).className).toMatch(/\bh-11\b/);
    expect(screen.getByRole('button', { name: 'Notifications' }).className).toMatch(/\bh-11\b/);

    expect(await checkA11y(container)).toHaveNoViolations();
  });
});
