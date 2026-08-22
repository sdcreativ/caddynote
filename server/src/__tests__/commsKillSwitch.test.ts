import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    strkSetting: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../lib/email.js', () => ({
  isEmailConfigured: () => true,
  sendEmail: vi.fn(),
}));
vi.mock('../lib/sms.js', () => ({
  isSmsConfigured: () => true,
  isWhatsAppConfigured: () => true,
  sendSms: vi.fn(),
  sendWhatsApp: vi.fn(),
}));
vi.mock('../lib/templates.js', () => ({
  resolveTemplate: vi.fn(),
  renderTemplate: vi.fn(),
}));
vi.mock('../lib/queue.js', () => ({
  enqueueCommunicationDispatch: vi.fn(),
}));
vi.mock('../lib/quotas.js', () => ({
  checkQuota: vi.fn(async () => ({ allowed: true, current: 0, limit: 100 })),
  QUOTA_LABELS: { smsPerMonth: 'SMS' },
}));

import { prisma } from '../lib/prisma.js';
import { getCommsKillSwitch, queueCommunication } from '../lib/communications.js';

describe('comms kill-switch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lit le kill-switch settings', async () => {
    (prisma.strkSetting.findUnique as any).mockResolvedValue({
      value: { email: true, sms: false, whatsapp: false },
    });
    await expect(getCommsKillSwitch()).resolves.toEqual({
      email: true,
      sms: false,
      whatsapp: false,
    });
  });

  it('refuse un envoi e-mail si kill-switch email actif', async () => {
    (prisma.strkSetting.findUnique as any).mockResolvedValue({
      value: { email: true, sms: false, whatsapp: false },
    });
    const result = await queueCommunication({
      recipientId: '00000000-0000-4000-8000-000000000001',
      channel: 'email',
      body: 'test',
      requestedBy: '00000000-0000-4000-8000-000000000002',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('channel_disabled');
    }
  });
});
