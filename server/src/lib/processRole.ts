/**
 * Rôle du process Node — point 1 (monolithe HTTP + crons + worker).
 *
 * Par défaut `all` : un seul process, comportement historique, rien à
 * changer en local ni en compose. Quand les jobs perturbent le HTTP
 * (latence à l’heure des crons, backup, file d’attente), le même binaire
 * se lance deux fois :
 *  - `api`     : écoute HTTP, met en file, n’exécute ni cron ni worker
 *  - `worker`  : crons + worker pg-boss, n’expose pas l’API métier
 *
 * Plusieurs `worker` sont autorisés : chaque cron passe par
 * `scheduleExclusiveCron` / `pg_try_advisory_lock` (`lib/cronLock.ts`).
 * Ne pas combiner `all` + `worker` (doublons tant que `all` exécute aussi
 * les crons — le lock limite le dégât mais gaspille des ticks).
 */

export type ProcessRole = 'all' | 'api' | 'worker';

export const parseProcessRole = (value: string | undefined): ProcessRole => {
  const normalized = (value ?? 'all').trim().toLowerCase();
  if (normalized === 'api' || normalized === 'worker' || normalized === 'all') {
    return normalized;
  }
  console.warn(
    `CADDYNOTE_PROCESS_ROLE invalide (« ${value ?? ''} ») — repli sur « all » (HTTP + jobs)`
  );
  return 'all';
};

export const getProcessRole = (): ProcessRole => parseProcessRole(process.env.CADDYNOTE_PROCESS_ROLE);

export const shouldServeHttp = (role: ProcessRole = getProcessRole()): boolean =>
  role === 'all' || role === 'api';

export const shouldRunJobs = (role: ProcessRole = getProcessRole()): boolean =>
  role === 'all' || role === 'worker';
