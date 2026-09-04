import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { registerActor } from './fixtures.js';
import { hashPasswordResetToken } from '../lib/passwordReset.js';
import { withCapturedResetEmail } from './captureResetEmail.js';

describe('POST /auth/forgot-password — journaux', () => {
  let email: string;

  beforeAll(async () => {
    const actor = await registerActor('teacher');
    email = actor.email;
  });

  it('ne journalise jamais le jeton de réinitialisation', async () => {
    const chunks: string[] = [];
    const capture = (...args: unknown[]) => {
      chunks.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    };
    const spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(capture)
    );

    try {
      const { result: res, rawToken } = await withCapturedResetEmail(() =>
        request(app).post('/auth/forgot-password').send({ email })
      );
      expect(res.status).toBe(200);
      expect(rawToken).toBeTruthy();

      const profile = await prisma.strkProfile.findUniqueOrThrow({ where: { email } });
      expect(profile.passwordResetToken).toBe(hashPasswordResetToken(rawToken!));
      expect(profile.passwordResetToken).not.toBe(rawToken);

      const dumped = chunks.join('\n');
      expect(dumped).not.toContain(rawToken!);
      expect(dumped).not.toContain(profile.passwordResetToken!);
      expect(dumped).not.toMatch(/Jeton de réinitialisation|\?token=/i);

      const leakedHash = await request(app).post('/auth/reset-password').send({
        token: profile.passwordResetToken,
        newPassword: 'AnotherPassword123!',
      });
      expect(leakedHash.status).toBe(400);
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
  });

  it('accepte encore un jeton legacy hex stocké en clair (fenêtre 1 h)', async () => {
    const actor = await registerActor('teacher');
    const legacy = `${'ab'.repeat(32)}`;
    await prisma.strkProfile.update({
      where: { id: actor.id },
      data: {
        passwordResetToken: legacy,
        passwordResetExpires: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const res = await request(app)
      .post('/auth/reset-password')
      .send({ token: legacy, newPassword: 'LegacyPass123!' });
    expect(res.status).toBe(200);
  });
});
