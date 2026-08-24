import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StudentDashboardHome from './StudentDashboardHome';

vi.mock('@/lib/navConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/navConfig')>();
  return { ...actual, roleLabel: () => 'Élève' };
});

describe('StudentDashboardHome', () => {
  it('propose Mes notes et les raccourcis essentiels', () => {
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
    expect(screen.getAllByRole('button', { name: /Mes notes/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /^Devoirs$/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /^Absences$/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /^Messages$/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('12').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1);
  });
});
