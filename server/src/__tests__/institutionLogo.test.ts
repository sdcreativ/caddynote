import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { buildObjectKey, buildTenantScope } from '../lib/s3.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

describe('PATCH /institutions/:id — logo', () => {
  let fx: Fixture;
  const cleanupIds: string[] = [];

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  afterAll(async () => {
    for (const id of cleanupIds) {
      await prisma.strkInstitution.delete({ where: { id } }).catch(() => {});
    }
  });

  it('accepte un logo fraîchement uploadé par un admin global (scope user-*)', async () => {
    const institution = await prisma.strkInstitution.create({
      data: { name: `LogoAdmin ${Date.now()}`, type: 'school' },
    });
    cleanupIds.push(institution.id);

    // Même clé que produirait POST /files/presign-upload pour un admin sans institutionId.
    const logoKey = buildObjectKey(
      'avatars',
      buildTenantScope(null, fx.globalAdmin.id),
      'logo.webp'
    );

    const patch = await request(app)
      .patch(`/institutions/${institution.id}`)
      .set(auth(fx.globalAdmin.token))
      .send({ logo: logoKey });
    expect(patch.status).toBe(200);
    expect(patch.body.institution.logo).toBe(logoKey);
  });

  it('conserve un logo déjà enregistré même s’il n’est plus dans le scope uploader', async () => {
    const legacyKey = 'https://cdn.example/legacy-logo.png';
    const institution = await prisma.strkInstitution.create({
      data: { name: `LogoLegacy ${Date.now()}`, type: 'school', logo: legacyKey },
    });
    cleanupIds.push(institution.id);

    const patch = await request(app)
      .patch(`/institutions/${institution.id}`)
      .set(auth(fx.globalAdmin.token))
      .send({ name: 'Renamed', logo: legacyKey });
    expect(patch.status).toBe(200);
    expect(patch.body.institution.logo).toBe(legacyKey);
    expect(patch.body.institution.name).toBe('Renamed');
  });

  it('refuse une clé d’un autre établissement', async () => {
    const institution = await prisma.strkInstitution.create({
      data: { name: `LogoDeny ${Date.now()}`, type: 'school' },
    });
    cleanupIds.push(institution.id);

    const foreignKey = buildObjectKey(
      'avatars',
      buildTenantScope('00000000-0000-4000-8000-000000000099', fx.globalAdmin.id),
      'x.png'
    );

    const patch = await request(app)
      .patch(`/institutions/${institution.id}`)
      .set(auth(fx.globalAdmin.token))
      .send({ logo: foreignKey });
    expect(patch.status).toBe(403);
    expect(patch.body.error).toMatch(/espace de stockage/i);
  });
});
