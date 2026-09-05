import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { registerActor, auth } from './fixtures.js';

const CATEGORY = 'platform';
const KEY = 'partners';

const cleanup = () =>
  prisma.strkSetting.deleteMany({ where: { category: CATEGORY, key: KEY } });

describe('Partners API', () => {
  let adminToken: string;
  let teacherToken: string;

  beforeAll(async () => {
    const admin = await registerActor('admin');
    adminToken = admin.token;
    const teacher = await registerActor('teacher');
    teacherToken = teacher.token;
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  it('GET /public/partners retourne une liste vide sans données', async () => {
    const res = await request(app).get('/public/partners');
    expect(res.status).toBe(200);
    expect(res.body.names).toEqual([]);
  });

  it('PUT /admin/partners nécessite une authentification', async () => {
    const res = await request(app).put('/admin/partners').send({ names: ['Lycée Horizon'] });
    expect(res.status).toBe(401);
  });

  it('PUT /admin/partners nécessite admin', async () => {
    const res = await request(app)
      .put('/admin/partners')
      .set(auth(teacherToken))
      .send({ names: ['Lycée Horizon'] });
    expect(res.status).toBe(403);
  });

  it('PUT /admin/partners valide et persiste', async () => {
    const res = await request(app)
      .put('/admin/partners')
      .set(auth(adminToken))
      .send({ names: ['Lycée Horizon', 'École Verte'] });
    expect(res.status).toBe(200);
    expect(res.body.names).toEqual(['Lycée Horizon', 'École Verte']);
  });

  it('GET /public/partners retourne la liste publiée', async () => {
    const res = await request(app).get('/public/partners');
    expect(res.status).toBe(200);
    expect(res.body.names).toEqual(['Lycée Horizon', 'École Verte']);
  });

  it('GET /admin/partners retourne la liste pour admin', async () => {
    const res = await request(app).get('/admin/partners').set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.names).toEqual(['Lycée Horizon', 'École Verte']);
  });

  it('PUT /admin/partners refuse URL, javascript: et balises', async () => {
    for (const name of ['https://evil.example', 'javascript:alert(1)', '//evil.example', 'École <x>']) {
      const res = await request(app)
        .put('/admin/partners')
        .set(auth(adminToken))
        .send({ names: [name] });
      expect(res.status).toBe(400);
    }
  });

  it('PUT /admin/partners refuse plus de 12 noms', async () => {
    const names = Array.from({ length: 13 }, (_, i) => `École ${i + 1}`);
    const res = await request(app)
      .put('/admin/partners')
      .set(auth(adminToken))
      .send({ names });
    expect(res.status).toBe(400);
  });

  it('PUT /admin/partners avec une liste vide masque le bandeau public', async () => {
    const put = await request(app)
      .put('/admin/partners')
      .set(auth(adminToken))
      .send({ names: [] });
    expect(put.status).toBe(200);
    expect(put.body.names).toEqual([]);

    const res = await request(app).get('/public/partners');
    expect(res.status).toBe(200);
    expect(res.body.names).toEqual([]);
  });

  it('GET /public/partners ignore un nom dangereux déjà stocké', async () => {
    await prisma.strkSetting.upsert({
      where: { category_key: { category: CATEGORY, key: KEY } },
      create: {
        category: CATEGORY,
        key: KEY,
        value: { names: ['Lycée Horizon', 'https://evil.example'] },
        isPublic: true,
      },
      update: {
        value: { names: ['Lycée Horizon', 'https://evil.example'] },
        isPublic: true,
      },
    });

    const res = await request(app).get('/public/partners');
    expect(res.status).toBe(200);
    expect(res.body.names).toEqual(['Lycée Horizon']);
  });
});
