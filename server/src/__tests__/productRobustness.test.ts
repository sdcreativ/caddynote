import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';
import { prisma } from '../lib/prisma.js';

describe('Priorité moyenne — robustesse produit', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  it('Lot 9 : crée un circuit transport et un ouvrage', async () => {
    const route = await request(app)
      .post('/services/transport/routes')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ name: 'Ligne A' });
    expect(route.status).toBe(201);

    const item = await request(app)
      .post('/services/library/items')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ title: 'Le Petit Prince', quantity: 2 });
    expect(item.status).toBe(201);
    expect(item.body.item.available).toBe(2);
  });

  it('Contact public : persiste un message', async () => {
    const res = await request(app).post('/contact').send({
      name: 'Parent Test',
      email: 'parent@example.com',
      subject: 'Demo',
      message: 'Bonjour, je souhaite une démonstration de CaddyNote.',
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    const row = await prisma.strkContactMessage.findUnique({ where: { id: res.body.id } });
    expect(row?.email).toBe('parent@example.com');
  });

  it('Forgot / reset password bout en bout', async () => {
    const email = fx.a.teacher.email;
    const forgot = await request(app).post('/auth/forgot-password').send({ email });
    expect(forgot.status).toBe(200);

    const profile = await prisma.strkProfile.findUnique({ where: { email } });
    expect(profile?.passwordResetToken).toBeTruthy();

    const reset = await request(app).post('/auth/reset-password').send({
      token: profile!.passwordResetToken,
      newPassword: 'NewPassword123!',
    });
    expect(reset.status).toBe(200);

    const login = await request(app).post('/auth/login').send({ email, password: 'NewPassword123!' });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();
  });

  it('Quotas incluent storageGb', async () => {
    const res = await request(app)
      .get(`/institutions/${fx.a.institutionId}/quotas`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(res.status).toBe(200);
    const types = res.body.quotas.map((q: { type: string }) => q.type);
    expect(types).toContain('storageGb');
  });

  it('Features snapshot expose plan + overrides + effective', async () => {
    const res = await request(app)
      .get(`/institutions/${fx.a.institutionId}/features`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('overrides');
    expect(res.body).toHaveProperty('planFeatures');
    expect(res.body).toHaveProperty('effective');
  });

  it('Soumission late si échéance dépassée', async () => {
    const assignment = await prisma.strkAssignment.create({
      data: {
        courseId: fx.a.courseId,
        teacherId: fx.a.teacher.id,
        title: 'Devoir en retard',
        dueDate: new Date(Date.now() - 86400000),
      },
    });
    // Élève sans pièce jointe S3 : attachments vides
    const res = await request(app)
      .post('/assignments/submissions')
      .set(auth(fx.a.student.token))
      .send({
        assignmentId: assignment.id,
        studentId: fx.a.student.id,
        content: 'Rendu tardif',
        attachments: [],
      });
    expect(res.status).toBe(201);
    expect(res.body.submission.status).toBe('late');
  });
});
