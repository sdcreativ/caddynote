import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { canSelfAssignRole, allowPrivilegedSelfRegister } from '../lib/publicRegister.js';
import { getPilotReadiness } from '../lib/diagnostics.js';

describe('IAM-001 — inscription publique', () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevAllow = process.env.CADDYNOTE_ALLOW_PRIVILEGED_REGISTER;
  const prevTestMode = process.env.CADDYNOTE_TEST_MODE;

  afterEach(() => {
    process.env.NODE_ENV = prevNodeEnv;
    if (prevAllow === undefined) delete process.env.CADDYNOTE_ALLOW_PRIVILEGED_REGISTER;
    else process.env.CADDYNOTE_ALLOW_PRIVILEGED_REGISTER = prevAllow;
    if (prevTestMode === undefined) delete process.env.CADDYNOTE_TEST_MODE;
    else process.env.CADDYNOTE_TEST_MODE = prevTestMode;
  });

  it('autorise student et parent sans bootstrap', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CADDYNOTE_ALLOW_PRIVILEGED_REGISTER;
    expect(canSelfAssignRole('student')).toBe(true);
    expect(canSelfAssignRole('parent')).toBe(true);
    expect(canSelfAssignRole('admin')).toBe(false);
    expect(canSelfAssignRole('school_admin')).toBe(false);
    expect(canSelfAssignRole('teacher')).toBe(false);
  });

  it('autorise les rôles privilégiés en NODE_ENV=test (fixtures)', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.CADDYNOTE_ALLOW_PRIVILEGED_REGISTER;
    expect(allowPrivilegedSelfRegister()).toBe(true);
    expect(canSelfAssignRole('admin')).toBe(true);
  });

  it('refuse POST /auth/register admin hors mode privilegié', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CADDYNOTE_ALLOW_PRIVILEGED_REGISTER;
    const res = await request(app)
      .post('/auth/register')
      .send({
        email: `escalade.${Date.now()}@example.invalid`,
        password: 'Password123!',
        firstName: 'Hack',
        lastName: 'Admin',
        role: 'admin',
      });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('privileged_role_forbidden');
  });

  it('getPilotReadiness signale TEST_MODE comme bloqueur', () => {
    process.env.CADDYNOTE_TEST_MODE = 'true';
    const pilot = getPilotReadiness();
    expect(pilot.ready).toBe(false);
    expect(pilot.blockers.some((b) => /TEST_MODE/i.test(b))).toBe(true);
  });
});
