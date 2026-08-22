import client from 'prom-client';

/**
 * Instrumentation HTTP / process exposée sur GET /metrics.
 * `prom-client` enregistre aussi les métriques process Node (mémoire, CPU,
 * event loop lag, âge du process) en plus des histogrammes HTTP ci-dessous.
 */
export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Durée des requêtes HTTP en secondes',
  labelNames: ['method', 'route', 'status_code'] as const,
  // Bornes centrées sur l'objectif produit (liste d'appel en cache <2s,
  // NFR-004) plutôt que les valeurs par défaut de la librairie, pensées
  // pour des API génériques.
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
});

export const httpRequestTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Nombre total de requêtes HTTP',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [registry],
});

/** 1 si ce process sert l’API HTTP (`all` / `api`), 0 pour un worker isolé. */
export const httpEnabled = new client.Gauge({
  name: 'caddynote_http_enabled',
  help: '1 si ce process sert l’API HTTP, 0 sinon',
  registers: [registry],
});

/** 1 si ce process exécute crons + worker de file (`all` / `worker`). */
export const jobsEnabled = new client.Gauge({
  name: 'caddynote_jobs_enabled',
  help: '1 si ce process exécute les crons et le worker de file, 0 sinon',
  registers: [registry],
});

/**
 * Étiquette de route à partir du gabarit Express (`req.route.path` composé
 * avec le chemin du routeur monté), jamais l'URL brute : un id dans l'URL
 * (`/students/<uuid>`) ferait exploser la cardinalité des séries
 * temporelles — chaque élève créerait sa propre série au lieu de tous
 * partager `/students/:id`.
 */
export const resolveRouteLabel = (req: import('express').Request): string => {
  const routePath = req.route?.path;
  if (!routePath) return 'unmatched';
  // `req.baseUrl` porte le préfixe du routeur (ex. "/students") quand la
  // route est définie sur un sous-routeur monté via `app.use('/students', ...)`.
  const base = req.baseUrl || '';
  return `${base}${routePath === '/' ? '' : routePath}` || '/';
};

export const syncProcessRoleMetrics = (
  http: boolean,
  jobs: boolean
): void => {
  httpEnabled.set(http ? 1 : 0);
  jobsEnabled.set(jobs ? 1 : 0);
};

export const metricsMiddleware: import('express').RequestHandler = (req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    // Résolu après coup (sur 'finish', pas avant) : req.route n'est renseigné
    // qu'une fois le routeur ayant effectivement matché la requête.
    const route = resolveRouteLabel(req);
    const labels = { method: req.method, route, status_code: String(res.statusCode) };
    httpRequestDuration.observe(labels, durationSeconds);
    httpRequestTotal.inc(labels);
  });
  next();
};
