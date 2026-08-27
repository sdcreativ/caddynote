import { apiClient } from '@/lib/apiClient';
import { fetchContactOpsMessages, fetchSupportTickets } from '@/services/strkSupportService';
import { fetchStrkInstitutions } from '@/services/strkInstitutionService';

export type DiagnosticsPayload = {
  status: string;
  database: string;
  timestamp: string;
  /** Tableau API `{ key, configured, notes }` (ou Record legacy). */
  integrations?: unknown;
  rpoHintHours?: number;
  backupCron?: string;
  filePurgeEnabled?: boolean;
};

export const fetchDiagnostics = async () => {
  return apiClient.get<DiagnosticsPayload>('/diagnostics');
};

export type BackupEntry = {
  key: string;
  sizeBytes: number;
  lastModified?: string;
};

export const listBackups = async () => {
  const { backups, s3Configured } = await apiClient.get<{
    backups: BackupEntry[];
    s3Configured: boolean;
  }>('/backups');
  return { backups, s3Configured };
};

export const runBackup = async () => {
  return apiClient.post<{ backup: unknown }>('/backups/run', {});
};

export const getBackupDownloadUrl = async (key: string) => {
  return apiClient.post<{ downloadUrl: string; expiresIn: number; key: string }>('/backups/download-url', {
    key,
  });
};

export const verifyBackup = async (key?: string) => {
  return apiClient.post<{
    ok: boolean;
    source?: string;
    detail?: string;
    filename?: string;
    key?: string;
  }>('/backups/verify', key ? { key } : {});
};

export type PurgeCandidate = { key: string; reason: string; sizeBytes: number };
export type PurgeResult = {
  dryRun: boolean;
  candidates: PurgeCandidate[];
  deleted: string[];
  errors: { key: string; error: string }[];
};

export const purgeFiles = async (dryRun = true) => {
  return apiClient.post<PurgeResult>('/files/purge', { dryRun });
};

export const getMaintenanceMode = async () => {
  const { value } = await apiClient.get<{ value: unknown }>('/settings/system/maintenanceMode');
  if (value === true || value === 'true') return true;
  if (value && typeof value === 'object' && 'enabled' in (value as object)) {
    return !!(value as { enabled?: boolean }).enabled;
  }
  return false;
};

export const setMaintenanceMode = async (enabled: boolean) => {
  return apiClient.put('/settings/system/maintenanceMode', {
    value: enabled,
    description: 'Mode maintenance plateforme',
    isPublic: false,
  });
};

export type CommsKillSwitch = { email: boolean; sms: boolean; whatsapp: boolean };

export const getCommsKillSwitch = async (): Promise<CommsKillSwitch> => {
  const { value } = await apiClient.get<{ value: unknown }>('/settings/system/commsKillSwitch');
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, boolean>;
  return { email: !!v.email, sms: !!v.sms, whatsapp: !!v.whatsapp };
};

export const setCommsKillSwitch = async (value: CommsKillSwitch) => {
  return apiClient.put('/settings/system/commsKillSwitch', {
    value,
    description: 'Kill-switch canaux plateforme',
    isPublic: false,
  });
};

export type PlatformFlags = Record<string, boolean>;

export const getPlatformFlags = async (): Promise<PlatformFlags> => {
  const { value } = await apiClient.get<{ value: unknown }>('/settings/system/platformFlags');
  return (value && typeof value === 'object' ? value : {}) as PlatformFlags;
};

export const setPlatformFlags = async (value: PlatformFlags) => {
  return apiClient.put('/settings/system/platformFlags', {
    value,
    description: 'Feature flags plateforme',
    isPublic: false,
  });
};

export type OpsMetrics = {
  timestamp: string;
  http: { totalRequests: number; total5xx: number; errorRate: number; avgLatencyMs: number | null };
  jobs: {
    processRole: string;
    httpEnabled: boolean;
    jobsEnabled: boolean;
    queueStarted: boolean;
  };
  communications: { queued: number; failedLast24h: number };
  security: { failedAuthLast24h: number };
  /** Anneau process-local (derniers snapshots) — pas de persistance durable. */
  history?: Array<{
    timestamp: string;
    http: { totalRequests: number; total5xx: number; errorRate: number; avgLatencyMs: number | null };
    communications: { queued: number; failedLast24h: number };
    security: { failedAuthLast24h: number };
  }>;
};

export const fetchOpsMetrics = async () => apiClient.get<OpsMetrics>('/admin/ops-metrics');

export const adminSearch = async (q: string) =>
  apiClient.get<{
    query: string;
    users: Array<{
      id: string;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
      role: string;
      institutionId: string | null;
      isActive: boolean;
    }>;
    institutions: Array<{ id: string; name: string; type: string; email: string | null; featureOverrides?: unknown }>;
  }>(`/admin/search?q=${encodeURIComponent(q)}`);

export const fetchRopa = async () =>
  apiClient.get<{
    entries: Array<{
      id: string;
      purpose: string;
      legalBasis: string;
      dataCategories: string[];
      retention: string;
    }>;
    version?: number;
    exportedAt?: string | null;
  }>('/admin/ropa');

export const saveRopa = async (
  entries: Array<{
    id: string;
    purpose: string;
    legalBasis: string;
    dataCategories: string[];
    retention: string;
  }>
) =>
  apiClient.put<{
    entries: typeof entries;
    version: number;
    exportedAt: string;
  }>('/admin/ropa', { entries });

export type CommOpsLog = {
  id: string;
  channel: string;
  status: string;
  subject?: string | null;
  useCase?: string | null;
  errorMessage?: string | null;
  requestedAt: string;
  failedAt?: string | null;
  recipientId: string;
  institutionId?: string | null;
  toAddress?: string | null;
};

export const listFailedCommunications = async (status: 'failed' | 'queued' = 'failed') =>
  apiClient.get<{ logs: CommOpsLog[]; count: number }>(`/admin/communications?status=${status}&limit=80`);

export const retryCommunication = async (id: string) =>
  apiClient.post<{ ok: boolean; id: string }>(`/admin/communications/${id}/retry`, {});

export const purgeFailedCommunications = async (olderThanDays = 30) =>
  apiClient.post<{ deleted: number; olderThanDays: number }>('/admin/communications/purge-failed', {
    olderThanDays,
  });

export const fetchBillingMetrics = async () =>
  apiClient.get<{
    generatedAt: string;
    mrr: number;
    arr: number;
    activeSubscriptions: number;
    newSubscriptions30d: number;
    cancelledSubscriptions30d: number;
    churnRate30d: number;
    stripeLinkedCount: number;
    notice: string;
  }>('/admin/billing-metrics');

export type DunningQueueItem = {
  subscriptionId: string;
  institutionId: string | null;
  status: string;
  expiresAt: string;
  plan: string;
  userEmail: string | null;
  userName: string | null;
  daysPastDue: number;
};

export const fetchDunningQueue = async (): Promise<DunningQueueItem[]> => {
  const { items } = await apiClient.get<{ items: DunningQueueItem[] }>('/admin/dunning-queue');
  return items ?? [];
};

/** Item actionnable pour le cockpit équipe (À traiter). */
export type PlatformOpsItem = {
  id: string;
  kind: 'ticket' | 'dunning' | 'frozen' | 'security' | 'comms' | 'contact';
  title: string;
  detail?: string;
  href: string;
};

/**
 * Agrège tickets ouverts, dunning, tenants gelés, contacts et signaux ops.
 * Best-effort : une source en échec (permission / réseau) n’empêche pas les autres.
 */
export const fetchPlatformOpsQueue = async (): Promise<PlatformOpsItem[]> => {
  const items: PlatformOpsItem[] = [];

  const [ticketsSettled, dunningSettled, institutionsSettled, opsSettled, contactsSettled] =
    await Promise.allSettled([
      fetchSupportTickets({ status: 'open' }),
      fetchDunningQueue(),
      fetchStrkInstitutions(),
      fetchOpsMetrics(),
      fetchContactOpsMessages('new'),
    ]);

  if (contactsSettled.status === 'fulfilled' && contactsSettled.value.length > 0) {
    const contacts = contactsSettled.value;
    const demos = contacts.filter((m) =>
      /d[eé]mo|d[eé]monstration|pr[eé]sentation|essai/i.test(m.subject)
    );
    const first = demos[0] ?? contacts[0];
    items.push({
      id: `contacts-${contacts.length}`,
      kind: 'contact',
      title:
        demos.length > 0
          ? `${demos.length} demande(s) de démo en attente`
          : `${contacts.length} message(s) contact en attente`,
      detail: `${first.name} — ${first.subject}`,
      href: '/super-admin/support-ops',
    });
  }

  if (ticketsSettled.status === 'fulfilled') {
    const open = ticketsSettled.value.filter((t) =>
      ['open', 'in_progress', 'waiting_on_customer'].includes(t.status)
    );
    if (open.length > 0) {
      const first = open[0];
      items.push({
        id: `tickets-${open.length}`,
        kind: 'ticket',
        title: `${open.length} ticket(s) support ouverts`,
        detail: first.subject,
        href: '/super-admin/support-ops',
      });
    }
  }

  if (dunningSettled.status === 'fulfilled' && dunningSettled.value.length > 0) {
    const n = dunningSettled.value.length;
    const first = dunningSettled.value[0];
    items.push({
      id: `dunning-${n}`,
      kind: 'dunning',
      title: `${n} abonnement(s) en grâce / suspendus`,
      detail: first.userName || first.userEmail || first.plan,
      href: '/super-admin/subscriptions',
    });
  }

  if (institutionsSettled.status === 'fulfilled') {
    const frozen = institutionsSettled.value.filter(
      (inst) => inst.featureOverrides?.['__ops_frozen'] === true
    );
    if (frozen.length > 0) {
      items.push({
        id: `frozen-${frozen.length}`,
        kind: 'frozen',
        title: `${frozen.length} établissement(s) gelé(s)`,
        detail: frozen[0]?.name,
        href: '/institutions',
      });
    }
  }

  if (opsSettled.status === 'fulfilled') {
    const ops = opsSettled.value;
    if (ops.security.failedAuthLast24h >= 20) {
      items.push({
        id: 'security-auth',
        kind: 'security',
        title: `${ops.security.failedAuthLast24h} échecs d’auth (24 h)`,
        detail: 'Voir l’observabilité',
        href: '/super-admin/observability',
      });
    }
    if (ops.communications.failedLast24h >= 5) {
      items.push({
        id: 'comms-failed',
        kind: 'comms',
        title: `${ops.communications.failedLast24h} communications échouées (24 h)`,
        href: '/super-admin/observability',
      });
    }
  }

  return items;
};

export const fetchProductTelemetry = async (days = 30) =>
  apiClient.get<{
    days: number;
    totalEvents: number;
    features: Array<{ feature: string; count: number }>;
  }>(`/admin/product-telemetry?days=${days}`);

export type InstitutionGroup = {
  id: string;
  name: string;
  createdAt?: string;
  _count?: { institutions?: number; members?: number };
};

export const listGroups = async () => {
  const { groups } = await apiClient.get<{ groups: InstitutionGroup[] }>('/groups');
  return groups;
};

export const createGroup = async (name: string) => {
  const { group } = await apiClient.post<{ group: InstitutionGroup }>('/groups', { name });
  return group;
};

export const updateGroup = async (id: string, name: string) => {
  const { group } = await apiClient.patch<{ group: InstitutionGroup }>(`/groups/${id}`, { name });
  return group;
};

export const deleteGroup = async (id: string) => {
  await apiClient.delete(`/groups/${id}`);
};

export const attachInstitutionToGroup = async (groupId: string, institutionId: string) => {
  await apiClient.post(`/groups/${groupId}/institutions`, { institutionId });
};

export const detachInstitutionFromGroup = async (groupId: string, institutionId: string) => {
  await apiClient.delete(`/groups/${groupId}/institutions/${institutionId}`);
};

export const getGroupDashboard = async (groupId: string) => {
  const res = await apiClient.get<{
    dashboard: {
      totals: { students: number; teachers: number; classes: number };
      institutions: Array<{
        institutionId: string;
        name: string;
        students: number;
        teachers: number;
        classes: number;
      }>;
    };
  }>(`/groups/${groupId}/dashboard`);
  const dash = res.dashboard;
  return {
    totals: dash.totals,
    institutions: (dash.institutions || []).map((i) => ({
      id: i.institutionId,
      name: i.name,
      students: i.students,
      teachers: i.teachers,
      classes: i.classes,
    })),
  };
};
