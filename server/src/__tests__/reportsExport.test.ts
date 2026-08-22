import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

/**
 * RPT-002 — export CSV réel. `ExportsPage.tsx` simulait tout le cycle
 * (barre de progression, toast de succès) sans jamais produire de fichier ;
 * `GET /reports/export` doit désormais renvoyer un vrai CSV téléchargeable,
 * scopé à l'établissement appelant.
 */
describe('Export de rapports (RPT-002)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  it('exporte la liste des élèves en CSV, avec en-têtes de téléchargement', async () => {
    const res = await request(app)
      .get(`/reports/export?type=students&institutionId=${fx.a.institutionId}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.text).toContain('Nom,E-mail,Classe');
  });

  it('exporte les absences en CSV avec le statut de justificatif (PRS-005)', async () => {
    const absenceRes = await request(app).post('/absences').set(auth(fx.a.teacher.token)).send({
      studentId: fx.a.student.id,
      institutionId: fx.a.institutionId,
      type: 'absence',
      date: new Date().toISOString().split('T')[0],
      duration: 60,
    });
    expect(absenceRes.status).toBe(201);

    const res = await request(app)
      .get(`/reports/export?type=absences&institutionId=${fx.a.institutionId}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Statut du justificatif');
    expect(res.text).toContain('none');
  });

  it('exporte les notes publiées en CSV, sans les brouillons', async () => {
    const published = await prisma.strkGrade.create({
      data: {
        studentId: fx.a.student.id,
        courseId: fx.a.courseId,
        teacherId: fx.a.teacher.id,
        gradeValue: 15,
        maxGrade: 20,
        title: 'Contrôle publié',
        status: 'published',
      },
    });
    const draft = await prisma.strkGrade.create({
      data: {
        studentId: fx.a.student.id,
        courseId: fx.a.courseId,
        teacherId: fx.a.teacher.id,
        gradeValue: 8,
        maxGrade: 20,
        title: 'Brouillon jamais publié',
        status: 'draft',
      },
    });

    const res = await request(app)
      .get(`/reports/export?type=grades&institutionId=${fx.a.institutionId}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(res.status).toBe(200);
    expect(res.text).toContain('15');
    expect(res.text).not.toContain('Brouillon jamais publié');

    await prisma.strkGrade.deleteMany({ where: { id: { in: [published.id, draft.id] } } });
  });

  it('exporte les statistiques de présence agrégées par élève', async () => {
    const res = await request(app)
      .get(`/reports/export?type=attendance&institutionId=${fx.a.institutionId}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(res.status).toBe(200);
    expect(res.text).toContain("Nombre d'absences");
  });

  it('exporte la liste des élèves en XLSX, avec un vrai classeur (magic bytes ZIP)', async () => {
    const res = await request(app)
      .get(`/reports/export?type=students&institutionId=${fx.a.institutionId}&format=xlsx`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    expect(res.headers['content-disposition']).toContain('.xlsx');
    // Un .xlsx est une archive ZIP : les 2 premiers octets valent toujours "PK".
    expect(res.text.charCodeAt(0)).toBe(0x50);
    expect(res.text.charCodeAt(1)).toBe(0x4b);
  });

  it('exporte les absences en PDF, avec un vrai document (en-tête %PDF)', async () => {
    const absenceRes = await request(app).post('/absences').set(auth(fx.a.teacher.token)).send({
      studentId: fx.a.student.id,
      institutionId: fx.a.institutionId,
      type: 'absence',
      date: new Date().toISOString().split('T')[0],
      duration: 45,
    });
    expect(absenceRes.status).toBe(201);

    const res = await request(app)
      .get(`/reports/export?type=absences&institutionId=${fx.a.institutionId}&format=pdf`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('.pdf');
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.subarray(0, 4).toString('latin1')).toBe('%PDF');
  });

  it('exporte un PDF valide même sans aucune ligne (pas de crash sur un tableau vide)', async () => {
    const otherClassRes = await request(app)
      .post('/classes')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ name: `Classe vide ${Date.now()}`, institutionId: fx.a.institutionId });
    const emptyClassId = otherClassRes.body.class.id as string;

    const res = await request(app)
      .get(`/reports/export?type=students&institutionId=${fx.a.institutionId}&format=pdf&classId=${emptyClassId}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(res.status).toBe(200);
    expect(res.body.subarray(0, 4).toString('latin1')).toBe('%PDF');
  });

  it('rejette un format invalide', async () => {
    const res = await request(app)
      .get(`/reports/export?type=students&institutionId=${fx.a.institutionId}&format=doc`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(res.status).toBe(400);
  });

  it('RPT-001 : filtre les élèves exportés par classe', async () => {
    const otherClassRes = await request(app)
      .post('/classes')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ name: `Autre classe ${Date.now()}`, institutionId: fx.a.institutionId });
    expect(otherClassRes.status).toBe(201);
    const otherClassId = otherClassRes.body.class.id as string;

    const matching = await request(app)
      .get(`/reports/export?type=students&institutionId=${fx.a.institutionId}&classId=${fx.a.classId}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(matching.status).toBe(200);
    // Le fixture inscrit fx.a.student dans fx.a.classId — doit apparaître.
    expect(matching.text.split('\n').length).toBeGreaterThan(1);

    const nonMatching = await request(app)
      .get(`/reports/export?type=students&institutionId=${fx.a.institutionId}&classId=${otherClassId}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(nonMatching.status).toBe(200);
    // Aucun élève dans cette classe fraîchement créée : seule la ligne d'en-tête.
    expect(nonMatching.text.trim().split('\n').length).toBe(1);
  });

  it('RPT-001 : filtre les absences exportées par classe et par matière', async () => {
    const absenceRes = await request(app).post('/absences').set(auth(fx.a.teacher.token)).send({
      studentId: fx.a.student.id,
      institutionId: fx.a.institutionId,
      courseId: fx.a.courseId,
      type: 'absence',
      date: new Date().toISOString().split('T')[0],
      duration: 30,
    });
    expect(absenceRes.status).toBe(201);

    const byClass = await request(app)
      .get(`/reports/export?type=absences&institutionId=${fx.a.institutionId}&classId=${fx.a.classId}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(byClass.status).toBe(200);
    expect(byClass.text.trim().split('\n').length).toBeGreaterThan(1);

    const bySubject = await request(app)
      .get(`/reports/export?type=absences&institutionId=${fx.a.institutionId}&subjectId=${fx.a.subjectId}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(bySubject.status).toBe(200);
    expect(bySubject.text.trim().split('\n').length).toBeGreaterThan(1);

    const otherSubjectRes = await request(app)
      .post('/subjects')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ name: `Autre matière ${Date.now()}`, institutionId: fx.a.institutionId });
    expect(otherSubjectRes.status).toBe(201);
    const otherSubjectId = otherSubjectRes.body.subject.id as string;

    const noMatch = await request(app)
      .get(`/reports/export?type=absences&institutionId=${fx.a.institutionId}&subjectId=${otherSubjectId}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(noMatch.status).toBe(200);
    expect(noMatch.text.trim().split('\n').length).toBe(1);
  });

  it('RPT-001 : filtre les notes exportées par matière', async () => {
    const published = await prisma.strkGrade.create({
      data: {
        studentId: fx.a.student.id,
        courseId: fx.a.courseId,
        teacherId: fx.a.teacher.id,
        gradeValue: 12,
        maxGrade: 20,
        title: 'Contrôle filtré par matière',
        status: 'published',
      },
    });

    const bySubject = await request(app)
      .get(`/reports/export?type=grades&institutionId=${fx.a.institutionId}&subjectId=${fx.a.subjectId}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(bySubject.status).toBe(200);
    // Le titre de la note n'est pas une colonne exportée (voir csvExport.ts) —
    // on vérifie la présence de la ligne via le nombre de lignes produites.
    expect(bySubject.text.trim().split('\n').length).toBeGreaterThan(1);

    const otherSubjectRes = await request(app)
      .post('/subjects')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ name: `Matière sans note ${Date.now()}`, institutionId: fx.a.institutionId });
    const otherSubjectId = otherSubjectRes.body.subject.id as string;

    const noMatch = await request(app)
      .get(`/reports/export?type=grades&institutionId=${fx.a.institutionId}&subjectId=${otherSubjectId}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(noMatch.status).toBe(200);
    expect(noMatch.text.trim().split('\n').length).toBe(1);

    await prisma.strkGrade.delete({ where: { id: published.id } });
  });

  it("un enseignant d'un autre établissement ne peut pas exporter (ORG-004)", async () => {
    const res = await request(app)
      .get(`/reports/export?type=students&institutionId=${fx.a.institutionId}`)
      .set(auth(fx.b.teacher.token));
    expect(res.status).toBe(403);
  });

  it('un élève ne peut pas exporter (rôle insuffisant)', async () => {
    const res = await request(app)
      .get(`/reports/export?type=students&institutionId=${fx.a.institutionId}`)
      .set(auth(fx.a.student.token));
    expect(res.status).toBe(403);
  });

  it('rejette un type invalide', async () => {
    const res = await request(app)
      .get(`/reports/export?type=bogus&institutionId=${fx.a.institutionId}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(res.status).toBe(400);
  });
});
