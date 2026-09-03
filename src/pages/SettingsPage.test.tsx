import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SettingsPage from './SettingsPage';

const authState = vi.hoisted(() => ({
  user: {
    id: 'u1',
    role: 'parent' as string,
    institutionId: 'inst1' as string | null,
  },
}));

vi.mock('@/hooks/useStrkAuth', () => ({
  useStrkAuth: () => ({ user: authState.user }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/services/strkSettingsService', () => ({
  StrkSettingsService: {
    getSystemSettings: vi.fn().mockResolvedValue({}),
    updateSystemSettings: vi.fn(),
    getAttendanceSettings: vi.fn().mockResolvedValue({}),
    updateAttendanceSettings: vi.fn(),
  },
}));

vi.mock('@/services/strkGradingScaleService', () => ({
  fetchGradingScales: vi.fn().mockResolvedValue([]),
  createGradingScale: vi.fn(),
  deleteGradingScale: vi.fn(),
}));

vi.mock('@/components/settings/CommunicationPreferencesPanel', () => ({
  CommunicationPreferencesPanel: () => <div>Préférences com</div>,
}));

vi.mock('@/components/settings/WebPushOptIn', () => ({
  WebPushOptIn: () => <div>Web push</div>,
}));

vi.mock('@/components/admin/QuotasAndFlagsPanel', () => ({
  QuotasAndFlagsPanel: () => <div>Quotas</div>,
}));

vi.mock('@/components/settings/SessionsPanel', () => ({
  SessionsPanel: () => <div>Sessions panel</div>,
}));

describe('SettingsPage (sécurité compte → Profil)', () => {
  beforeEach(() => {
    authState.user = {
      id: 'u1',
      role: 'parent',
      institutionId: 'inst1',
    };
  });

  it('renvoie vers Profil pour 2FA/sessions et n’expose plus l’onglet Sécurité', () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Compte & sécurité')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ouvrir mon profil/i })).toHaveAttribute('href', '/profile');
    expect(screen.queryByRole('tab', { name: 'Sécurité' })).not.toBeInTheDocument();
    expect(screen.queryByText('Sessions panel')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('Direction : outils audit/exports sans onglet Sécurité doublon', () => {
    authState.user = { id: 'u1', role: 'school_admin', institutionId: 'inst1' };
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );

    expect(screen.queryByRole('tab', { name: 'Sécurité' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Journal d’audit/i })).toHaveAttribute('href', '/audit-log');
    expect(screen.getByRole('tab', { name: 'Établissement' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Pédagogie' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Notifications' })).toBeInTheDocument();
  });
});
