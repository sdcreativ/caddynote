import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import request from 'supertest';
import { generateSync } from 'otplib';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import {
  isMfaRequiredRole,
  isMfaSetupExempt,
  MFA_REQUIRED_ROLES,
  MFA_GRACE_DAYS,
  computeMfaGraceUntil,
  isMfaGraceExpired,
  shouldEnforceMfaSetup,
  shouldEnforcePasswordChange,
  generateBackupCodes,
  hashBackupCodes,
  consumeBackupCode,
  looksLikeBackupCode,
} from '../lib/mfa.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

describe('IAM-003 — MFA grâce 7 j (rôles sensibles)', () => {
  it('couvre direction, secrétariat et comptabilité, pas les enseignants', () => {
    expect(MFA_REQUIRED_ROLES).toEqual(['admin', 'school_admin', 'secretary', 'accountant']);
    expect(MFA_GRACE_DAYS).toBe(7);
    expect(isMfaRequiredRole('admin')).toBe(true);
    expect(isMfaRequiredRole('teacher')).toBe(false);
    expect(isMfaRequiredRole('supervisor')).toBe(false);
  });

  it('exempte uniquement le routeur /auth', () => {
    expect(isMfaSetupExempt('/auth')).toBe(true);
    expect(isMfaSetupExempt('/users')).toBe(false);
    expect(isMfaSetupExempt('/finance')).toBe(false);
  });

  it('shouldEnforceMfaSetup : pas de blocage pendant la grâce', () => {
    const inGrace = computeMfaGraceUntil();
    expect(isMfaGraceExpired(inGrace)).toBe(false);
    expect(
      shouldEnforceMfaSetup({
        nodeEnv: 'production',
        testMode: false,
        role: 'school_admin',
        mfaEnabled: false,
        routeBaseUrl: '/students',
        mfaGraceUntil: inGrace,
      })
    ).toBe(false);
  });

  it('shouldEnforceMfaSetup : bloque après expiration de la grâce', () => {
    const expired = new Date(Date.now() - 60_000);
    expect(isMfaGraceExpired(expired)).toBe(true);
    expect(
      shouldEnforceMfaSetup({
        nodeEnv: 'production',
        testMode: false,
        role: 'school_admin',
        mfaEnabled: false,
        routeBaseUrl: '/students',
        mfaGraceUntil: expired,
      })
    ).toBe(true);
  });

  it('shouldEnforceMfaSetup : null = pas encore démarré → ne bloque pas', () => {
    expect(
      shouldEnforceMfaSetup({
        nodeEnv: 'production',
        testMode: false,
        role: 'school_admin',
        mfaEnabled: false,
        routeBaseUrl: '/students',
        mfaGraceUntil: null,
      })
    ).toBe(false);
  });

  it('shouldEnforcePasswordChange bloque hors /auth', () => {
    expect(
      shouldEnforcePasswordChange({ mustChangePassword: true, routeBaseUrl: '/students' })
    ).toBe(true);
    expect(shouldEnforcePasswordChange({ mustChangePassword: true, routeBaseUrl: '/auth' })).toBe(
      false
    );
    expect(
      shouldEnforcePasswordChange({ mustChangePassword: false, routeBaseUrl: '/students' })
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

describe('IAM-003 — MFA soft + mot de passe provisoire', () => {
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
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        mfaBackupCodeHashes: [],
        mustChangePassword: false,
        mfaGraceUntil: null,
      },
    });
    await prisma.strkProfile.update({
      where: { id: fx.globalAdmin.id },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        mfaBackupCodeHashes: [],
        mustChangePassword: false,
        mfaGraceUntil: null,
      },
    });
  });

  it('pendant la grâce : school_admin sans MFA non bloqué + mfaRecommended', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CADDYNOTE_TEST_MODE = 'false';

    const graceUntil = computeMfaGraceUntil();
    await prisma.strkProfile.update({
      where: { id: fx.a.schoolAdmin.id },
      data: { mfaEnabled: false, mustChangePassword: false, mfaGraceUntil: graceUntil },
    });

    const ok = await request(app).get('/students').set(auth(fx.a.schoolAdmin.token));
    expect(ok.status).not.toBe(403);

    const me = await request(app).get('/auth/me').set(auth(fx.a.schoolAdmin.token));
    expect(me.status).toBe(200);
    expect(me.body.mfaSetupRequired).toBe(false);
    expect(me.body.mfaRecommended).toBe(true);
    expect(me.body.mfaGraceUntil).toBeTruthy();
  });

  it('après expiration grâce : APIs métier bloquées (mfa_setup_required)', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CADDYNOTE_TEST_MODE = 'false';

    await prisma.strkProfile.update({
      where: { id: fx.a.schoolAdmin.id },
      data: {
        mfaEnabled: false,
        mustChangePassword: false,
        mfaGraceUntil: new Date(Date.now() - 60_000),
      },
    });

    const blocked = await request(app).get('/students').set(auth(fx.a.schoolAdmin.token));
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('mfa_setup_required');

    const me = await request(app).get('/auth/me').set(auth(fx.a.schoolAdmin.token));
    expect(me.status).toBe(200);
    expect(me.body.mfaSetupRequired).toBe(true);
    expect(me.body.mfaRecommended).toBe(false);
  });

  it('mot de passe provisoire : APIs métier bloquées jusqu’au change-password', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CADDYNOTE_TEST_MODE = 'false';

    await prisma.strkProfile.update({
      where: { id: fx.a.schoolAdmin.id },
      data: { mustChangePassword: true, mfaEnabled: false },
    });

    const blocked = await request(app).get('/students').set(auth(fx.a.schoolAdmin.token));
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('password_change_required');

    const me = await request(app).get('/auth/me').set(auth(fx.a.schoolAdmin.token));
    expect(me.status).toBe(200);
    expect(me.body.mustChangePassword).toBe(true);

    const changed = await request(app)
      .post('/auth/change-password')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ currentPassword: 'Password123!', newPassword: 'Password456!' });
    expect(changed.status).toBe(200);

    const after = await request(app).get('/students').set(auth(fx.a.schoolAdmin.token));
    expect(after.status).not.toBe(403);

    // Restaure le mot de passe fixture pour les autres tests.
    await request(app)
      .post('/auth/change-password')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ currentPassword: 'Password456!', newPassword: 'Password123!' });
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

    await request(app)
      .post('/auth/mfa/disable')
      .set(auth(first.body.token))
      .send({ password: 'Password123!' });
  });
});
