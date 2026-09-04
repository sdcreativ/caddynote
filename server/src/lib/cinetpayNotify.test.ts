import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { parseCinetPayNotify } from './cinetpay.js';

describe('parseCinetPayNotify', () => {
  const prevSite = process.env.CINETPAY_SITE_ID;
  const prevSecret = process.env.CINETPAY_WEBHOOK_SECRET;

  afterEach(() => {
    if (prevSite === undefined) delete process.env.CINETPAY_SITE_ID;
    else process.env.CINETPAY_SITE_ID = prevSite;
    if (prevSecret === undefined) delete process.env.CINETPAY_WEBHOOK_SECRET;
    else process.env.CINETPAY_WEBHOOK_SECRET = prevSecret;
  });

  it('refuse un id trop court ou injecté', () => {
    delete process.env.CINETPAY_WEBHOOK_SECRET;
    expect(parseCinetPayNotify({})).toEqual({ ok: false, error: 'transaction_id manquant' });
    expect(parseCinetPayNotify({ transaction_id: 'abc' }).ok).toBe(false);
    expect(parseCinetPayNotify({ transaction_id: '../../etc/passwd' }).ok).toBe(false);
  });

  it('accepte un UUID et refuse un site_id étranger', () => {
    delete process.env.CINETPAY_WEBHOOK_SECRET;
    process.env.CINETPAY_SITE_ID = 'site-a';
    const id = '11111111-1111-4111-8111-111111111111';
    expect(parseCinetPayNotify({ transaction_id: id, cpm_site_id: 'site-a' })).toEqual({
      ok: true,
      transactionId: id,
    });
    expect(parseCinetPayNotify({ transaction_id: id, cpm_site_id: 'other' }).ok).toBe(false);
  });

  it('exige le HMAC quand CINETPAY_WEBHOOK_SECRET est posé', () => {
    process.env.CINETPAY_SITE_ID = 'site-a';
    process.env.CINETPAY_WEBHOOK_SECRET = 'notify-secret';
    const id = 'pay-ref-0001';
    const payload = `site-a${id}`;
    const signature = createHash('sha256').update(`${payload}notify-secret`).digest('hex');
    expect(parseCinetPayNotify({ transaction_id: id }).ok).toBe(false);
    expect(parseCinetPayNotify({ transaction_id: id, cpm_signature: signature })).toEqual({
      ok: true,
      transactionId: id,
    });
  });
});
