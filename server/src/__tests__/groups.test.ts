import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { buildFixture, registerActor, auth, issueTestToken, type Fixture } from './fixtures.js';

// ORG-002 — « groupe scolaire » : vue consolidée en lecture sur plusieurs
// établissements pour un compte `group_owner`, sans jamais donner accès aux
// données opérationnelles (élèves, notes...) qui restent isolées par
// établissement (ORG-004, testée séparément dans tenant-isolation.*).
describe('Groupes scolaires (ORG-002)', () => {
  let fx: Fixture;
  let groupId: string;
  let groupOwnerToken: string;
  let outsiderGroupOwnerToken: string;

  beforeAll(async () => {
    fx = await buildFixture();

    const groupRes = await request(app)
      .post('/groups')
      .set(auth(fx.globalAdmin.token))
      .send({ name: 'Réseau de test' });
    expect(groupRes.status).toBe(201);
    groupId = groupRes.body.group.id;

    const attachA = await request(app)
      .post(`/groups/${groupId}/institutions`)
      .set(auth(fx.globalAdmin.token))
      .send({ institutionId: fx.a.institutionId });
    expect(attachA.status).toBe(200);

    const attachB = await request(app)
      .post(`/groups/${groupId}/institutions`)
      .set(auth(fx.globalAdmin.token))
      .send({ institutionId: fx.b.institutionId });
    expect(attachB.status).toBe(200);

    // Le compte group_owner est créé directement via Prisma (comme les
    // extensions strk_students/strk_teachers dans fixtures.ts) : le rôle
    // n'est volontairement pas auto-assignable via /auth/register (IAM-001),
    // seul l'admin global peut le faire via POST /users + PATCH /:id/group.
    const owner = await prisma.strkProfile.create({
      data: { email: `owner.${groupId}@isolation.test`, role: 'group_owner', groupId, firstName: 'Owner', lastName: 'Group' },
    });
    groupOwnerToken = await issueTestToken({ sub: owner.id, role: 'group_owner', institutionId: null, groupId });

    const outsider = await prisma.strkInstitutionGroup.create({ data: { name: 'Autre réseau' } });
    const outsiderOwner = await prisma.strkProfile.create({
      data: { email: `outsider.${groupId}@isolation.test`, role: 'group_owner', groupId: outsider.id, firstName: 'Outsider', lastName: 'Group' },
    });
    outsiderGroupOwnerToken = await issueTestToken({
      sub: outsiderOwner.id,
      role: 'group_owner',
      institutionId: null,
      groupId: outsider.id,
    });
  }, 30000);

  it('le group_owner voit les deux établissements de son groupe', async () => {
    const res = await request(app).get(`/groups/${groupId}/institutions`).set(auth(groupOwnerToken));
    expect(res.status).toBe(200);
    const ids = res.body.institutions.map((i: { id: string }) => i.id);
    expect(ids).toEqual(expect.arrayContaining([fx.a.institutionId, fx.b.institutionId]));
  });

  it('le group_owner voit ses établissements via GET /institutions (vue générale)', async () => {
    const res = await request(app).get('/institutions').set(auth(groupOwnerToken));
    expect(res.status).toBe(200);
    const ids = res.body.institutions.map((i: { id: string }) => i.id);
    expect(ids).toEqual(expect.arrayContaining([fx.a.institutionId, fx.b.institutionId]));
  });

  it('le tableau de bord consolidé additionne les effectifs des deux établissements', async () => {
    const res = await request(app).get(`/groups/${groupId}/dashboard`).set(auth(groupOwnerToken));
    expect(res.status).toBe(200);
    // Un élève par établissement dans la fixture -> total consolidé = 2.
    expect(res.body.dashboard.totals.students).toBe(2);
    expect(res.body.dashboard.institutions).toHaveLength(2);
  });

  it('un group_owner d’un autre groupe n’a accès ni au groupe, ni à ses établissements, ni à son tableau de bord', async () => {
    const groupRes = await request(app).get(`/groups/${groupId}`).set(auth(outsiderGroupOwnerToken));
    expect(groupRes.status).toBe(403);

    const instRes = await request(app).get(`/groups/${groupId}/institutions`).set(auth(outsiderGroupOwnerToken));
    expect(instRes.status).toBe(403);

    const dashRes = await request(app).get(`/groups/${groupId}/dashboard`).set(auth(outsiderGroupOwnerToken));
    expect(dashRes.status).toBe(403);

    // Et ne voit toujours pas les établissements du groupe de fx dans la vue générale.
    const generalRes = await request(app).get('/institutions').set(auth(outsiderGroupOwnerToken));
    expect(generalRes.status).toBe(200);
    const ids = generalRes.body.institutions.map((i: { id: string }) => i.id);
    expect(ids).not.toContain(fx.a.institutionId);
  });

  it('le group_owner ne peut ni créer ni détacher un établissement du groupe (réservé à l’admin global)', async () => {
    const attachRes = await request(app)
      .post(`/groups/${groupId}/institutions`)
      .set(auth(groupOwnerToken))
      .send({ institutionId: fx.a.institutionId });
    expect(attachRes.status).toBe(403);

    const detachRes = await request(app)
      .delete(`/groups/${groupId}/institutions/${fx.a.institutionId}`)
      .set(auth(groupOwnerToken));
    expect(detachRes.status).toBe(403);
  });

  it('un group_owner n’a aucun accès aux données opérationnelles des établissements de son groupe (ORG-004 préservée)', async () => {
    const res = await request(app).get(`/students/${fx.a.student.id}`).set(auth(groupOwnerToken));
    expect(res.status).toBe(403);
  });

  describe('anti-escalade de privilège (POST /users)', () => {
    it('refuse à un school_admin de créer un compte admin', async () => {
      const res = await request(app)
        .post('/users')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ email: `escalade.admin.${Date.now()}@isolation.test`, firstName: 'X', lastName: 'Y', role: 'admin' });
      expect(res.status).toBe(403);
    });

    it('refuse à un school_admin de créer un compte group_owner', async () => {
      const res = await request(app)
        .post('/users')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ email: `escalade.owner.${Date.now()}@isolation.test`, firstName: 'X', lastName: 'Y', role: 'group_owner' });
      expect(res.status).toBe(403);
    });

    it('autorise l’admin global à créer un compte group_owner', async () => {
      const res = await request(app)
        .post('/users')
        .set(auth(fx.globalAdmin.token))
        .send({ email: `legit.owner.${Date.now()}@isolation.test`, firstName: 'X', lastName: 'Y', role: 'group_owner' });
      expect(res.status).toBe(201);
    });
  });

  describe('PATCH /users/:id/group', () => {
    it('refuse à un school_admin de rattacher un compte à un groupe', async () => {
      const target = await registerActor('teacher', fx.a.institutionId);
      const res = await request(app)
        .patch(`/users/${target.id}/group`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ groupId });
      expect(res.status).toBe(403);
    });

    it('autorise l’admin global à rattacher un compte à un groupe', async () => {
      const target = await registerActor('teacher');
      const res = await request(app).patch(`/users/${target.id}/group`).set(auth(fx.globalAdmin.token)).send({ groupId });
      expect(res.status).toBe(200);
      expect(res.body.user.groupId).toBe(groupId);
    });
  });
});
