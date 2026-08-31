import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/hooks/useStrkAuth', () => ({
  useStrkAuth: () => ({
    user: { email: 'ops@example.test', role: 'admin' },
    logout: vi.fn(),
  }),
}));

vi.mock('@/hooks/usePlatformPermissions', () => ({
  usePlatformPermissions: () => ({
    loading: false,
    roleCodes: [],
    permissions: [],
    legacyFullAccess: true,
    hasPermission: () => true,
    canSeeSection: () => true,
    reload: vi.fn(),
  }),
}));

import SuperAdminSidebar from './SuperAdminSidebar';
import SuperAdminMobileBottomNav from './SuperAdminMobileBottomNav';

describe('SuperAdmin mobile RWD (P0+P1)', () => {
  const originalInnerWidth = window.innerWidth;

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 390,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: originalInnerWidth,
    });
  });

  it('cache le drawer hors écran lorsqu’il est fermé', () => {
    const { container } = render(
      <MemoryRouter>
        <SuperAdminSidebar
          activeSection="overview"
          onSectionChange={() => undefined}
          isOpen={false}
          onClose={() => undefined}
        />
      </MemoryRouter>
    );
    const aside = container.querySelector('aside');
    expect(aside?.className).toContain('-translate-x-full');
    expect(aside?.className).not.toMatch(/(?:^|\s)translate-x-0(?:\s|$)/);
  });

  it('affiche le drawer et un overlay lorsqu’il est ouvert', () => {
    const onClose = vi.fn();
    const { container } = render(
      <MemoryRouter>
        <SuperAdminSidebar
          activeSection="overview"
          onSectionChange={() => undefined}
          isOpen
          onClose={onClose}
        />
      </MemoryRouter>
    );
    const aside = container.querySelector('aside');
    expect(aside?.className).toContain('translate-x-0');
    expect(screen.getByLabelText('Fermer le menu')).toBeInTheDocument();
    const overlay = container.querySelector('.fixed.inset-0.z-40');
    expect(overlay).toBeTruthy();
    fireEvent.click(overlay!);
    expect(onClose).toHaveBeenCalled();
  });

  it('ferme le drawer après sélection d’une section sur mobile', () => {
    const onClose = vi.fn();
    const onSectionChange = vi.fn();
    render(
      <MemoryRouter>
        <SuperAdminSidebar
          activeSection="overview"
          onSectionChange={onSectionChange}
          isOpen
          onClose={onClose}
        />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /Support ops/i }));
    expect(onSectionChange).toHaveBeenCalledWith('support-ops');
    expect(onClose).toHaveBeenCalled();
  });

  it('expose la bottom nav ops avec Plus', () => {
    const onOpenMore = vi.fn();
    const onSectionChange = vi.fn();
    render(
      <SuperAdminMobileBottomNav
        activeSection="overview"
        onSectionChange={onSectionChange}
        onOpenMore={onOpenMore}
      />
    );
    expect(screen.getByLabelText('Navigation ops rapide')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Plus$/i }));
    expect(onOpenMore).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Établissements/i }));
    expect(onSectionChange).toHaveBeenCalledWith('institutions');
  });
});
