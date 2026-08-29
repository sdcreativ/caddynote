import { startSubscriptionCron } from './subscriptionCron.js';
import { startSubscriptionSuspensionCron } from './subscriptionSuspension.js';
import { startAbsenceAlertCron } from './absenceAlertCron.js';
import { startAttendanceThresholdCron } from './attendanceThresholds.js';
import { startLateFeeCron } from './lateFees.js';
import { startAssignmentReminderCron } from './assignmentReminders.js';
import { startDatabaseBackupCron } from './backup.js';
import { startFilePurgeCron } from './filePurge.js';
import { startAuditRetentionCron } from './auditRetention.js';
import { startDunningCron } from './dunning.js';
import { startCampaignScheduleCron } from './campaignSchedule.js';
import { startExportScheduleCron } from './exportSchedule.js';
import { startAdmissionDocumentReminderCron } from './admissionDocDeadlineCron.js';
import { startNotificationActivityRetentionCron } from './notificationActivityRetention.js';
import { startQueue, registerCommunicationDispatchWorker } from './queue.js';
import { dispatchCommunicationById } from './communications.js';

let started = false;

/**
 * Crons + worker de file. Idempotent : un second appel dans le même
 * process est un no-op (évite d’enregistrer deux fois le worker pg-boss).
 */
export const startBackgroundJobs = (): void => {
  if (started) return;
  started = true;

  startSubscriptionCron();
  startSubscriptionSuspensionCron();
  startDunningCron();
  startAbsenceAlertCron();
  startAttendanceThresholdCron();
  startLateFeeCron();
  startAssignmentReminderCron();
  startDatabaseBackupCron();
  startFilePurgeCron();
  startAuditRetentionCron();
  startCampaignScheduleCron();
  startExportScheduleCron();
  startAdmissionDocumentReminderCron();
  startNotificationActivityRetentionCron();
  startQueue()
    .then(() => registerCommunicationDispatchWorker(dispatchCommunicationById))
    .catch((error) => console.error("Erreur au démarrage de la file d'attente:", error));
};

export const areBackgroundJobsStarted = (): boolean => started;
