import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import {
  ensureBootstrapAdmin,
  retireBootstrapAdmin,
  validateBootstrapCredentials,
  clearBootstrapMarker,
  countActiveAdmins,
} from '../lib/bootstrapAdmin.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';
import { hashPassword } from '../lib/password.js';

describe('Bootstrap super-admin', () => {
  const prevEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const prevPass = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const prevDeploy = process.env.CADDYNOTE_DEPLOYMENT;

  afterEach(async () => {
    if (prevEmail === undefined) delete process.env.BOOTSTRAP_ADMIN_EMAIL;
    else process.env.BOOTSTRAP_ADMIN_EMAIL = prevEmail;
    if (prevPass === undefined) delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
    else process.env.BOOTSTRAP_ADMIN_PASSWORD = prevPass;
    if (prevDeploy === undefined) delete process.env.CADDYNOTE_DEPLOYMENT;
    else process.env.CADDYNOTE_DEPLOYMENT = prevDeploy;

    await prisma.strkProfile
      .deleteMany({ where: { email: { endsWith: '@bootstrap.test' } } })
      .catch(() => undefined);
    await clearBootstrapMarker();
  });

  it('refuse les identifiants démo', () => {
    expect(validateBootstrapCredentials('admin@caddynote.test', 'SuperSecret123456!')).toMatch(
      /caddynote\.test/
    );
    expect(validateBootstrapCredentials('ops@example.com', 'Test1234!')).toMatch(/faible|démo/i);
    expect(validateBootstrapCredentials('ops@example.com', 'short')).toMatch(/court/i);
  });

  it('crée un admin si aucun admin actif et vars valides', async () => {
    const email = `boot.${Date.now()}@bootstrap.test`;
    process.env.BOOTSTRAP_ADMIN_EMAIL = email;
    process.env.BOOTSTRAP_ADMIN_PASSWORD = 'BootstrapSecret99!!';

    const existingAdmins = await prisma.strkProfile.findMany({
      where: { role: 'admin', isActive: true },
      select: { id: true },
    });
    await prisma.strkProfile.updateMany({
      where: { role: 'admin', isActive: true },
      data: { isActive: false },
    });

    try {
      const result = await ensureBootstrapAdmin();
      expect(result.status).toBe('created');
      if (result.status === 'created') {
        expect(result.email).toBe(email);
        const row = await prisma.strkProfile.findUnique({ where: { email } });
        expect(row?.role).toBe('admin');
        expect(row?.isActive).toBe(true);
        expect(row?.institutionId).toBeNull();
      }
      // Second appel : skip (admin déjà là)
      const again = await ensureBootstrapAdmin();
      expect(again.status).toBe('skipped');
    } finally {
      await prisma.strkProfile.deleteMany({ where: { email } });
      await clearBootstrapMarker();
      if (existingAdmins.length) {
        await prisma.strkProfile.updateMany({
          where: { id: { in: existingAdmins.map((a) => a.id) } },
          data: { isActive: true },
        });
      }
    }
  });

  it('ne recrée pas si un admin existe déjà', async () => {
    const fx: Fixture = await buildFixture();
    const email = `boot.skip.${Date.now()}@bootstrap.test`;
    process.env.BOOTSTRAP_ADMIN_EMAIL = email;
    process.env.BOOTSTRAP_ADMIN_PASSWORD = 'BootstrapSecret99!!';
    const result = await ensureBootstrapAdmin();
    expect(result.status).toBe('skipped');
    const ghost = await prisma.strkProfile.findUnique({ where: { email } });
    expect(ghost).toBeNull();
    // sanity fixture admin
    expect(fx.globalAdmin.id).toBeTruthy();
  });

  it('retire le bootstrap après un second admin', async () => {
    const email = `boot.retire.${Date.now()}@bootstrap.test`;
    const passwordHash = await hashPassword('BootstrapSecret99!!');
    const bootstrap = await prisma.strkProfile.create({
      data: {
        email,
        passwordHash,
        firstName: 'Bootstrap',
        lastName: 'Admin',
        role: 'admin',
        institutionId: null,
      },
    });
    await prisma.strkSetting.upsert({
      where: { category_key: { category: 'platform', key: 'bootstrap_admin' } },
      create: {
        category: 'platform',
        key: 'bootstrap_admin',
        value: { email, profileId: bootstrap.id, createdAt: new Date().toISOString() },
        description: 'test',
        isPublic: false,
      },
      update: {
        value: { email, profileId: bootstrap.id, createdAt: new Date().toISOString() },
      },
    });

    const real = await prisma.strkProfile.create({
      data: {
        email: `real.${Date.now()}@bootstrap.test`,
        passwordHash,
        firstName: 'Real',
        lastName: 'Admin',
        role: 'admin',
        institutionId: null,
      },
    });

    const retired = await retireBootstrapAdmin(real.id);
    expect(retired.deactivated).toBe(true);
    const after = await prisma.strkProfile.findUnique({ where: { id: bootstrap.id } });
    expect(after?.isActive).toBe(false);

    await prisma.strkProfile.deleteMany({ where: { id: { in: [bootstrap.id, real.id] } } });
  });

  it('GET /admin/bootstrap/status exige admin', async () => {
    const fx = await buildFixture();
    await request(app).get('/admin/bootstrap/status').expect(401);
    const res = await request(app)
      .get('/admin/bootstrap/status')
      .set(auth(fx.globalAdmin.token))
      .expect(200);
    expect(res.body).toHaveProperty('activeAdminCount');
    expect(res.body).toHaveProperty('envConfigured');
  });
});

describe('validateBootstrapCredentials staging length', () => {
  const prev = process.env.CADDYNOTE_DEPLOYMENT;
  afterEach(() => {
    if (prev === undefined) delete process.env.CADDYNOTE_DEPLOYMENT;
    else process.env.CADDYNOTE_DEPLOYMENT = prev;
  });

  it('exige 16 caractères en production', () => {
    process.env.CADDYNOTE_DEPLOYMENT = 'production';
    expect(validateBootstrapCredentials('ops@example.com', 'OnlyTwelve12!')).toMatch(/16/);
    expect(validateBootstrapCredentials('ops@example.com', 'SixteenCharsOK!!')).toBeNull();
  });
});
