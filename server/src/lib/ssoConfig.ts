/**
 * Config SSO par établissement (StrkSetting category=institution, key=sso:{id}).
 * Le secret client n'est jamais renvoyé en clair aux clients (masqué).
 */
import { z } from 'zod';
import { prisma } from './prisma.js';
import { assertSafeOutboundUrl, isSafeSsoUrlShape, UnsafeSsoUrlError } from './safeOutboundUrl.js';

export const ssoConfigSchema = z
  .object({
    enabled: z.boolean(),
    provider: z.enum(['oidc', 'azure_ad', 'stub']).default('azure_ad'),
    displayName: z.string().max(80).optional(),
    /** Azure AD tenant id (GUID ou `organizations`). Ignoré si issuerUrl est fourni. */
    azureTenantId: z.string().max(80).optional(),
    issuerUrl: z
      .string()
      .max(500)
      .optional()
      .or(z.literal(''))
      .refine((value) => !value || isSafeSsoUrlShape(value), { message: 'issuerUrl HTTPS public requis' }),
    clientId: z.string().max(200).optional().default(''),
    /** Omise pour conserver le secret existant à l’update. */
    clientSecret: z.string().max(500).optional(),
    /** Domaines e-mail autorisés pour discover (ex. `lycee.fr`). */
    emailDomains: z.array(z.string().min(1).max(120)).max(20).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.enabled && !val.clientId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'clientId requis si enabled', path: ['clientId'] });
    }
  });

export type SsoConfigInput = z.infer<typeof ssoConfigSchema>;

export type SsoConfigStored = SsoConfigInput & {
  updatedAt?: string;
  /** Secret présent en base (jamais exposé). */
  hasClientSecret?: boolean;
};

const settingKey = (institutionId: string) => `sso:${institutionId}`;

export const resolveIssuerUrl = (cfg: Pick<SsoConfigStored, 'issuerUrl' | 'azureTenantId' | 'provider'>): string => {
  if (cfg.issuerUrl) return cfg.issuerUrl.replace(/\/$/, '');
  if (cfg.provider === 'azure_ad' || cfg.azureTenantId) {
    const tid = cfg.azureTenantId || 'organizations';
    return `https://login.microsoftonline.com/${tid}/v2.0`;
  }
  throw new Error('issuerUrl ou azureTenantId requis');
};

export const loadSsoConfig = async (institutionId: string): Promise<SsoConfigStored | null> => {
  const row = await prisma.strkSetting.findUnique({
    where: { category_key: { category: 'institution', key: settingKey(institutionId) } },
    select: { value: true },
  });
  if (!row?.value || typeof row.value !== 'object') return null;
  const raw = row.value as Record<string, unknown>;
  const hasClientSecret = typeof raw.clientSecret === 'string' && raw.clientSecret.length > 0;
  return { ...(raw as SsoConfigStored), hasClientSecret };
};

/** Vue admin / GET /settings : secret masqué (jamais en clair). */
export const redactSsoConfig = (cfg: SsoConfigStored | null, institutionId?: string) => {
  if (!cfg) {
    return {
      enabled: false,
      provider: 'azure_ad' as const,
      issuerUrl: '',
      clientId: '',
      hasClientSecret: false,
      emailDomains: [] as string[],
      displayName: 'Microsoft',
      note: institutionId ? undefined : undefined,
    };
  }
  const { clientSecret: omittedSecret, ...rest } = cfg as SsoConfigStored & { clientSecret?: string };
  const hasClientSecret = !!(
    rest.hasClientSecret ||
    cfg.hasClientSecret ||
    (typeof omittedSecret === 'string' && omittedSecret.length > 0)
  );
  return {
    ...rest,
    clientSecret: hasClientSecret ? '********' : '',
    hasClientSecret,
    displayName: rest.displayName || (rest.provider === 'azure_ad' ? 'Microsoft' : 'SSO'),
  };
};

/** Vue publique login : aucun secret. */
export const publicSsoView = (cfg: SsoConfigStored | null, institutionId: string) => {
  if (!cfg?.enabled) {
    return { enabled: false as const, institutionId };
  }
  return {
    enabled: true as const,
    institutionId,
    provider: cfg.provider,
    displayName: cfg.displayName || (cfg.provider === 'azure_ad' ? 'Microsoft' : 'SSO'),
  };
};

export const saveSsoConfig = async (
  institutionId: string,
  input: SsoConfigInput,
  previous: SsoConfigStored | null
): Promise<SsoConfigStored> => {
  const prevSecret =
    previous && typeof (previous as { clientSecret?: string }).clientSecret === 'string'
      ? (previous as { clientSecret?: string }).clientSecret
      : undefined;
  const clientSecret = input.clientSecret && input.clientSecret !== '********' ? input.clientSecret : prevSecret;
  if (input.enabled && input.provider !== 'stub' && !clientSecret) {
    throw new Error('clientSecret requis pour activer le SSO');
  }
  if (input.enabled && input.provider === 'azure_ad' && !input.issuerUrl && !input.azureTenantId) {
    throw new Error('azureTenantId ou issuerUrl requis pour Azure AD');
  }
  if (input.azureTenantId && /[/\\@: ]/.test(input.azureTenantId)) {
    throw new Error('azureTenantId invalide');
  }
  if (input.issuerUrl) {
    try {
      await assertSafeOutboundUrl(input.issuerUrl);
    } catch (error) {
      if (error instanceof UnsafeSsoUrlError) throw new Error('issuerUrl non autorisée');
      throw error;
    }
  }

  const value: SsoConfigStored & { clientSecret?: string } = {
    enabled: input.enabled,
    provider: input.provider,
    displayName: input.displayName,
    azureTenantId: input.azureTenantId,
    issuerUrl: input.issuerUrl || undefined,
    clientId: input.clientId || '',
    clientSecret,
    emailDomains: (input.emailDomains || []).map((d) => d.toLowerCase().replace(/^@/, '')),
    updatedAt: new Date().toISOString(),
  };

  await prisma.strkSetting.upsert({
    where: { category_key: { category: 'institution', key: settingKey(institutionId) } },
    create: {
      category: 'institution',
      key: settingKey(institutionId),
      value,
      description: 'Config IdP SSO OIDC',
      isPublic: false,
    },
    update: { value, description: 'Config IdP SSO OIDC' },
  });

  return { ...value, hasClientSecret: !!clientSecret };
};

/** PUT /settings institution:sso:* — même garde que saveSsoConfig. */
export const assertSsoSettingValueSafe = async (value: unknown): Promise<void> => {
  if (!value || typeof value !== 'object') return;
  const raw = value as { issuerUrl?: unknown; azureTenantId?: unknown };
  if (typeof raw.azureTenantId === 'string' && /[/\\@: ]/.test(raw.azureTenantId)) {
    throw new Error('azureTenantId invalide');
  }
  if (typeof raw.issuerUrl !== 'string' || raw.issuerUrl.length === 0) return;
  await assertSafeOutboundUrl(raw.issuerUrl);
};

export const findSsoInstitutionByEmail = async (
  email: string
): Promise<{ institutionId: string; config: SsoConfigStored } | null> => {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return null;

  const rows = await prisma.strkSetting.findMany({
    where: { category: 'institution', key: { startsWith: 'sso:' } },
    select: { key: true, value: true },
    take: 500,
  });

  for (const row of rows) {
    const cfg = row.value as SsoConfigStored & { clientSecret?: string };
    if (!cfg?.enabled) continue;
    const domains = cfg.emailDomains || [];
    if (!domains.includes(domain)) continue;
    const institutionId = row.key.replace(/^sso:/, '');
    if (!institutionId) continue;
    return { institutionId, config: { ...cfg, hasClientSecret: !!cfg.clientSecret } };
  }
  return null;
};
