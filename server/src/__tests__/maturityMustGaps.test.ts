import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';
import { markAdmissionFeePaidByProviderRef } from '../routes/admissions.routes.js';
import { renderStudentCardPdf } from '../lib/pdf.js';

/**
 * Couverture des gaps MUST maturité métier livrés le 16/08/2026 :
 * PED-001 cahier de textes, EVA-003 import CSV, FIN échéanciers,
 * ELV-003 parcours, DOC attestation/facture/carte wallet, admissions fee online helper.
 */
describe('Maturité métier — gaps MUST', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  it('PED-001 : crée et liste des séances de cahier de textes', async () => {
    const create = await request(app)
      .post(`/courses/${fx.a.courseId}/lessons`)
      .set(auth(fx.a.teacher.token))
      .send({
        lessonDate: '2026-09-01',
        title: 'Séance 1',
        contentCovered: 'Fractions — addition',
        homeworkGiven: 'Exercices 1 à 5',
      });
    expect(create.status).toBe(201);
    expect(create.body.lesson.contentCovered).toContain('Fractions');

    const list = await request(app)
      .get(`/courses/${fx.a.courseId}/lessons`)
      .set(auth(fx.a.teacher.token));
    expect(list.status).toBe(200);
    expect(list.body.lessons.length).toBeGreaterThanOrEqual(1);
  });

  it('EVA-003 : importe des notes depuis un CSV', async () => {
    await prisma.strkStudent.update({
      where: { id: fx.a.student.id },
      data: { studentNumber: 'MAT-IMPORT-1' },
    });

    const res = await request(app)
      .post('/grades/import')
      .set(auth(fx.a.teacher.token))
      .send({
        csv: 'studentNumber,gradeValue\nMAT-IMPORT-1,14.5\n',
        courseId: fx.a.courseId,
        teacherId: fx.a.teacher.id,
        periodId: fx.a.periodId,
        title: 'Import CSV test',
      });
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(1);
  });

  it('FIN : crée un échéancier qui génère N factures', async () => {
    const res = await request(app)
      .post('/finance/payment-plans')
      .set(auth(fx.a.schoolAdmin.token))
      .send({
        studentId: fx.a.student.id,
        label: 'Scolarité test',
        currency: 'XOF',
        installments: [
          { dueDate: '2026-10-01', amountCents: 50000, label: 'T1' },
          { dueDate: '2027-01-01', amountCents: 50000, label: 'T2' },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.plan.invoices).toHaveLength(2);
    expect(res.body.plan.totalCents).toBe(100000);
  });

  it('ELV-003 : liste et clôture un parcours scolaire', async () => {
    const enroll = await request(app)
      .post(`/students/${fx.a.student.id}/enrollments`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ classId: fx.a.classId, academicYear: '2025-2026' });
    expect(enroll.status).toBe(201);

    const list = await request(app)
      .get(`/students/${fx.a.student.id}/enrollments`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(list.status).toBe(200);
    expect(list.body.enrollments.length).toBeGreaterThanOrEqual(1);

    const enrollmentId = enroll.body.enrollment.id as string;
    const close = await request(app)
      .post(`/students/${fx.a.student.id}/enrollments/${enrollmentId}/close`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ outcome: 'promoted' });
    expect(close.status).toBe(200);
    expect(close.body.enrollment.outcome).toBe('promoted');
  });

  it('DOC : génère attestation et facture PDF', async () => {
    const attestation = await request(app)
      .post('/documents/school-attestation')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ studentId: fx.a.student.id, purpose: 'bourse' });
    expect(attestation.status).toBe(201);
    expect(attestation.body.document.type).toBe('school_attestation');

    const invoice = await prisma.strkInvoice.create({
      data: {
        institutionId: fx.a.institutionId,
        studentId: fx.a.student.id,
        invoiceNumber: `INV-DOC-${Date.now()}`,
        totalCents: 10000,
        currency: 'XOF',
        createdBy: fx.a.schoolAdmin.id,
        lines: { create: [{ label: 'Test', amountCents: 10000, quantity: 1, lineType: 'fee' }] },
      },
    });
    const invoiceDoc = await request(app)
      .post('/documents/invoice')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ invoiceId: invoice.id });
    expect(invoiceDoc.status).toBe(201);
    expect(invoiceDoc.body.document.type).toBe('invoice');
  });

  it('DOC : carte élève rendue au format wallet CR80 (pas A4)', async () => {
    const { PDFDocument } = await import('pdf-lib');
    const bytes = await renderStudentCardPdf({
      institutionName: 'École Test',
      studentName: 'Ada Lovelace',
      studentNumber: 'A-1',
      className: '6e',
      academicYear: '2026-2027',
      verificationUrl: 'http://localhost/verify/x',
      documentId: 'doc-1',
      version: 1,
      generatedAt: new Date(),
    });
    expect(bytes.byteLength).toBeGreaterThan(200);
    expect(Buffer.from(bytes).subarray(0, 4).toString()).toBe('%PDF');
    const pdf = await PDFDocument.load(bytes);
    const page = pdf.getPage(0);
    const { width, height } = page.getSize();
    // CR80 ≈ 243 × 153 pt (pas A4 595 × 842)
    expect(width).toBeCloseTo(243, 0);
    expect(height).toBeCloseTo(153, 0);
  });

  it('Admissions : marque les frais payés via providerRef (webhook)', async () => {
    const application = await prisma.strkAdmissionApplication.create({
      data: {
        institutionId: fx.a.institutionId,
        academicYear: '2026-2027',
        studentFirstName: 'Jean',
        studentLastName: 'Dupont',
        studentBirthDate: new Date('2012-01-01'),
        contactEmail: 'parent@example.com',
        guardians: [],
        publicToken: `tok-${Date.now()}`,
        applicationFeeCents: 5000,
        applicationFeeCurrency: 'XOF',
        applicationFeeProvider: 'cinetpay',
        applicationFeeProviderRef: `fee-ref-${Date.now()}`,
      },
    });
    const ok = await markAdmissionFeePaidByProviderRef(application.applicationFeeProviderRef!, 'cinetpay');
    expect(ok).toBe(true);
    const updated = await prisma.strkAdmissionApplication.findUniqueOrThrow({ where: { id: application.id } });
    expect(updated.applicationFeePaid).toBe(true);
  });
});
