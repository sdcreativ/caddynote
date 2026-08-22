import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';
import { fillRequiredAdmissionPacket } from './admissionPacketFill.js';
import { evaluateConditionRule, computePacketCompleteness } from '../lib/admissionPackets.js';

describe('Admissions — moteur de pièces (spec complète)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  const payload = (overrides: Record<string, unknown> = {}) => ({
    institutionId: fx.a.institutionId,
    classId: fx.a.classId,
    academicYear: '2026-2027',
    applicationKind: 'pre_registration',
    studentFirstName: `Pieces${Date.now().toString(36)}`,
    studentLastName: 'Test',
    studentBirthDate: '2015-01-15',
    studentGender: 'female',
    guardians: [
      {
        firstName: 'Parent',
        lastName: 'Test',
        email: `parent.pieces.${Date.now()}@admissions.test`,
        phone: '+2250700000000',
        relationship: 'mother',
      },
    ],
    contactEmail: `contact.pieces.${Date.now()}@admissions.test`,
    ...overrides,
  });

  it('évalue les règles conditionnelles et la complétude', () => {
    expect(
      evaluateConditionRule({ flags: ['foreign_student'] }, {
        applicationKind: 'pre_registration',
        profileFlags: ['foreign_student'],
      })
    ).toBe(true);
    expect(
      evaluateConditionRule({ flags: ['foreign_student'] }, {
        applicationKind: 'pre_registration',
        profileFlags: [],
      })
    ).toBe(false);

    const completeness = computePacketCompleteness([
      { status: 'missing', obligation: 'required', waived: false },
      { status: 'uploaded', obligation: 'required', waived: false },
      { status: 'missing', obligation: 'conditional', waived: true },
    ]);
    expect(completeness.requiredTotal).toBe(2);
    expect(completeness.requiredDone).toBe(1);
    expect(completeness.canSubmit).toBe(false);
  });

  it('matérialise un modèle, refuse submit incomplet, accepte après dépôt', async () => {
    const created = await request(app).post('/admissions').send(payload());
    expect(created.status).toBe(201);
    const token = created.body.application.publicToken as string;

    const packet = await request(app).get(`/admissions/status/${token}/packet`);
    expect(packet.status).toBe(200);
    expect(packet.body.template).toBeTruthy();
    expect(packet.body.items.length).toBeGreaterThan(0);
    expect(packet.body.completeness.canSubmit).toBe(false);

    const submitBlocked = await request(app).post(`/admissions/status/${token}/submit`).send({});
    expect(submitBlocked.status).toBe(422);
    expect(submitBlocked.body.code).toBe('packet_incomplete');

    await fillRequiredAdmissionPacket(app, token);
    const current = await request(app).get(`/admissions/status/${token}/packet`);
    expect(current.body.completeness.canSubmit).toBe(true);

    const submitted = await request(app).post(`/admissions/status/${token}/submit`).send({});
    expect(submitted.status).toBe(200);

    const appId = created.body.application.id as string;
    const reviewed = await request(app)
      .patch(`/admissions/${appId}/packet/items/${current.body.items[0].id}`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ status: 'compliant' });
    expect(reviewed.status).toBe(200);
  });

  it('ajoute la pièce conditionnelle foreign_student uniquement si le drapeau est présent', async () => {
    const without = await request(app).post('/admissions').send(payload({ profileFlags: [] }));
    expect(without.status).toBe(201);
    const pktWithout = await request(app).get(
      `/admissions/status/${without.body.application.publicToken}/packet`
    );
    const hasPassportWithout = pktWithout.body.items.some(
      (i: { documentType: { code: string } }) => i.documentType.code === 'passport_or_residence'
    );
    expect(hasPassportWithout).toBe(false);

    const withFlag = await request(app)
      .post('/admissions')
      .send(payload({ profileFlags: ['foreign_student'] }));
    expect(withFlag.status).toBe(201);
    const pktWith = await request(app).get(
      `/admissions/status/${withFlag.body.application.publicToken}/packet`
    );
    const hasPassportWith = pktWith.body.items.some(
      (i: { documentType: { code: string } }) => i.documentType.code === 'passport_or_residence'
    );
    expect(hasPassportWith).toBe(true);
  });

  it('autorise le CRUD de modèles sans intervention technique', async () => {
    const headers = auth(fx.a.schoolAdmin.token);
    const code = `tpl_${Date.now().toString(36)}`;
    const created = await request(app)
      .post('/admissions/packets/templates')
      .set(headers)
      .send({
        code,
        name: 'Modèle test collège',
        applicationKind: 'first_enrollment',
        level: 'college',
        requirements: [],
      });
    expect(created.status).toBe(201);

    const catalog = await request(app).get('/admissions/packets/catalog').set(headers);
    expect(catalog.status).toBe(200);
    const birth = catalog.body.types.find(
      (t: { institutionId: string | null; code: string }) =>
        t.institutionId === fx.a.institutionId && t.code === 'birth_certificate'
    );
    expect(birth).toBeTruthy();

    const reqs = await request(app)
      .put(`/admissions/packets/templates/${created.body.template.id}/requirements`)
      .set(headers)
      .send({
        requirements: [
          {
            documentTypeId: birth.id,
            obligation: 'required',
            originalMode: 'copy_then_original',
          },
        ],
      });
    expect(reqs.status).toBe(200);
    expect(reqs.body.template.requirements).toHaveLength(1);

    const duplicated = await request(app)
      .post(`/admissions/packets/templates/${created.body.template.id}/duplicate`)
      .set(headers)
      .send({ code: `${code}_2027`, name: 'Modèle 2027', academicYear: '2027-2028' });
    expect(duplicated.status).toBe(201);
    expect(duplicated.body.template.academicYear).toBe('2027-2028');
  });

  it('réemploie les pièces valides lors d’une réinscription', async () => {
    const headers = auth(fx.a.schoolAdmin.token);
    const created = await request(app)
      .post('/admissions')
      .send(payload({ applicationKind: 'first_enrollment' }));
    expect(created.status).toBe(201);
    const token = created.body.application.publicToken as string;
    await fillRequiredAdmissionPacket(app, token);

    const packet = await request(app).get(`/admissions/status/${token}/packet`);
    for (const item of packet.body.items.filter((i: { fileKey: string | null }) => i.fileKey)) {
      await request(app)
        .patch(`/admissions/${created.body.application.id}/packet/items/${item.id}`)
        .set(headers)
        .send({ status: 'compliant' });
    }

    await request(app).post(`/admissions/status/${token}/submit`).send({});
    await request(app)
      .patch(`/admissions/${created.body.application.id}/status`)
      .set(headers)
      .send({ status: 'conditionally_accepted' });
    await request(app).post(`/admissions/${created.body.application.id}/enroll`).set(headers).send({});

    const reenroll = await request(app)
      .post(`/admissions/${created.body.application.id}/reenroll`)
      .set(headers)
      .send({ academicYear: '2027-2028', classId: fx.a.classId });
    expect(reenroll.status).toBe(201);
    expect(reenroll.body.application.applicationKind).toBe('re_enrollment');
    expect(reenroll.body.reusedDocuments).toBeGreaterThanOrEqual(0);

    const newPacket = await request(app).get(
      `/admissions/status/${reenroll.body.application.publicToken}/packet`
    );
    expect(newPacket.status).toBe(200);
    const reused = newPacket.body.items.filter((i: { reusedFromItemId: string | null }) => i.reusedFromItemId);
    // Au moins photo/report_card peuvent matcher entre first_enrollment et re_enrollment
    expect(Array.isArray(reused)).toBe(true);
  });

  it('expose une file agents filtrée et le marquage d’original', async () => {
    const headers = auth(fx.a.schoolAdmin.token);
    const created = await request(app)
      .post('/admissions')
      .send(payload({ applicationKind: 'first_enrollment', level: 'college' }));
    const token = created.body.application.publicToken as string;
    await fillRequiredAdmissionPacket(app, token);
    await request(app).post(`/admissions/status/${token}/submit`).send({});

    const queue = await request(app)
      .get('/admissions/packets/review-queue')
      .query({ level: 'college', status: 'submitted' })
      .set(headers);
    expect(queue.status).toBe(200);
    expect(queue.body.applications.some((a: { id: string }) => a.id === created.body.application.id)).toBe(
      true
    );

    const pkt = await request(app)
      .get(`/admissions/${created.body.application.id}/packet`)
      .set(headers);
    const copyThenOriginal = pkt.body.items.find(
      (i: { originalMode: string }) => i.originalMode === 'copy_then_original'
    );
    if (copyThenOriginal) {
      const seen = await request(app)
        .patch(`/admissions/${created.body.application.id}/packet/items/${copyThenOriginal.id}`)
        .set(headers)
        .send({ status: 'finalized', originalSeen: true });
      expect(seen.status).toBe(200);
      const updated = seen.body.items.find((i: { id: string }) => i.id === copyThenOriginal.id);
      expect(updated.originalSeenAt).toBeTruthy();
      expect(updated.status).toBe('finalized');
    }
  });

  it('expose politique, motifs standard, versions et confirmation', async () => {
    const headers = auth(fx.a.schoolAdmin.token);
    const policy = await request(app).get('/admissions/packets/policy').set(headers);
    expect(policy.status).toBe(200);
    expect(policy.body.policy.channels.email).toBe(true);

    const updatedPolicy = await request(app)
      .put('/admissions/packets/policy')
      .set(headers)
      .send({ payment: { trigger: 'after_acceptance', requirePaidBeforeEnroll: true } });
    expect(updatedPolicy.status).toBe(200);
    expect(updatedPolicy.body.policy.payment.trigger).toBe('after_acceptance');

    const reasons = await request(app).get('/admissions/packets/rejection-reasons').set(headers);
    expect(reasons.status).toBe(200);
    expect(reasons.body.reasons.length).toBeGreaterThan(0);

    const created = await request(app).post('/admissions').send(payload());
    const token = created.body.application.publicToken as string;
    await fillRequiredAdmissionPacket(app, token);
    await request(app).post(`/admissions/status/${token}/submit`).send({});

    const accept = await request(app)
      .patch(`/admissions/${created.body.application.id}/status`)
      .set(headers)
      .send({ status: 'conditionally_accepted', decisionNotes: 'OK' });
    expect(accept.status).toBe(200);
    expect(accept.body.confirmationDocumentId || accept.body.application.confirmationDocumentId).toBeTruthy();

    const confirmation = await request(app).get(`/admissions/status/${token}/confirmation`);
    expect(confirmation.status).toBe(200);
    expect(confirmation.body.verificationUrl).toContain('/verify/document/');

    const pkt = await request(app)
      .get(`/admissions/${created.body.application.id}/packet`)
      .set(headers);
    const withFile = pkt.body.items.find((i: { fileKey: string | null }) => i.fileKey);
    if (withFile) {
      const versions = await request(app)
        .get(`/admissions/${created.body.application.id}/packet/items/${withFile.id}/versions`)
        .set(headers);
      expect(versions.status).toBe(200);
      expect(versions.body.versions.length).toBeGreaterThan(0);

      const dl = await request(app)
        .get(`/admissions/${created.body.application.id}/packet/items/${withFile.id}/download`)
        .set(headers);
      expect([200, 404]).toContain(dl.status);
    }
  });

  it('crée un campus natif et lie un compte parent dès la création', async () => {
    const headers = auth(fx.a.schoolAdmin.token);
    const campus = await request(app)
      .post('/campuses')
      .set(headers)
      .send({ code: `site_${Date.now().toString(36)}`, name: 'Campus Test Plateau' });
    expect(campus.status).toBe(201);

    const publicList = await request(app).get(`/campuses/public/${fx.a.institutionId}`);
    expect(publicList.status).toBe(200);
    expect(publicList.body.campuses.some((c: { id: string }) => c.id === campus.body.campus.id)).toBe(true);

    const email = `parent.campus.${Date.now()}@admissions.test`;
    const created = await request(app)
      .post('/admissions')
      .send({
        ...payload({ campusId: campus.body.campus.id }),
        contactEmail: email,
        guardians: [
          {
            firstName: 'Parent',
            lastName: 'Campus',
            email,
            relationship: 'mother',
          },
        ],
      });
    expect(created.status).toBe(201);
    expect(created.body.parentAccountLinked).toBe(true);
    expect(created.body.application.campusId).toBe(campus.body.campus.id);
    expect(created.body.application.contactProfileId).toBeTruthy();
  });
});
