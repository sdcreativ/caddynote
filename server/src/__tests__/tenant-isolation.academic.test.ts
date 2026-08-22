import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

// ORG-004 — couvre les correctifs apportés à absences/grades/assignments/
// signatures/exercises/guardians : ces routes vérifiaient l'établissement à
// la création et sur les listes filtrées par institutionId, mais pas sur les
// accès par id (fiche, modification, suppression) ni sur les filtres
// courseId/teacherId — un compte de l'établissement B pouvait lire ou altérer
// des notes, devoirs, absences ou signatures de l'établissement A.
describe('Isolation multi-tenant — vie scolaire', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  describe('absences', () => {
    it('refuse la liste des absences d’un cours de A à un enseignant de B', async () => {
      const res = await request(app).get(`/absences?courseId=${fx.a.courseId}`).set(auth(fx.b.teacher.token));
      expect(res.status).toBe(403);
    });
    it('refuse la création d’une absence dans A par l’enseignant de B', async () => {
      const res = await request(app)
        .post('/absences')
        .set(auth(fx.b.teacher.token))
        .send({ studentId: fx.a.student.id, institutionId: fx.a.institutionId, type: 'absence', date: '2026-01-10', duration: 60 });
      expect(res.status).toBe(403);
    });
    it('refuse la validation d’un justificatif d’absence de A par l’enseignant de B', async () => {
      const created = await request(app)
        .post('/absences')
        .set(auth(fx.a.teacher.token))
        .send({ studentId: fx.a.student.id, institutionId: fx.a.institutionId, type: 'absence', date: '2026-01-11', duration: 60 });
      expect(created.status).toBe(201);
      const res = await request(app)
        .patch(`/absences/${created.body.absence.id}/review`)
        .set(auth(fx.b.teacher.token))
        .send({ justified: true });
      expect(res.status).toBe(404);
    });
  });

  describe('grades', () => {
    it('refuse la liste des notes d’un cours de A à un enseignant de B', async () => {
      const res = await request(app).get(`/grades?courseId=${fx.a.courseId}`).set(auth(fx.b.teacher.token));
      expect(res.status).toBe(403);
    });
    it('refuse la liste des notes saisies par l’enseignant de A à l’enseignant de B', async () => {
      const res = await request(app).get(`/grades?teacherId=${fx.a.teacher.id}`).set(auth(fx.b.teacher.token));
      expect(res.status).toBe(403);
    });
    it('refuse la création d’une note pour un cours de A par l’enseignant de B', async () => {
      const res = await request(app).post('/grades').set(auth(fx.b.teacher.token)).send({
        studentId: fx.a.student.id,
        courseId: fx.a.courseId,
        teacherId: fx.b.teacher.id,
        gradeValue: 18,
        title: 'Intrusion',
        periodId: fx.a.periodId,
      });
      expect(res.status).toBe(403);
    });
    it('refuse la modification/suppression d’une note de A par l’enseignant de B', async () => {
      const created = await request(app).post('/grades').set(auth(fx.a.teacher.token)).send({
        studentId: fx.a.student.id,
        courseId: fx.a.courseId,
        teacherId: fx.a.teacher.id,
        gradeValue: 15,
        title: 'Contrôle',
        periodId: fx.a.periodId,
      });
      expect(created.status).toBe(201);
      const gradeId = created.body.grade.id;

      const patchRes = await request(app).patch(`/grades/${gradeId}`).set(auth(fx.b.teacher.token)).send({ gradeValue: 0 });
      expect(patchRes.status).toBe(403);

      const deleteRes = await request(app).delete(`/grades/${gradeId}`).set(auth(fx.b.teacher.token));
      expect(deleteRes.status).toBe(403);

      // Contrôle positif : l'enseignant de A peut bien modifier sa propre note.
      const okRes = await request(app).patch(`/grades/${gradeId}`).set(auth(fx.a.teacher.token)).send({ gradeValue: 16 });
      expect(okRes.status).toBe(200);
    });
  });

  describe('assignments (devoirs)', () => {
    let assignmentId: string;

    it('refuse la création d’un devoir sur un cours de A par l’enseignant de B', async () => {
      const res = await request(app).post('/assignments').set(auth(fx.b.teacher.token)).send({
        courseId: fx.a.courseId,
        teacherId: fx.b.teacher.id,
        title: 'Devoir intrus',
        dueDate: '2026-02-01',
      });
      expect(res.status).toBe(403);
    });

    it('autorise l’enseignant de A à créer un devoir sur son propre cours', async () => {
      const res = await request(app).post('/assignments').set(auth(fx.a.teacher.token)).send({
        courseId: fx.a.courseId,
        teacherId: fx.a.teacher.id,
        title: 'Devoir légitime',
        dueDate: '2026-02-01',
      });
      expect(res.status).toBe(201);
      assignmentId = res.body.assignment.id;
    });

    it('refuse la lecture par id du devoir de A à un enseignant de B', async () => {
      const res = await request(app).get(`/assignments/${assignmentId}`).set(auth(fx.b.teacher.token));
      expect(res.status).toBe(403);
    });

    it('refuse la modification/suppression du devoir de A par l’enseignant de B', async () => {
      const patchRes = await request(app).patch(`/assignments/${assignmentId}`).set(auth(fx.b.teacher.token)).send({ title: 'Piraté' });
      expect(patchRes.status).toBe(404);
      const deleteRes = await request(app).delete(`/assignments/${assignmentId}`).set(auth(fx.b.teacher.token));
      expect(deleteRes.status).toBe(404);
    });

    it('refuse la liste des soumissions du devoir de A à l’enseignant de B', async () => {
      const res = await request(app).get(`/assignments/${assignmentId}/submissions`).set(auth(fx.b.teacher.token));
      expect(res.status).toBe(403);
    });

    it('refuse à l’élève de B de soumettre sur le devoir de A', async () => {
      const res = await request(app)
        .post('/assignments/submissions')
        .set(auth(fx.b.student.token))
        .send({ assignmentId, studentId: fx.b.student.id });
      expect(res.status).toBe(403);
    });

    it('refuse à l’enseignant de B de noter une soumission du devoir de A', async () => {
      const submitRes = await request(app)
        .post('/assignments/submissions')
        .set(auth(fx.a.student.token))
        .send({ assignmentId, studentId: fx.a.student.id, content: 'Ma réponse' });
      expect(submitRes.status).toBe(201);
      const submissionId = submitRes.body.submission.id;

      const gradeRes = await request(app)
        .patch(`/assignments/submissions/${submissionId}/grade`)
        .set(auth(fx.b.teacher.token))
        .send({ grade: 20 });
      expect(gradeRes.status).toBe(404);

      const okRes = await request(app)
        .patch(`/assignments/submissions/${submissionId}/grade`)
        .set(auth(fx.a.teacher.token))
        .send({ grade: 17 });
      expect(okRes.status).toBe(200);
    });
  });

  describe('signatures', () => {
    it('refuse la validation d’une signature de A par le personnel de B', async () => {
      const created = await request(app).post('/signatures').set(auth(fx.a.teacher.token)).send({
        studentId: fx.a.student.id,
        institutionId: fx.a.institutionId,
        title: 'Entrée',
        type: 'entry',
        date: '2026-01-12',
      });
      expect(created.status).toBe(201);
      const signatureId = created.body.signature.id;

      const res = await request(app)
        .patch(`/signatures/${signatureId}/status`)
        .set(auth(fx.b.teacher.token))
        .send({ status: 'completed' });
      expect(res.status).toBe(403);

      const delRes = await request(app).delete(`/signatures/${signatureId}`).set(auth(fx.b.schoolAdmin.token));
      expect(delRes.status).toBe(404);
    });
  });

  describe('exercises', () => {
    it('refuse la lecture d’un exercice non publié de A à un enseignant de B', async () => {
      const created = await request(app).post('/exercises').set(auth(fx.a.teacher.token)).send({
        title: 'Exercice brouillon',
        isPublished: false,
      });
      expect(created.status).toBe(201);
      const exerciseId = created.body.exercise.id;

      const res = await request(app).get(`/exercises/${exerciseId}`).set(auth(fx.b.teacher.token));
      expect(res.status).toBe(403);

      const questionsRes = await request(app).get(`/exercises/${exerciseId}/questions`).set(auth(fx.b.teacher.token));
      expect(questionsRes.status).toBe(403);
    });

    it('un exercice publié de A reste invisible à un compte de B', async () => {
      const created = await request(app).post('/exercises').set(auth(fx.a.teacher.token)).send({
        title: 'Exercice publié',
        isPublished: true,
      });
      expect(created.status).toBe(201);
      const exerciseId = created.body.exercise.id;

      const res = await request(app).get(`/exercises/${exerciseId}`).set(auth(fx.b.student.token));
      expect(res.status).toBe(403);

      // Contrôle positif : visible pour un élève de A une fois publié.
      const okRes = await request(app).get(`/exercises/${exerciseId}`).set(auth(fx.a.student.token));
      expect(okRes.status).toBe(200);
    });
  });

  describe('guardians (ELV-002)', () => {
    it('refuse la création d’un lien responsable pour un élève de A par le school_admin de B', async () => {
      const res = await request(app)
        .post('/guardians')
        .set(auth(fx.b.schoolAdmin.token))
        .send({
          institutionId: fx.a.institutionId,
          studentId: fx.a.student.id,
          guardianId: fx.parentA.id,
          relationship: 'tutor',
        });
      expect(res.status).toBe(403);
    });

    it('refuse de rattacher un élève A via institutionId B (intégrité tenant)', async () => {
      const parentB = await import('./fixtures.js').then((m) => m.registerActor('parent', fx.b.institutionId));
      const res = await request(app)
        .post('/guardians')
        .set(auth(fx.b.schoolAdmin.token))
        .send({
          institutionId: fx.b.institutionId,
          studentId: fx.a.student.id,
          guardianId: parentB.id,
          relationship: 'tutor',
        });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('student_institution_mismatch');
    });

    it('refuse lecture / patch / désactivation des gardiens d’un élève A par B', async () => {
      const list = await request(app)
        .get(`/guardians/for-student/${fx.a.student.id}`)
        .set(auth(fx.b.schoolAdmin.token));
      expect(list.status).toBe(403);

      const linkRes = await request(app)
        .get(`/guardians/for-student/${fx.a.student.id}`)
        .set(auth(fx.a.schoolAdmin.token));
      expect(linkRes.status).toBe(200);
      const linkId = linkRes.body.guardians[0]?.id as string | undefined;
      expect(linkId).toBeTruthy();

      const patch = await request(app)
        .patch(`/guardians/${linkId}`)
        .set(auth(fx.b.schoolAdmin.token))
        .send({ canViewGrades: false });
      expect(patch.status).toBe(404);

      const deactivate = await request(app)
        .patch(`/guardians/${linkId}/deactivate`)
        .set(auth(fx.b.schoolAdmin.token));
      expect(deactivate.status).toBe(404);
    });

    it('un parent lié à un élève de A ne voit pas les élèves de B (`/my-children`)', async () => {
      const res = await request(app).get('/guardians/my-children').set(auth(fx.parentA.token));
      expect(res.status).toBe(200);
      const ids = res.body.children.map((c: { studentId: string }) => c.studentId);
      expect(ids).toContain(fx.a.student.id);
      expect(ids).not.toContain(fx.b.student.id);
    });

    it('parcours bout-en-bout : création lien → parent voit l’enfant + droits santé', async () => {
      const parent = await import('./fixtures.js').then((m) => m.registerActor('parent'));
      const link = await request(app)
        .post('/guardians')
        .set(auth(fx.a.schoolAdmin.token))
        .send({
          institutionId: fx.a.institutionId,
          studentId: fx.a.student.id,
          guardianId: parent.id,
          relationship: 'mother',
          canViewHealth: true,
          canViewDiscipline: true,
          canViewGrades: true,
        });
      expect(link.status).toBe(201);
      expect(link.body.guardian.canViewHealth).toBe(true);
      expect(link.body.guardian.canViewDiscipline).toBe(true);

      const children = await request(app).get('/guardians/my-children').set(auth(parent.token));
      expect(children.status).toBe(200);
      const child = children.body.children.find((c: { studentId: string }) => c.studentId === fx.a.student.id);
      expect(child).toBeTruthy();
      expect(child.canViewHealth).toBe(true);
      expect(child.canViewDiscipline).toBe(true);

      const health = await request(app)
        .get(`/students/${fx.a.student.id}/health`)
        .set(auth(parent.token));
      expect(health.status).toBe(200);
    });

    it('refuse l’inscription d’un élève A dans une classe de B', async () => {
      const res = await request(app)
        .post(`/students/${fx.a.student.id}/enrollments`)
        .set(auth(fx.b.schoolAdmin.token))
        .send({ classId: fx.b.classId });
      expect([403, 404]).toContain(res.status);
    });

    it('un parent de A ne peut pas consulter les notes d’un élève de B', async () => {
      const res = await request(app).get(`/grades?studentId=${fx.b.student.id}`).set(auth(fx.parentA.token));
      expect(res.status).toBe(403);
    });
  });
});
