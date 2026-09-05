import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { registerActor, auth } from './fixtures.js';
import { DEFAULT_PUBLIC_EMAIL } from '../lib/publicVitrine.js';

const CATEGORY = 'platform';
const KEYS = ['testimonials', 'publicContact', 'publicStats', 'faq'];

const cleanup = () =>
  prisma.strkSetting.deleteMany({ where: { category: CATEGORY, key: { in: KEYS } } });

const testimonial = {
  quote: 'Les parents sont informés plus vite et nos équipes gagnent du temps.',
  name: 'Marie Kouassi',
  role: 'Directrice',
  place: 'Abidjan',
};

describe('Vitrine API', () => {
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

  it('GET /public/vitrine est vide hors e-mail officiel', async () => {
    const res = await request(app).get('/public/vitrine');
    expect(res.status).toBe(200);
    expect(res.body.testimonials).toEqual([]);
    expect(res.body.faq).toEqual([]);
    expect(res.body.stats).toEqual({ schools: null, students: null });
    expect(res.body.contact).toEqual({ email: DEFAULT_PUBLIC_EMAIL, phone: '', whatsapp: '' });
  });

  it('PUT /admin/vitrine/* exige admin', async () => {
    const res = await request(app)
      .put('/admin/vitrine/testimonials')
      .set(auth(teacherToken))
      .send({ items: [testimonial] });
    expect(res.status).toBe(403);
  });

  it('publie un témoignage puis le sert au public', async () => {
    const put = await request(app)
      .put('/admin/vitrine/testimonials')
      .set(auth(adminToken))
      .send({ items: [testimonial] });
    expect(put.status).toBe(200);
    expect(put.body.items).toEqual([testimonial]);

    const res = await request(app).get('/public/vitrine');
    expect(res.body.testimonials).toEqual([testimonial]);
  });

  it('refuse un témoignage avec URL ou HTML', async () => {
    const res = await request(app)
      .put('/admin/vitrine/testimonials')
      .set(auth(adminToken))
      .send({ items: [{ ...testimonial, place: 'https://evil.example' }] });
    expect(res.status).toBe(400);
  });

  it('enregistre les coordonnées et masque le téléphone vide', async () => {
    const put = await request(app)
      .put('/admin/vitrine/contact')
      .set(auth(adminToken))
      .send({ email: 'hello@caddynote.com', phone: '', whatsapp: '+225 07 00 00 00 00' });
    expect(put.status).toBe(200);
    expect(put.body.email).toBe('hello@caddynote.com');
    expect(put.body.phone).toBe('');

    const res = await request(app).get('/public/vitrine');
    expect(res.body.contact.email).toBe('hello@caddynote.com');
    expect(res.body.contact.whatsapp).toContain('225');
  });

  it('refuse un faux numéro de téléphone', async () => {
    const res = await request(app)
      .put('/admin/vitrine/contact')
      .set(auth(adminToken))
      .send({ email: 'hello@caddynote.com', phone: 'javascript:alert(1)', whatsapp: '' });
    expect(res.status).toBe(400);
  });

  it('publie uniquement des chiffres entiers positifs', async () => {
    const put = await request(app)
      .put('/admin/vitrine/stats')
      .set(auth(adminToken))
      .send({ schools: 2, students: null });
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ schools: 2, students: null });

    const bad = await request(app)
      .put('/admin/vitrine/stats')
      .set(auth(adminToken))
      .send({ schools: 0, students: 10 });
    expect(bad.status).toBe(400);
  });

  it('publie une FAQ et ignore une entrée déjà stockée dangereuse', async () => {
    const item = { q: 'Comment me connecter ?', a: 'Utilisez l’e-mail fourni par votre établissement.' };
    const put = await request(app)
      .put('/admin/vitrine/faq')
      .set(auth(adminToken))
      .send({ items: [item] });
    expect(put.status).toBe(200);

    await prisma.strkSetting.update({
      where: { category_key: { category: CATEGORY, key: 'faq' } },
      data: { value: { items: [item, { q: '<script>', a: 'https://evil.example/x' }] } },
    });

    const res = await request(app).get('/public/vitrine');
    expect(res.body.faq).toEqual([item]);
  });

  it('GET /admin/vitrine agrège les sections pour l’admin', async () => {
    const res = await request(app).get('/admin/vitrine').set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.testimonials[0].name).toBe('Marie Kouassi');
    expect(res.body.stats.schools).toBe(2);
  });
});
