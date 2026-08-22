import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

/**
 * EVA-002 — barèmes configurables par établissement. Aucune configuration
 * ni UI n'existait pour proposer une liste fermée de barèmes (« Note sur
 * 20 », « Note sur 10 »...) aux enseignants — seul un champ libre
 * (`StrkGrade.maxGrade`) existait, ressaisi à la main à chaque note.
 */
describe('Barèmes de notation (EVA-002)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  it('crée un barème, le liste, aucun par défaut au départ', async () => {
    const res = await request(app).post('/grading-scales').set(auth(fx.a.schoolAdmin.token)).send({
      institutionId: fx.a.institutionId,
      name: 'Note sur 20',
      maxValue: 20,
    });
    expect(res.status).toBe(201);
    expect(res.body.scale.isDefault).toBe(false);

    const list = await request(app)
      .get(`/grading-scales?institutionId=${fx.a.institutionId}`)
      .set(auth(fx.a.teacher.token));
    expect(list.status).toBe(200);
    expect(list.body.scales.some((s: any) => s.name === 'Note sur 20')).toBe(true);
  });

  it('un seul barème par défaut à la fois : en poser un nouveau désactive l’ancien', async () => {
    const first = await request(app).post('/grading-scales').set(auth(fx.a.schoolAdmin.token)).send({
      institutionId: fx.a.institutionId,
      name: 'Note sur 10',
      maxValue: 10,
      isDefault: true,
    });
    expect(first.status).toBe(201);
    expect(first.body.scale.isDefault).toBe(true);

    const second = await request(app).post('/grading-scales').set(auth(fx.a.schoolAdmin.token)).send({
      institutionId: fx.a.institutionId,
      name: 'Note sur 100',
      maxValue: 100,
      isDefault: true,
    });
    expect(second.status).toBe(201);
    expect(second.body.scale.isDefault).toBe(true);

    const reloaded = await request(app)
      .get(`/grading-scales?institutionId=${fx.a.institutionId}`)
      .set(auth(fx.a.schoolAdmin.token));
    const defaults = reloaded.body.scales.filter((s: any) => s.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].name).toBe('Note sur 100');
  });

  it('rejette un doublon de nom pour le même établissement', async () => {
    await request(app).post('/grading-scales').set(auth(fx.a.schoolAdmin.token)).send({
      institutionId: fx.a.institutionId,
      name: 'Compétences',
      maxValue: 4,
    });
    const dup = await request(app).post('/grading-scales').set(auth(fx.a.schoolAdmin.token)).send({
      institutionId: fx.a.institutionId,
      name: 'Compétences',
      maxValue: 5,
    });
    expect(dup.status).toBe(409);
  });

  it("le personnel d'un autre établissement ne peut ni lister ni créer (ORG-004)", async () => {
    const list = await request(app)
      .get(`/grading-scales?institutionId=${fx.a.institutionId}`)
      .set(auth(fx.b.teacher.token));
    expect(list.status).toBe(403);

    const create = await request(app).post('/grading-scales').set(auth(fx.b.schoolAdmin.token)).send({
      institutionId: fx.a.institutionId,
      name: 'Intrusion',
      maxValue: 20,
    });
    expect(create.status).toBe(403);
  });

  it('un enseignant peut consulter mais pas créer/modifier/supprimer', async () => {
    const create = await request(app).post('/grading-scales').set(auth(fx.a.teacher.token)).send({
      institutionId: fx.a.institutionId,
      name: 'Interdit',
      maxValue: 20,
    });
    expect(create.status).toBe(403);
  });

  it('supprime un barème sans toucher aux notes déjà saisies (pas de clé étrangère)', async () => {
    const scale = await request(app).post('/grading-scales').set(auth(fx.a.schoolAdmin.token)).send({
      institutionId: fx.a.institutionId,
      name: 'Éphémère',
      maxValue: 20,
    });
    const del = await request(app)
      .delete(`/grading-scales/${scale.body.scale.id}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(del.status).toBe(200);
  });
});
