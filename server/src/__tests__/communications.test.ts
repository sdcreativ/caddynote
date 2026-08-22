import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

// Communication multicanal (chap. 17, COM-001 à 005). SMS/WhatsApp/e-mail ne
// sont pas configurés dans cet environnement de test (pas de clés Twilio/SMTP
// réelles) : ces canaux sont donc testés au niveau "501 explicite" (comme le
// reste des intégrations gated de l'API), et le canal `push` (notifications
// internes, sans fournisseur externe) sert de canal "bout en bout" pour
// vérifier la traçabilité (COM-004), le consentement (COM-003) et l'accusé
// de réception (COM-005).
describe('Communication multicanal (COM-001 à 005)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  describe('canaux gated (COM-001)', () => {
    it('répond 501 pour sms/whatsapp/email tant que non configurés', async () => {
      for (const channel of ['sms', 'whatsapp', 'email']) {
        const res = await request(app)
          .post('/communications/send')
          .set(auth(fx.a.teacher.token))
          .send({ recipientId: fx.a.student.id, channel, body: 'Test' });
        expect(res.status).toBe(501);
      }
    });
  });

  describe('modèles versionnés (COM-002)', () => {
    it('une nouvelle version désactive la précédente', async () => {
      const v1 = await request(app)
        .post('/communications/templates')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ useCase: 'welcome', channel: 'push', body: 'Bienvenue {{firstName}} !', variables: ['firstName'] });
      expect(v1.status).toBe(201);
      expect(v1.body.template.version).toBe(1);

      const v2 = await request(app)
        .post('/communications/templates')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ useCase: 'welcome', channel: 'push', body: 'Bienvenue chez nous, {{firstName}} !', variables: ['firstName'] });
      expect(v2.status).toBe(201);
      expect(v2.body.template.version).toBe(2);

      const list = await request(app)
        .get('/communications/templates?useCase=welcome&channel=push')
        .set(auth(fx.a.schoolAdmin.token));
      const versions = list.body.templates.filter((t: { useCase: string }) => t.useCase === 'welcome');
      expect(versions).toHaveLength(1);
      expect(versions[0].version).toBe(2);
    });

    it('refuse à un school_admin de B de créer/lire un modèle pour l’établissement A', async () => {
      const createRes = await request(app)
        .post('/communications/templates')
        .set(auth(fx.b.schoolAdmin.token))
        .send({ institutionId: fx.a.institutionId, useCase: 'intrus', channel: 'push', body: 'x' });
      expect(createRes.status).toBe(403);

      const listRes = await request(app)
        .get(`/communications/templates?institutionId=${fx.a.institutionId}`)
        .set(auth(fx.b.schoolAdmin.token));
      expect(listRes.status).toBe(403);
    });

    it('refuse à un school_admin de créer un modèle global (réservé à l’admin)', async () => {
      const res = await request(app)
        .post('/communications/templates')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ institutionId: null, useCase: 'global_test', channel: 'push', body: 'x' });
      // institutionId est silencieusement forcé à celui de l'appelant, donc pas d'erreur ici,
      // mais le modèle créé doit être rattaché à l'établissement de A, jamais global.
      expect(res.status).toBe(201);
      expect(res.body.template.institutionId).toBe(fx.a.institutionId);
    });
  });

  describe('envoi via le canal push + traçabilité (COM-004)', () => {
    it("envoie un message ad-hoc à un élève de son propre établissement et crée un log 'delivered'", async () => {
      const res = await request(app)
        .post('/communications/send')
        .set(auth(fx.a.teacher.token))
        .send({ recipientId: fx.a.student.id, channel: 'push', subject: 'Info', body: 'Réunion parents-profs demain', isCritical: true });
      expect(res.status).toBe(201);
      expect(res.body.log.status).toBe('delivered');
      expect(res.body.log.deliveredAt).not.toBeNull();

      const notif = await prisma.notification.findFirst({ where: { userId: fx.a.student.id, message: 'Réunion parents-profs demain' } });
      expect(notif).not.toBeNull();
    });

    it('refuse d’envoyer à un élève d’un autre établissement (ORG-004)', async () => {
      const res = await request(app)
        .post('/communications/send')
        .set(auth(fx.a.teacher.token))
        .send({ recipientId: fx.b.student.id, channel: 'push', body: 'Intrusion' });
      expect(res.status).toBe(403);
    });

    it('utilise un modèle versionné (useCase) avec substitution de variables', async () => {
      const res = await request(app)
        .post('/communications/send')
        .set(auth(fx.a.teacher.token))
        .send({ recipientId: fx.a.student.id, channel: 'push', useCase: 'welcome', variables: { firstName: 'Awa' } });
      expect(res.status).toBe(201);
      expect(res.body.log.body).toContain('Awa');
      expect(res.body.log.templateId).not.toBeNull();
    });
  });

  describe('consentement par canal (COM-003)', () => {
    it("un opt-out bloque l'envoi sans jamais appeler le fournisseur, tracé comme tel", async () => {
      const optOut = await request(app)
        .put('/communications/preferences/push')
        .set(auth(fx.a.student.token))
        .send({ optedIn: false });
      expect(optOut.status).toBe(200);

      const before = await prisma.notification.count({ where: { userId: fx.a.student.id } });
      const res = await request(app)
        .post('/communications/send')
        .set(auth(fx.a.teacher.token))
        .send({ recipientId: fx.a.student.id, channel: 'push', body: 'Ne devrait pas arriver' });
      expect(res.status).toBe(201);
      expect(res.body.log.status).toBe('failed');
      expect(res.body.log.skippedOptOut).toBe(true);
      const after = await prisma.notification.count({ where: { userId: fx.a.student.id } });
      expect(after).toBe(before); // aucune notification créée

      // Réactivation pour ne pas polluer les tests suivants.
      await request(app).put('/communications/preferences/push').set(auth(fx.a.student.token)).send({ optedIn: true });
    });
  });

  describe('journal (COM-004) et accusé de réception (COM-005)', () => {
    it('le destinataire consulte son propre journal ; un autre élève ne le peut pas', async () => {
      const selfRes = await request(app).get(`/communications/logs?recipientId=${fx.a.student.id}`).set(auth(fx.a.student.token));
      expect(selfRes.status).toBe(200);
      expect(selfRes.body.logs.length).toBeGreaterThan(0);

      const otherRes = await request(app).get(`/communications/logs?recipientId=${fx.a.student.id}`).set(auth(fx.b.student.token));
      expect(otherRes.status).toBe(403);
    });

    it('un accusé de réception ne peut être posé que par le destinataire, et seulement si critique', async () => {
      const critical = await request(app)
        .post('/communications/send')
        .set(auth(fx.a.teacher.token))
        .send({ recipientId: fx.a.student.id, channel: 'push', body: 'Convocation obligatoire', isCritical: true });
      const logId = critical.body.log.id;

      const wrongUser = await request(app).post(`/communications/logs/${logId}/acknowledge`).set(auth(fx.b.student.token));
      expect(wrongUser.status).toBe(403);

      const ok = await request(app).post(`/communications/logs/${logId}/acknowledge`).set(auth(fx.a.student.token));
      expect(ok.status).toBe(200);
      expect(ok.body.log.acknowledgedAt).not.toBeNull();

      const nonCritical = await request(app)
        .post('/communications/send')
        .set(auth(fx.a.teacher.token))
        .send({ recipientId: fx.a.student.id, channel: 'push', body: 'Info anodine', isCritical: false });
      const ackNonCritical = await request(app)
        .post(`/communications/logs/${nonCritical.body.log.id}/acknowledge`)
        .set(auth(fx.a.student.token));
      expect(ackNonCritical.status).toBe(400);
    });
  });
});
