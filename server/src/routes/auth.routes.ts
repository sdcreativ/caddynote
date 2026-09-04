import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { signAccessToken, signMfaChallengeToken, verifyAccessToken, verifyMfaChallengeToken } from '../lib/jwt.js';
import {
  accessTokenInBody,
  clearAccessTokenCookie,
  isCookieMutationOriginAllowed,
  setAccessTokenCookie,
} from '../lib/accessCookie.js';
import { isSessionValid } from '../lib/sessions.js';
import { requireAuth } from '../middleware/auth.js';
import { PUBLIC_PROFILE_SELECT } from '../lib/profileSelect.js';
import { generateMfaSecret, buildOtpAuthUri, generateMfaQrCode, verifyMfaCode, isMfaRequiredRole, generateBackupCodes, hashBackupCodes, tryConsumeBackupCode, looksLikeBackupCode, ensureMfaGraceStarted, isMfaGraceExpired, computeMfaGraceUntil } from '../lib/mfa.js';
import { isEmailConfigured, sendEmail } from '../lib/email.js';
import { escapeHtml, wrapTransactionalEmail } from '../lib/emailLayout.js';
import { createSession } from '../lib/sessions.js';
import { logAudit } from '../lib/audit.js';
import { ensureRoleExtension } from '../lib/roleExtensions.js';
import { isTestMode } from '../lib/testMode.js';
import { canSelfAssignRole } from '../lib/publicRegister.js';
import { requiredEmail } from '../lib/zodHelpers.js';
import { consumeAdoptCode } from '../lib/ssoAdopt.js';
import {
  buildResetPasswordUrl,
  hashPasswordResetToken,
  isLegacyPlainResetToken,
  issuePasswordResetSecret,
} from '../lib/passwordReset.js';

/** IAM-004 : crée la session servant de base au jeton, puis signe le jeton
 * avec son id (`sid`) — un point de passage unique pour les 3 endroits qui
 * émettent un jeton d'accès (register/login/vérification MFA), pour ne pas
 * risquer d'en oublier un et laisser un jeton non révocable circuler. */
const issueAccessToken = async (
  req: import('express').Request,
  res: import('express').Response,
  profile: { id: string; role: import('@prisma/client').StrkUserRole; institutionId: string | null; groupId?: string | null }
): Promise<string> => {
  const session = await createSession({
    userId: profile.id,
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
    ipAddress: req.ip,
  });
  const token = signAccessToken({ sub: profile.id, role: profile.role, institutionId: profile.institutionId, groupId: profile.groupId, sid: session.id });
  setAccessTokenCookie(res, token);
  return token;
};

export const authRouter = Router();

// IAM-002 : limite les tentatives sur les seuls endpoints exposés au
// bourrage d'identifiants (register, login, vérification MFA, mot de passe
// oublié/réinitialisé, adopt SSO) — jamais sur ce qui exige déjà une session
// valide (/me, /logout, /sessions...). Désactivé en test (fixtures >10 comptes).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives, réessayez plus tard.' },
  skip: () => process.env.NODE_ENV === 'test' || isTestMode(),
});

const registerSchema = z.object({
  email: requiredEmail,
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phoneNumber: z.string().optional(),
  // IAM-001 / Pronote : aucun compte n’est créé via inscription publique.
  // Les fixtures (NODE_ENV=test) et le bootstrap explicite restent possibles.
  role: z.enum(['admin', 'school_admin', 'teacher', 'student', 'parent']).default('student'),
  institutionId: z.string().uuid().optional(),
});

authRouter.post('/register', authLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const { email, password, firstName, lastName, phoneNumber, role, institutionId } = parsed.data;

  if (!canSelfAssignRole(role)) {
    return res.status(403).json({
      error:
        'Les comptes sont créés par votre établissement (espace élève et espace parent séparés). Utilisez les identifiants fournis par la direction, ou contactez-la.',
      code: 'public_register_disabled',
    });
  }

  const existing = await prisma.strkProfile.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: 'Un compte existe déjà avec cet e-mail' });
  }

  try {
    const passwordHash = await hashPassword(password);
    const profile = await prisma.strkProfile.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        phoneNumber,
        role,
        institutionId,
      },
      select: PUBLIC_PROFILE_SELECT,
    });
    // Bug réel corrigé le 16/08/2026 (voir lib/roleExtensions.ts) : sans
    // ceci, un compte élève/enseignant créé par ce chemin restait inutilisable
    // partout où l'app indexe sur StrkStudent/StrkTeacher plutôt que StrkProfile.
    await ensureRoleExtension(profile.id, profile.role, profile.institutionId);

    const token = await issueAccessToken(req, res, profile);
    res.status(201).json({ ...accessTokenInBody(req, token), user: profile });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ error: 'Un compte existe déjà avec cet e-mail' });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return res.status(400).json({ error: "L'établissement indiqué (institutionId) est introuvable" });
    }
    console.error('Register error:', error);
    res.status(500).json({ error: "Erreur lors de la création du compte" });
  }
});

const loginSchema = z.object({
  email: requiredEmail,
  password: z.string().min(1),
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const { email, password } = parsed.data;

  const profile = await prisma.strkProfile.findUnique({ where: { email } });

  // Réponse volontairement identique que l'e-mail existe ou non, et hachage
  // "factice" exécuté même si le compte n'existe pas, pour ne pas laisser
  // fuiter l'existence d'un compte par une différence de timing (IAM-002).
  const passwordHash = profile?.passwordHash ?? '$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const validPassword = await verifyPassword(passwordHash, password).catch(() => false);

  if (!profile || !profile.passwordHash || !validPassword) {
    await logAudit({
      institutionId: profile?.institutionId ?? undefined,
      actorId: profile?.id ?? undefined,
      action: 'auth.login.failed',
      targetType: 'user',
      targetId: profile?.id ?? undefined,
      metadata: { reason: !profile ? 'unknown_account' : 'bad_credentials' },
      ipAddress: req.ip,
    }).catch(() => undefined);
    return res.status(401).json({ error: 'E-mail ou mot de passe incorrect' });
  }

  // PER-005 : compte désactivé (cf. DELETE /users/:id) — vérifié après la
  // validation du mot de passe, pour ne révéler l'état du compte qu'à
  // quelqu'un qui a déjà prouvé en connaître les identifiants.
  if (!profile.isActive) {
    return res.status(403).json({ error: 'Ce compte a été désactivé' });
  }

  // IAM-003 : mot de passe validé mais MFA activée -> pas de jeton d'accès
  // tout de suite, seulement un jeton de défi de courte durée. L'accès réel
  // n'est délivré qu'après vérification du code TOTP (POST /auth/mfa/login-verify).
  if (profile.mfaEnabled) {
    return res.json({ mfaRequired: true, challengeToken: signMfaChallengeToken(profile.id) });
  }

  await prisma.strkProfile.update({ where: { id: profile.id }, data: { lastLoginAt: new Date() } });
  const mfaGraceUntil = await ensureMfaGraceStarted({
    id: profile.id,
    role: profile.role,
    mfaEnabled: profile.mfaEnabled,
    mfaGraceUntil: profile.mfaGraceUntil,
  });

  const token = await issueAccessToken(req, res, profile);
  await logAudit({ institutionId: profile.institutionId, actorId: profile.id, action: 'auth.login', ipAddress: req.ip });
  // Journal visible sur /super-admin « Activité récente » (StrkActivity ≠ audit technique).
  await prisma.strkActivity
    .create({
      data: {
        type: 'login',
        description: `Connexion de ${profile.email}`,
        userId: profile.id,
        institutionId: profile.institutionId ?? undefined,
        metadata: {},
      },
    })
    .catch(() => undefined);
  const { passwordHash: _omit, mfaSecret: _omit2, passwordResetToken: _omit3, mfaBackupCodeHashes: _omit4, ...safeProfile } = profile;
  res.json({
    ...accessTokenInBody(req, token),
    user: { ...safeProfile, mfaGraceUntil },
  });
});

const mfaLoginVerifySchema = z.object({
  challengeToken: z.string().min(1),
  /** TOTP 6 chiffres, ou code de secours `XXXX-XXXX` / 8–16 caractères. */
  code: z.string().min(6).max(19),
});

authRouter.post('/mfa/login-verify', authLimiter, async (req, res) => {
  const parsed = mfaLoginVerifySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }

  let sub: string;
  try {
    sub = verifyMfaChallengeToken(parsed.data.challengeToken).sub;
  } catch {
    return res.status(401).json({ error: 'Jeton de défi expiré ou invalide, reconnectez-vous' });
  }

  const profile = await prisma.strkProfile.findUnique({ where: { id: sub } });
  if (!profile || !profile.mfaEnabled || !profile.mfaSecret) {
    return res.status(401).json({ error: 'Session MFA invalide' });
  }

  // PER-005 : le compte a pu être désactivé entre l'émission du jeton de
  // défi MFA et cette vérification — avant de consommer un code de secours.
  if (!profile.isActive) {
    return res.status(403).json({ error: 'Ce compte a été désactivé' });
  }

  const rawCode = parsed.data.code.trim();
  let verified = false;
  let consumedBackup = false;

  if (/^\d{6}$/.test(rawCode)) {
    verified = await verifyMfaCode(profile.mfaSecret, rawCode);
  } else if (looksLikeBackupCode(rawCode)) {
    verified = await tryConsumeBackupCode(profile.id, rawCode);
    consumedBackup = verified;
  }

  if (!verified) {
    await logAudit({
      institutionId: profile.institutionId,
      actorId: profile.id,
      action: 'auth.mfa.failed',
      targetType: 'user',
      targetId: profile.id,
      ipAddress: req.ip,
    }).catch(() => undefined);
    return res.status(401).json({ error: 'Code de vérification incorrect' });
  }

  await prisma.strkProfile.update({ where: { id: profile.id }, data: { lastLoginAt: new Date() } });

  const token = await issueAccessToken(req, res, profile);
  await logAudit({
    institutionId: profile.institutionId,
    actorId: profile.id,
    action: consumedBackup ? 'auth.login.backup_code' : 'auth.login',
    ipAddress: req.ip,
    metadata: consumedBackup ? { method: 'mfa_backup_code' } : undefined,
  });
  await prisma.strkActivity
    .create({
      data: {
        type: 'login',
        description: `Connexion de ${profile.email}`,
        userId: profile.id,
        institutionId: profile.institutionId ?? undefined,
        metadata: consumedBackup ? { method: 'mfa_backup_code' } : {},
      },
    })
    .catch(() => undefined);
  const {
    passwordHash: _omit,
    mfaSecret: _omit2,
    passwordResetToken: _omit3,
    mfaBackupCodeHashes: _omit4,
    ...safeProfile
  } = profile;
  res.json({ ...accessTokenInBody(req, token), user: safeProfile });
});

// --- MFA : activation/désactivation (IAM-003) ---

authRouter.post('/mfa/setup', requireAuth, async (req, res) => {
  if (req.auth!.impersonatorId) {
    return res.status(403).json({ error: 'Action interdite pendant une impersonation' });
  }
  const profile = await prisma.strkProfile.findUnique({ where: { id: req.auth!.sub } });
  if (!profile?.email) {
    return res.status(400).json({ error: 'Compte sans e-mail, MFA indisponible' });
  }
  // Le secret est stocké immédiatement (mais `mfaEnabled` reste false tant que
  // /auth/mfa/confirm n'a pas validé un premier code) : un secret généré puis
  // jamais confirmé est inoffensif, il n'est utilisé pour aucune vérification.
  const secret = generateMfaSecret();
  await prisma.strkProfile.update({ where: { id: profile.id }, data: { mfaSecret: secret } });
  const otpAuthUri = buildOtpAuthUri(profile.email, secret);
  const qrCodeDataUrl = await generateMfaQrCode(otpAuthUri);
  res.json({ secret, otpAuthUri, qrCodeDataUrl });
});

const mfaCodeSchema = z.object({ code: z.string().min(6).max(6) });

authRouter.post('/mfa/confirm', requireAuth, async (req, res) => {
  if (req.auth!.impersonatorId) {
    return res.status(403).json({ error: 'Action interdite pendant une impersonation' });
  }
  const parsed = mfaCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const profile = await prisma.strkProfile.findUnique({ where: { id: req.auth!.sub } });
  if (!profile?.mfaSecret) {
    return res.status(400).json({ error: 'Aucune procédure d’activation MFA en cours (appelez /auth/mfa/setup)' });
  }
  const valid = await verifyMfaCode(profile.mfaSecret, parsed.data.code);
  if (!valid) {
    return res.status(401).json({ error: 'Code de vérification incorrect' });
  }
  const backupCodes = generateBackupCodes();
  await prisma.strkProfile.update({
    where: { id: profile.id },
    data: {
      mfaEnabled: true,
      mfaBackupCodeHashes: hashBackupCodes(backupCodes),
      mfaGraceUntil: null,
    },
  });
  await logAudit({
    institutionId: profile.institutionId,
    actorId: profile.id,
    action: 'auth.mfa.enabled',
    ipAddress: req.ip,
  }).catch(() => undefined);
  // Les codes en clair ne sont renvoyés qu’une fois — uniquement à la confirmation.
  res.json({ success: true, backupCodes });
});

const mfaDisableSchema = z.object({ password: z.string().min(1) });

authRouter.post('/mfa/disable', requireAuth, async (req, res) => {
  if (req.auth!.impersonatorId) {
    return res.status(403).json({ error: 'Action interdite pendant une impersonation' });
  }
  const parsed = mfaDisableSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const profile = await prisma.strkProfile.findUnique({ where: { id: req.auth!.sub } });
  if (!profile?.passwordHash || !(await verifyPassword(profile.passwordHash, parsed.data.password))) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }
  await prisma.strkProfile.update({
    where: { id: profile.id },
    data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodeHashes: [] },
  });
  await logAudit({ institutionId: profile.institutionId, actorId: profile.id, action: 'auth.mfa.disabled', ipAddress: req.ip });
  res.json({ success: true });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  let profile = await prisma.strkProfile.findUnique({
    where: { id: req.auth!.sub },
    select: PUBLIC_PROFILE_SELECT,
  });
  if (!profile) {
    return res.status(404).json({ error: 'Utilisateur introuvable' });
  }
  // Démarre la grâce 7 j au premier accès authentifié (backfill comptes existants).
  const mfaGraceUntil = await ensureMfaGraceStarted({
    id: profile.id,
    role: profile.role,
    mfaEnabled: profile.mfaEnabled,
    mfaGraceUntil: profile.mfaGraceUntil,
  });
  if (mfaGraceUntil !== profile.mfaGraceUntil) {
    profile = { ...profile, mfaGraceUntil };
  }

  const needsMfa = isMfaRequiredRole(profile.role) && !profile.mfaEnabled;
  const graceExpired = needsMfa && isMfaGraceExpired(mfaGraceUntil);
  const inGrace = needsMfa && !!mfaGraceUntil && !graceExpired;
  const impersonation = req.auth!.impersonatorId
    ? {
        active: true,
        impersonatorId: req.auth!.impersonatorId,
        expiresAt: (() => {
          try {
            const header = req.headers.authorization || '';
            const raw = header.slice('Bearer '.length);
            const decoded = JSON.parse(
              Buffer.from(raw.split('.')[1] || '', 'base64url').toString('utf8')
            ) as { exp?: number };
            return decoded.exp ? new Date(decoded.exp * 1000).toISOString() : null;
          } catch {
            return null;
          }
        })(),
      }
    : { active: false };

  res.json({
    user: profile,
    mustChangePassword: !!profile.mustChangePassword,
    mfaRecommended: inGrace,
    mfaSetupRequired: graceExpired && !isTestMode(),
    mfaGraceUntil: mfaGraceUntil ? mfaGraceUntil.toISOString() : null,
    impersonation,
  });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

authRouter.post('/change-password', requireAuth, async (req, res) => {
  if (req.auth!.impersonatorId) {
    return res.status(403).json({ error: 'Action interdite pendant une impersonation' });
  }
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }

  const profile = await prisma.strkProfile.findUnique({ where: { id: req.auth!.sub } });
  if (!profile?.passwordHash || !(await verifyPassword(profile.passwordHash, parsed.data.currentPassword))) {
    return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.strkProfile.update({
    where: { id: profile.id },
    data: { passwordHash, mustChangePassword: false },
  });
  // IAM-004 : les autres sessions (autres appareils) sont invalidées ; celle
  // en cours ne l'est jamais ici — sinon la requête qui vient de réussir se
  // retrouverait elle-même déconnectée sans nouveau jeton pour la remplacer.
  await prisma.strkSession.updateMany({
    where: { userId: profile.id, revokedAt: null, id: { not: req.auth!.sid } },
    data: { revokedAt: new Date() },
  });
  await logAudit({ institutionId: profile.institutionId, actorId: profile.id, action: 'auth.password.changed', ipAddress: req.ip });
  res.json({ success: true });
});

const forgotPasswordSchema = z.object({ email: requiredEmail });

authRouter.post('/forgot-password', authLimiter, async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }

  const profile = await prisma.strkProfile.findUnique({ where: { email: parsed.data.email } });
  // Réponse identique que le compte existe ou non (évite l'énumération de comptes).
  if (profile) {
    const { raw, hash } = issuePasswordResetSecret();
    await prisma.strkProfile.update({
      where: { id: profile.id },
      data: {
        passwordResetToken: hash,
        passwordResetExpires: new Date(Date.now() + 60 * 60 * 1000), // 1h
      },
    });
    const resetUrl = buildResetPasswordUrl(process.env.APP_URL || 'http://localhost:8080', raw);
    const first = escapeHtml(profile.firstName ?? '');
    const html = wrapTransactionalEmail({
      preheader: 'Réinitialisez votre mot de passe CaddyNote (lien valable 1 heure)',
      title: 'Réinitialisation du mot de passe',
      bodyHtml: `
        <p style="margin:0 0 16px;">Bonjour${first ? ` <strong>${first}</strong>` : ''},</p>
        <p style="margin:0 0 16px;">
          Une demande de réinitialisation de mot de passe a été effectuée pour votre compte CaddyNote.
          Le lien ci-dessous est valable <strong>1 heure</strong>.
        </p>
      `,
      cta: { label: 'Choisir un nouveau mot de passe', url: resetUrl },
      footerNote:
        'Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail — votre mot de passe actuel reste inchangé.',
    });
    const sent = await sendEmail({
      to: profile.email!,
      subject: 'Réinitialisation de votre mot de passe CaddyNote',
      html,
      text: `Bonjour${profile.firstName ? ` ${profile.firstName}` : ''},\n\nRéinitialisez votre mot de passe (valable 1 h) :\n${resetUrl}\n\nSi vous n’êtes pas à l’origine de cette demande, ignorez ce message.`,
    });
    if (!sent) {
      // Jamais le jeton ni l’URL dans les journaux — secret d’accès au compte.
      console.warn('[auth] forgot-password : e-mail non envoyé');
    }
  }
  res.json({ success: true, message: 'Si ce compte existe, un e-mail de réinitialisation a été envoyé.' });
});

const resetPasswordSchema = z.object({
  token: z.string().min(16).max(128),
  newPassword: z.string().min(8),
});

authRouter.post('/reset-password', authLimiter, async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }

  const now = new Date();
  const hashed = hashPasswordResetToken(parsed.data.token);
  let profile = await prisma.strkProfile.findFirst({
    where: {
      passwordResetToken: hashed,
      passwordResetExpires: { gt: now },
    },
  });
  // Fenêtre 1 h : e-mails déjà partis avec jeton en clair / en query.
  if (!profile && isLegacyPlainResetToken(parsed.data.token)) {
    profile = await prisma.strkProfile.findFirst({
      where: {
        passwordResetToken: parsed.data.token,
        passwordResetExpires: { gt: now },
      },
    });
  }
  if (!profile) {
    return res.status(400).json({ error: 'Jeton invalide ou expiré' });
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.strkProfile.update({
    where: { id: profile.id },
    data: { passwordHash, passwordResetToken: null, passwordResetExpires: null, mustChangePassword: false },
  });
  // IAM-004 : une réinitialisation de mot de passe (typiquement après
  // suspicion de compromission) invalide toutes les sessions existantes —
  // il n'y a pas de "session courante" à préserver ici, contrairement à
  // POST /auth/change-password ci-dessus.
  await prisma.strkSession.updateMany({ where: { userId: profile.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await logAudit({ institutionId: profile.institutionId, actorId: profile.id, action: 'auth.password.reset', ipAddress: req.ip });
  res.json({ success: true });
});

// --- IAM-004 : gestion des sessions ---

authRouter.get('/sessions', requireAuth, async (req, res) => {
  const sessions = await prisma.strkSession.findMany({
    where: { userId: req.auth!.sub, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: 'desc' },
    select: { id: true, userAgent: true, ipAddress: true, createdAt: true, lastSeenAt: true, expiresAt: true },
  });
  res.json({
    sessions: sessions.map((s) => ({ ...s, current: s.id === req.auth!.sid })),
  });
});

authRouter.delete('/sessions/:id', requireAuth, async (req, res) => {
  const session = await prisma.strkSession.findUnique({ where: { id: req.params.id } });
  if (!session || session.userId !== req.auth!.sub) {
    return res.status(404).json({ error: 'Session introuvable' });
  }
  await prisma.strkSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
  await logAudit({
    institutionId: req.auth!.institutionId,
    actorId: req.auth!.sub,
    action: 'auth.session.revoked',
    targetType: 'session',
    targetId: session.id,
    metadata: { self: session.id === req.auth!.sid },
    ipAddress: req.ip,
  });
  res.json({ success: true });
});

// "Se déconnecter de tous les autres appareils" — la session courante n'est
// jamais révoquée par cette route (cf. POST /auth/logout pour ça).
authRouter.delete('/sessions', requireAuth, async (req, res) => {
  const result = await prisma.strkSession.updateMany({
    where: { userId: req.auth!.sub, revokedAt: null, id: { not: req.auth!.sid } },
    data: { revokedAt: new Date() },
  });
  await logAudit({
    institutionId: req.auth!.institutionId,
    actorId: req.auth!.sub,
    action: 'auth.session.revoked_all_others',
    metadata: { count: result.count },
    ipAddress: req.ip,
  });
  res.json({ revoked: result.count });
});

authRouter.post('/logout', requireAuth, async (req, res) => {
  await prisma.strkSession.update({ where: { id: req.auth!.sid }, data: { revokedAt: new Date() } });
  clearAccessTokenCookie(res);
  res.json({ success: true });
});

/** Échange un code SSO (usage unique) ou un jeton de test contre le cookie HttpOnly. */
authRouter.post('/adopt', authLimiter, async (req, res) => {
  if (!isCookieMutationOriginAllowed(req)) {
    return res.status(403).json({ error: 'Origine de la requête refusée', code: 'csrf' });
  }
  const parsed = z
    .object({
      code: z.string().min(16).max(128).optional(),
      token: z.string().min(20).max(4000).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success || (!parsed.data.code && !parsed.data.token)) {
    return res.status(400).json({ error: 'Jeton manquant' });
  }

  const setCookieFromAccessToken = async (token: string) => {
    const payload = verifyAccessToken(token);
    if (!(await isSessionValid(payload.sid))) {
      return res.status(401).json({ error: 'Session révoquée ou expirée, reconnectez-vous' });
    }
    setAccessTokenCookie(res, token);
    return res.json({ ok: true });
  };

  try {
    if (parsed.data.code) {
      const adopted = await consumeAdoptCode(parsed.data.code);
      if (!adopted) {
        return res.status(401).json({ error: 'Code invalide ou expiré' });
      }
      if (adopted.kind === 'mfa') {
        return res.json({ ok: true, mfaRequired: true, challengeToken: adopted.token });
      }
      return await setCookieFromAccessToken(adopted.token);
    }
    return await setCookieFromAccessToken(parsed.data.token!);
  } catch {
    return res.status(401).json({ error: 'Jeton invalide ou expiré' });
  }
});
