/**
 * Finalise une connexion SSO : rattachement profil existant + tenant + MFA.
 * Pas de provisionnement automatique (user inconnu → refus).
 */
import type { Request } from 'express';
import { prisma } from './prisma.js';
import { signAccessToken, signMfaChallengeToken } from './jwt.js';
import { createSession } from './sessions.js';
import { logAudit } from './audit.js';
import { PUBLIC_PROFILE_SELECT } from './profileSelect.js';
import type { SsoConfigStored } from './ssoConfig.js';
import { normalizeEmail } from './emailNormalize.js';

export type SsoLoginResult =
  | { kind: 'token'; token: string; user: Record<string, unknown> }
  | { kind: 'mfa'; challengeToken: string }
  | { kind: 'error'; status: number; error: string; code: string };

export const completeSsoLogin = async (opts: {
  req: Request;
  institutionId: string;
  email: string;
  config: SsoConfigStored;
  idpSub: string;
}): Promise<SsoLoginResult> => {
  const email = normalizeEmail(opts.email);
  const domain = email.split('@')[1];
  if (opts.config.emailDomains?.length && domain && !opts.config.emailDomains.includes(domain)) {
    return { kind: 'error', status: 403, error: 'Domaine e-mail non autorisé pour cet établissement', code: 'sso_domain_forbidden' };
  }

  const profile = await prisma.strkProfile.findUnique({ where: { email } });
  if (!profile) {
    await logAudit({
      institutionId: opts.institutionId,
      action: 'auth.sso.failed',
      metadata: { reason: 'unknown_account', emailDomain: domain },
      ipAddress: opts.req.ip,
    }).catch(() => undefined);
    return { kind: 'error', status: 403, error: 'Aucun compte CaddyNote pour cet e-mail. Demandez une invitation.', code: 'sso_unknown_user' };
  }

  if (profile.institutionId !== opts.institutionId) {
    await logAudit({
      institutionId: opts.institutionId,
      actorId: profile.id,
      action: 'auth.sso.failed',
      targetType: 'user',
      targetId: profile.id,
      metadata: { reason: 'tenant_mismatch' },
      ipAddress: opts.req.ip,
    }).catch(() => undefined);
    return { kind: 'error', status: 403, error: 'Ce compte n’appartient pas à cet établissement', code: 'sso_tenant_mismatch' };
  }

  if (!profile.isActive) {
    return { kind: 'error', status: 403, error: 'Ce compte a été désactivé', code: 'sso_inactive' };
  }

  if (profile.mfaEnabled) {
    await logAudit({
      institutionId: profile.institutionId,
      actorId: profile.id,
      action: 'auth.sso.mfa_challenge',
      ipAddress: opts.req.ip,
      metadata: { idpSub: opts.idpSub },
    }).catch(() => undefined);
    return { kind: 'mfa', challengeToken: signMfaChallengeToken(profile.id) };
  }

  await prisma.strkProfile.update({ where: { id: profile.id }, data: { lastLoginAt: new Date() } });

  const session = await createSession({
    userId: profile.id,
    userAgent: typeof opts.req.headers['user-agent'] === 'string' ? opts.req.headers['user-agent'] : undefined,
    ipAddress: opts.req.ip,
  });
  const token = signAccessToken({
    sub: profile.id,
    role: profile.role,
    institutionId: profile.institutionId,
    groupId: profile.groupId,
    sid: session.id,
  });

  await logAudit({
    institutionId: profile.institutionId,
    actorId: profile.id,
    action: 'auth.sso.login',
    ipAddress: opts.req.ip,
    metadata: { provider: opts.config.provider, idpSub: opts.idpSub },
  });
  await prisma.strkActivity
    .create({
      data: {
        type: 'login',
        description: `Connexion SSO de ${profile.email}`,
        userId: profile.id,
        institutionId: profile.institutionId ?? undefined,
        metadata: { method: 'sso', provider: opts.config.provider },
      },
    })
    .catch(() => undefined);

  const full = await prisma.strkProfile.findUniqueOrThrow({
    where: { id: profile.id },
    select: PUBLIC_PROFILE_SELECT,
  });

  return { kind: 'token', token, user: full as unknown as Record<string, unknown> };
};
