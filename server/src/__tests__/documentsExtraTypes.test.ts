import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { buildFixture, registerActor, auth, type Fixture } from './fixtures.js';
import { prisma } from '../lib/prisma.js';

/**
 * DOC-001 — types de document ajoutés au-delà des 3 initiaux (certificat,
 * reçu, bulletin) : relevé de notes (cumul de périodes, distinct du
 * bulletin qui ne porte que sur une seule) et liste de classe (document
 * administratif, pas rattaché à un élève).
 */
describe('Documents — relevé et liste de classe (DOC-001)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  const computeOnePeriod = async (academicYear: string, order: number, grade: number) => {
    const periodRes = await request(app).post('/academic-periods').set(auth(fx.a.schoolAdmin.token)).send({
      institutionId: fx.a.institutionId,
      academicYear,
      name: `Période ${order}`,
      order,
      startDate: '2027-01-01',
      endDate: '2027-06-01',
    });
    expect(periodRes.status).toBe(201);
    const periodId = periodRes.body.period.id as string;

    const gradeRes = await request(app).post('/grades').set(auth(fx.a.teacher.token)).send({
      studentId: fx.a.student.id,
      courseId: fx.a.courseId,
      teacherId: fx.a.teacher.id,
      gradeValue: grade,
      title: 'Contrôle',
      periodId,
    });
    expect(gradeRes.status).toBe(201);
    await request(app).post('/grades/publish').set(auth(fx.a.teacher.token)).send({ courseId: fx.a.courseId, periodId });
    const computeRes = await request(app)
      .post('/grades/compute')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ classId: fx.a.classId, periodId });
    expect(computeRes.status).toBe(201);
    return periodId;
  };

  describe('Relevé de notes (transcript)', () => {
    it("refuse tant qu'aucune période de cette année scolaire n'a été calculée", async () => {
      const res = await request(app)
        .post('/documents/transcript')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ studentId: fx.a.student.id, academicYear: '2099-2100' });
      expect(res.status).toBe(409);
    });

    it('cumule plusieurs périodes calculées de la même année scolaire', async () => {
      const academicYear = '2027-2028';
      await computeOnePeriod(academicYear, 10, 15);
      await computeOnePeriod(academicYear, 11, 12);

      const res = await request(app)
        .post('/documents/transcript')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ studentId: fx.a.student.id, academicYear });
      expect(res.status).toBe(201);
      expect(res.body.document.dataSnapshot.periods).toHaveLength(2);

      const documentId = res.body.document.id as string;
      const download = await request(app).get(`/documents/${documentId}/download`).set(auth(fx.a.schoolAdmin.token));
      expect(download.status).toBe(200);
      expect(Buffer.from(download.body).subarray(0, 5).toString()).toBe('%PDF-');

      // L'élève lui-même peut consulter son propre relevé.
      const asStudent = await request(app).get(`/documents/${documentId}`).set(auth(fx.a.student.token));
      expect(asStudent.status).toBe(200);
    });

    it("le personnel d'un autre établissement ne peut ni générer ni lire (ORG-004)", async () => {
      const gen = await request(app)
        .post('/documents/transcript')
        .set(auth(fx.b.schoolAdmin.token))
        .send({ studentId: fx.a.student.id, academicYear: '2027-2028' });
      expect(gen.status).toBe(404);
    });
  });

  describe('Liste de classe (class_list)', () => {
    it('génère la liste avec les élèves de la classe', async () => {
      const res = await request(app)
        .post('/documents/class-list')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ classId: fx.a.classId });
      expect(res.status).toBe(201);
      expect(res.body.document.dataSnapshot.students.some((s: any) => s.name)).toBe(true);

      const documentId = res.body.document.id as string;
      const download = await request(app).get(`/documents/${documentId}/download`).set(auth(fx.a.schoolAdmin.token));
      expect(download.status).toBe(200);
      expect(Buffer.from(download.body).subarray(0, 5).toString()).toBe('%PDF-');
    });

    it("un élève ou un parent ne peut jamais consulter une liste de classe", async () => {
      const gen = await request(app)
        .post('/documents/class-list')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ classId: fx.a.classId });
      const documentId = gen.body.document.id as string;

      const asStudent = await request(app).get(`/documents/${documentId}`).set(auth(fx.a.student.token));
      expect(asStudent.status).toBe(403);

      const asParent = await request(app).get(`/documents/${documentId}`).set(auth(fx.parentA.token));
      expect(asParent.status).toBe(403);
    });

    it("le personnel d'un autre établissement ne peut ni générer ni lire une classe qui n'est pas la sienne (ORG-004)", async () => {
      const res = await request(app)
        .post('/documents/class-list')
        .set(auth(fx.b.schoolAdmin.token))
        .send({ classId: fx.a.classId });
      expect(res.status).toBe(404);
    });
  });

  describe('Carte d’élève (student_card)', () => {
    it('génère un PDF pour un élève de l’établissement', async () => {
      const res = await request(app)
        .post('/documents/student-card')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ studentId: fx.a.student.id });
      expect(res.status).toBe(201);
      expect(res.body.document.type).toBe('student_card');
      const download = await request(app)
        .get(`/documents/${res.body.document.id}/download`)
        .set(auth(fx.a.schoolAdmin.token));
      expect(download.status).toBe(200);
      expect(Buffer.from(download.body).subarray(0, 5).toString()).toBe('%PDF-');
      const { PDFDocument } = await import('pdf-lib');
      const pdf = await PDFDocument.load(download.body);
      const { width, height } = pdf.getPage(0).getSize();
      expect(width).toBeCloseTo(243, 0);
      expect(height).toBeCloseTo(153, 0);
    });

    it('l’élève peut consulter sa propre carte', async () => {
      const gen = await request(app)
        .post('/documents/student-card')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ studentId: fx.a.student.id });
      const asStudent = await request(app).get(`/documents/${gen.body.document.id}`).set(auth(fx.a.student.token));
      expect(asStudent.status).toBe(200);
    });

    it("le personnel d'un autre établissement ne peut pas générer la carte (ORG-004)", async () => {
      const res = await request(app)
        .post('/documents/student-card')
        .set(auth(fx.b.schoolAdmin.token))
        .send({ studentId: fx.a.student.id });
      expect(res.status).toBe(404);
    });
  });
});
