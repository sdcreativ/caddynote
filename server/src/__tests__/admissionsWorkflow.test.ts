import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';
import { fillRequiredAdmissionPacket } from './admissionPacketFill.js';

/**
 * §5.12 — recette machine à états + enroll ; PJ S3 → 501 + signal public.
 */
describe('Admissions — workflow & stockage (§5.12)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  const payload = (overrides: Record<string, unknown> = {}) => ({
    institutionId: fx.a.institutionId,
    classId: fx.a.classId,
    academicYear: '2026-2027',
    studentFirstName: `Ada${Date.now().toString(36)}`,
    studentLastName: 'Lovelace',
    studentBirthDate: '2014-12-10',
    studentGender: 'female',
    guardians: [
      {
        firstName: 'Parent',
        lastName: 'Lovelace',
        email: `parent.512.${Date.now()}@admissions.test`,
        phone: '+221770000512',
        relationship: 'mother',
      },
    ],
    contactEmail: `contact.512.${Date.now()}@admissions.test`,
    ...overrides,
  });

  describe('P1 — machine à états + enroll', () => {
    it('draft → submitted → conditionally_accepted → enrolled (+ certificat)', async () => {
      const created = await request(app).post('/admissions').send(payload());
      expect(created.status).toBe(201);
      expect(created.body.application.status).toBe('draft');
      expect(typeof created.body.fileStorageAvailable).toBe('boolean');
      const { id, publicToken } = created.body.application;

      const status = await request(app).get(`/admissions/status/${publicToken}`);
      expect(status.status).toBe(200);
      expect(status.body.fileStorageAvailable).toBe(created.body.fileStorageAvailable);

      await fillRequiredAdmissionPacket(app, publicToken);
      const submitted = await request(app).post(`/admissions/status/${publicToken}/submit`).send({});
      expect(submitted.status).toBe(200);
      expect(submitted.body.application.status).toBe('submitted');

      // Enroll direct depuis submitted interdit si on force conditionally_accepted d’abord…
      // (ALLOWED : submitted → enrolled OK aussi — on teste le chemin « accepté sous condition ».)
      const accept = await request(app)
        .patch(`/admissions/${id}/status`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ status: 'conditionally_accepted', decisionNotes: 'Dossier complet §5.12' });
      expect(accept.status).toBe(200);
      expect(accept.body.application.status).toBe('conditionally_accepted');

      const enroll = await request(app).post(`/admissions/${id}/enroll`).set(auth(fx.a.schoolAdmin.token));
      expect(enroll.status).toBe(201);
      expect(enroll.body.studentId).toBeTruthy();
      expect(enroll.body.studentNumber).toMatch(/^\d{4}-[0-9A-F]{6}$/);
      expect(enroll.body.documentId).toBeTruthy();

      const after = await request(app).get(`/admissions/status/${publicToken}`);
      expect(after.body.application.status).toBe('enrolled');

      // Transition impossible depuis enrolled
      const reopen = await request(app)
        .patch(`/admissions/${id}/status`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ status: 'rejected' });
      expect(reopen.status).toBe(409);
    });

    it('submitted → needs_info → re-submit → enroll direct', async () => {
      const created = await request(app).post('/admissions').send(payload({ studentFirstName: 'NeedsInfo' }));
      const { id, publicToken } = created.body.application;
      await fillRequiredAdmissionPacket(app, publicToken);
      await request(app).post(`/admissions/status/${publicToken}/submit`).send({});

      const needs = await request(app)
        .patch(`/admissions/${id}/status`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ status: 'needs_info', decisionNotes: 'Extrait manquant' });
      expect(needs.status).toBe(200);

      const badEnroll = await request(app).post(`/admissions/${id}/enroll`).set(auth(fx.a.schoolAdmin.token));
      expect(badEnroll.status).toBe(409);

      const resubmit = await request(app).post(`/admissions/status/${publicToken}/submit`).send({});
      expect(resubmit.body.application.status).toBe('submitted');

      const enroll = await request(app).post(`/admissions/${id}/enroll`).set(auth(fx.a.schoolAdmin.token));
      expect(enroll.status).toBe(201);
    });
  });

  describe('P2 — pièces jointes (S3 ou repli local)', () => {
    it('presign-upload propose le mode local lorsque S3 est absent', async () => {
      const created = await request(app).post('/admissions').send(payload({ studentFirstName: 'NoS3' }));
      expect(created.status).toBe(201);
      expect(created.body.fileStorageAvailable).toBe(true);
      const token = created.body.application.publicToken as string;

      const presign = await request(app)
        .post(`/admissions/status/${token}/documents/presign-upload`)
        .send({ filename: 'id.pdf', contentType: 'application/pdf' });

      expect(presign.status).toBe(200);
      if (presign.body.mode === 's3') {
        expect(presign.body.url).toBeTruthy();
        expect(presign.body.fields).toBeTruthy();
      } else {
        expect(presign.body.mode).toBe('local');
        expect(presign.body.key).toMatch(/^admissions\//);
        expect(presign.body.uploadPath).toContain('/documents/direct-upload');

        const pdf = Buffer.from('%PDF-1.4 local-test');
        const put = await request(app)
          .put(`/admissions/status/${token}/documents/direct-upload`)
          .set('Content-Type', 'application/pdf')
          .set('X-Object-Key', presign.body.key)
          .send(pdf);
        expect(put.status).toBe(201);

        const attached = await request(app)
          .post(`/admissions/status/${token}/documents`)
          .send({ label: 'Pièce test', fileKey: presign.body.key });
        expect(attached.status).toBe(200);
        expect(attached.body.application.documents).toEqual(
          expect.arrayContaining([expect.objectContaining({ label: 'Pièce test', fileKey: presign.body.key })])
        );
      }
    });
  });
});
