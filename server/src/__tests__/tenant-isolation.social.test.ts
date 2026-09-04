import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

// ORG-004 — messagerie, notifications, journal d'activité, rapports,
// analytics et stockage de fichiers. Ces modules exposaient soit un annuaire
// complet tous établissements confondus (contacts), soit un accès par
// userId/institutionId non vérifié (notifications, activité, analytics,
// rapports), soit une clé d'objet non rattachée à un tenant (fichiers).
describe('Isolation multi-tenant — communication, supervision, fichiers', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
    for (const institutionId of [fx.a.institutionId, fx.b.institutionId]) {
      await request(app)
        .put(`/institutions/${institutionId}/features/advancedReports`)
        .set(auth(fx.globalAdmin.token))
        .send({ enabled: true });
    }
  }, 30000);

  describe('messages', () => {
    it('la liste de contacts d’un enseignant de A ne contient aucun compte de B', async () => {
      const res = await request(app).get('/messages/contacts').set(auth(fx.a.teacher.token));
      expect(res.status).toBe(200);
      const ids = res.body.users.map((u: { id: string }) => u.id);
      expect(ids).not.toContain(fx.b.teacher.id);
      expect(ids).not.toContain(fx.b.schoolAdmin.id);
      expect(ids).toContain(fx.a.schoolAdmin.id);
    });

    it('refuse l’envoi d’un message vers un destinataire d’un autre établissement', async () => {
      const res = await request(app)
        .post('/messages')
        .set(auth(fx.a.teacher.token))
        .send({ recipientId: fx.b.teacher.id, subject: 'Salut', content: 'Bonjour' });
      expect(res.status).toBe(403);
    });

    it('refuse à un school_admin de B de lire les messages reçus d’un utilisateur de A', async () => {
      const res = await request(app)
        .get(`/messages/received?userId=${fx.a.teacher.id}`)
        .set(auth(fx.b.schoolAdmin.token));
      expect(res.status).toBe(403);
    });

    it('seul le destinataire réel d’un message peut y répondre', async () => {
      const sent = await request(app)
        .post('/messages')
        .set(auth(fx.a.teacher.token))
        .send({ recipientId: fx.a.schoolAdmin.id, subject: 'Info', content: 'Bonjour' });
      expect(sent.status).toBe(201);
      const messageId = sent.body.message.id;

      const res = await request(app)
        .post(`/messages/${messageId}/reply`)
        .set(auth(fx.b.schoolAdmin.token))
        .send({ subject: 'Re: Info', content: 'Intrusion' });
      expect(res.status).toBe(403);

      const okRes = await request(app)
        .post(`/messages/${messageId}/reply`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ subject: 'Re: Info', content: 'Réponse légitime' });
      expect(okRes.status).toBe(201);
    });

    it('refuse des pièces jointes hors dossier messages/ ou d’un autre tenant', async () => {
      const foreign = await request(app)
        .post('/messages')
        .set(auth(fx.a.teacher.token))
        .send({
          recipientId: fx.a.schoolAdmin.id,
          subject: 'PJ',
          content: 'Intrus',
          attachments: [`documents/inst-${fx.a.institutionId}/secret.pdf`],
        });
      expect(foreign.status).toBe(400);

      const otherTenant = await request(app)
        .post('/messages')
        .set(auth(fx.a.teacher.token))
        .send({
          recipientId: fx.a.schoolAdmin.id,
          subject: 'PJ',
          content: 'Autre établissement',
          attachments: [`messages/inst-${fx.b.institutionId}/note.pdf`],
        });
      expect(otherTenant.status).toBe(400);
    });

    it('accepte des pièces jointes sous messages/ du même établissement', async () => {
      const key = `messages/inst-${fx.a.institutionId}/2026-attach-ok.pdf`;
      const res = await request(app)
        .post('/messages')
        .set(auth(fx.a.teacher.token))
        .send({
          recipientId: fx.a.schoolAdmin.id,
          subject: 'Avec PJ',
          content: 'Voir pièce',
          attachments: [key],
        });
      expect(res.status).toBe(201);
      expect(res.body.message.attachments).toEqual([key]);
    });
  });

  describe('notifications', () => {
    it('refuse à un school_admin de B de consulter les notifications d’un utilisateur de A', async () => {
      const res = await request(app)
        .get(`/notifications?userId=${fx.a.teacher.id}`)
        .set(auth(fx.b.schoolAdmin.token));
      expect(res.status).toBe(403);
    });

    it('refuse à un enseignant de B de notifier un élève de A', async () => {
      const res = await request(app).post('/notifications').set(auth(fx.b.teacher.token)).send({
        userId: fx.a.student.id,
        title: 'Devoir',
        message: 'Rendez votre devoir',
      });
      expect(res.status).toBe(403);
    });

    it('autorise un enseignant de A à notifier son propre élève', async () => {
      const res = await request(app).post('/notifications').set(auth(fx.a.teacher.token)).send({
        userId: fx.a.student.id,
        title: 'Devoir',
        message: 'Rendez votre devoir',
      });
      expect(res.status).toBe(201);
    });
  });

  describe('activity', () => {
    it('refuse d’usurper une entrée de journal au nom de l’établissement A', async () => {
      const res = await request(app)
        .post('/activity')
        .set(auth(fx.b.schoolAdmin.token))
        .send({ type: 'login', institutionId: fx.a.institutionId, description: 'Connexion suspecte' });
      expect(res.status).toBe(403);
    });

    it('refuse à un school_admin de B de consulter le journal d’un utilisateur de A', async () => {
      const res = await request(app).get(`/activity/by-user/${fx.a.teacher.id}`).set(auth(fx.b.schoolAdmin.token));
      expect(res.status).toBe(403);
    });
  });

  describe('reports', () => {
    let reportId: string;

    it('refuse la création d’un rapport pour l’établissement A par le school_admin de B', async () => {
      const res = await request(app)
        .post('/reports')
        .set(auth(fx.b.schoolAdmin.token))
        .send({ title: 'Rapport intrus', reportType: 'attendance', institutionId: fx.a.institutionId });
      expect(res.status).toBe(403);
    });

    it('refuse la modification/suppression d’un rapport de A par le school_admin de B', async () => {
      const created = await request(app)
        .post('/reports')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ title: 'Rapport légitime', reportType: 'attendance', institutionId: fx.a.institutionId });
      expect(created.status).toBe(201);
      reportId = created.body.report.id;

      const patchRes = await request(app)
        .patch(`/reports/${reportId}/status`)
        .set(auth(fx.b.schoolAdmin.token))
        .send({ status: 'completed' });
      expect(patchRes.status).toBe(404);

      const deleteRes = await request(app).delete(`/reports/${reportId}`).set(auth(fx.b.schoolAdmin.token));
      expect(deleteRes.status).toBe(404);
    });

    it('GET /reports sans institutionId ne liste pas les rapports d’un autre établissement', async () => {
      const created = await request(app)
        .post('/reports')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ title: 'Rapport A isolé', reportType: 'attendance', institutionId: fx.a.institutionId });
      expect(created.status).toBe(201);
      const idA = created.body.report.id as string;

      const fromB = await request(app).get('/reports').set(auth(fx.b.schoolAdmin.token));
      expect(fromB.status).toBe(200);
      const idsB = (fromB.body.reports as { id: string }[]).map((r) => r.id);
      expect(idsB).not.toContain(idA);

      const fromA = await request(app).get('/reports').set(auth(fx.a.schoolAdmin.token));
      expect(fromA.status).toBe(200);
      expect((fromA.body.reports as { id: string }[]).map((r) => r.id)).toContain(idA);

      const cross = await request(app)
        .get(`/reports?institutionId=${fx.a.institutionId}`)
        .set(auth(fx.b.schoolAdmin.token));
      expect(cross.status).toBe(403);
    });
  });

  describe('analytics', () => {
    it('refuse les métriques de tableau de bord de A à un school_admin de B', async () => {
      const res = await request(app)
        .get(`/analytics/dashboard-metrics?institutionId=${fx.a.institutionId}`)
        .set(auth(fx.b.schoolAdmin.token));
      expect(res.status).toBe(403);
    });

    it('sans institutionId, un school_admin est ramené à son propre établissement (pas la vue globale)', async () => {
      const res = await request(app).get('/analytics/dashboard-metrics').set(auth(fx.a.schoolAdmin.token));
      expect(res.status).toBe(200);
      // totalInstitutions doit refléter le périmètre d'un seul établissement, pas le total plateforme.
      expect(res.body.metrics.totalInstitutions).toBe(1);
    });

    it('refuse les statistiques hebdomadaires/mensuelles de A à un enseignant de B', async () => {
      const weekly = await request(app)
        .get(`/analytics/weekly-stats?institutionId=${fx.a.institutionId}`)
        .set(auth(fx.b.teacher.token));
      expect(weekly.status).toBe(403);

      const monthly = await request(app)
        .get(`/analytics/monthly-stats?institutionId=${fx.a.institutionId}`)
        .set(auth(fx.b.teacher.token));
      expect(monthly.status).toBe(403);
    });
  });

  describe('subscriptions (décomptes)', () => {
    it('refuse le décompte d’élèves de A à un school_admin de B', async () => {
      const res = await request(app)
        .get(`/subscriptions/counts/students?institutionId=${fx.a.institutionId}`)
        .set(auth(fx.b.schoolAdmin.token));
      expect(res.status).toBe(403);
    });
  });
});
