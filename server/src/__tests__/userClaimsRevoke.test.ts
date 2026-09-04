import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { buildFixture, registerActor, auth, type Fixture } from './fixtures.js';

describe('Révocation des sessions après changement de claims JWT', () => {
  let fx: Fixture;
  let groupId: string;

  beforeAll(async () => {
    fx = await buildFixture();
    const group = await request(app)
      .post('/groups')
      .set(auth(fx.globalAdmin.token))
      .send({ name: `Réseau claims ${Date.now()}` });
    expect(group.status).toBe(201);
    groupId = group.body.group.id as string;
  }, 30_000);

  it('PATCH rôle révoque le jeton ; un simple nom ne le fait pas', async () => {
    const victim = await registerActor('school_admin', fx.a.institutionId);

    const nameOnly = await request(app)
      .patch(`/users/${victim.id}`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ firstName: 'PrénomSansRevoke' });
    expect(nameOnly.status).toBe(200);
    const stillValid = await request(app).get(`/users/${victim.id}`).set(auth(victim.token));
    expect(stillValid.status).toBe(200);

    const demoted = await request(app)
      .patch(`/users/${victim.id}`)
      .set(auth(fx.globalAdmin.token))
      .send({ role: 'teacher' });
    expect(demoted.status).toBe(200);
    expect(demoted.body.user.role).toBe('teacher');

    const after = await request(app).get(`/users/${victim.id}`).set(auth(victim.token));
    expect(after.status).toBe(401);

    const open = await prisma.strkSession.count({
      where: { userId: victim.id, revokedAt: null },
    });
    expect(open).toBe(0);
  });

  it('PATCH établissement révoque si l’école change, pas si elle est identique', async () => {
    const victim = await registerActor('teacher', fx.a.institutionId);

    const same = await request(app)
      .patch(`/users/${victim.id}/institution`)
      .set(auth(fx.globalAdmin.token))
      .send({ institutionId: fx.a.institutionId });
    expect(same.status).toBe(200);
    const stillValid = await request(app).get(`/users/${victim.id}`).set(auth(victim.token));
    expect(stillValid.status).toBe(200);

    const moved = await request(app)
      .patch(`/users/${victim.id}/institution`)
      .set(auth(fx.globalAdmin.token))
      .send({ institutionId: fx.b.institutionId });
    expect(moved.status).toBe(200);
    expect(moved.body.user.institutionId).toBe(fx.b.institutionId);

    const after = await request(app).get(`/users/${victim.id}`).set(auth(victim.token));
    expect(after.status).toBe(401);
  });

  it('PATCH groupe révoque si le rattachement change', async () => {
    const victim = await registerActor('teacher', fx.a.institutionId);

    const attached = await request(app)
      .patch(`/users/${victim.id}/group`)
      .set(auth(fx.globalAdmin.token))
      .send({ groupId });
    expect(attached.status).toBe(200);
    expect(attached.body.user.groupId).toBe(groupId);

    const afterAttach = await request(app).get(`/users/${victim.id}`).set(auth(victim.token));
    expect(afterAttach.status).toBe(401);

    const login = await request(app)
      .post('/auth/login')
      .send({ email: victim.email, password: 'Password123!' });
    expect(login.status).toBe(200);
    const freshToken = login.body.token as string;

    const sameGroup = await request(app)
      .patch(`/users/${victim.id}/group`)
      .set(auth(fx.globalAdmin.token))
      .send({ groupId });
    expect(sameGroup.status).toBe(200);
    const stillValid = await request(app).get(`/users/${victim.id}`).set(auth(freshToken));
    expect(stillValid.status).toBe(200);
  });
});
