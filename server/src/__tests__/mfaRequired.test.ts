import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import request from 'supertest';
import { generateSync } from 'otplib';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import {
  isMfaRequiredRole,
  isMfaSetupExempt,
  MFA_REQUIRED_ROLES,
  shouldEnforceMfaSetup,
  generateBackupCodes,
  hashBackupCodes,
  consumeBackupCode,
  looksLikeBackupCode,
} from '../lib/mfa.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

describe('IAM-003 — MFA obligatoire (rôles sensibles)', () => {
  it('couvre direction, secrétariat et comptabilité, pas les enseignants', () => {
    expect(MFA_REQUIRED_ROLES).toEqual(['admin', 'school_admin', 'secretary', 'accountant']);
    expect(isMfaRequiredRole('admin')).toBe(true);
    expect(isMfaRequiredRole('teacher')).toBe(false);
    expect(isMfaRequiredRole('supervisor')).toBe(false);
  });

  it('exempte uniquement le routeur /auth (enrôlement, /me, logout)', () => {
    expect(isMfaSetupExempt('/auth')).toBe(true);
    expect(isMfaSetupExempt('/users')).toBe(false);
    expect(isMfaSetupExempt('/finance')).toBe(false);
  });

  it('shouldEnforceMfaSetup : prod uniquement, rôles sensibles, hors /auth', () => {
    expect(
      shouldEnforceMfaSetup({
        nodeEnv: 'production',
        testMode: false,
        role: 'school_admin',
        mfaEnabled: false,
        routeBaseUrl: '/students',
      })
    ).toBe(true);

    expect(
      shouldEnforceMfaSetup({
        nodeEnv: 'production',
        testMode: false,
        role: 'school_admin',
        mfaEnabled: true,
        routeBaseUrl: '/students',
      })
    ).toBe(false);

    expect(
      shouldEnforceMfaSetup({
        nodeEnv: 'test',
        testMode: false,
        role: 'school_admin',
        mfaEnabled: false,
        routeBaseUrl: '/students',
      })
    ).toBe(false);

    expect(
      shouldEnforceMfaSetup({
        nodeEnv: 'production',
        testMode: true,
        role: 'school_admin',
        mfaEnabled: false,
        routeBaseUrl: '/students',
      })
    ).toBe(false);

    expect(
      shouldEnforceMfaSetup({
        nodeEnv: 'production',
        testMode: false,
        role: 'teacher',
        mfaEnabled: false,
        routeBaseUrl: '/students',
      })
    ).toBe(false);

    expect(
      shouldEnforceMfaSetup({
        nodeEnv: 'production',
        testMode: false,
        role: 'school_admin',
        mfaEnabled: false,
        routeBaseUrl: '/auth',
      })
    ).toBe(false);
  });

  it('codes de secours : hash + consommation unique', () => {
    const codes = generateBackupCodes(2);
    expect(codes).toHaveLength(2);
    expect(codes[0]).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
    const hashes = hashBackupCodes(codes);
    const first = consumeBackupCode(hashes, codes[0]);
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.remaining).toHaveLength(1);
      expect(consumeBackupCode(first.remaining, codes[0]).ok).toBe(false);
      expect(consumeBackupCode(first.remaining, codes[1]).ok).toBe(true);
    }
    expect(looksLikeBackupCode(codes[0])).toBe(true);
    expect(looksLikeBackupCode('123456')).toBe(false);
  });
});

describe('IAM-003 — recette HTTP MFA obligatoire hors test mode', () => {
  let fx: Fixture;
  const prevNodeEnv = process.env.NODE_ENV;
  const prevTestMode = process.env.CADDYNOTE_TEST_MODE;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  afterEach(async () => {
    process.env.NODE_ENV = prevNodeEnv;
    if (prevTestMode === undefined) delete process.env.CADDYNOTE_TEST_MODE;
    else process.env.CADDYNOTE_TEST_MODE = prevTestMode;
    await prisma.strkProfile.update({
      where: { id: fx.a.schoolAdmin.id },
      data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodeHashes: [] },
    });
    await prisma.strkProfile.update({
      where: { id: fx.globalAdmin.id },
      data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodeHashes: [] },
    });
  });

  it('en prod simulée, school_admin sans MFA est bloqué hors /auth', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CADDYNOTE_TEST_MODE = 'false';

    await prisma.strkProfile.update({
      where: { id: fx.a.schoolAdmin.id },
      data: { mfaEnabled: false },
    });

    const blocked = await request(app).get('/students').set(auth(fx.a.schoolAdmin.token));
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('mfa_setup_required');

    const me = await request(app).get('/auth/me').set(auth(fx.a.schoolAdmin.token));
    expect(me.status).toBe(200);
    expect(me.body.mfaSetupRequired).toBe(true);
  });

  it('en prod simulée, admin plateforme sans MFA est bloqué hors /auth (Super Admin)', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CADDYNOTE_TEST_MODE = 'false';

    await prisma.strkProfile.update({
      where: { id: fx.globalAdmin.id },
      data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodeHashes: [] },
    });

    const blocked = await request(app).get('/institutions').set(auth(fx.globalAdmin.token));
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('mfa_setup_required');

    const me = await request(app).get('/auth/me').set(auth(fx.globalAdmin.token));
    expect(me.status).toBe(200);
    expect(me.body.mfaSetupRequired).toBe(true);

    await prisma.strkProfile.update({
      where: { id: fx.globalAdmin.id },
      data: { mfaEnabled: true, mfaSecret: 'JBSWY3DPEHPK3PXP' },
    });
    const ok = await request(app).get('/institutions').set(auth(fx.globalAdmin.token));
    expect(ok.status).toBe(200);
  });

  it('en prod simulée, school_admin avec MFA passe ; enseignant sans MFA n’est pas bloqué sur /auth/me', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CADDYNOTE_TEST_MODE = 'false';

    await prisma.strkProfile.update({
      where: { id: fx.a.schoolAdmin.id },
      data: { mfaEnabled: true, mfaSecret: 'JBSWY3DPEHPK3PXP' },
    });

    const ok = await request(app).get('/students').set(auth(fx.a.schoolAdmin.token));
    expect(ok.status).not.toBe(403);

    await prisma.strkProfile.update({
      where: { id: fx.a.teacher.id },
      data: { mfaEnabled: false },
    });
    const teacher = await request(app).get('/auth/me').set(auth(fx.a.teacher.token));
    expect(teacher.status).toBe(200);
    expect(teacher.body.mfaSetupRequired).toBeFalsy();
  });

  it('login-verify accepte un code de secours une seule fois', async () => {
    const setup = await request(app).post('/auth/mfa/setup').set(auth(fx.a.teacher.token));
    expect(setup.status).toBe(200);
    const secret = setup.body.secret as string;
    const totp = generateSync({ secret });
    const confirm = await request(app)
      .post('/auth/mfa/confirm')
      .set(auth(fx.a.teacher.token))
      .send({ code: totp });
    expect(confirm.status).toBe(200);
    expect(confirm.body.backupCodes).toHaveLength(10);
    const backup = confirm.body.backupCodes[0] as string;

    const login = await request(app)
      .post('/auth/login')
      .send({ email: fx.a.teacher.email, password: 'Password123!' });
    expect(login.body.mfaRequired).toBe(true);

    const first = await request(app)
      .post('/auth/mfa/login-verify')
      .send({ challengeToken: login.body.challengeToken, code: backup });
    expect(first.status).toBe(200);
    expect(first.body.token).toBeTruthy();

    const login2 = await request(app)
      .post('/auth/login')
      .send({ email: fx.a.teacher.email, password: 'Password123!' });
    const second = await request(app)
      .post('/auth/mfa/login-verify')
      .send({ challengeToken: login2.body.challengeToken, code: backup });
    expect(second.status).toBe(401);

    // Nettoyage : désactiver MFA enseignant
    await request(app)
      .post('/auth/mfa/disable')
      .set(auth(first.body.token))
      .send({ password: 'Password123!' });
  });
});
