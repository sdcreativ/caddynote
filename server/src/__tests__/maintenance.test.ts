import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Request } from 'express';
import request from 'supertest';
import { app } from '../index.js';
import { ACCESS_COOKIE_NAME } from '../lib/accessCookie.js';
import { isAdminMaintenanceBypass } from '../middleware/maintenance.js';
import { auth, registerActor, type Actor } from './fixtures.js';

const req = (headers: Record<string, string>): Request => ({ headers } as Request);

describe('Mode maintenance — bypass admin', () => {
  const previous = process.env.MAINTENANCE_MODE;
  let admin: Actor;
  let teacher: Actor;

  beforeAll(async () => {
    admin = await registerActor('admin');
    teacher = await registerActor('teacher');
    process.env.MAINTENANCE_MODE = 'true';
  }, 30_000);

  afterAll(() => {
    if (previous === undefined) delete process.env.MAINTENANCE_MODE;
    else process.env.MAINTENANCE_MODE = previous;
  });

  it('isAdminMaintenanceBypass accepte admin Bearer ou cookie, refuse le reste', () => {
    expect(isAdminMaintenanceBypass(req({}))).toBe(false);
    expect(isAdminMaintenanceBypass(req({ authorization: `Bearer ${teacher.token}` }))).toBe(false);
    expect(isAdminMaintenanceBypass(req({ authorization: `Bearer ${admin.token}` }))).toBe(true);
    expect(
      isAdminMaintenanceBypass(req({ cookie: `${ACCESS_COOKIE_NAME}=${admin.token}` }))
    ).toBe(true);
    expect(
      isAdminMaintenanceBypass(req({ cookie: `${ACCESS_COOKIE_NAME}=${teacher.token}` }))
    ).toBe(false);
    expect(isAdminMaintenanceBypass(req({ authorization: 'Bearer not-a-jwt' }))).toBe(false);
  });

  it('GET /status est 503 sans admin ; /health et /auth restent ouverts', async () => {
    const blocked = await request(app).get('/status');
    expect(blocked.status).toBe(503);
    expect(blocked.body.code).toBe('MAINTENANCE');

    const teacherBlocked = await request(app).get('/status').set(auth(teacher.token));
    expect(teacherBlocked.status).toBe(503);

    const health = await request(app).get('/health');
    expect(health.status).toBe(200);

    const me = await request(app).get('/auth/me').set(auth(teacher.token));
    expect(me.status).not.toBe(503);
  });

  it('admin Bearer et cookie passent ; cookie enseignant non', async () => {
    const viaBearer = await request(app).get('/status').set(auth(admin.token));
    expect(viaBearer.status).toBe(200);

    const viaCookie = await request(app)
      .get('/status')
      .set('Cookie', `${ACCESS_COOKIE_NAME}=${admin.token}`);
    expect(viaCookie.status).toBe(200);

    const teacherCookie = await request(app)
      .get('/status')
      .set('Cookie', `${ACCESS_COOKIE_NAME}=${teacher.token}`);
    expect(teacherCookie.status).toBe(503);
    expect(teacherCookie.body.code).toBe('MAINTENANCE');
  });
});
