import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/email.js', () => ({
  sendEmail: vi.fn(async () => true),
}));

vi.mock('../lib/sms.js', () => ({
  isSmsConfigured: vi.fn(() => false),
  sendSms: vi.fn(async () => ({ providerMessageId: 'SM_test' })),
}));

import { sendAccountInvite } from '../lib/accountInvite.js';
import { sendEmail } from '../lib/email.js';
import { isSmsConfigured, sendSms } from '../lib/sms.js';

describe('Invitation de compte (IAM-001)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isSmsConfigured).mockReturnValue(false);
    vi.mocked(sendEmail).mockResolvedValue(true);
  });

  it('envoie toujours l’e-mail d’invitation', async () => {
    const result = await sendAccountInvite({
      email: 'a@test.caddynote',
      firstName: 'Alice',
      tempPassword: 'Tmp1234!',
    });
    expect(result.emailSent).toBe(true);
    expect(result.smsSent).toBe(false);
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(sendSms).not.toHaveBeenCalled();
  });

  it('envoie aussi un SMS si téléphone et Twilio configurés', async () => {
    vi.mocked(isSmsConfigured).mockReturnValue(true);
    const result = await sendAccountInvite({
      email: 'b@test.caddynote',
      firstName: 'Bob',
      tempPassword: 'Tmp5678!',
      phoneNumber: '+33601020304',
      accountKind: 'enseignant',
    });
    expect(result.smsSent).toBe(true);
    expect(sendSms).toHaveBeenCalledWith(
      '+33601020304',
      expect.stringContaining('Tmp5678!')
    );
    expect(sendSms).toHaveBeenCalledWith('+33601020304', expect.stringContaining('enseignant'));
  });

  it('ne tente pas de SMS sans numéro, même si Twilio est configuré', async () => {
    vi.mocked(isSmsConfigured).mockReturnValue(true);
    const result = await sendAccountInvite({
      email: 'c@test.caddynote',
      firstName: 'Claire',
      tempPassword: 'Tmp9!',
    });
    expect(result.smsSent).toBe(false);
    expect(sendSms).not.toHaveBeenCalled();
  });

  it('reste emailSent=true si le SMS échoue', async () => {
    vi.mocked(isSmsConfigured).mockReturnValue(true);
    vi.mocked(sendSms).mockRejectedValueOnce(new Error('Twilio down'));
    const result = await sendAccountInvite({
      email: 'd@test.caddynote',
      firstName: 'Dan',
      tempPassword: 'Tmp0!',
      phoneNumber: '+33699999999',
    });
    expect(result.emailSent).toBe(true);
    expect(result.smsSent).toBe(false);
  });
});
