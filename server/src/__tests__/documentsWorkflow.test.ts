import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

/**
 * §5.9 P1 — recette génération PDF + verify token public + révocation (L7-1 / L7-3).
 */
describe('Documents — génération / verify public (§5.9)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  it('certificat → PDF → verify public valide → régénération → révocation → verify invalide', async () => {
    const v1 = await request(app)
      .post('/documents/enrollment-certificate')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ studentId: fx.a.student.id });
    expect(v1.status).toBe(201);
    expect(v1.body.document.version).toBeGreaterThanOrEqual(1);
    const token1 = v1.body.document.verificationToken as string;
    const id1 = v1.body.document.id as string;

    const download = await request(app).get(`/documents/${id1}/download`).set(auth(fx.a.schoolAdmin.token));
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toBe('application/pdf');
    expect(Buffer.from(download.body).subarray(0, 5).toString()).toBe('%PDF-');

    const verifyOk = await request(app).get(`/documents/verify/${token1}`);
    expect(verifyOk.status).toBe(200);
    expect(verifyOk.body.valid).toBe(true);
    expect(verifyOk.body.type).toBe('enrollment_certificate');
    expect(verifyOk.body.institution).toBeTruthy();
    expect(verifyOk.body.generatedAt).toBeTruthy();

    const v2 = await request(app)
      .post('/documents/enrollment-certificate')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ studentId: fx.a.student.id });
    expect(v2.status).toBe(201);
    expect(v2.body.document.version).toBeGreaterThan(v1.body.document.version);
    const id2 = v2.body.document.id as string;
    const token2 = v2.body.document.verificationToken as string;

    // L’ancienne version reste vérifiable tant qu’elle n’est pas révoquée.
    const stillOk = await request(app).get(`/documents/verify/${token1}`);
    expect(stillOk.body.valid).toBe(true);

    const revoke = await request(app).post(`/documents/${id2}/revoke`).set(auth(fx.a.schoolAdmin.token));
    expect(revoke.status).toBe(200);
    expect(revoke.body.document.status).toBe('revoked');

    const verifyRevoked = await request(app).get(`/documents/verify/${token2}`);
    expect(verifyRevoked.status).toBe(200);
    expect(verifyRevoked.body.valid).toBe(false);
    expect(verifyRevoked.body.status).toBe('revoked');
  });

  it('jeton inconnu → 404 valid:false (sans auth)', async () => {
    const res = await request(app).get('/documents/verify/token-inexistant-§5.9');
    expect(res.status).toBe(404);
    expect(res.body.valid).toBe(false);
  });
});
