import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

/**
 * §5.4 — cycle signature : création (personnel) → signature élève → lecture parent
 * (canViewAttendance) ; refus cross-tenant.
 */
describe('Signatures — create / complete / parent view (§5.4)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  const createSignature = async () => {
    const res = await request(app).post('/signatures').set(auth(fx.a.teacher.token)).send({
      studentId: fx.a.student.id,
      institutionId: fx.a.institutionId,
      title: 'Émargement cours test',
      type: 'entry',
      date: new Date().toISOString(),
    });
    expect(res.status).toBe(201);
    return res.body.signature.id as string;
  };

  it('l’élève peut compléter sa propre signature', async () => {
    const id = await createSignature();
    const res = await request(app)
      .patch(`/signatures/${id}/status`)
      .set(auth(fx.a.student.token))
      .send({ status: 'completed', signatureData: 'data:image/png;base64,abc' });
    expect(res.status).toBe(200);
    expect(res.body.signature.status).toBe('completed');
    expect(res.body.signature.verified).toBe(true);
    expect(res.body.signature.completedAt).toBeTruthy();
  });

  it('le parent (canViewAttendance) peut lister la signature de son enfant', async () => {
    const id = await createSignature();
    const res = await request(app)
      .get(`/signatures?studentId=${fx.a.student.id}`)
      .set(auth(fx.parentA.token));
    expect(res.status).toBe(200);
    expect(res.body.signatures.some((s: { id: string }) => s.id === id)).toBe(true);
  });

  it('le personnel d’un autre établissement ne peut pas valider la signature', async () => {
    const id = await createSignature();
    const res = await request(app)
      .patch(`/signatures/${id}/status`)
      .set(auth(fx.b.teacher.token))
      .send({ status: 'completed' });
    expect(res.status).toBe(403);
  });

  it('un élève d’un autre établissement ne peut pas lire la signature', async () => {
    const id = await createSignature();
    const res = await request(app).get(`/signatures/${id}`).set(auth(fx.b.student.token));
    expect(res.status).toBe(403);
  });
});
