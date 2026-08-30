import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

describe('Lot 9 — planning bus (arrêts + créneaux)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  it('crée un circuit, des arrêts et un créneau ; parent voit le planning', async () => {
    const route = await request(app)
      .post('/services/transport/routes')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ name: `BusPlan-${Date.now()}`, capacity: 20 });
    expect(route.status).toBe(201);
    const routeId = route.body.route.id as string;

    const stop = await request(app)
      .post(`/services/transport/routes/${routeId}/stops`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ name: 'Arrêt Centre', sequence: 1 });
    expect(stop.status).toBe(201);
    expect(stop.body.stop.sequence).toBe(1);

    const slot = await request(app)
      .post(`/services/transport/routes/${routeId}/schedule`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ dayOfWeek: 1, departureTime: '07:15', direction: 'outbound', stopId: stop.body.stop.id });
    expect(slot.status).toBe(201);
    expect(slot.body.slot.departureTime).toBe('07:15');

    const list = await request(app)
      .get('/services/transport/routes')
      .set(auth(fx.a.schoolAdmin.token));
    expect(list.status).toBe(200);
    const found = list.body.routes.find((r: { id: string }) => r.id === routeId);
    expect(found?.stops?.length).toBeGreaterThanOrEqual(1);
    expect(found?.scheduleSlots?.length).toBeGreaterThanOrEqual(1);

    const enroll = await request(app)
      .post(`/services/transport/routes/${routeId}/enroll`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ studentId: fx.a.student.id });
    expect(enroll.status).toBe(201);

    const mine = await request(app).get('/services/mine').set(auth(fx.parentA.token));
    expect(mine.status).toBe(200);
    const child = mine.body.children.find((c: { studentId: string }) => c.studentId === fx.a.student.id);
    const enrollment = child?.transportEnrollments?.find((e: { routeId: string }) => e.routeId === routeId);
    expect(enrollment?.scheduleSlots?.length).toBeGreaterThanOrEqual(1);

    const badDay = await request(app)
      .post(`/services/transport/routes/${routeId}/schedule`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ dayOfWeek: 9, departureTime: '08:00' });
    expect(badDay.status).toBe(400);
  });
});
