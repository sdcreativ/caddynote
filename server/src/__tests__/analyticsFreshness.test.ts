import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

/**
 * RPT-003 — fraîcheur des données affichée. `dashboard-metrics` est mis en
 * cache jusqu'à une heure (`StrkDashboardStat.validUntil`) : sans
 * `generatedAt`, rien ne distinguait un calcul à l'instant d'un calcul
 * vieux de 59 minutes.
 */
describe('Fraîcheur des données affichées (RPT-003)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
    await request(app)
      .put(`/institutions/${fx.a.institutionId}/features/advancedReports`)
      .set(auth(fx.globalAdmin.token))
      .send({ enabled: true });
  }, 30000);

  it('dashboard-metrics indique l’horodatage réel du calcul, identique tant que le cache est valide', async () => {
    const first = await request(app)
      .get(`/analytics/dashboard-metrics?institutionId=${fx.a.institutionId}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(first.status).toBe(200);
    expect(first.body.generatedAt).toBeTruthy();
    expect(new Date(first.body.generatedAt).getTime()).not.toBeNaN();

    // Un second appel immédiat sert le même cache (validUntil ~1h) : le
    // même `generatedAt`, pas un horodatage de la requête en cours.
    const second = await request(app)
      .get(`/analytics/dashboard-metrics?institutionId=${fx.a.institutionId}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(second.status).toBe(200);
    expect(second.body.generatedAt).toBe(first.body.generatedAt);
  });

  it('weekly-stats et monthly-stats, jamais mis en cache, indiquent un horodatage courant à chaque appel', async () => {
    const before = Date.now();
    const weekly = await request(app)
      .get(`/analytics/weekly-stats?institutionId=${fx.a.institutionId}`)
      .set(auth(fx.a.schoolAdmin.token));
    const monthly = await request(app)
      .get(`/analytics/monthly-stats?institutionId=${fx.a.institutionId}`)
      .set(auth(fx.a.schoolAdmin.token));
    const after = Date.now();

    expect(weekly.status).toBe(200);
    expect(monthly.status).toBe(200);
    const weeklyTime = new Date(weekly.body.generatedAt).getTime();
    const monthlyTime = new Date(monthly.body.generatedAt).getTime();
    expect(weeklyTime).toBeGreaterThanOrEqual(before);
    expect(weeklyTime).toBeLessThanOrEqual(after);
    expect(monthlyTime).toBeGreaterThanOrEqual(before);
    expect(monthlyTime).toBeLessThanOrEqual(after);
  });

  it("un élève ou un parent ne peut pas interroger les tableaux de bord internes (RPT-004)", async () => {
    const asStudent = await request(app)
      .get(`/analytics/dashboard-metrics?institutionId=${fx.a.institutionId}`)
      .set(auth(fx.a.student.token));
    expect(asStudent.status).toBe(403);

    const asParent = await request(app)
      .get(`/analytics/weekly-stats?institutionId=${fx.a.institutionId}`)
      .set(auth(fx.parentA.token));
    expect(asParent.status).toBe(403);

    const monthlyAsStudent = await request(app)
      .get(`/analytics/monthly-stats?institutionId=${fx.a.institutionId}`)
      .set(auth(fx.a.student.token));
    expect(monthlyAsStudent.status).toBe(403);
  });
});
