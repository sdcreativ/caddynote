import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

/**
 * Lot 9 — socle opérationnel (pas produit métier complet).
 */
describe('Lot 9 — modules complémentaires (opérationnel)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  it('refuse l’inscription transport d’un élève d’un autre établissement', async () => {
    const route = await request(app)
      .post('/services/transport/routes')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ name: `Ligne-${Date.now()}`, capacity: 2 });
    expect(route.status).toBe(201);

    const cross = await request(app)
      .post(`/services/transport/routes/${route.body.route.id}/enroll`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ studentId: fx.b.student.id });
    expect(cross.status).toBe(400);
    expect(cross.body.error).toMatch(/hors établissement/i);
  });

  it('inscrit, respecte la capacité, puis clôture l’inscription', async () => {
    const extra = await request(app)
      .post('/auth/register')
      .send({
        email: `eleve.lot9.${Date.now()}@isolation.test`,
        password: 'Password123!',
        firstName: 'Extra',
        lastName: 'Eleve',
        role: 'student',
        institutionId: fx.a.institutionId,
      });
    expect(extra.status).toBe(201);
    const extraStudentId = extra.body.user.id as string;

    const route = await request(app)
      .post('/services/transport/routes')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ name: `Cap-${Date.now()}`, capacity: 1 });
    expect(route.status).toBe(201);
    const routeId = route.body.route.id as string;

    const ok = await request(app)
      .post(`/services/transport/routes/${routeId}/enroll`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ studentId: fx.a.student.id });
    expect(ok.status).toBe(201);

    const full = await request(app)
      .post(`/services/transport/routes/${routeId}/enroll`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ studentId: extraStudentId });
    expect(full.status).toBe(409);
    expect(full.body.error).toMatch(/capacité/i);

    const list = await request(app)
      .get('/services/transport/routes')
      .set(auth(fx.a.schoolAdmin.token));
    expect(list.status).toBe(200);
    const found = list.body.routes.find((r: { id: string }) => r.id === routeId);
    expect(found.enrollments).toHaveLength(1);
    expect(found.enrollments[0].studentName).toBeTruthy();

    const end = await request(app)
      .post(`/services/transport/enrollments/${ok.body.enrollment.id}/end`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({});
    expect(end.status).toBe(200);

    const after = await request(app)
      .get('/services/transport/routes')
      .set(auth(fx.a.schoolAdmin.token));
    const foundAfter = after.body.routes.find((r: { id: string }) => r.id === routeId);
    expect(foundAfter.enrollments).toHaveLength(0);
  });

  it('prêt bibliothèque + retour restaure la disponibilité', async () => {
    const item = await request(app)
      .post('/services/library/items')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ title: `Livre-${Date.now()}`, quantity: 1 });
    expect(item.status).toBe(201);
    const itemId = item.body.item.id as string;

    const loan = await request(app)
      .post(`/services/library/items/${itemId}/loan`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ studentId: fx.a.student.id });
    expect(loan.status).toBe(201);

    const empty = await request(app)
      .post(`/services/library/items/${itemId}/loan`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ studentId: fx.a.student.id });
    expect(empty.status).toBe(409);

    const ret = await request(app)
      .post(`/services/library/loans/${loan.body.loan.id}/return`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({});
    expect(ret.status).toBe(200);

    const list = await request(app)
      .get('/services/library/items')
      .set(auth(fx.a.schoolAdmin.token));
    const found = list.body.items.find((i: { id: string }) => i.id === itemId);
    expect(found.available).toBe(1);
  });

  it('visite infirmerie et fiche RH créables via API', async () => {
    const visit = await request(app)
      .post('/services/clinic/visits')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ studentId: fx.a.student.id, reason: 'Contrôle' });
    expect(visit.status).toBe(201);

    const hr = await request(app)
      .post('/services/hr/staff')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ profileId: fx.a.teacher.id, jobTitle: 'Enseignant titulaire' });
    expect(hr.status).toBe(201);
  });
});
