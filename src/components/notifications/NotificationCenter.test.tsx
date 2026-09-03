import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotificationCenter } from './NotificationCenter';

const { fetchNotifications, markNotificationAsRead, markAllNotificationsAsRead, toast } = vi.hoisted(
  () => ({
    fetchNotifications: vi.fn(),
    markNotificationAsRead: vi.fn(),
    markAllNotificationsAsRead: vi.fn(),
    toast: vi.fn(),
  })
);

vi.mock('@/services/strkNotificationService', () => ({
  fetchNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
}));

describe('NotificationCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiche une erreur honnête avec nouvel essai si le chargement échoue', async () => {
    fetchNotifications.mockImplementation(() => Promise.reject(new Error('network')));

    render(
      <MemoryRouter>
        <NotificationCenter userId="u1" />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/Impossible de charger les notifications/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /R[ée]essayer/i })).toBeInTheDocument();

    fetchNotifications.mockImplementation(() => Promise.resolve([]));
    fireEvent.click(screen.getByRole('button', { name: /R[ée]essayer/i }));
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByText(/Aucune notification non lue/i)).toBeInTheDocument();
    });
  });

  it('marque comme lu via read=true (plus via read_at)', async () => {
    fetchNotifications.mockResolvedValue([
      {
        id: 'n1',
        userId: 'u1',
        title: 'Facture',
        message: 'À régler',
        type: 'info',
        read: false,
        actionUrl: '/my-children?tab=finance',
        createdAt: '2026-09-03T10:00:00.000Z',
      },
    ]);
    markNotificationAsRead.mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <NotificationCenter userId="u1" />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Facture')).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: /Voir/i })).toHaveAttribute(
      'href',
      '/my-children?tab=finance'
    );

    fireEvent.click(screen.getByRole('button', { name: /^Marquer comme lu$/i }));
    await waitFor(() => {
      expect(markNotificationAsRead).toHaveBeenCalledWith('n1');
      expect(screen.queryByRole('button', { name: /^Marquer comme lu$/i })).not.toBeInTheDocument();
      expect(screen.getByText(/Aucune notification non lue/i)).toBeInTheDocument();
    });
  });
});
