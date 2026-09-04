import 'dotenv/config';
import express from 'express';
// Bug réel trouvé le 16/08/2026 en testant en charge la publication de
// bulletins (NFR-010) : Express 4 ne rattrape PAS le rejet d'une promesse
// dans un handler `async` — une erreur Prisma non explicitement catchée
// (ex. contrainte unique violée par une vraie course de concurrence, voir
// `generateDocument` dans documents.routes.ts) devient une exception non
// interceptée qui **fait crasher tout le process Node**, pas seulement la
// requête fautive : plus aucun établissement, plus aucun utilisateur ne
// peut plus être servi jusqu'au redémarrage manuel. Vérifié : reproduit à
// coup sûr en environnement de test de charge réel. `express-async-errors`
// corrige ceci pour la totalité des ~40 routeurs déjà écrits (un seul
// import, avant la définition de toute route) plutôt que d'exiger de
// réécrire chaque handler avec un wrapper try/catch — l'erreur est
// désormais transmise au middleware d'erreur global ci-dessous (une
// réponse 500 propre pour CETTE requête, jamais un arrêt du process).
import 'express-async-errors';
import cors from 'cors';
import helmet from 'helmet';
import { isTestMode } from './lib/testMode.js';
import { assertFileEncryptionReady } from './lib/fileEncryption.js';
import { assertAntivirusReady } from './lib/antivirus.js';

// BigInt (ex. storageUsedBytes) n'est pas JSON-sérialisable par défaut.
(BigInt.prototype as unknown as { toJSON?: () => string }).toJSON = function toJSON() {
  return this.toString();
};
import { authRouter } from './routes/auth.routes.js';
import { ssoRouter } from './routes/sso.routes.js';
import { institutionsRouter } from './routes/institutions.routes.js';
import { groupsRouter } from './routes/groups.routes.js';
import { studentsRouter } from './routes/students.routes.js';
import { usersRouter } from './routes/users.routes.js';
import { classesRouter } from './routes/classes.routes.js';
import { subjectsRouter } from './routes/subjects.routes.js';
import { coursesRouter } from './routes/courses.routes.js';
import { schedulesRouter } from './routes/schedules.routes.js';
import { gradesRouter } from './routes/grades.routes.js';
import { academicPeriodsRouter } from './routes/academicPeriods.routes.js';
import { gradingScalesRouter } from './routes/gradingScales.routes.js';
import { observationsRouter } from './routes/observations.routes.js';
import { disciplineRouter } from './routes/discipline.routes.js';
import { absencesRouter } from './routes/absences.routes.js';
import { signaturesRouter } from './routes/signatures.routes.js';
import { assignmentsRouter } from './routes/assignments.routes.js';
import { teacherAvailabilityRouter } from './routes/teacherAvailability.routes.js';
import { messagesRouter } from './routes/messages.routes.js';
import { notificationsRouter } from './routes/notifications.routes.js';
import { settingsRouter } from './routes/settings.routes.js';
import { announcementPublicRouter, announcementAdminRouter } from './routes/announcement.routes.js';
import { guardiansRouter } from './routes/guardians.routes.js';
import { subscriptionsRouter } from './routes/subscriptions.routes.js';
import { activityRouter } from './routes/activity.routes.js';
import { analyticsRouter } from './routes/analytics.routes.js';
import { reportsRouter } from './routes/reports.routes.js';
import { exercisesRouter } from './routes/exercises.routes.js';
import { filesRouter } from './routes/files.routes.js';
import { financeRouter, financePublicRouter } from './routes/finance.routes.js';
import { communicationsRouter, communicationsPublicRouter } from './routes/communications.routes.js';
import { documentsRouter, documentsPublicRouter } from './routes/documents.routes.js';
import { admissionsRouter, admissionsPublicRouter } from './routes/admissions.routes.js';
import { campusesRouter } from './routes/campuses.routes.js';
import { auditLogRouter } from './routes/auditLog.routes.js';
import { backupRouter } from './routes/backup.routes.js';
import { supportRouter } from './routes/support.routes.js';
import { lot9Router } from './routes/lot9.routes.js';
import { pushRouter } from './routes/push.routes.js';
import { despsRouter } from './routes/desps.routes.js';
import { contactPublicRouter } from './routes/contact.routes.js';
import { diagnosticsRouter } from './routes/diagnostics.routes.js';
import { adminOpsRouter } from './routes/adminOps.routes.js';
import { statusRouter } from './routes/status.routes.js';
import { stripeWebhookHandler } from './routes/stripeWebhook.routes.js';
import { metricsMiddleware, syncProcessRoleMetrics } from './lib/metrics.js';
import { buildOpenApiDocument, isOpenApiExposed, OPENAPI_DOCS_HTML } from './lib/openapi.js';
import { healthHandler, metricsHandler, startWorkerProbe } from './lib/health.js';
import { getProcessRole, shouldRunJobs, shouldServeHttp } from './lib/processRole.js';
import { startBackgroundJobs } from './lib/jobs.js';
import { logDatabaseTarget } from './lib/databaseTarget.js';
import { maintenanceMiddleware } from './middleware/maintenance.js';
import { assertCorsOriginReady, resolveCorsOrigin } from './lib/corsOrigin.js';

const app = express();
const port = Number(process.env.PORT) || 4000;

app.use(helmet());
app.use(cors({ origin: resolveCorsOrigin(), credentials: true }));

// NFR-002/003 : mesure chaque requête (durée, méthode, route, statut) avant
// tout routeur, pour couvrir aussi les réponses d'erreur précoces (CORS,
// payload trop volumineux...) — voir lib/metrics.ts.
app.use(metricsMiddleware);

// Le webhook Stripe a besoin du corps brut exact pour vérifier la signature
// (FIN-005) — monté AVANT express.json(), qui reparserait/reformaterait le
// corps et invaliderait la vérification.
app.post('/subscriptions/webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler);

app.use(express.json());

// Mode maintenance plateforme (après JSON pour lire le corps des PUT settings).
app.use(maintenanceMiddleware);
// Bug réel trouvé le 16/08/2026 en préparant le test de charge NFR-010 : le
// limiteur (IAM-002) était monté sur TOUT le routeur /auth, y compris
// GET /auth/me — appelé en permanence par la SPA pour vérifier la session,
// pas une tentative de connexion. À 10 requêtes/15min/IP, un simple test de
// charge (une seule IP source) faisait chuter /auth/me à 0% de succès après
// les 10 premières requêtes ; en production, le même risque existe pour
// tout groupe d'utilisateurs derrière une IP partagée (NAT d'établissement
// scolaire, proxy sortant) — exactement le profil réseau d'une école.
// Déplacé dans auth.routes.ts, appliqué seulement aux endpoints réellement
// exposés au bourrage d'identifiants (register/login/mfa/mot de passe
// oublié) — jamais à ce qui exige déjà une session valide (/me, /logout,
// /sessions, /change-password...), même principe que le limiteur dédié
// d'admissions.routes.ts (`submitLimiter`, appliqué route par route).
app.use('/auth', authRouter);
app.use('/auth/sso', ssoRouter);
app.use('/institutions', institutionsRouter);
app.use('/campuses', campusesRouter);
app.use('/groups', groupsRouter);
app.use('/students', studentsRouter);
app.use('/users', usersRouter);
app.use('/classes', classesRouter);
app.use('/subjects', subjectsRouter);
app.use('/courses', coursesRouter);
app.use('/schedules', schedulesRouter);
app.use('/grades', gradesRouter);
app.use('/academic-periods', academicPeriodsRouter);
app.use('/grading-scales', gradingScalesRouter);
app.use('/observations', observationsRouter);
app.use('/discipline', disciplineRouter);
app.use('/absences', absencesRouter);
app.use('/signatures', signaturesRouter);
app.use('/assignments', assignmentsRouter);
app.use('/teacher-availability', teacherAvailabilityRouter);
app.use('/messages', messagesRouter);
app.use('/notifications', notificationsRouter);
app.use('/public', announcementPublicRouter);
app.use('/admin', announcementAdminRouter);
app.use('/settings', settingsRouter);
app.use('/guardians', guardiansRouter);
app.use('/subscriptions', subscriptionsRouter);
app.use('/activity', activityRouter);
app.use('/analytics', analyticsRouter);
app.use('/reports', reportsRouter);
app.use('/exercises', exercisesRouter);
app.use('/files', filesRouter);
// financePublicRouter d'abord : financeRouter applique `requireAuth` à toute
// requête qui entre dans le routeur (avant même le matching de route), donc
// s'il était monté en premier, la route publique /finance/verify/:token
// serait interceptée par cette authentification obligatoire.
app.use('/finance', financePublicRouter);
app.use('/finance', financeRouter);
// Même ordre et même raison que /finance ci-dessus : le webhook Twilio
// (public) doit être atteint avant le `requireAuth` global de communicationsRouter.
app.use('/communications', communicationsPublicRouter);
app.use('/communications', communicationsRouter);
// Même ordre et même raison : /documents/verify/:token doit rester public.
app.use('/documents', documentsPublicRouter);
app.use('/documents', documentsRouter);
// Même ordre et même raison : le dépôt public d'une préinscription
// (candidat sans compte) doit rester atteignable avant le `requireAuth`
// global d'admissionsRouter (gestion réservée à la direction).
app.use('/admissions', admissionsPublicRouter);
app.use('/admissions', admissionsRouter);
app.use('/audit-log', auditLogRouter);
app.use('/backups', backupRouter);
app.use('/support', supportRouter);
app.use('/services', lot9Router);
app.use('/push', pushRouter);
app.use('/admin/integrations/desps', despsRouter);
app.use('/contact', contactPublicRouter);
app.use(diagnosticsRouter);
app.use('/admin', adminOpsRouter);
app.use('/status', statusRouter);

// Chap. 22.2 / Lot 12 : catalogue OpenAPI. Local / test seulement ;
// staging/production → 404 sauf OPENAPI_DOCS=true (réseau interne).
app.get('/openapi.json', (_req, res) => {
  if (!isOpenApiExposed()) {
    return res.status(404).json({ error: 'Introuvable' });
  }
  res.json(buildOpenApiDocument());
});
app.get('/docs', (_req, res) => {
  if (!isOpenApiExposed()) {
    return res.status(404).type('html').send('Introuvable');
  }
  res.type('html').send(OPENAPI_DOCS_HTML);
});

// Sonde de disponibilité (NFR-001) : vérifie aussi la connexion à la base.
// `processRole` / `http` / `jobs` disent si CE process sert l’API et/ou
// les tâches de fond — indispensable dès qu’on sépare api et worker.
app.get('/health', healthHandler);

// NFR-001/002/003 : métriques process/HTTP (durée/volume par route, statuts,
// métriques process par défaut — dont l'âge du process). Aucune donnée sensible
// (que des compteurs par route/méthode/statut), mais route/méthode
// exposeraient la structure interne de l'API à un sondage anonyme si le
// port était ouvert au public — protégé par un jeton porteur (Bearer)
// obligatoire hors NODE_ENV=test : si `METRICS_TOKEN` n'est pas défini,
// l'accès est refusé (401). En test, l'absence de jeton reste ouverte.
app.get('/metrics', metricsHandler);

// Middleware d'erreur global (Express reconnaît une fonction à 4 paramètres
// comme telle, peu importe son nom) — filet de sécurité final pour toute
// erreur qu'un handler de route n'a pas explicitement traitée. Combiné à
// `express-async-errors` (import en tête de fichier) : une promesse
// rejetée dans un handler `async` arrive bien ici plutôt que de crasher le
// process. Monté après tous les routeurs : Express n'exécute un middleware
// à 4 arguments que si `next(err)` a été appelé, jamais sur une requête qui
// s'est terminée normalement plus haut.
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(`Erreur non gérée sur ${req.method} ${req.originalUrl}:`, err);
  if (res.headersSent) {
    return; // Une réponse partielle est déjà partie ; on ne peut plus la remplacer.
  }
  res.status(500).json({ error: 'Erreur interne du serveur' });
});

// Dernier filet de sécurité, hors du cycle de vie Express (tâches
// planifiées, code exécuté en dehors d'une requête HTTP...) : loggue sans
// jamais laisser une erreur inattendue arrêter tout le process — c'est
// précisément l'absence de ceci qui laissait un bug isolé (une seule
// requête) couper le service pour tous les établissements à la fois.
process.on('unhandledRejection', (reason) => {
  console.error('Rejet de promesse non géré :', reason);
});
process.on('uncaughtException', (error) => {
  console.error('Exception non interceptée :', error);
});

// En environnement de test, la suite d'intégration monte `app` directement
// via supertest (pas de vrai socket) et ne veut ni tâche planifiée ni port
// occupé — cf. server/src/__tests__/.
if (process.env.NODE_ENV !== 'test') {
  logDatabaseTarget();
  const role = getProcessRole();
  syncProcessRoleMetrics(shouldServeHttp(role), shouldRunJobs(role));

  if (isTestMode()) {
    const deployment = (process.env.CADDYNOTE_DEPLOYMENT || '').trim().toLowerCase();
    const hardHost = deployment === 'production' || deployment === 'staging';
    if (hardHost && process.env.CADDYNOTE_ALLOW_TEST_MODE_IN_PROD !== 'true') {
      console.error(
        `Refus de démarrer : CADDYNOTE_TEST_MODE=true avec CADDYNOTE_DEPLOYMENT=${deployment}. ` +
          'Désactivez TEST_MODE sur l’hébergement réel, ou CADDYNOTE_ALLOW_TEST_MODE_IN_PROD=true uniquement en urgence documentée.'
      );
      process.exit(1);
    }
    if (process.env.NODE_ENV === 'production' && !hardHost) {
      console.warn(
        '⚠️  CADDYNOTE_TEST_MODE=true sous NODE_ENV=production (Compose/local). ' +
          'Sur un serveur réel : CADDYNOTE_DEPLOYMENT=production et CADDYNOTE_TEST_MODE=false.'
      );
    }
    console.warn(
      '⚠️  CADDYNOTE_TEST_MODE=true — intégrations externes coupées, MFA assouplie'
    );
  }

  try {
    assertCorsOriginReady();
    assertFileEncryptionReady();
    assertAntivirusReady();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  if (shouldServeHttp(role)) {
    // 0.0.0.0 : requis sous Docker — un bind implicite sur localhost
    // rend le port publié inaccessible depuis l'hôte (connection reset).
    const host = process.env.HOST || '0.0.0.0';
    void (async () => {
      try {
        const { runBootstrapAdminOnStartup } = await import('./lib/bootstrapAdmin.js');
        await runBootstrapAdminOnStartup();
        try {
          const { syncPlatformRbacCatalog, migratePlatformOpsAclToRoles } = await import(
            './lib/platformRbac/seed.js'
          );
          await syncPlatformRbacCatalog();
          await migratePlatformOpsAclToRoles();
        } catch (rbacErr) {
          console.error('Seed RBAC plateforme :', rbacErr);
        }
      } catch (err) {
        console.error(err);
        process.exit(1);
      }
      app.listen(port, host, () => {
        console.log(`🚀 CaddyNote API listening on http://${host}:${port} (rôle=${role})`);
        if (shouldRunJobs(role)) {
          startBackgroundJobs();
        } else {
          console.log('Rôle api — crons et worker de file non démarrés dans ce process');
        }
      });
    })();
  } else {
    // worker : jobs sans exposer l’API métier (sonde /health + /metrics seulement).
    startBackgroundJobs();
    startWorkerProbe(port);
    console.log(`CaddyNote worker démarré (rôle=${role})`);
  }
}

export { app };
