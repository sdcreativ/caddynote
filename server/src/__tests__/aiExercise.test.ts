import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

/**
 * Module complémentaire IA (§4.16 de l'audit) : l'edge function Supabase
 * `ai-exercise-helper` a été portée vers `/exercises/ai/*` sur Claude
 * (`server/src/lib/aiExercise.ts` + `anthropicClient.ts`) — déjà fait et
 * documenté (§3.1/§4.9 de l'audit), mais **sans aucun test**, contrairement
 * à tous les autres modules du produit. Cette suite comble ce trou :
 * - gating 501 quand `ANTHROPIC_API_KEY` est absente (le cas dans cet
 *   environnement, comme Stripe/CinetPay/SMTP/S3/ClamAV) ;
 * - contrôle de rôle sur `/ai/generate`, vérifié indépendamment de la
 *   configuration (l'ordre des middlewares a été corrigé au passage — voir
 *   exercises.routes.ts) ;
 * - validation des schémas d'entrée ;
 * - la logique réelle de `lib/aiExercise.ts` (sorties structurées, parsing
 *   JSON), testée via un client Anthropic simulé plutôt qu'un vrai appel
 *   réseau — même principe que les webhooks Stripe/CinetPay testés avec des
 *   requêtes construites à la main.
 */
describe('Assistant IA des exercices (module IA, §4.16)', () => {
  let fx: Fixture;
  const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  const originalProvider = process.env.AI_PROVIDER;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  afterEach(() => {
    if (originalAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    if (originalOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAiKey;
    if (originalProvider === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = originalProvider;
  });

  describe('Gating (aucune clé IA dans cet environnement)', () => {
    beforeEach(() => {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.AI_PROVIDER;
    });

    beforeAll(async () => {
      // Flag opt-in : sans activation, requireFeature répond 403 avant le 501.
      await request(app)
        .put(`/institutions/${fx.a.institutionId}/features/exercises_ai`)
        .set(auth(fx.globalAdmin.token))
        .send({ enabled: true });
    });

    afterAll(async () => {
      await request(app)
        .put(`/institutions/${fx.a.institutionId}/features/exercises_ai`)
        .set(auth(fx.globalAdmin.token))
        .send({ enabled: null });
    });

    it("n'est pas configuré par défaut", async () => {
      const { isAiConfigured } = await import('../lib/anthropicClient.js');
      expect(isAiConfigured()).toBe(false);
    });

    it('POST /exercises/ai/generate répond 501 explicite, jamais un échec silencieux', async () => {
      const res = await request(app)
        .post('/exercises/ai/generate')
        .set(auth(fx.a.teacher.token))
        .send({ subject: 'Mathématiques', difficulty: 3, topic: 'Fractions' });
      expect(res.status).toBe(501);
      expect(res.body.error).toMatch(/ANTHROPIC_API_KEY|OPENAI_API_KEY/);
    });

    it('POST /exercises/ai/correct-answer répond 501', async () => {
      const res = await request(app)
        .post('/exercises/ai/correct-answer')
        .set(auth(fx.a.student.token))
        .send({ question: 'Q', studentAnswer: 'A', correctAnswer: 'A', subject: 'Français' });
      expect(res.status).toBe(501);
    });

    it('POST /exercises/ai/adaptive-recommendations répond 501', async () => {
      const res = await request(app)
        .post('/exercises/ai/adaptive-recommendations')
        .set(auth(fx.a.student.token))
        .send({ studentLevel: 3, weaknesses: [], strengths: [], subject: 'Histoire' });
      expect(res.status).toBe(501);
    });

    it('POST /exercises/ai/pedagogical-help répond 501', async () => {
      const res = await request(app)
        .post('/exercises/ai/pedagogical-help')
        .set(auth(fx.a.student.token))
        .send({ question: 'Q', studentQuestion: 'Je ne comprends pas', context: 'Exercice de géométrie' });
      expect(res.status).toBe(501);
    });

    it("répond 501 même avec un corps invalide : inutile de valider une requête que la fonctionnalité indisponible ne traitera pas", async () => {
      const res = await request(app)
        .post('/exercises/ai/generate')
        .set(auth(fx.a.teacher.token))
        .send({ subject: '', difficulty: 3, topic: 'Fractions' });
      expect(res.status).toBe(501);
    });

    it('une fois configurée, un corps invalide est bien rejeté (400) sans jamais appeler Claude', async () => {
      const prevTestMode = process.env.CADDYNOTE_TEST_MODE;
      delete process.env.CADDYNOTE_TEST_MODE;
      process.env.ANTHROPIC_API_KEY = 'test-key-fixture';
      try {
        const res = await request(app)
          .post('/exercises/ai/generate')
          .set(auth(fx.a.teacher.token))
          .send({ subject: '', difficulty: 3, topic: 'Fractions' });
        expect(res.status).toBe(400);
      } finally {
        if (prevTestMode === undefined) delete process.env.CADDYNOTE_TEST_MODE;
        else process.env.CADDYNOTE_TEST_MODE = prevTestMode;
      }
    });
  });

  describe('Feature flag exercises_ai + quota (§5.6 P2)', () => {
    it('flag off → 403 feature_disabled pour l’enseignant (avant 501)', async () => {
      await request(app)
        .put(`/institutions/${fx.a.institutionId}/features/exercises_ai`)
        .set(auth(fx.globalAdmin.token))
        .send({ enabled: false });

      const res = await request(app)
        .post('/exercises/ai/generate')
        .set(auth(fx.a.teacher.token))
        .send({ subject: 'Mathématiques', difficulty: 3, topic: 'Fractions' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('feature_disabled');

      await request(app)
        .put(`/institutions/${fx.a.institutionId}/features/exercises_ai`)
        .set(auth(fx.globalAdmin.token))
        .send({ enabled: null });
    });

    it('quota maxAiPerMonth atteint → 403 quota_exceeded (flag on, clé présente)', async () => {
      await request(app)
        .put(`/institutions/${fx.a.institutionId}/features/exercises_ai`)
        .set(auth(fx.globalAdmin.token))
        .send({ enabled: true });

      const plan = await prisma.subscriptionPlan.create({
        data: { name: `Plan AI ${Date.now()}`, priceMonthly: 0, maxAiPerMonth: 0 },
      });
      const sub = await prisma.premiumSubscription.create({
        data: {
          userId: fx.a.schoolAdmin.id,
          institutionId: fx.a.institutionId,
          planId: plan.id,
          plan: plan.name,
          status: 'active',
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      const prevTestMode = process.env.CADDYNOTE_TEST_MODE;
      delete process.env.CADDYNOTE_TEST_MODE;
      process.env.ANTHROPIC_API_KEY = 'test-key-fixture';
      try {
        const res = await request(app)
          .post('/exercises/ai/generate')
          .set(auth(fx.a.teacher.token))
          .send({ subject: 'Mathématiques', difficulty: 3, topic: 'Fractions' });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('quota_exceeded');
      } finally {
        if (prevTestMode === undefined) delete process.env.CADDYNOTE_TEST_MODE;
        else process.env.CADDYNOTE_TEST_MODE = prevTestMode;
        delete process.env.ANTHROPIC_API_KEY;
        await prisma.premiumSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        await prisma.subscriptionPlan.delete({ where: { id: plan.id } }).catch(() => {});
        await request(app)
          .put(`/institutions/${fx.a.institutionId}/features/exercises_ai`)
          .set(auth(fx.globalAdmin.token))
          .send({ enabled: null });
      }
    });
  });

  describe('Contrôle de rôle sur /ai/generate (vérifié avant la disponibilité de la fonctionnalité)', () => {
    it("un élève ne peut pas générer d'exercice, que l'IA soit configurée ou non (403, pas 501)", async () => {
      const res = await request(app)
        .post('/exercises/ai/generate')
        .set(auth(fx.a.student.token))
        .send({ subject: 'Mathématiques', difficulty: 3, topic: 'Fractions' });
      expect(res.status).toBe(403);
    });

    it("un enseignant avec flag on reçoit 501 (pas 403 rôle) : le contrôle de rôle l'a laissé passer", async () => {
      await request(app)
        .put(`/institutions/${fx.a.institutionId}/features/exercises_ai`)
        .set(auth(fx.globalAdmin.token))
        .send({ enabled: true });
      try {
        const res = await request(app)
          .post('/exercises/ai/generate')
          .set(auth(fx.a.teacher.token))
          .send({ subject: 'Mathématiques', difficulty: 3, topic: 'Fractions' });
        expect(res.status).toBe(501);
      } finally {
        await request(app)
          .put(`/institutions/${fx.a.institutionId}/features/exercises_ai`)
          .set(auth(fx.globalAdmin.token))
          .send({ enabled: null });
      }
    });
  });

  describe('lib/aiExercise.ts — logique réelle via completeJson', () => {
    beforeEach(() => {
      vi.resetModules();
    });

    it('generateExercise() parse la sortie structurée du provider', async () => {
      const completeJson = vi.fn().mockResolvedValue({
        title: 'Fractions simples',
        description: 'Exercice généré',
        questions: [
          {
            questionText: '1/2 + 1/4 = ?',
            questionType: 'multiple_choice',
            options: ['3/4', '2/6', '1/6'],
            correctAnswer: '3/4',
            explanation: 'Mise au même dénominateur',
            points: 1,
          },
        ],
      });
      vi.doMock('../lib/anthropicClient.js', () => ({
        completeJson,
        isAiConfigured: () => true,
      }));

      const { generateExercise } = await import('../lib/aiExercise.js');
      const result = await generateExercise({
        subject: 'Mathématiques',
        difficulty: 2,
        topic: 'Fractions',
        questionCount: 1,
      });

      expect(completeJson).toHaveBeenCalledTimes(1);
      const call = completeJson.mock.calls[0][0];
      expect(call.schemaName).toBe('generated_exercise');
      expect(call.user).toContain('Fractions');
      expect(result.title).toBe('Fractions simples');
      expect(result.questions).toHaveLength(1);
    });

    it('correctOpenAnswer() renvoie le score et le retour tels que produits par le modèle', async () => {
      const completeJson = vi.fn().mockResolvedValue({
        score: 7,
        isCorrect: false,
        feedback: 'Presque, mais...',
        suggestions: ['Revoir la leçon'],
      });
      vi.doMock('../lib/anthropicClient.js', () => ({
        completeJson,
        isAiConfigured: () => true,
      }));

      const { correctOpenAnswer } = await import('../lib/aiExercise.js');
      const result = await correctOpenAnswer({
        question: 'Capitale de la France ?',
        studentAnswer: 'Lyon',
        correctAnswer: 'Paris',
        subject: 'Géographie',
      });

      expect(result.score).toBe(7);
      expect(result.isCorrect).toBe(false);
      expect(result.suggestions).toEqual(['Revoir la leçon']);
    });

    it('propage l’erreur du provider si la réponse est inutilisable', async () => {
      const completeJson = vi.fn().mockRejectedValue(new Error('Réponse IA vide ou inattendue'));
      vi.doMock('../lib/anthropicClient.js', () => ({
        completeJson,
        isAiConfigured: () => true,
      }));

      const { getPedagogicalHelp } = await import('../lib/aiExercise.js');
      await expect(
        getPedagogicalHelp({ question: 'Q', studentQuestion: 'Aide', context: 'Contexte' })
      ).rejects.toThrow('Réponse IA vide ou inattendue');
    });
  });
});
