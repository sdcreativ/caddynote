import { apiClient } from '@/lib/apiClient';

/** Télémétrie produit minimale (fire-and-forget) — type product.*. */
export const trackProductEvent = (feature: string, description?: string, metadata?: Record<string, unknown>) => {
  void apiClient
    .post('/activity', {
      type: `product.${feature}`,
      description: description || feature,
      metadata: metadata || {},
    })
    .catch(() => undefined);
};
