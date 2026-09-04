import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { consumeAdoptCode, hashAdoptCode, issueAdoptCode, SSO_ADOPT_CATEGORY } from './ssoAdopt.js';
import { prisma } from './prisma.js';
import { buildFixture, type Fixture } from '../__tests__/fixtures.js';

describe('ssoAdopt', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30_000);

  afterAll(async () => {
    await prisma.strkSetting.deleteMany({ where: { category: SSO_ADOPT_CATEGORY } }).catch(() => undefined);
  });

  it('le hash du code n’est pas le code en clair', () => {
    const raw = 'abcdefghijklmnopqrstuvwxyz012345';
    expect(hashAdoptCode(raw)).not.toBe(raw);
    expect(hashAdoptCode(raw)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashAdoptCode(raw)).toBe(hashAdoptCode(raw));
  });

  it('un code est consommable une seule fois et ne stocke pas de JWT', async () => {
    const raw = await issueAdoptCode({ kind: 'token', userId: fx.a.teacher.id, sid: 'sid-test' });
    const stored = await prisma.strkSetting.findUnique({
      where: { category_key: { category: SSO_ADOPT_CATEGORY, key: hashAdoptCode(raw) } },
    });
    expect(JSON.stringify(stored?.value ?? {})).not.toMatch(/eyJ/);
    expect((stored?.value as { sid?: string }).sid).toBe('sid-test');

    const first = await consumeAdoptCode(raw);
    expect(first).toMatchObject({ kind: 'token', userId: fx.a.teacher.id, sid: 'sid-test' });
    expect(await consumeAdoptCode(raw)).toBeNull();
  });

  it('refuse un code expiré (déjà retiré)', async () => {
    const raw = await issueAdoptCode({ kind: 'mfa', userId: fx.a.teacher.id });
    await prisma.strkSetting.update({
      where: { category_key: { category: SSO_ADOPT_CATEGORY, key: hashAdoptCode(raw) } },
      data: { value: { kind: 'mfa', userId: fx.a.teacher.id, exp: Date.now() - 1 } },
    });
    expect(await consumeAdoptCode(raw)).toBeNull();
    expect(await consumeAdoptCode(raw)).toBeNull();
  });

  it('refuse un code trop court ou inconnu', async () => {
    expect(await consumeAdoptCode('short')).toBeNull();
    expect(await consumeAdoptCode('abcdefghijklmnopqrstuvwxyz012345')).toBeNull();
  });
});
