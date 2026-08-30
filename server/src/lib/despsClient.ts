/**
 * Connecteur DESPS / DSC — stub ops.
 * Sans contrat API officiel : ping + dry-run d’export élèves (payload local).
 * Quand DESPS_BASE_URL + credentials sont présents, `ping` tente un GET /health.
 */
import { prisma } from './prisma.js';
import { areExternalServicesDisabled } from './testMode.js';

export const isDespsConfigured = (): boolean =>
  !areExternalServicesDisabled() &&
  !!(process.env.DESPS_BASE_URL?.trim() && process.env.DESPS_API_KEY?.trim());

export type DespsStatus = {
  configured: boolean;
  baseUrlHost: string | null;
  notes: string;
};

export const getDespsStatus = (): DespsStatus => {
  if (areExternalServicesDisabled()) {
    return {
      configured: false,
      baseUrlHost: null,
      notes: 'Intégrations sortantes désactivées (test mode)',
    };
  }
  if (!isDespsConfigured()) {
    return {
      configured: false,
      baseUrlHost: null,
      notes: 'DESPS_BASE_URL + DESPS_API_KEY absents — stub dry-run uniquement',
    };
  }
  let host: string | null = null;
  try {
    host = new URL(process.env.DESPS_BASE_URL!.trim()).host;
  } catch {
    host = '(URL invalide)';
  }
  return {
    configured: true,
    baseUrlHost: host,
    notes: 'Connecteur configuré — sync réelle selon contrat DESPS',
  };
};

export const pingDesps = async (): Promise<{ ok: boolean; status?: number; error?: string }> => {
  if (!isDespsConfigured()) {
    return { ok: false, error: 'not_configured' };
  }
  const base = process.env.DESPS_BASE_URL!.trim().replace(/\/$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${base}/health`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${process.env.DESPS_API_KEY!.trim()}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
      redirect: 'manual',
    });
    return { ok: res.ok || res.status === 404, status: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'network_error' };
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Dry-run : construit un snapshot élèves pour un établissement (jamais envoyé
 * tant que DESPS_SYNC_LIVE !== 'true').
 */
export const buildDespsStudentExport = async (institutionId: string) => {
  const students = await prisma.strkStudent.findMany({
    where: { institutionId },
    take: 500,
    select: {
      id: true,
      studentNumber: true,
      profile: { select: { firstName: true, lastName: true, email: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return {
    institutionId,
    generatedAt: new Date().toISOString(),
    live: process.env.DESPS_SYNC_LIVE === 'true',
    count: students.length,
    truncated: students.length >= 500,
    records: students.map((s) => ({
      externalId: s.id,
      studentNumber: s.studentNumber ?? null,
      firstName: s.profile?.firstName ?? null,
      lastName: s.profile?.lastName ?? null,
      email: s.profile?.email ?? null,
    })),
  };
};
