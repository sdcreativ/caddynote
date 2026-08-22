/**
 * Verrou distribué pour les crons `node-cron` (P2-D / Scale).
 *
 * Plusieurs process `worker` (ou `all`) peuvent démarrer les mêmes crons.
 * Sans lock, SMS/backup/dunning doubleraient. On utilise
 * `pg_try_advisory_lock` sur un **Client pg dédié** (pas le pool Prisma) pour
 * que unlock se fasse sur la même connexion.
 */
import cron, { type ScheduledTask } from 'node-cron';
import pg from 'pg';
import { createHash } from 'node:crypto';

export type CronLockResult = 'ran' | 'skipped' | 'error';

/** Deux int4 stables dérivés du nom (namespace CaddyNote cron). */
export const lockKeyPair = (name: string): [number, number] => {
  const digest = createHash('sha256').update(`caddynote:cron:${name}`).digest();
  const key1 = digest.readInt32BE(0);
  const key2 = digest.readInt32BE(4);
  return [key1, key2];
};

const getDatabaseUrl = (): string | undefined =>
  process.env.DATABASE_URL || process.env.TEST_DATABASE_URL;

/**
 * Exécute `fn` si le verrou advisory est acquis ; sinon `skipped`.
 * Toujours unlock dans `finally` sur la même connexion.
 */
export const withCronLock = async (
  name: string,
  fn: () => Promise<void>
): Promise<CronLockResult> => {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    console.error(`cronLock[${name}] : DATABASE_URL manquant — exécution refusée`);
    return 'error';
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  const [key1, key2] = lockKeyPair(name);

  try {
    await client.connect();
    const locked = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock($1, $2) AS locked',
      [key1, key2]
    );
    if (!locked.rows[0]?.locked) {
      console.log(`cronLock[${name}] : skip (déjà tenu par un autre worker)`);
      return 'skipped';
    }

    try {
      await fn();
      return 'ran';
    } finally {
      await client.query('SELECT pg_advisory_unlock($1, $2)', [key1, key2]).catch((err) => {
        console.error(`cronLock[${name}] : unlock échoué:`, err);
      });
    }
  } catch (error) {
    console.error(`cronLock[${name}] : erreur:`, error);
    return 'error';
  } finally {
    await client.end().catch(() => undefined);
  }
};

/**
 * Enregistre un cron exclusif entre workers.
 * Le handler async est encapsulé : erreurs loguées, pas de crash process.
 */
export const scheduleExclusiveCron = (
  expression: string,
  name: string,
  fn: () => Promise<void>
): ScheduledTask => {
  if (!cron.validate(expression)) {
    throw new Error(`Expression cron invalide pour « ${name} » : ${expression}`);
  }
  return cron.schedule(expression, () => {
    void withCronLock(name, fn).then((result) => {
      if (result === 'error') {
        console.error(`cronLock[${name}] : tick terminé en erreur`);
      }
    });
  });
};
