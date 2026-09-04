import { describe, it, expect, afterAll } from 'vitest';
import { consumeAdoptCode, hashAdoptCode, issueAdoptCode, SSO_ADOPT_CATEGORY } from './ssoAdopt.js';
import { prisma } from './prisma.js';

describe('ssoAdopt', () => {
  afterAll(async () => {
    await prisma.strkSetting.deleteMany({ where: { category: SSO_ADOPT_CATEGORY } }).catch(() => undefined);
  });

  it('le hash du code n’est pas le code en clair', () => {
    const raw = 'abcdefghijklmnopqrstuvwxyz012345';
    expect(hashAdoptCode(raw)).not.toBe(raw);
    expect(hashAdoptCode(raw)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashAdoptCode(raw)).toBe(hashAdoptCode(raw));
  });

  it('un code est consommable une seule fois', async () => {
    const raw = await issueAdoptCode({ kind: 'token', token: 'not-a-jwt-just-payload' });
    const first = await consumeAdoptCode(raw);
    expect(first).toMatchObject({ kind: 'token', token: 'not-a-jwt-just-payload' });
    expect(await consumeAdoptCode(raw)).toBeNull();
  });

  it('refuse un code expiré (déjà retiré)', async () => {
    const raw = await issueAdoptCode({ kind: 'mfa', token: 'challenge' });
    await prisma.strkSetting.update({
      where: { category_key: { category: SSO_ADOPT_CATEGORY, key: hashAdoptCode(raw) } },
      data: { value: { kind: 'mfa', token: 'challenge', exp: Date.now() - 1 } },
    });
    expect(await consumeAdoptCode(raw)).toBeNull();
    expect(await consumeAdoptCode(raw)).toBeNull();
  });

  it('refuse un code trop court ou inconnu', async () => {
    expect(await consumeAdoptCode('short')).toBeNull();
    expect(await consumeAdoptCode('abcdefghijklmnopqrstuvwxyz012345')).toBeNull();
  });
});
