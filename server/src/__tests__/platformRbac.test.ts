import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { buildFixture, auth, registerActor, type Fixture } from './fixtures.js';
import { syncPlatformRbacCatalog } from '../lib/platformRbac/seed.js';
import { resolvePlatformAccess } from '../lib/platformRbac/resolve.js';
import { assignPlatformRole, replaceUserPlatformRoles, PlatformRbacError } from '../lib/platformRbac/manage.js';
import { PLATFORM_SYSTEM_ROLES } from '../lib/platformRbac/systemRoles.js';
import { PLATFORM_PERMISSIONS } from '../lib/platformRbac/catalog.js';

describe('RBAC administration plateforme CaddyNote', () => {
  let fx: Fixture;
  let owner: Awaited<ReturnType<typeof registerActor>>;
  let supportOnly: Awaited<ReturnType<typeof registerActor>>;

  beforeAll(async () => {
    fx = await buildFixture();
    await syncPlatformRbacCatalog();

    owner = await registerActor('admin');
    supportOnly = await registerActor('admin');

    // Owner = platform_owner + capacité promote
    await replaceUserPlatformRoles({
      userId: owner.id,
      roleCodes: ['platform_owner', 'super_admin'],
      actorId: owner.id,
      actorRole: 'admin',
    });

    await replaceUserPlatformRoles({
      userId: supportOnly.id,
      roleCodes: ['support_l1'],
      actorId: owner.id,
      actorRole: 'admin',
    });
  }, 60000);

  it('catalogue contient tous les rôles et permissions du document', () => {
    expect(PLATFORM_SYSTEM_ROLES.length).toBe(34);
    expect(PLATFORM_PERMISSIONS.length).toBeGreaterThanOrEqual(50);
    expect(PLATFORM_SYSTEM_ROLES.map((r) => r.code)).toContain('desps_admin');
    expect(PLATFORM_SYSTEM_ROLES.map((r) => r.code)).toContain('platform_owner');
  });

  it('support_l1 ne peut pas lire la facturation SaaS', async () => {
    const access = await resolvePlatformAccess(supportOnly.id, 'admin');
    expect(access.permissions.has('platform.support.tickets')).toBe(true);
    expect(access.permissions.has('platform.billing.manage')).toBe(false);

    const res = await request(app).get('/subscriptions/all').set(auth(supportOnly.token));
    expect(res.status).toBe(403);
  });

  it('union multi-rôles : billing + support', async () => {
    const hybrid = await registerActor('admin');
    await replaceUserPlatformRoles({
      userId: hybrid.id,
      roleCodes: ['support_l1', 'billing_admin'],
      actorId: owner.id,
      actorRole: 'admin',
    });
    const access = await resolvePlatformAccess(hybrid.id, 'admin');
    expect(access.permissions.has('platform.support.tickets')).toBe(true);
    expect(access.permissions.has('platform.billing.manage')).toBe(true);
  });

  it('ignore un rôle expiré au profit des rôles actifs', async () => {
    const tmp = await registerActor('admin');
    await replaceUserPlatformRoles({
      userId: tmp.id,
      roleCodes: ['support_l1'],
      actorId: owner.id,
      actorRole: 'admin',
    });
    const billing = await prisma.strkPlatformRole.findUniqueOrThrow({ where: { code: 'billing_admin' } });
    await prisma.strkPlatformUserRole.create({
      data: {
        userId: tmp.id,
        roleId: billing.id,
        expiresAt: new Date(Date.now() - 60_000),
        grantedBy: owner.id,
      },
    });
    const access = await resolvePlatformAccess(tmp.id, 'admin');
    expect(access.roleCodes).toContain('support_l1');
    expect(access.roleCodes).not.toContain('billing_admin');
    expect(access.permissions.has('platform.support.tickets')).toBe(true);
    expect(access.permissions.has('platform.billing.manage')).toBe(false);
  });

  it('plafond super_admin', async () => {
    const max = Number(process.env.PLATFORM_SUPER_ADMIN_MAX || 2);
    const current = await prisma.strkPlatformUserRole.count({
      where: { role: { code: 'super_admin' }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    });
    // Remplir jusqu’au plafond si besoin, puis refuser
    const extras: string[] = [];
    while (current + extras.length < max) {
      const a = await registerActor('admin');
      await assignPlatformRole({
        userId: a.id,
        roleCode: 'super_admin',
        actorId: owner.id,
        actorRole: 'admin',
      });
      extras.push(a.id);
    }
    const overflow = await registerActor('admin');
    await expect(
      assignPlatformRole({
        userId: overflow.id,
        roleCode: 'super_admin',
        actorId: owner.id,
        actorRole: 'admin',
      })
    ).rejects.toBeInstanceOf(PlatformRbacError);
  });

  it('API catalogue et me/scopes', async () => {
    const roles = await request(app).get('/admin/platform-rbac/roles').set(auth(owner.token));
    expect(roles.status).toBe(200);
    expect(roles.body.roles.length).toBe(34);

    const me = await request(app).get('/admin/me/scopes').set(auth(supportOnly.token));
    expect(me.status).toBe(200);
    expect(me.body.roleCodes).toContain('support_l1');
    expect(me.body.permissions).toContain('platform.support.tickets');
  });

  it('support_l1 ne peut pas gérer le RBAC', async () => {
    const res = await request(app)
      .put(`/admin/platform-rbac/users/${fx.a.schoolAdmin.id}/roles`)
      .set(auth(supportOnly.token))
      .send({ roleCodes: ['auditor'] });
    expect([403, 400]).toContain(res.status);
  });
});
