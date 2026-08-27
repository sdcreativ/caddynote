import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
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

/**
 * §7.3 P2 — a11y ciblée chrome Super Admin (navigation nommée).
 */
describe('SuperAdminSidebar a11y (§7)', () => {
  it(
    'expose une navigation accessible et les libellés i18n',
    () => {
      const { getByLabelText, getByRole } = render(
        <MemoryRouter>
          <SuperAdminSidebar activeSection="overview" onSectionChange={() => undefined} />
        </MemoryRouter>
      );
      expect(getByLabelText('Navigation ops plateforme')).toBeInTheDocument();
      expect(getByRole('button', { name: /Vue d'ensemble/i })).toBeInTheDocument();
      expect(getByRole('button', { name: /Support ops/i })).toBeInTheDocument();
    },
    30_000
  );
});
