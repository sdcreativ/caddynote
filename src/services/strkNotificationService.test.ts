import { describe, it, expect } from 'vitest';
import { normalizeNotification } from '@/services/strkNotificationService';

describe('normalizeNotification', () => {
  it('mappe le contrat API camelCase (Prisma)', () => {
    const n = normalizeNotification({
      id: 'n1',
      userId: 'u1',
      title: 'Absence',
      message: 'Justificatif manquant',
      type: 'attendance',
      read: false,
      actionUrl: '/my-children?tab=attendance',
      createdAt: '2026-09-03T10:00:00.000Z',
    });

    expect(n).toMatchObject({
      id: 'n1',
      userId: 'u1',
      read: false,
      actionUrl: '/my-children?tab=attendance',
      createdAt: '2026-09-03T10:00:00.000Z',
    });
  });

  it('accepte les reliquats snake_case et lit read_at comme lu', () => {
    const n = normalizeNotification({
      id: 'n2',
      user_id: 'u2',
      title: 'Info',
      message: 'Hello',
      type: 'info',
      read_at: '2026-09-03T11:00:00.000Z',
      action_url: '/messages',
      created_at: '2026-09-03T09:00:00.000Z',
    });

    expect(n.read).toBe(true);
    expect(n.userId).toBe('u2');
    expect(n.actionUrl).toBe('/messages');
    expect(n.createdAt).toBe('2026-09-03T09:00:00.000Z');
  });

  it('conserve le booléen API read même si un reliquat read_at existe', () => {
    const n = normalizeNotification({
      id: 'n2b',
      userId: 'u2',
      title: 'Info',
      message: 'Hello',
      type: 'info',
      read: false,
      read_at: '2026-09-03T11:00:00.000Z',
      createdAt: '2026-09-03T09:00:00.000Z',
    });
    expect(n.read).toBe(false);
  });

  it('conserve read=false lorsque le booléen API est fourni', () => {
    const n = normalizeNotification({
      id: 'n3',
      userId: 'u3',
      title: 'X',
      message: 'Y',
      type: 'info',
      read: false,
      createdAt: '2026-09-03T08:00:00.000Z',
    });
    expect(n.read).toBe(false);
  });
});
