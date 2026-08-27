import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SuperAdminNotificationsBell } from './SuperAdminNotificationsBell';

vi.mock('@/hooks/useStrkAuth', () => ({
  useStrkAuth: () => ({ user: { id: 'admin-1', role: 'admin' } }),
}));

const fetchContact = vi.fn();
const fetchUnread = vi.fn();

vi.mock('@/services/strkSupportService', () => ({
  fetchContactOpsMessages: (...args: unknown[]) => fetchContact(...args),
}));

vi.mock('@/services/strkNotificationService', () => ({
  fetchUnreadNotifications: (...args: unknown[]) => fetchUnread(...args),
  markNotificationAsRead: vi.fn(),
}));

describe('SuperAdminNotificationsBell', () => {
  beforeEach(() => {
    fetchContact.mockReset();
    fetchUnread.mockReset();
    fetchUnread.mockResolvedValue([]);
  });

  it('affiche le badge et l’aria « 1 demande de démo »', async () => {
    fetchContact.mockResolvedValue([
      {
        id: 'c1',
        name: 'Marie Kouassi',
        email: 'marie@example.test',
        subject: 'Demande de démonstration',
        message: 'Bonjour',
        status: 'new',
        convertedTicketId: null,
        createdAt: new Date().toISOString(),
      },
    ]);

    const onCount = vi.fn();
    render(
      <MemoryRouter>
        <SuperAdminNotificationsBell onDemoCountChange={onCount} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /1 demande/i })).toBeInTheDocument();
    });
    expect(onCount).toHaveBeenCalledWith(1);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
  });
});
