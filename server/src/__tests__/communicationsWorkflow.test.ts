import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

/**
 * §5.10 P1 — recette canaux email/SMS (sandbox / gated) + opt-out préférences.
 * Twilio/SMTP ne sont jamais appelés réellement : opt-out coupe avant dispatch ;
 * canaux absents → 501 ; SMTP factice → failed via file (déjà queue.test).
 */
describe('Communications — canaux sandbox + opt-out (§5.10)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
    await prisma.strkProfile.update({
      where: { id: fx.a.student.id },
      data: { phoneNumber: '+2250700000059' },
    });
  }, 30000);

  describe('préférences', () => {
    it('GET/PUT préférences reflètent l’opt-out (UI Settings)', async () => {
      const put = await request(app)
        .put('/communications/preferences/email')
        .set(auth(fx.a.student.token))
        .send({ optedIn: false });
      expect(put.status).toBe(200);
      expect(put.body.preference.optedIn).toBe(false);

      const get = await request(app).get('/communications/preferences').set(auth(fx.a.student.token));
      expect(get.status).toBe(200);
      const emailPref = get.body.preferences.find((p: { channel: string }) => p.channel === 'email');
      expect(emailPref?.optedIn).toBe(false);

      await request(app)
        .put('/communications/preferences/email')
        .set(auth(fx.a.student.token))
        .send({ optedIn: true });
    });
  });

  describe('canaux email/SMS', () => {
    const twilioKeys = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_SMS_FROM'] as const;
    const smtpKeys = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'] as const;
    let prev: Record<string, string | undefined> = {};

    afterEach(() => {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      prev = {};
    });

    const snapshot = (keys: readonly string[]) => {
      for (const k of keys) prev[k] = process.env[k];
      prev.CADDYNOTE_TEST_MODE = process.env.CADDYNOTE_TEST_MODE;
    };

    it('sans Twilio/SMTP → 501 (sandbox non branché)', async () => {
      snapshot([...twilioKeys, ...smtpKeys]);
      for (const k of [...twilioKeys, ...smtpKeys]) delete process.env[k];
      process.env.CADDYNOTE_TEST_MODE = 'true';

      for (const channel of ['sms', 'email'] as const) {
        const res = await request(app)
          .post('/communications/send')
          .set(auth(fx.a.teacher.token))
          .send({ recipientId: fx.a.student.id, channel, body: 'Ping sandbox' });
        expect(res.status).toBe(501);
      }
    });

    it('opt-out SMS bloque avant fournisseur (Twilio factice configuré)', async () => {
      snapshot([...twilioKeys, 'CADDYNOTE_TEST_MODE']);
      delete process.env.CADDYNOTE_TEST_MODE;
      process.env.TWILIO_ACCOUNT_SID = 'ACtest510sms';
      process.env.TWILIO_AUTH_TOKEN = 'test-token-510';
      process.env.TWILIO_SMS_FROM = '+15555550100';

      await request(app)
        .put('/communications/preferences/sms')
        .set(auth(fx.a.student.token))
        .send({ optedIn: false });

      const res = await request(app)
        .post('/communications/send')
        .set(auth(fx.a.teacher.token))
        .send({ recipientId: fx.a.student.id, channel: 'sms', body: 'Ne pas envoyer' });
      expect(res.status).toBe(201);
      expect(res.body.log.status).toBe('failed');
      expect(res.body.log.skippedOptOut).toBe(true);
      expect(res.body.log.providerMessageId).toBeFalsy();

      await request(app)
        .put('/communications/preferences/sms')
        .set(auth(fx.a.student.token))
        .send({ optedIn: true });
    });

    it('opt-out email bloque avant SMTP (SMTP factice configuré)', async () => {
      snapshot([...smtpKeys, 'CADDYNOTE_TEST_MODE']);
      delete process.env.CADDYNOTE_TEST_MODE;
      process.env.SMTP_HOST = '127.0.0.1';
      process.env.SMTP_USER = 'u';
      process.env.SMTP_PASS = 'p';
      process.env.SMTP_FROM = 'noreply@example.test';

      await request(app)
        .put('/communications/preferences/email')
        .set(auth(fx.a.student.token))
        .send({ optedIn: false });

      const res = await request(app)
        .post('/communications/send')
        .set(auth(fx.a.teacher.token))
        .send({
          recipientId: fx.a.student.id,
          channel: 'email',
          subject: 'Opt-out',
          body: 'Ne pas envoyer',
        });
      expect(res.status).toBe(201);
      expect(res.body.log.status).toBe('failed');
      expect(res.body.log.skippedOptOut).toBe(true);

      await request(app)
        .put('/communications/preferences/email')
        .set(auth(fx.a.student.token))
        .send({ optedIn: true });
    });
  });
});
