/**
 * Bootstrap one-shot du premier super-admin (role=admin, sans établissement).
 *
 * Env :
 *   BOOTSTRAP_ADMIN_EMAIL
 *   BOOTSTRAP_ADMIN_PASSWORD  (≥ 12 car., pas les mots de passe démo)
 *
 * Comportement :
 * - Si les deux vars absentes → no-op.
 * - Si un admin actif existe déjà → no-op (+ avertissement si env encore présente).
 * - Sinon → crée le compte, journalise, écrit un marqueur `platform/bootstrap_admin`.
 *
 * Après création du vrai admin : retirer les vars du .env et désactiver le
 * compte bootstrap (UI ou POST /admin/bootstrap/retire).
 */
import { prisma } from './prisma.js';
import { hashPassword } from './password.js';
import { logAudit } from './audit.js';

const SETTING_CATEGORY = 'platform';
const SETTING_KEY = 'bootstrap_admin';

const FORBIDDEN_PASSWORDS = new Set([
  'Test1234!',
  'Password123!',
  'password',
  'admin',
  'changeme',
]);

export type BootstrapResult =
  | { status: 'skipped'; reason: string }
  | { status: 'created'; email: string; id: string }
  | { status: 'error'; reason: string };

export type BootstrapMarker = {
  email: string;
  profileId: string;
  createdAt: string;
};

const isHardDeployment = (): boolean => {
  const d = (process.env.CADDYNOTE_DEPLOYMENT || '').trim().toLowerCase();
  return d === 'production' || d === 'staging';
};

export const validateBootstrapCredentials = (
  email: string,
  password: string
): string | null => {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return 'BOOTSTRAP_ADMIN_EMAIL invalide';
  }
  if (normalized.endsWith('@caddynote.test')) {
    return 'E-mails @caddynote.test interdits pour le bootstrap (comptes démo uniquement)';
  }
  if (FORBIDDEN_PASSWORDS.has(password)) {
    return 'Mot de passe bootstrap trop faible / connu (démo) — générez un secret unique';
  }
  if (password.length < 12) {
    return 'BOOTSTRAP_ADMIN_PASSWORD trop court (min. 12 caractères)';
  }
  if (isHardDeployment() && password.length < 16) {
    return 'En staging/production, BOOTSTRAP_ADMIN_PASSWORD doit faire au moins 16 caractères';
  }
  return null;
};

export const countActiveAdmins = async (): Promise<number> =>
  prisma.strkProfile.count({
    where: { role: 'admin', isActive: true },
  });

export const readBootstrapMarker = async (): Promise<BootstrapMarker | null> => {
  const row = await prisma.strkSetting.findUnique({
    where: { category_key: { category: SETTING_CATEGORY, key: SETTING_KEY } },
    select: { value: true },
  });
  if (!row?.value || typeof row.value !== 'object') return null;
  const v = row.value as Partial<BootstrapMarker>;
  if (!v.email || !v.profileId || !v.createdAt) return null;
  return { email: v.email, profileId: v.profileId, createdAt: v.createdAt };
};

export const clearBootstrapMarker = async (): Promise<void> => {
  await prisma.strkSetting.deleteMany({
    where: { category: SETTING_CATEGORY, key: SETTING_KEY },
  });
};

/**
 * Désactive le compte bootstrap marqué (si encore actif) et efface le marqueur.
 * À appeler une fois le vrai super-admin créé.
 */
export const retireBootstrapAdmin = async (actorId: string): Promise<{
  deactivated: boolean;
  email: string | null;
}> => {
  const marker = await readBootstrapMarker();
  if (!marker) {
    return { deactivated: false, email: null };
  }

  const profile = await prisma.strkProfile.findUnique({ where: { id: marker.profileId } });
  let deactivated = false;
  if (profile?.isActive && profile.role === 'admin') {
    // Ne pas se désactiver soi-même si l’acteur EST encore le bootstrap
    // et qu’il n’y a pas d’autre admin — laisse le caller gérer.
    const admins = await countActiveAdmins();
    if (profile.id === actorId && admins <= 1) {
      throw new Error(
        'Créez d’abord un autre super-admin actif avant de retirer le compte bootstrap'
      );
    }
    await prisma.strkProfile.update({
      where: { id: profile.id },
      data: {
        isActive: false,
        deactivatedAt: new Date(),
        deactivatedBy: actorId,
      },
    });
    deactivated = true;
  }

  await clearBootstrapMarker();
  await logAudit({
    actorId,
    action: 'auth.bootstrap.retired',
    targetType: 'user',
    targetId: marker.profileId,
    metadata: { email: marker.email, deactivated },
  });

  return { deactivated, email: marker.email };
};

export const ensureBootstrapAdmin = async (): Promise<BootstrapResult> => {
  const emailRaw = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim() || '';
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || '';

  if (!emailRaw && !password) {
    return { status: 'skipped', reason: 'vars absentes' };
  }
  if (!emailRaw || !password) {
    return {
      status: 'error',
      reason: 'BOOTSTRAP_ADMIN_EMAIL et BOOTSTRAP_ADMIN_PASSWORD doivent être fournis ensemble',
    };
  }

  const email = emailRaw.toLowerCase();
  const invalid = validateBootstrapCredentials(email, password);
  if (invalid) {
    return { status: 'error', reason: invalid };
  }

  const activeAdmins = await countActiveAdmins();
  if (activeAdmins > 0) {
    return {
      status: 'skipped',
      reason: `admin(s) actif(s) déjà présent(s) (${activeAdmins}) — retirez BOOTSTRAP_ADMIN_* du .env`,
    };
  }

  const existing = await prisma.strkProfile.findUnique({ where: { email } });
  if (existing) {
    if (existing.role === 'admin' && existing.isActive) {
      return { status: 'skipped', reason: 'compte bootstrap déjà actif' };
    }
    // Réactiver / promouvoir uniquement si zéro autre admin (déjà garanti).
    const passwordHash = await hashPassword(password);
    const updated = await prisma.strkProfile.update({
      where: { id: existing.id },
      data: {
        role: 'admin',
        passwordHash,
        institutionId: null,
        isActive: true,
        deactivatedAt: null,
        deactivatedBy: null,
        firstName: existing.firstName || 'Bootstrap',
        lastName: existing.lastName || 'Admin',
      },
    });
    const marker: BootstrapMarker = {
      email,
      profileId: updated.id,
      createdAt: new Date().toISOString(),
    };
    await prisma.strkSetting.upsert({
      where: { category_key: { category: SETTING_CATEGORY, key: SETTING_KEY } },
      create: {
        category: SETTING_CATEGORY,
        key: SETTING_KEY,
        value: marker,
        description: 'Compte bootstrap super-admin (one-shot)',
        isPublic: false,
      },
      update: { value: marker },
    });
    await logAudit({
      actorId: updated.id,
      action: 'auth.bootstrap.reactivated',
      targetType: 'user',
      targetId: updated.id,
      metadata: { email },
    });
    return { status: 'created', email, id: updated.id };
  }

  const passwordHash = await hashPassword(password);
  const created = await prisma.strkProfile.create({
    data: {
      email,
      passwordHash,
      firstName: 'Bootstrap',
      lastName: 'Admin',
      role: 'admin',
      institutionId: null,
      mfaEnabled: false,
    },
  });

  const marker: BootstrapMarker = {
    email,
    profileId: created.id,
    createdAt: new Date().toISOString(),
  };
  await prisma.strkSetting.upsert({
    where: { category_key: { category: SETTING_CATEGORY, key: SETTING_KEY } },
    create: {
      category: SETTING_CATEGORY,
      key: SETTING_KEY,
      value: marker,
      description: 'Compte bootstrap super-admin (one-shot)',
      isPublic: false,
    },
    update: { value: marker },
  });

  await logAudit({
    actorId: created.id,
    action: 'auth.bootstrap.created',
    targetType: 'user',
    targetId: created.id,
    metadata: { email },
  });

  return { status: 'created', email, id: created.id };
};

/** Appelé au démarrage du process HTTP (pas en NODE_ENV=test sauf tests unitaires). */
export const runBootstrapAdminOnStartup = async (): Promise<void> => {
  const result = await ensureBootstrapAdmin();
  if (result.status === 'created') {
    console.warn(
      `⚠️  Bootstrap super-admin créé (${result.email}). ` +
        'Connectez-vous, créez votre vrai admin + MFA, puis retirez BOOTSTRAP_ADMIN_* du .env ' +
        'et appelez POST /admin/bootstrap/retire.'
    );
    return;
  }
  if (result.status === 'error') {
    console.error(`Bootstrap admin : ${result.reason}`);
    if (isHardDeployment()) {
      throw new Error(`Bootstrap admin refusé : ${result.reason}`);
    }
    return;
  }
  if (
    result.reason.includes('déjà') &&
    (process.env.BOOTSTRAP_ADMIN_EMAIL || process.env.BOOTSTRAP_ADMIN_PASSWORD)
  ) {
    console.warn(`⚠️  Bootstrap admin : ${result.reason}`);
  }
};
