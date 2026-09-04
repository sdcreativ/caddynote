import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';
import { withCapturedResetEmail } from './captureResetEmail.js';

/**
 * IAM-004 (sessions) et IAM-005 (journal d'audit).
 */
describe('Sessions et journal d’audit (IAM-004/005)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  const login = async (email: string) =>
    request(app).post('/auth/login').send({ email, password: 'Password123!' });

  describe('IAM-004 — gestion des sessions', () => {
    it('chaque connexion crée une session distincte, listée avec la session courante marquée', async () => {
      const listRes = await request(app).get('/auth/sessions').set(auth(fx.a.teacher.token));
      expect(listRes.status).toBe(200);
      expect(listRes.body.sessions.length).toBeGreaterThanOrEqual(1);
      expect(listRes.body.sessions.some((s: any) => s.current)).toBe(true);
    });

    it('révoquer une session invalide immédiatement le jeton associé, sans affecter les autres', async () => {
      const email = `session.${Date.now()}@isolation.test`;
      await request(app)
        .post('/auth/register')
        .send({ email, password: 'Password123!', firstName: 'Multi', lastName: 'Session', role: 'teacher', institutionId: fx.a.institutionId });

      const loginA = await login(email);
      const loginB = await login(email);
      expect(loginA.status).toBe(200);
      expect(loginB.status).toBe(200);
      const tokenA = loginA.body.token;
      const tokenB = loginB.body.token;

      const sessions = await request(app).get('/auth/sessions').set(auth(tokenA));
      expect(sessions.body.sessions.length).toBeGreaterThanOrEqual(2);

      const otherSessionId = sessions.body.sessions.find((s: any) => !s.current).id;
      const revokeRes = await request(app).delete(`/auth/sessions/${otherSessionId}`).set(auth(tokenA));
      expect(revokeRes.status).toBe(200);

      // Le jeton de la session révoquée (B) échoue désormais.
      const asB = await request(app).get('/auth/me').set(auth(tokenB));
      expect(asB.status).toBe(401);

      // Le jeton A reste parfaitement valide.
      const asA = await request(app).get('/auth/me').set(auth(tokenA));
      expect(asA.status).toBe(200);
    });

    it('ne peut pas révoquer la session d’un autre utilisateur', async () => {
      const otherLogin = await request(app)
        .post('/auth/register')
        .send({ email: `victim.${Date.now()}@isolation.test`, password: 'Password123!', firstName: 'V', lastName: 'Victim', role: 'teacher', institutionId: fx.a.institutionId });
      const victimSessions = await request(app).get('/auth/sessions').set(auth(otherLogin.body.token));
      const victimSessionId = victimSessions.body.sessions[0].id;

      const res = await request(app).delete(`/auth/sessions/${victimSessionId}`).set(auth(fx.b.teacher.token));
      expect(res.status).toBe(404);
    });

    it('« déconnexion partout ailleurs » révoque les autres sessions mais jamais la session courante', async () => {
      const email = `everywhere.${Date.now()}@isolation.test`;
      await request(app)
        .post('/auth/register')
        .send({ email, password: 'Password123!', firstName: 'Every', lastName: 'Where', role: 'teacher', institutionId: fx.a.institutionId });
      const loginA = await login(email);
      const loginB = await login(email);
      const loginC = await login(email);

      const revokeRes = await request(app).delete('/auth/sessions').set(auth(loginA.body.token));
      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.revoked).toBeGreaterThanOrEqual(2);

      const stillWorks = await request(app).get('/auth/me').set(auth(loginA.body.token));
      expect(stillWorks.status).toBe(200);
      const revokedB = await request(app).get('/auth/me').set(auth(loginB.body.token));
      expect(revokedB.status).toBe(401);
      const revokedC = await request(app).get('/auth/me').set(auth(loginC.body.token));
      expect(revokedC.status).toBe(401);
    });

    it('POST /auth/logout révoque la session courante', async () => {
      const email = `logout.${Date.now()}@isolation.test`;
      await request(app)
        .post('/auth/register')
        .send({ email, password: 'Password123!', firstName: 'Log', lastName: 'Out', role: 'teacher', institutionId: fx.a.institutionId });
      const loginRes = await login(email);
      const logoutRes = await request(app).post('/auth/logout').set(auth(loginRes.body.token));
      expect(logoutRes.status).toBe(200);
      const after = await request(app).get('/auth/me').set(auth(loginRes.body.token));
      expect(after.status).toBe(401);
    });

    it('changer son mot de passe révoque les autres sessions, jamais la session courante', async () => {
      const email = `changepwd.${Date.now()}@isolation.test`;
      await request(app)
        .post('/auth/register')
        .send({ email, password: 'Password123!', firstName: 'Change', lastName: 'Pwd', role: 'teacher', institutionId: fx.a.institutionId });
      const loginA = await login(email);
      const loginB = await login(email);

      const changeRes = await request(app)
        .post('/auth/change-password')
        .set(auth(loginA.body.token))
        .send({ currentPassword: 'Password123!', newPassword: 'NewPassword456!' });
      expect(changeRes.status).toBe(200);

      const stillA = await request(app).get('/auth/me').set(auth(loginA.body.token));
      expect(stillA.status).toBe(200);
      const revokedB = await request(app).get('/auth/me').set(auth(loginB.body.token));
      expect(revokedB.status).toBe(401);
    });

    it('réinitialiser le mot de passe (dossier oublié) révoque absolument toutes les sessions', async () => {
      const email = `forgot.${Date.now()}@isolation.test`;
      await request(app)
        .post('/auth/register')
        .send({ email, password: 'Password123!', firstName: 'Forgot', lastName: 'Pwd', role: 'teacher', institutionId: fx.a.institutionId });
      const loginA = await login(email);

      const { rawToken } = await withCapturedResetEmail(() =>
        request(app).post('/auth/forgot-password').send({ email })
      );
      expect(rawToken).toBeTruthy();

      const resetRes = await request(app)
        .post('/auth/reset-password')
        .send({ token: rawToken, newPassword: 'AnotherPassword789!' });
      expect(resetRes.status).toBe(200);

      const afterReset = await request(app).get('/auth/me').set(auth(loginA.body.token));
      expect(afterReset.status).toBe(401);
    });

    it('un jeton sans session (format légataire) est refusé plutôt qu’accepté sans vérification', async () => {
      const legacyToken = jwt.sign(
        { sub: fx.a.teacher.id, role: 'teacher', institutionId: fx.a.institutionId },
        'test-only-secret-do-not-use-in-production',
        { expiresIn: '1h' }
      );
      const res = await request(app).get('/auth/me').set(auth(legacyToken));
      expect(res.status).toBe(401);
    });
  });

  describe('IAM-005 — journal d’audit', () => {
    it('trace les actions disciplinaires — jamais accessible en écriture par le client', async () => {
      // Déclenche des entrées réelles.
      const created = await request(app).post('/discipline/incidents').set(auth(fx.a.teacher.token)).send({
        studentId: fx.a.student.id,
        description: 'Pour vérifier le journal d’audit',
      });
      await request(app)
        .patch(`/discipline/incidents/${created.body.incident.id}/status`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ status: 'under_review' });

      const logsRes = await request(app)
        .get(`/audit-log?institutionId=${fx.a.institutionId}&action=discipline`)
        .set(auth(fx.a.schoolAdmin.token));
      expect(logsRes.status).toBe(200);
      expect(logsRes.body.logs.some((l: any) => l.action === 'discipline.status_changed' && l.targetId === created.body.incident.id)).toBe(true);

      // Aucune route d'écriture publique n'existe pour ce journal.
      const forgedWrite = await request(app)
        .post('/audit-log')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ action: 'faux.evenement' });
      expect(forgedWrite.status).toBe(404);
    });

    it('isolation multi-tenant : un school_admin ne voit que les entrées de son propre établissement', async () => {
      const crossRes = await request(app)
        .get(`/audit-log?institutionId=${fx.a.institutionId}`)
        .set(auth(fx.b.schoolAdmin.token));
      expect(crossRes.status).toBe(403);
    });

    it('un enseignant n’a pas accès au journal d’audit', async () => {
      const res = await request(app).get(`/audit-log?institutionId=${fx.a.institutionId}`).set(auth(fx.a.teacher.token));
      expect(res.status).toBe(403);
    });

    it('trace la confirmation manuelle d’un paiement (finance)', async () => {
      const feeRes = await request(app)
        .post('/finance/fee-items')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ institutionId: fx.a.institutionId, name: 'Frais de test audit', amountCents: 10000 });
      const invoiceRes = await request(app)
        .post('/finance/invoices')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ institutionId: fx.a.institutionId, studentId: fx.a.student.id, lines: [{ feeItemId: feeRes.body.feeItem.id, quantity: 1 }] });
      const payRes = await request(app)
        .post(`/finance/invoices/${invoiceRes.body.invoice.id}/payments/manual`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ amountCents: 10000, method: 'cash' });
      expect(payRes.status).toBe(201);

      const logsRes = await request(app)
        .get(`/audit-log?institutionId=${fx.a.institutionId}&action=finance.payment`)
        .set(auth(fx.a.schoolAdmin.token));
      expect(logsRes.body.logs.some((l: any) => l.targetId === payRes.body.payment.id)).toBe(true);
    });
  });
});
