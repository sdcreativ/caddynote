/**
 * Cible Postgres réelle (point 4) : `npm run dev` (souvent :5432) et
 * Compose (`caddynote-db` publié en :5433) ne partagent pas les données.
 * On n’unifie pas les deux — on rend le choix **visible** avant migrate/seed.
 */

export type DbProfile = 'compose-internal' | 'compose-published' | 'host' | 'test' | 'other';

export interface DatabaseTarget {
  host: string;
  port: number;
  database: string;
  profile: DbProfile;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export const inferDbProfile = (host: string, port: number, database: string): DbProfile => {
  if (database.includes('_test')) return 'test';
  if (host === 'caddynote-db') return 'compose-internal';
  const local = LOCAL_HOSTS.has(host);
  if (local && port === 5433) return 'compose-published';
  if (local && port === 5432) return 'host';
  return 'other';
};

export const parseDatabaseUrl = (url: string | undefined): DatabaseTarget | null => {
  if (!url?.trim()) return null;
  try {
    const parsed = new URL(url);
    const database = decodeURIComponent(parsed.pathname.replace(/^\//, '')).split('/')[0] ?? '';
    const port = parsed.port ? Number(parsed.port) : 5432;
    const host = parsed.hostname;
    if (!host || Number.isNaN(port)) return null;
    return { host, port, database, profile: inferDbProfile(host, port, database) };
  } catch {
    return null;
  }
};

export const getDatabaseTarget = (url = process.env.DATABASE_URL): DatabaseTarget | null =>
  parseDatabaseUrl(url);

export const formatDatabaseTarget = (target: DatabaseTarget): string =>
  `${target.host}:${target.port}/${target.database}`;

const PROFILE_LABEL: Record<DbProfile, string> = {
  'compose-internal': 'compose (réseau Docker, caddynote-db)',
  'compose-published': 'compose publié (hôte → port 5433)',
  host: 'Postgres de l’hôte (port 5432)',
  test: 'base de tests (caddynote_test)',
  other: 'cible non reconnue',
};

export const describeDatabaseTarget = (target: DatabaseTarget): string =>
  `${formatDatabaseTarget(target)} — ${PROFILE_LABEL[target.profile]}`;

/** Avertissement si on touche la base hôte alors que Compose vit à part. */
export const hostDbMixupWarning = (target: DatabaseTarget): string | null => {
  if (target.profile !== 'host') return null;
  return (
    'Postgres hôte (port 5432) : distinct de caddynote-db (port hôte 5433). ' +
    'Migrer ou seeder ici ne met pas à jour la stack Compose. ' +
    'Pour une seule base : DATABASE_URL vers localhost:5433, ou CADDYNOTE_DB_PROFILE=host si c’est volontaire.'
  );
};

export type ExpectedDbProfile = 'compose' | 'host' | 'test';

export const parseExpectedDbProfile = (value: string | undefined): ExpectedDbProfile | null => {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === 'compose' || normalized === 'host' || normalized === 'test') return normalized;
  return null;
};

const matchesExpected = (target: DatabaseTarget, expected: ExpectedDbProfile): boolean => {
  if (expected === 'compose') {
    return target.profile === 'compose-internal' || target.profile === 'compose-published';
  }
  return target.profile === expected;
};

/**
 * Si `CADDYNOTE_DB_PROFILE` est défini, refuse une cible qui ne correspond
 * pas (migrate/seed/boot). Absent = pas de refus, seulement un log.
 */
export const assertDbProfile = (
  target: DatabaseTarget,
  expectedRaw = process.env.CADDYNOTE_DB_PROFILE
): string | null => {
  const expected = parseExpectedDbProfile(expectedRaw);
  if (!expected) {
    if (expectedRaw?.trim()) {
      return `CADDYNOTE_DB_PROFILE invalide (« ${expectedRaw} ») — valeurs : compose, host, test`;
    }
    return null;
  }
  if (matchesExpected(target, expected)) return null;
  return (
    `CADDYNOTE_DB_PROFILE=${expected} mais DATABASE_URL pointe vers ${describeDatabaseTarget(target)}. ` +
    'Corriger l’URL ou le profil avant migrate/seed.'
  );
};

/** Log de démarrage / scripts. Lève si le profil déclaré ne correspond pas. */
export const logDatabaseTarget = (): void => {
  const target = getDatabaseTarget();
  if (!target) {
    console.warn('⚠️  DATABASE_URL absent ou illisible — impossible de savoir quelle base sera utilisée.');
    return;
  }
  console.log(`Postgres cible : ${describeDatabaseTarget(target)}`);
  const mismatch = assertDbProfile(target);
  if (mismatch) {
    throw new Error(mismatch);
  }
  const mixup = hostDbMixupWarning(target);
  if (mixup) {
    console.warn(`⚠️  ${mixup}`);
  }
};
