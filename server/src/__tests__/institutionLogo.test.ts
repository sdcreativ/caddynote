import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { buildObjectKey, buildTenantScope } from '../lib/s3.js';
import { putStoredObject } from '../lib/fileStorage.js';
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

  it('laisse la direction lire un logo enregistré sous le scope user-* de l’admin', async () => {
    const logoKey = buildObjectKey(
      'avatars',
      buildTenantScope(null, fx.globalAdmin.id),
      'brand.webp'
    );
    await putStoredObject(logoKey, Buffer.from('fake-webp-bytes'), 'image/webp');
    await prisma.strkInstitution.update({
      where: { id: fx.a.institutionId },
      data: { logo: logoKey },
    });

    try {
      const allowed = await request(app)
        .post('/files/presign-download')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ key: logoKey });
      expect(allowed.status).toBe(200);

      const content = await request(app)
        .get(`/files/content?key=${encodeURIComponent(logoKey)}`)
        .set(auth(fx.a.schoolAdmin.token));
      expect(content.status).toBe(200);

      const denied = await request(app)
        .post('/files/presign-download')
        .set(auth(fx.b.schoolAdmin.token))
        .send({ key: logoKey });
      expect(denied.status).toBe(403);
    } finally {
      await prisma.strkInstitution.update({
        where: { id: fx.a.institutionId },
        data: { logo: null },
      });
    }
  });

  it('laisse enseignant, élève et parent lire le logo établissement', async () => {
    const logoKey = buildObjectKey(
      'avatars',
      buildTenantScope(null, fx.globalAdmin.id),
      'shared-brand.webp'
    );
    await putStoredObject(logoKey, Buffer.from('shared-logo'), 'image/webp');
    await prisma.strkInstitution.update({
      where: { id: fx.a.institutionId },
      data: { logo: logoKey },
    });

    try {
      for (const actor of [fx.a.teacher, fx.a.student, fx.parentA]) {
        const allowed = await request(app)
          .post('/files/presign-download')
          .set(auth(actor.token))
          .send({ key: logoKey });
        expect(allowed.status, `role token ${actor.email}`).toBe(200);
      }

      const foreign = await request(app)
        .post('/files/presign-download')
        .set(auth(fx.b.teacher.token))
        .send({ key: logoKey });
      expect(foreign.status).toBe(403);
    } finally {
      await prisma.strkInstitution.update({
        where: { id: fx.a.institutionId },
        data: { logo: null },
      });
    }
  });

  it('autorise le parent à lire GET /institutions/:id de l’école de son enfant', async () => {
    const res = await request(app)
      .get(`/institutions/${fx.a.institutionId}`)
      .set(auth(fx.parentA.token));
    expect(res.status).toBe(200);
    expect(res.body.institution.id).toBe(fx.a.institutionId);

    const denied = await request(app)
      .get(`/institutions/${fx.b.institutionId}`)
      .set(auth(fx.parentA.token));
    expect(denied.status).toBe(403);
  });

  it('presign-upload avec institutionId place la clé sous inst-* pour l’admin global', async () => {
    const upload = await request(app)
      .post('/files/presign-upload')
      .set(auth(fx.globalAdmin.token))
      .send({
        folder: 'avatars',
        filename: 'logo.png',
        contentType: 'image/png',
        institutionId: fx.a.institutionId,
      });
    expect(upload.status).toBe(200);
    expect(upload.body.key).toMatch(new RegExp(`^avatars/inst-${fx.a.institutionId}/`));
  });
});
