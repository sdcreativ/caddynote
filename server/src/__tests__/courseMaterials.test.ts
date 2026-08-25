import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

describe('PED-002 — ressources de cours', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  it('l’enseignant du cours crée une ressource texte (sans S3)', async () => {
    const res = await request(app)
      .post(`/courses/${fx.a.courseId}/materials`)
      .set(auth(fx.a.teacher.token))
      .send({ title: 'Chapitre 1', type: 'article', content: 'https://example.test/cours' });
    expect(res.status).toBe(201);
    expect(res.body.material.title).toBe('Chapitre 1');
    expect(res.body.material.fileKey).toBeNull();
  });

  it('un élève du même établissement liste les ressources', async () => {
    const res = await request(app).get(`/courses/${fx.a.courseId}/materials`).set(auth(fx.a.student.token));
    expect(res.status).toBe(200);
    expect(res.body.materials.length).toBeGreaterThan(0);
  });

  it('un enseignant de l’établissement B ne liste pas les ressources de A', async () => {
    const res = await request(app).get(`/courses/${fx.a.courseId}/materials`).set(auth(fx.b.teacher.token));
    expect(res.status).toBe(403);
  });

  it('un fileKey hors dossier cours/ est rejeté', async () => {
    const res = await request(app)
      .post(`/courses/${fx.a.courseId}/materials`)
      .set(auth(fx.a.teacher.token))
      .send({ title: 'Intrus', type: 'pdf', fileKey: 'documents/inst-x/secret.pdf' });
    expect(res.status).toBe(400);
  });

  it('un fileKey valide sans S3 répond 501', async () => {
    const res = await request(app)
      .post(`/courses/${fx.a.courseId}/materials`)
      .set(auth(fx.a.teacher.token))
      .send({ title: 'PDF', type: 'pdf', fileKey: 'cours/inst-x/chapitre.pdf' });
    expect(res.status).toBe(501);
  });
});
