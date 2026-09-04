import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { isMetricsAccessAllowed } from '../lib/health.js';

/**
 * Couvre l'instrumentation HTTP/process exposée sur GET /metrics (`lib/metrics.ts`).
 */
describe('Métriques API (NFR-001/002/003)', () => {
  const originalToken = process.env.METRICS_TOKEN;

  afterEach(() => {
    if (originalToken === undefined) delete process.env.METRICS_TOKEN;
    else process.env.METRICS_TOKEN = originalToken;
  });

  it('expose les métriques process par défaut (dont l’âge du process)', async () => {
    delete process.env.METRICS_TOKEN;
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('process_start_time_seconds');
  });

  it('compte et mesure une vraie requête, avec le gabarit de route (pas l’URL brute)', async () => {
    delete process.env.METRICS_TOKEN;
    await request(app).get('/health');

    const res = await request(app).get('/metrics');
    expect(res.text).toContain('http_requests_total{method="GET",route="/health",status_code="200"}');
    expect(res.text).toMatch(/http_request_duration_seconds_bucket\{le="[^"]+",method="GET",route="\/health",status_code="200"\}/);
  });

  it('étiquette "unmatched" une route qui ne correspond à aucun gabarit (404)', async () => {
    delete process.env.METRICS_TOKEN;
    await request(app).get('/cette-route-nexiste-pas');

    const res = await request(app).get('/metrics');
    expect(res.text).toContain('route="unmatched"');
  });

  it('sans jeton configuré, /metrics reste accessible uniquement en NODE_ENV=test', async () => {
    delete process.env.METRICS_TOKEN;
    expect(process.env.NODE_ENV).toBe('test');
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
  });

  it('avec un jeton configuré, /metrics exige un Bearer valide (jamais un accès silencieusement ouvert)', async () => {
    process.env.METRICS_TOKEN = 'secret-test';
    const withoutToken = await request(app).get('/metrics');
    expect(withoutToken.status).toBe(401);

    const withWrongToken = await request(app).get('/metrics').set('Authorization', 'Bearer faux');
    expect(withWrongToken.status).toBe(401);

    const withToken = await request(app).get('/metrics').set('Authorization', 'Bearer secret-test');
    expect(withToken.status).toBe(200);
  });

  it('hors test, l’absence de METRICS_TOKEN refuse l’accès', () => {
    expect(isMetricsAccessAllowed(undefined, undefined, 'production')).toBe(false);
    expect(isMetricsAccessAllowed(undefined, undefined, 'development')).toBe(false);
    expect(isMetricsAccessAllowed(undefined, undefined, 'test')).toBe(true);
    expect(isMetricsAccessAllowed('Bearer secret', 'secret', 'production')).toBe(true);
    expect(isMetricsAccessAllowed(undefined, 'secret', 'production')).toBe(false);
  });
});
