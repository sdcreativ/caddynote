/**
 * Normalise GET /diagnostics.integrations (tableau API ou Record legacy)
 * et fournit des libellés ops professionnels.
 */

export type IntegrationDiagItem = {
  key: string;
  configured: boolean;
  ok?: boolean;
  notes?: string;
  detail?: string;
};

export type IntegrationAlert = {
  id: string;
  key: string;
  label: string;
  severity: 'critical' | 'warning';
  message: string;
};

const INTEGRATION_LABELS: Record<string, string> = {
  test_mode: 'Mode test plateforme',
  file_storage: 'Stockage fichiers',
  s3: 'Stockage S3',
  stripe: 'Stripe (paiements carte)',
  stripe_webhook: 'Webhook Stripe',
  cinetpay: 'CinetPay (Mobile Money)',
  smtp: 'E-mail (SMTP)',
  twilio: 'Twilio (SMS / WhatsApp)',
  clamav: 'Antivirus ClamAV',
  file_purge: 'Purge fichiers',
};

/** Intégrations optionnelles : pas d’alerte si absentes (opt-in / contexte local). */
const OPTIONAL_WHEN_OFF = new Set(['file_purge', 'file_storage']);

export const integrationLabel = (key: string): string =>
  INTEGRATION_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function normalizeIntegrations(
  raw: unknown
): IntegrationDiagItem[] {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const row = item as Record<string, unknown>;
        const key = typeof row.key === 'string' ? row.key : null;
        if (!key) return null;
        return {
          key,
          configured: row.configured === true,
          ok: typeof row.ok === 'boolean' ? row.ok : undefined,
          notes: typeof row.notes === 'string' ? row.notes : undefined,
          detail: typeof row.detail === 'string' ? row.detail : undefined,
        };
      })
      .filter((x): x is IntegrationDiagItem => x != null);
  }

  if (typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>).map(([key, value]) => {
      const info = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
      // Si la clé est un index numérique et que l’item a un `key`, l’utiliser.
      const nestedKey = typeof info.key === 'string' ? info.key : key;
      return {
        key: nestedKey,
        configured: info.configured === true,
        ok: typeof info.ok === 'boolean' ? info.ok : undefined,
        notes: typeof info.notes === 'string' ? info.notes : undefined,
        detail: typeof info.detail === 'string' ? info.detail : undefined,
      };
    });
  }

  return [];
}

export function findIntegration(
  raw: unknown,
  key: string
): IntegrationDiagItem | undefined {
  return normalizeIntegrations(raw).find((i) => i.key === key);
}

/**
 * Alertes à afficher. Disparaissent automatiquement dès que l’intégration
 * est configurée (ou que le mode test est désactivé).
 */
export function buildIntegrationAlerts(raw: unknown): IntegrationAlert[] {
  const alerts: IntegrationAlert[] = [];

  for (const item of normalizeIntegrations(raw)) {
    const label = integrationLabel(item.key);

    // Mode test : alerte uniquement s’il est ACTIF (configured === true côté API).
    if (item.key === 'test_mode') {
      if (item.configured) {
        alerts.push({
          id: 'int-test_mode-on',
          key: item.key,
          label,
          severity: 'critical',
          message:
            item.notes ||
            'CADDYNOTE_TEST_MODE actif — MFA assouplie et intégrations sortantes coupées.',
        });
      }
      continue;
    }

    if (OPTIONAL_WHEN_OFF.has(item.key) && !item.configured) {
      continue;
    }

    if (item.configured === false) {
      alerts.push({
        id: `int-${item.key}-cfg`,
        key: item.key,
        label,
        severity: 'warning',
        message:
          item.notes || 'Non configurée (variables d’environnement manquantes).',
      });
      continue;
    }

    if (item.ok === false) {
      alerts.push({
        id: `int-${item.key}-err`,
        key: item.key,
        label,
        severity: 'critical',
        message: item.detail || item.notes || 'En erreur',
      });
    }
  }

  return alerts;
}
