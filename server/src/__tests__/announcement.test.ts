import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { registerActor, auth } from './fixtures.js';

const CATEGORY = 'platform';
const KEY = 'announcement';

const cleanup = () =>
  prisma.strkSetting.deleteMany({ where: { category: CATEGORY, key: KEY } });

describe('Announcement API', () => {
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

  it('GET /public/announcement retourne null sans données', async () => {
    const res = await request(app).get('/public/announcement');
    expect(res.status).toBe(200);
    expect(res.body.announcement).toBeNull();
  });

  it('PUT /admin/announcement nécessite admin', async () => {
    const res = await request(app)
      .put('/admin/announcement')
      .set(auth(teacherToken))
      .send({ text: 'Test', shortText: 'T', ctaLabel: 'Go', ctaUrl: '/x', showYear: true, enabled: true });
    expect(res.status).toBe(403);
  });

  it('PUT /admin/announcement valide et persiste', async () => {
    const payload = {
      text: 'CaddyNote accompagne la rentrée scolaire',
      shortText: 'Rentrée — présentation sur demande',
      ctaLabel: 'Demander une présentation',
      ctaUrl: '/contact?subject=Présentation',
      showYear: true,
      enabled: true,
    };
    const res = await request(app)
      .put('/admin/announcement')
      .set(auth(adminToken))
      .send(payload);
    expect(res.status).toBe(200);
    expect(res.body.announcement).toMatchObject(payload);
  });

  it('GET /public/announcement retourne les données si activée', async () => {
    const res = await request(app).get('/public/announcement');
    expect(res.status).toBe(200);
    expect(res.body.announcement).toBeTruthy();
    expect(res.body.announcement.text).toContain('rentrée');
    expect(res.body.announcement.showYear).toBe(true);
  });

  it('PUT /admin/announcement rejette les données invalides', async () => {
    const res = await request(app)
      .put('/admin/announcement')
      .set(auth(adminToken))
      .send({ text: 123 });
    expect(res.status).toBe(400);
  });

  it('GET /admin/announcement retourne les données pour admin', async () => {
    const res = await request(app)
      .get('/admin/announcement')
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.announcement.text).toContain('rentrée');
  });

  it('PUT /admin/announcement refuse une URL externe ou javascript:', async () => {
    for (const ctaUrl of ['https://evil.example', 'javascript:alert(1)', '//evil.example']) {
      const res = await request(app)
        .put('/admin/announcement')
        .set(auth(adminToken))
        .send({
          text: 'x',
          shortText: 'x',
          ctaLabel: 'Go',
          ctaUrl,
          showYear: false,
          enabled: true,
        });
      expect(res.status).toBe(400);
    }
  });

  it('GET /public/announcement neutralise un ctaUrl externe déjà stocké', async () => {
    const legacy = {
      text: 'legacy',
      shortText: 'legacy',
      ctaLabel: 'Go',
      ctaUrl: 'https://evil.example',
      showYear: false,
      enabled: true,
    };
    await prisma.strkSetting.upsert({
      where: { category_key: { category: CATEGORY, key: KEY } },
      create: { category: CATEGORY, key: KEY, value: legacy, isPublic: true },
      update: { value: legacy, isPublic: true },
    });

    const res = await request(app).get('/public/announcement');
    expect(res.status).toBe(200);
    expect(res.body.announcement).toBeTruthy();
    expect(res.body.announcement.ctaUrl).toBe('');
  });

  it('désactiver masque le bandeau public', async () => {
    await request(app)
      .put('/admin/announcement')
      .set(auth(adminToken))
      .send({
        text: 'Test',
        shortText: 'T',
        ctaLabel: 'Go',
        ctaUrl: '/x',
        showYear: false,
        enabled: false,
      });

    const res = await request(app).get('/public/announcement');
    expect(res.status).toBe(200);
    expect(res.body.announcement).toBeNull();
  });
});
