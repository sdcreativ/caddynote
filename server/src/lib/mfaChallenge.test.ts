import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildFixture, type Fixture } from '../__tests__/fixtures.js';
import { prisma } from './prisma.js';
import {
  consumeMfaChallengeJti,
  issueMfaChallengeToken,
  peekMfaChallengeToken,
} from './mfaChallenge.js';

describe('MFA challenge à usage unique', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30_000);

  afterAll(async () => {
    if (!fx) return;
    await prisma.strkSetting.deleteMany({
      where: { category: 'mfa_challenge', key: fx.a.teacher.id },
    });
  });

  it('un jti n’est consommé qu’une fois', async () => {
    const token = await issueMfaChallengeToken(fx.a.teacher.id);
    const { sub, jti } = peekMfaChallengeToken(token);
    expect(sub).toBe(fx.a.teacher.id);

    const [first, second] = await Promise.all([
      consumeMfaChallengeJti(sub, jti),
      consumeMfaChallengeJti(sub, jti),
    ]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(await consumeMfaChallengeJti(sub, jti)).toBe(false);
  });

  it('un nouveau login invalide le défi précédent', async () => {
    const first = await issueMfaChallengeToken(fx.a.teacher.id);
    const old = peekMfaChallengeToken(first);
    const second = await issueMfaChallengeToken(fx.a.teacher.id);
    const next = peekMfaChallengeToken(second);

    expect(await consumeMfaChallengeJti(old.sub, old.jti)).toBe(false);
    expect(await consumeMfaChallengeJti(next.sub, next.jti)).toBe(true);
  });
});
