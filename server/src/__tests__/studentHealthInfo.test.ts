import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

/**
 * ELV-001 — volet santé/contact d'urgence du dossier élève. Catégorie de
 * données plus sensible que le reste du dossier (identité/scolarité) :
 * contrôle d'accès dédié (StrkStudentGuardian.canViewHealth), écriture
 * réservée au personnel et aux responsables ayant ce droit — jamais à
 * l'élève lui-même.
 */
describe('Dossier santé de l’élève (ELV-001)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  it("est vide par défaut, puis renseigné par le personnel", async () => {
    const empty = await request(app)
      .get(`/students/${fx.a.student.id}/health`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(empty.status).toBe(200);
    expect(empty.body.healthInfo).toBeNull();

    const write = await request(app)
      .put(`/students/${fx.a.student.id}/health`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({
        allergies: 'Arachides',
        emergencyContactName: 'Jean Dupont',
        emergencyContactPhone: '+33600000000',
      });
    expect(write.status).toBe(200);
    expect(write.body.healthInfo.allergies).toBe('Arachides');
    expect(write.body.healthInfo.emergencyContactName).toBe('Jean Dupont');

    const read = await request(app)
      .get(`/students/${fx.a.student.id}/health`)
      .set(auth(fx.a.teacher.token));
    expect(read.status).toBe(200);
    expect(read.body.healthInfo.allergies).toBe('Arachides');
  });

  it('un parent avec canViewHealth (par défaut) peut lire et mettre à jour', async () => {
    const read = await request(app)
      .get(`/students/${fx.a.student.id}/health`)
      .set(auth(fx.parentA.token));
    expect(read.status).toBe(200);

    const write = await request(app)
      .put(`/students/${fx.a.student.id}/health`)
      .set(auth(fx.parentA.token))
      .send({ medicalConditions: 'Asthme léger' });
    expect(write.status).toBe(200);
    expect(write.body.healthInfo.medicalConditions).toBe('Asthme léger');
  });

  it('un parent sans canViewHealth ne peut ni lire ni écrire', async () => {
    const restrictedParent = await import('./fixtures.js').then((m) => m.registerActor('parent'));
    const link = await request(app).post('/guardians').set(auth(fx.a.schoolAdmin.token)).send({
      institutionId: fx.a.institutionId,
      studentId: fx.a.student.id,
      guardianId: restrictedParent.id,
      relationship: 'other_authorized',
      canViewHealth: false,
    });
    expect(link.status).toBe(201);

    const read = await request(app)
      .get(`/students/${fx.a.student.id}/health`)
      .set(auth(restrictedParent.token));
    expect(read.status).toBe(403);

    const write = await request(app)
      .put(`/students/${fx.a.student.id}/health`)
      .set(auth(restrictedParent.token))
      .send({ allergies: 'Ne devrait pas être accepté' });
    expect(write.status).toBe(403);
  });

  it("l'élève lui-même peut lire mais pas écrire son propre dossier santé", async () => {
    const read = await request(app)
      .get(`/students/${fx.a.student.id}/health`)
      .set(auth(fx.a.student.token));
    expect(read.status).toBe(200);

    const write = await request(app)
      .put(`/students/${fx.a.student.id}/health`)
      .set(auth(fx.a.student.token))
      .send({ allergies: 'Auto-déclaration' });
    expect(write.status).toBe(403);
  });

  it("le personnel d'un autre établissement ne peut pas accéder (ORG-004)", async () => {
    const read = await request(app)
      .get(`/students/${fx.a.student.id}/health`)
      .set(auth(fx.b.teacher.token));
    expect(read.status).toBe(403);

    const write = await request(app)
      .put(`/students/${fx.a.student.id}/health`)
      .set(auth(fx.b.schoolAdmin.token))
      .send({ allergies: 'Ne devrait pas être accepté' });
    expect(write.status).toBe(403);
  });
});
