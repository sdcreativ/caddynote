import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AccountantDashboardHome from './AccountantDashboardHome';

vi.mock('@/lib/navConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/navConfig')>();
  return { ...actual, roleLabel: () => 'Comptable' };
});

describe('AccountantDashboardHome', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T10:00:00'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('expose À traiter finance et CTA finances', () => {
    render(
      <MemoryRouter>
        <AccountantDashboardHome
          userName="Nora"
          invoicesOpen={2}
          unpaidCents={1_200_000}
          state="ready"
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /Bonjour, Nora/i })).toBeInTheDocument();
    expect(screen.getByText(/facture\(s\)/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Ouvrir les finances/i }).length).toBeGreaterThanOrEqual(
      1
    );
    expect(screen.getByRole('link', { name: /Traiter maintenant/i })).toHaveAttribute('href', '/finance');
  });
});
