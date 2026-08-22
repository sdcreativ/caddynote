import { PgBoss, type Job } from 'pg-boss';

/**
 * Découplage envoi/traitement (chap. 17, Lot 6) : `POST /communications/send`
 * effectuait jusqu'ici l'appel réel au fournisseur (SMTP/Twilio) de façon
 * synchrone dans la requête HTTP — un ralentissement ou une indisponibilité
 * du fournisseur se répercutait directement sur le temps de réponse de
 * l'API, sans retry en cas d'échec transitoire.
 *
 * `pg-boss` plutôt qu'une simple exécution différée (`setImmediate`, promesse
 * non attendue) : ce projet n'a aucune autre infrastructure de file
 * d'attente (pas de Redis dans `docker-compose.yml`), et une tâche "en
 * file" qui ne survit pas à un redémarrage du processus n'est pas une vraie
 * file d'attente — juste un risque de perte silencieuse déguisé en
 * asynchronisme. `pg-boss` persiste les tâches dans Postgres (déjà la seule
 * base de données de ce projet), avec retry automatique.
 */

const QUEUE_NAME = 'communication-dispatch';

let boss: PgBoss | null = null;
let startPromise: Promise<PgBoss> | null = null;

export const isQueueStarted = (): boolean => !!boss;

/** Idempotent : plusieurs appels concurrents avant la fin du premier
 * démarrage attendent tous la même instance plutôt que d'en créer une par
 * accident. */
export const startQueue = async (): Promise<PgBoss> => {
  if (boss) return boss;
  if (startPromise) return startPromise;

  startPromise = (async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL manquant — impossible de démarrer la file d'attente");
    }
    const instance = new PgBoss({ connectionString });
    instance.on('error', (error: Error) => console.error("Erreur file d'attente (pg-boss):", error));
    await instance.start();
    await instance.createQueue(QUEUE_NAME);
    boss = instance;
    return instance;
  })();

  try {
    return await startPromise;
  } finally {
    startPromise = null;
  }
};

export const stopQueue = async (): Promise<void> => {
  if (!boss) return;
  const instance = boss;
  boss = null;
  await instance.stop({ graceful: true, timeout: 5000 });
};

/** Met une communication en file — ne fait rien de plus que persister
 * l'intention d'envoi ; le traitement réel a lieu dans le worker enregistré
 * via `registerCommunicationDispatchWorker`. 3 tentatives avec un délai
 * croissant : une panne transitoire du fournisseur (SMTP/Twilio) ne doit
 * pas se traduire par un échec définitif dès le premier essai. */
export const enqueueCommunicationDispatch = async (logId: string): Promise<string | null> => {
  const instance = await startQueue();
  return instance.send(QUEUE_NAME, { logId }, { retryLimit: 3, retryDelay: 30, retryBackoff: true });
};

/** Enregistre le worker qui traite réellement les communications mises en
 * file. `handler` reçoit l'id du journal (`StrkCommunicationLog.id`) déjà
 * créé au statut `queued` — c'est à lui d'effectuer l'appel fournisseur et
 * de mettre à jour le statut final. */
export const registerCommunicationDispatchWorker = async (handler: (logId: string) => Promise<void>): Promise<void> => {
  const instance = await startQueue();
  await instance.work<{ logId: string }>(QUEUE_NAME, async (jobs: Job<{ logId: string }>[]) => {
    for (const job of jobs) {
      await handler(job.data.logId);
    }
  });
};
