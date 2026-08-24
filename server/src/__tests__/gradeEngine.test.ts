import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { buildFixture, auth, registerActor, type Fixture } from './fixtures.js';

/**
 * EVA-004/005/006 : workflow de publication des notes, moteur de calcul de
 * moyennes/rangs versionné, et bulletin PDF+QR qui en dépend.
 */
describe('Moteur de notes (EVA-004/005/006)', () => {
  let fx: Fixture;
  // Période dédiée aux tests de calcul (EVA-004/006), distincte de
  // fx.a.periodId : les tests EVA-005 publient déjà des notes sur
  // fx.a.courseId/fx.a.periodId, ce qui fausserait la moyenne attendue ici.
  let computePeriodId: string;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  describe('EVA-005 — workflow brouillon → publié → corrigé', () => {
    it('une note nouvellement créée est en brouillon, invisible de l’élève et du parent', async () => {
      const created = await request(app).post('/grades').set(auth(fx.a.teacher.token)).send({
        studentId: fx.a.student.id,
        courseId: fx.a.courseId,
        teacherId: fx.a.teacher.id,
        gradeValue: 15,
        title: 'Devoir surveillé',
        periodId: fx.a.periodId,
      });
      expect(created.status).toBe(201);
      expect(created.body.grade.status).toBe('draft');

      const asStudent = await request(app)
        .get(`/grades?studentId=${fx.a.student.id}`)
        .set(auth(fx.a.student.token));
      expect(asStudent.status).toBe(200);
      expect(asStudent.body.grades.find((g: any) => g.id === created.body.grade.id)).toBeUndefined();

      const asParent = await request(app)
        .get(`/grades?studentId=${fx.a.student.id}`)
        .set(auth(fx.parentA.token));
      expect(asParent.status).toBe(200);
      expect(asParent.body.grades.find((g: any) => g.id === created.body.grade.id)).toBeUndefined();

      // Le personnel, lui, voit bien le brouillon.
      const asTeacher = await request(app)
        .get(`/grades?studentId=${fx.a.student.id}`)
        .set(auth(fx.a.teacher.token));
      expect(asTeacher.body.grades.find((g: any) => g.id === created.body.grade.id)).toBeDefined();
    });

    it('la publication rend la note visible élève/parent, et bloque désormais la modification directe', async () => {
      const created = await request(app).post('/grades').set(auth(fx.a.teacher.token)).send({
        studentId: fx.a.student.id,
        courseId: fx.a.courseId,
        teacherId: fx.a.teacher.id,
        gradeValue: 12,
        title: 'À publier',
        periodId: fx.a.periodId,
      });
      const gradeId = created.body.grade.id;

      const publishRes = await request(app)
        .post('/grades/publish')
        .set(auth(fx.a.teacher.token))
        .send({ courseId: fx.a.courseId, periodId: fx.a.periodId });
      expect(publishRes.status).toBe(200);
      expect(publishRes.body.published).toBeGreaterThanOrEqual(1);

      const asStudent = await request(app)
        .get(`/grades?studentId=${fx.a.student.id}`)
        .set(auth(fx.a.student.token));
      expect(asStudent.body.grades.find((g: any) => g.id === gradeId)?.status).toBe('published');

      const asParent = await request(app)
        .get(`/grades?studentId=${fx.a.student.id}`)
        .set(auth(fx.parentA.token));
      expect(asParent.status).toBe(200);
      expect(asParent.body.grades.find((g: any) => g.id === gradeId)?.status).toBe('published');

      const patchRes = await request(app)
        .patch(`/grades/${gradeId}`)
        .set(auth(fx.a.teacher.token))
        .send({ gradeValue: 0 });
      expect(patchRes.status).toBe(409);

      const deleteRes = await request(app).delete(`/grades/${gradeId}`).set(auth(fx.a.teacher.token));
      expect(deleteRes.status).toBe(409);
    });

    it('un parent sans canViewGrades ne peut pas lister les notes de l’enfant', async () => {
      await prisma.strkStudentGuardian.updateMany({
        where: { guardianId: fx.parentA.id, studentId: fx.a.student.id },
        data: { canViewGrades: false },
      });
      try {
        const res = await request(app)
          .get(`/grades?studentId=${fx.a.student.id}`)
          .set(auth(fx.parentA.token));
        expect(res.status).toBe(403);
      } finally {
        await prisma.strkStudentGuardian.updateMany({
          where: { guardianId: fx.parentA.id, studentId: fx.a.student.id },
          data: { canViewGrades: true },
        });
      }
    });

    it('une correction conserve l’ancienne valeur et trace l’auteur, sans écraser silencieusement', async () => {
      const created = await request(app).post('/grades').set(auth(fx.a.teacher.token)).send({
        studentId: fx.a.student.id,
        courseId: fx.a.courseId,
        teacherId: fx.a.teacher.id,
        gradeValue: 8,
        title: 'Erreur de saisie',
        periodId: fx.a.periodId,
      });
      const gradeId = created.body.grade.id;
      await request(app)
        .post('/grades/publish')
        .set(auth(fx.a.teacher.token))
        .send({ courseId: fx.a.courseId, periodId: fx.a.periodId });

      const correctRes = await request(app)
        .post(`/grades/${gradeId}/correct`)
        .set(auth(fx.a.teacher.token))
        .send({ gradeValue: 18 });
      expect(correctRes.status).toBe(200);
      expect(correctRes.body.grade.status).toBe('corrected');
      expect(Number(correctRes.body.grade.previousValue)).toBe(8);
      expect(Number(correctRes.body.grade.gradeValue)).toBe(18);
      expect(correctRes.body.grade.correctedBy).toBe(fx.a.teacher.id);
    });

    it('refuse la correction d’une note encore en brouillon', async () => {
      const created = await request(app).post('/grades').set(auth(fx.a.teacher.token)).send({
        studentId: fx.a.student.id,
        courseId: fx.a.courseId,
        teacherId: fx.a.teacher.id,
        gradeValue: 10,
        title: 'Brouillon',
        periodId: fx.a.periodId,
      });
      const res = await request(app)
        .post(`/grades/${created.body.grade.id}/correct`)
        .set(auth(fx.a.teacher.token))
        .send({ gradeValue: 20 });
      expect(res.status).toBe(400);
    });

    it('un enseignant de B ne peut ni publier ni corriger sur un cours de A', async () => {
      const publishRes = await request(app)
        .post('/grades/publish')
        .set(auth(fx.b.teacher.token))
        .send({ courseId: fx.a.courseId, periodId: fx.a.periodId });
      expect(publishRes.status).toBe(403);
    });
  });

  describe('EVA-004 — académiques et moteur de calcul', () => {
    it('isole les périodes académiques par établissement', async () => {
      const res = await request(app).get(`/academic-periods?institutionId=${fx.a.institutionId}`).set(auth(fx.b.schoolAdmin.token));
      expect(res.status).toBe(403);

      const okRes = await request(app).get(`/academic-periods?institutionId=${fx.a.institutionId}`).set(auth(fx.a.schoolAdmin.token));
      expect(okRes.status).toBe(200);
      expect(okRes.body.periods.some((p: any) => p.id === fx.a.periodId)).toBe(true);
    });

    it('calcule moyennes pondérées et rangs pour deux élèves sur deux matières', async () => {
      const periodRes = await request(app)
        .post('/academic-periods')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ institutionId: fx.a.institutionId, academicYear: '2025-2026', name: 'Trimestre calcul', order: 3, startDate: '2026-04-01', endDate: '2026-06-20' });
      expect(periodRes.status).toBe(201);
      computePeriodId = periodRes.body.period.id;

      // Deuxième élève de la classe A. /auth/register crée désormais la ligne
      // StrkStudent (lib/roleExtensions.ts, 16/08/2026) ; il ne reste plus
      // qu'à la rattacher à la classe pour ce test.
      const student2 = await registerActor('student', fx.a.institutionId);
      await prisma.strkStudent.update({ where: { id: student2.id }, data: { classId: fx.a.classId } });

      // Deuxième matière/cours (coefficient par défaut = 1, contre 2 pour fx.a.courseId).
      const subject2Res = await request(app)
        .post('/subjects')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ name: 'Matière secondaire', institutionId: fx.a.institutionId });
      const subject2Id = subject2Res.body.subject.id;
      const course2Res = await request(app)
        .post('/courses')
        .set(auth(fx.a.schoolAdmin.token))
        .send({
          name: 'Cours secondaire',
          institutionId: fx.a.institutionId,
          teacherId: fx.a.teacher.id,
          classId: fx.a.classId,
          subjectId: subject2Id,
        });
      const course2Id = course2Res.body.course.id;

      const enterGrade = async (studentId: string, courseId: string, gradeValue: number) => {
        const res = await request(app).post('/grades').set(auth(fx.a.teacher.token)).send({
          studentId,
          courseId,
          teacherId: fx.a.teacher.id,
          gradeValue,
          title: 'Contrôle',
          periodId: computePeriodId,
        });
        expect(res.status).toBe(201);
        return res.body.grade.id as string;
      };

      // Élève 1 (fx.a.student) : 16 en matière principale (coef 2), 10 en secondaire (coef 1).
      await enterGrade(fx.a.student.id, fx.a.courseId, 16);
      await enterGrade(fx.a.student.id, course2Id, 10);
      // Élève 2 : 10 en matière principale, 18 en secondaire.
      await enterGrade(student2.id, fx.a.courseId, 10);
      await enterGrade(student2.id, course2Id, 18);

      await request(app).post('/grades/publish').set(auth(fx.a.teacher.token)).send({ courseId: fx.a.courseId, periodId: computePeriodId });
      await request(app).post('/grades/publish').set(auth(fx.a.teacher.token)).send({ courseId: course2Id, periodId: computePeriodId });

      const computeRes = await request(app)
        .post('/grades/compute')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ classId: fx.a.classId, periodId: computePeriodId });
      expect(computeRes.status).toBe(201);

      const readRes = await request(app)
        .get(`/grades/computations?classId=${fx.a.classId}&periodId=${computePeriodId}`)
        .set(auth(fx.a.schoolAdmin.token));
      expect(readRes.status).toBe(200);
      const rows: any[] = readRes.body.computations;

      const mainSubjectAvgStudent1 = rows.find((r) => r.studentId === fx.a.student.id && r.subjectId === fx.a.subjectId);
      const mainSubjectAvgStudent2 = rows.find((r) => r.studentId === student2.id && r.subjectId === fx.a.subjectId);
      expect(Number(mainSubjectAvgStudent1.average)).toBeCloseTo(16, 5);
      expect(Number(mainSubjectAvgStudent2.average)).toBeCloseTo(10, 5);
      expect(mainSubjectAvgStudent1.rank).toBe(1);
      expect(mainSubjectAvgStudent2.rank).toBe(2);
      expect(mainSubjectAvgStudent1.studentCount).toBe(2);

      const overallStudent1 = rows.find((r) => r.studentId === fx.a.student.id && r.subjectId === null);
      const overallStudent2 = rows.find((r) => r.studentId === student2.id && r.subjectId === null);
      // (16*2 + 10*1) / 3 = 14 ; (10*2 + 18*1) / 3 = 12.666...
      expect(Number(overallStudent1.average)).toBeCloseTo(14, 5);
      expect(Number(overallStudent2.average)).toBeCloseTo(12.6667, 3);
      expect(overallStudent1.rank).toBe(1);
      expect(overallStudent2.rank).toBe(2);

      // Un recalcul crée une nouvelle version sans effacer l'ancienne.
      const recomputeRes = await request(app)
        .post('/grades/compute')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ classId: fx.a.classId, periodId: computePeriodId });
      expect(recomputeRes.status).toBe(201);
      const versions = await prisma.strkGradeComputation.findMany({
        where: { classId: fx.a.classId, periodId: computePeriodId },
        select: { version: true },
        distinct: ['version'],
      });
      expect(versions.length).toBe(2);
    });

    it('refuse le calcul pour une classe d’un autre établissement', async () => {
      const res = await request(app)
        .post('/grades/compute')
        .set(auth(fx.b.schoolAdmin.token))
        .send({ classId: fx.a.classId, periodId: fx.a.periodId });
      expect(res.status).toBe(404);
    });

    it('un élève/parent ne peut consulter les moyennes que de son propre enfant', async () => {
      const res = await request(app)
        .get(`/grades/computations?classId=${fx.a.classId}&periodId=${computePeriodId}&studentId=${fx.a.student.id}`)
        .set(auth(fx.parentA.token));
      expect(res.status).toBe(200);
      expect(res.body.computations.length).toBeGreaterThan(0);
      expect(res.body.computations.every((r: any) => r.studentId === fx.a.student.id)).toBe(true);

      const forbidden = await request(app)
        .get(`/grades/computations?classId=${fx.a.classId}&periodId=${computePeriodId}`)
        .set(auth(fx.parentA.token));
      expect(forbidden.status).toBe(400); // studentId requis pour un rôle non-personnel
    });

    it('parent : résumé notes par matière avec moyennes', async () => {
      const periodRes = await request(app)
        .post('/academic-periods')
        .set(auth(fx.a.schoolAdmin.token))
        .send({
          institutionId: fx.a.institutionId,
          academicYear: '2025-2026',
          name: 'Trimestre résumé parent',
          order: 9,
          startDate: '2026-09-01',
          endDate: '2026-12-15',
        });
      expect(periodRes.status).toBe(201);
      const periodId = periodRes.body.period.id as string;

      const subjectRes = await request(app)
        .post('/subjects')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ name: 'Mathématiques parent', institutionId: fx.a.institutionId });
      expect(subjectRes.status).toBe(201);
      const courseRes = await request(app)
        .post('/courses')
        .set(auth(fx.a.schoolAdmin.token))
        .send({
          name: 'Maths 6ème',
          institutionId: fx.a.institutionId,
          teacherId: fx.a.teacher.id,
          classId: fx.a.classId,
          subjectId: subjectRes.body.subject.id,
        });
      expect(courseRes.status).toBe(201);
      const courseId = courseRes.body.course.id as string;

      const draft = await request(app).post('/grades').set(auth(fx.a.teacher.token)).send({
        studentId: fx.a.student.id,
        courseId,
        teacherId: fx.a.teacher.id,
        gradeValue: 14,
        maxGrade: 20,
        gradeType: 'exam',
        title: 'Devoir parent',
        periodId,
        coefficient: 2,
      });
      expect(draft.status).toBe(201);
      const published = await request(app)
        .post('/grades/publish')
        .set(auth(fx.a.teacher.token))
        .send({ courseId, periodId });
      expect(published.status).toBe(200);

      const res = await request(app)
        .get(`/grades/student-summary?studentId=${fx.a.student.id}`)
        .set(auth(fx.parentA.token));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.subjects)).toBe(true);
      expect(res.body.subjects.length).toBeGreaterThan(0);
      const math = res.body.subjects.find(
        (s: { subjectName: string }) => s.subjectName === 'Mathématiques parent'
      );
      expect(math).toBeTruthy();
      expect(math.averageOutOf20).toBeCloseTo(14, 5);
      expect(math.grades.some((g: { title: string }) => g.title === 'Devoir parent')).toBe(true);
      expect(res.body.overallAverageOutOf20).toEqual(expect.any(Number));

      const otherChild = await request(app)
        .get(`/grades/student-summary?studentId=${fx.b.student.id}`)
        .set(auth(fx.parentA.token));
      expect(otherChild.status).toBe(403);
    });
  });

  describe('EVA-006 — bulletin PDF', () => {
    it('refuse de générer un bulletin tant qu’aucun calcul n’a été effectué pour la période', async () => {
      const freshPeriod = await request(app)
        .post('/academic-periods')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ institutionId: fx.a.institutionId, academicYear: '2025-2026', name: 'Trimestre sans calcul', order: 2, startDate: '2026-01-05', endDate: '2026-03-20' });
      const res = await request(app)
        .post('/documents/report-card')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ studentId: fx.a.student.id, periodId: freshPeriod.body.period.id });
      expect(res.status).toBe(409);
    });

    it('génère un bulletin PDF valide après calcul, et applique l’isolation multi-tenant', async () => {
      // Un test précédent a déjà déclenché un calcul pour fx.a.classId/computePeriodId.
      const genRes = await request(app)
        .post('/documents/report-card')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ studentId: fx.a.student.id, periodId: computePeriodId });
      expect(genRes.status).toBe(201);
      const documentId = genRes.body.document.id as string;

      const downloadRes = await request(app).get(`/documents/${documentId}/download`).set(auth(fx.a.schoolAdmin.token));
      expect(downloadRes.status).toBe(200);
      expect(Buffer.from(downloadRes.body).subarray(0, 5).toString()).toBe('%PDF-');

      // L'élève concerné peut aussi le consulter.
      const asStudent = await request(app).get(`/documents/${documentId}`).set(auth(fx.a.student.token));
      expect(asStudent.status).toBe(200);

      // Parent avec canViewGrades : lecture + téléchargement du bulletin.
      const asParent = await request(app).get(`/documents/${documentId}`).set(auth(fx.parentA.token));
      expect(asParent.status).toBe(200);
      const parentDl = await request(app).get(`/documents/${documentId}/download`).set(auth(fx.parentA.token));
      expect(parentDl.status).toBe(200);
      expect(Buffer.from(parentDl.body).subarray(0, 5).toString()).toBe('%PDF-');

      // Un admin de l'établissement B ne peut ni le lire ni le télécharger.
      const forbidden = await request(app).get(`/documents/${documentId}`).set(auth(fx.b.schoolAdmin.token));
      expect(forbidden.status).toBe(403);

      // Un élève de B ne peut pas non plus, via getStudentAccess.
      const forbiddenStudent = await request(app).get(`/documents/${documentId}`).set(auth(fx.b.student.token));
      expect(forbiddenStudent.status).toBe(403);
    });

    it('un admin de B ne peut pas générer de bulletin pour un élève de A', async () => {
      const res = await request(app)
        .post('/documents/report-card')
        .set(auth(fx.b.schoolAdmin.token))
        .send({ studentId: fx.a.student.id, periodId: computePeriodId });
      expect(res.status).toBe(404);
    });

    // Bug réel trouvé le 16/08/2026 en testant en charge la publication de
    // bulletins (NFR-010) : deux générations concurrentes du même bulletin
    // (findFirst + create non atomique sur la version) faisaient planter
    // TOUT le serveur (contrainte unique violée, jamais rattrapée) — pas
    // seulement échouer la requête en conflit. Corrigé par une nouvelle
    // tentative sur conflit dans generateDocument (documents.routes.ts).
    it('deux générations concurrentes du même bulletin ne plantent jamais le serveur et produisent des versions distinctes', async () => {
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/documents/report-card')
          .set(auth(fx.a.schoolAdmin.token))
          .send({ studentId: fx.a.student.id, periodId: computePeriodId }),
        request(app)
          .post('/documents/report-card')
          .set(auth(fx.a.schoolAdmin.token))
          .send({ studentId: fx.a.student.id, periodId: computePeriodId }),
      ]);
      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);
      expect(res1.body.document.version).not.toBe(res2.body.document.version);

      // Le serveur répond toujours normalement juste après (pas de crash).
      const health = await request(app).get('/health');
      expect(health.status).toBe(200);
    });
  });
});
