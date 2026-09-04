/**
 * Code SSO à usage unique : le callback redirige avec un opaque,
 * `/auth/adopt` l’échange contre le cookie. Jamais de JWT dans l’URL.
 */
import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

export const SSO_ADOPT_CATEGORY = 'sso_adopt';
const ADOPT_TTL_MS = 2 * 60 * 1000;
const HASH_PREFIX = 'caddynote-sso-adopt:';

export type SsoAdoptKind = 'token' | 'mfa';

export type SsoAdoptPayload = {
  kind: SsoAdoptKind;
  token: string;
  exp: number;
};

export const hashAdoptCode = (raw: string): string =>
  crypto.createHash('sha256').update(`${HASH_PREFIX}${raw}`).digest('hex');

export const issueAdoptCode = async (opts: { kind: SsoAdoptKind; token: string }): Promise<string> => {
  const raw = crypto.randomBytes(32).toString('base64url');
  const key = hashAdoptCode(raw);
  await prisma.strkSetting.create({
    data: {
      category: SSO_ADOPT_CATEGORY,
      key,
      value: { kind: opts.kind, token: opts.token, exp: Date.now() + ADOPT_TTL_MS },
      description: 'SSO adopt code (TTL court, usage unique)',
      isPublic: false,
    },
  });
  return raw;
};

export const consumeAdoptCode = async (raw: string): Promise<SsoAdoptPayload | null> => {
  if (typeof raw !== 'string' || raw.length < 16 || raw.length > 128) return null;
  const key = hashAdoptCode(raw);
  let row: { value: unknown };
  try {
    row = await prisma.strkSetting.delete({
      where: { category_key: { category: SSO_ADOPT_CATEGORY, key } },
      select: { value: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return null;
    }
    throw error;
  }
  const value = row.value as SsoAdoptPayload;
  if (!value?.token || (value.kind !== 'token' && value.kind !== 'mfa')) return null;
  if (!value.exp || value.exp < Date.now()) return null;
  return value;
};
