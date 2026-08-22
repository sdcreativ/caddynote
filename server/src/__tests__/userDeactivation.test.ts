import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { buildFixture, registerActor, auth, type Fixture } from './fixtures.js';

/**
 * PER-005 — désactivation sans perte d'historique. `DELETE /users/:id`
 * supprimait le compte pour de bon (`prisma.strkProfile.delete`), ce qui
 * échoue dès qu'un compte a la moindre donnée liée (contrainte de clé
 * étrangère) et ne laissait de toute façon aucune trace de son passage.
 * Remplacé par une vraie désactivation : le compte et son historique
 * restent en base, seule la connexion est bloquée.
 */
describe('Désactivation de compte (PER-005)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  it("désactive un compte : ne le supprime pas, révoque ses sessions, empêche une future connexion", async () => {
    const victim = await registerActor('teacher', fx.a.institutionId);

    const res = await request(app)
      .delete(`/users/${victim.id}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(res.status).toBe(200);
    expect(res.body.user.isActive).toBe(false);

    // Le compte existe toujours en base (pas de suppression réelle).
    const stillThere = await prisma.strkProfile.findUnique({ where: { id: victim.id } });
    expect(stillThere).not.toBeNull();
    expect(stillThere?.isActive).toBe(false);
    expect(stillThere?.deactivatedAt).not.toBeNull();
    expect(stillThere?.deactivatedBy).toBe(fx.a.schoolAdmin.id);

    // Le jeton émis avant la désactivation ne fonctionne plus (session révoquée).
    const meAfter = await request(app).get(`/users/${victim.id}`).set(auth(victim.token));
    expect(meAfter.status).toBe(401);

    // Une nouvelle tentative de connexion est bloquée.
    const login = await request(app).post('/auth/login').send({ email: victim.email, password: 'Password123!' });
    expect(login.status).toBe(403);
  });

  it('un compte désactivé disposant déjà de données liées reste désactivable (pas de crash de contrainte)', async () => {
    // Un enseignant avec des cours/emplois du temps réels ne pouvait pas
    // être supprimé sans casser des contraintes de clé étrangère — la
    // désactivation, elle, n'a aucune raison d'échouer.
    const res = await request(app)
      .delete(`/users/${fx.a.teacher.id}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(res.status).toBe(200);

    // On réactive immédiatement pour ne pas perturber les autres tests
    // partageant cette fixture (fx.a.teacher est réutilisé ailleurs).
    const reactivate = await request(app)
      .post(`/users/${fx.a.teacher.id}/reactivate`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(reactivate.status).toBe(200);
    expect(reactivate.body.user.isActive).toBe(true);
  });

  it('réactive un compte : connexion à nouveau possible', async () => {
    const victim = await registerActor('teacher', fx.a.institutionId);
    await request(app).delete(`/users/${victim.id}`).set(auth(fx.a.schoolAdmin.token));

    const blocked = await request(app).post('/auth/login').send({ email: victim.email, password: 'Password123!' });
    expect(blocked.status).toBe(403);

    const reactivate = await request(app)
      .post(`/users/${victim.id}/reactivate`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(reactivate.status).toBe(200);
    expect(reactivate.body.user.isActive).toBe(true);

    const login = await request(app).post('/auth/login').send({ email: victim.email, password: 'Password123!' });
    expect(login.status).toBe(200);
  });

  it("le personnel d'un autre établissement ne peut pas désactiver un compte (ORG-004)", async () => {
    const victim = await registerActor('teacher', fx.a.institutionId);
    const res = await request(app).delete(`/users/${victim.id}`).set(auth(fx.b.teacher.token));
    expect(res.status).toBe(403);
  });

  it('un compte ne peut pas se désactiver lui-même', async () => {
    const res = await request(app).delete(`/users/${fx.a.schoolAdmin.id}`).set(auth(fx.a.schoolAdmin.token));
    expect(res.status).toBe(400);
  });

  it('un enseignant (personnel) peut désactiver un compte de son établissement', async () => {
    // Un enseignant dédié, distinct de `fx.a.teacher` : sa session a été
    // révoquée par un test précédent (désactivation/réactivation), ce qui
    // invaliderait ce test pour une raison indépendante de ce qu'il vérifie.
    const staffTeacher = await registerActor('teacher', fx.a.institutionId);
    const victim = await registerActor('student', fx.a.institutionId);
    const res = await request(app).delete(`/users/${victim.id}`).set(auth(staffTeacher.token));
    expect(res.status).toBe(200);
  });
});

describe('Anonymisation DSAR (POST /users/:id/anonymize)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  it('anonymise un compte (admin global) : PII remplacées, sessions révoquées', async () => {
    const victim = await registerActor('student', fx.a.institutionId);
    const originalEmail = victim.email;

    const denied = await request(app)
      .post(`/users/${victim.id}/anonymize`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(denied.status).toBe(403);

    const res = await request(app)
      .post(`/users/${victim.id}/anonymize`)
      .set(auth(fx.globalAdmin.token));
    expect(res.status).toBe(200);
    expect(res.body.anonymizedEmail).toMatch(/@anon\.invalid$/);

    const row = await prisma.strkProfile.findUnique({ where: { id: victim.id } });
    expect(row?.email).toBe(res.body.anonymizedEmail);
    expect(row?.firstName).toBe('Anonymisé');
    expect(row?.isActive).toBe(false);
    expect(row?.passwordHash).toBeNull();

    const login = await request(app).post('/auth/login').send({ email: originalEmail, password: 'Password123!' });
    expect(login.status).toBe(401);

    const again = await request(app)
      .post(`/users/${victim.id}/anonymize`)
      .set(auth(fx.globalAdmin.token));
    expect(again.status).toBe(409);
  });

  it('refuse d’anonymiser un admin global ou soi-même', async () => {
    const self = await request(app)
      .post(`/users/${fx.globalAdmin.id}/anonymize`)
      .set(auth(fx.globalAdmin.token));
    expect(self.status).toBe(400);

    // Un second admin ne doit pas non plus être anonymisable.
    const otherAdmin = await registerActor('admin');
    const res = await request(app)
      .post(`/users/${otherAdmin.id}/anonymize`)
      .set(auth(fx.globalAdmin.token));
    expect(res.status).toBe(403);
  });
});
