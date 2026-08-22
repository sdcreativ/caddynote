import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

// ORG-004 — Lot 1 : isolation multi-tenant sur le socle (établissements,
// classes, cours, matières, utilisateurs). Chaque bloc vérifie qu'un acteur
// de l'établissement B est rejeté sur une ressource de l'établissement A
// (contrôle négatif) et qu'un acteur légitime de A y accède bien (contrôle
// positif, pour ne pas masquer un test qui échouerait "par accident").
describe('Isolation multi-tenant — socle', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  describe('institutions', () => {
    it("refuse à un school_admin de B de lire l'établissement A", async () => {
      const res = await request(app).get(`/institutions/${fx.a.institutionId}`).set(auth(fx.b.schoolAdmin.token));
      expect(res.status).toBe(403);
    });
    it("autorise le school_admin de A à lire son propre établissement", async () => {
      const res = await request(app).get(`/institutions/${fx.a.institutionId}`).set(auth(fx.a.schoolAdmin.token));
      expect(res.status).toBe(200);
    });
    it("l'admin global voit tous les établissements", async () => {
      const res = await request(app).get('/institutions').set(auth(fx.globalAdmin.token));
      expect(res.status).toBe(200);
      const ids = res.body.institutions.map((i: { id: string }) => i.id);
      expect(ids).toEqual(expect.arrayContaining([fx.a.institutionId, fx.b.institutionId]));
    });
  });

  describe('classes', () => {
    it('refuse la liste des classes de A à un enseignant de B', async () => {
      const res = await request(app)
        .get(`/classes?institutionId=${fx.a.institutionId}`)
        .set(auth(fx.b.teacher.token));
      expect(res.status).toBe(403);
    });
    it('refuse la lecture par id d’une classe de A à un enseignant de B', async () => {
      const res = await request(app).get(`/classes/${fx.a.classId}`).set(auth(fx.b.teacher.token));
      expect(res.status).toBe(403);
    });
    it('refuse la modification d’une classe de A par le school_admin de B', async () => {
      const res = await request(app)
        .patch(`/classes/${fx.a.classId}`)
        .set(auth(fx.b.schoolAdmin.token))
        .send({ name: 'Classe piratée' });
      expect(res.status).toBe(403);
    });
    it('refuse la suppression d’une classe de A par le school_admin de B', async () => {
      const res = await request(app).delete(`/classes/${fx.a.classId}`).set(auth(fx.b.schoolAdmin.token));
      expect(res.status).toBe(404);
    });
    it('autorise le school_admin de A à modifier sa propre classe', async () => {
      const res = await request(app)
        .patch(`/classes/${fx.a.classId}`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ description: 'ok' });
      expect(res.status).toBe(200);
    });
  });

  describe('courses', () => {
    it('refuse la lecture d’un cours de A à un school_admin de B', async () => {
      const res = await request(app).get(`/courses/${fx.a.courseId}`).set(auth(fx.b.schoolAdmin.token));
      expect(res.status).toBe(403);
    });
    it('refuse la création d’un cours dans A par le school_admin de B', async () => {
      const res = await request(app)
        .post('/courses')
        .set(auth(fx.b.schoolAdmin.token))
        .send({ name: 'Cours intrus', institutionId: fx.a.institutionId });
      expect(res.status).toBe(403);
    });
  });

  describe('subjects', () => {
    it('refuse la liste des matières de A à un school_admin de B', async () => {
      const res = await request(app)
        .get(`/subjects?institutionId=${fx.a.institutionId}`)
        .set(auth(fx.b.schoolAdmin.token));
      expect(res.status).toBe(403);
    });
    it('refuse la modification d’une matière de A par le school_admin de B', async () => {
      const res = await request(app)
        .patch(`/subjects/${fx.a.subjectId}`)
        .set(auth(fx.b.schoolAdmin.token))
        .send({ name: 'Piratée' });
      expect(res.status).toBe(404);
    });
    it('refuse le rattachement classe A <-> matière A par un school_admin de B', async () => {
      const res = await request(app)
        .post('/subjects/class-subjects')
        .set(auth(fx.b.schoolAdmin.token))
        .send({ classId: fx.a.classId, subjectId: fx.a.subjectId });
      expect(res.status).toBe(403);
    });
    it('refuse la liste des élèves d’une classe de A à un school_admin de B', async () => {
      const res = await request(app)
        .get(`/subjects/student-classes/by-class/${fx.a.classId}`)
        .set(auth(fx.b.schoolAdmin.token));
      expect(res.status).toBe(403);
    });
  });

  describe('schedules', () => {
    it('refuse la création d’un créneau dans A par le school_admin de B', async () => {
      const res = await request(app)
        .post('/schedules')
        .set(auth(fx.b.schoolAdmin.token))
        .send({
          courseId: fx.a.courseId,
          institutionId: fx.a.institutionId,
          dayOfWeek: 1,
          startTime: '08:00',
          endTime: '09:00',
        });
      expect(res.status).toBe(403);
    });
  });

  describe('users', () => {
    it('refuse la lecture d’un profil de A à un enseignant de B', async () => {
      const res = await request(app).get(`/users/${fx.a.teacher.id}`).set(auth(fx.b.teacher.token));
      expect(res.status).toBe(403);
    });
    it('refuse à un school_admin de B de créer un utilisateur dans A', async () => {
      const res = await request(app)
        .post('/users')
        .set(auth(fx.b.schoolAdmin.token))
        .send({ email: `intrus.${Date.now()}@isolation.test`, firstName: 'X', lastName: 'Y', role: 'teacher', institutionId: fx.a.institutionId });
      expect(res.status).toBe(403);
    });
    it('refuse à un school_admin de B de modifier le rôle/profil d’un utilisateur de A', async () => {
      const res = await request(app)
        .patch(`/users/${fx.a.teacher.id}`)
        .set(auth(fx.b.schoolAdmin.token))
        .send({ firstName: 'Piraté' });
      expect(res.status).toBe(403);
    });
  });

  describe('students', () => {
    it('un school_admin de B ne voit aucun élève de A dans la liste', async () => {
      const res = await request(app).get('/students').set(auth(fx.b.schoolAdmin.token));
      expect(res.status).toBe(200);
      const ids = res.body.students.map((s: { id: string }) => s.id);
      expect(ids).not.toContain(fx.a.student.id);
    });
    it('refuse la fiche élève de A à un enseignant de B', async () => {
      const res = await request(app).get(`/students/${fx.a.student.id}`).set(auth(fx.b.teacher.token));
      expect(res.status).toBe(403);
    });
    it('autorise l’élève lui-même à lire sa propre fiche', async () => {
      const res = await request(app).get(`/students/${fx.a.student.id}`).set(auth(fx.a.student.token));
      expect(res.status).toBe(200);
    });
  });
});
