import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { buildOpenApiDocument, OPENAPI_CATALOG, OPENAPI_OPERATION_COUNT } from '../lib/openapi.js';

/**
 * Lot 12 / chap. 22.2 — le catalogue OpenAPI doit coller à l'API réelle
 * (servie, pas un fichier markdown orphelin), et un plancher d'opérations
 * empêche de le vider par accident. Les chemins critiques sont aussi
 * interrogés sur l'app Express : un 404 ici signifierait que le catalogue
 * documente une route qui n'existe plus.
 */
describe('OpenAPI (chap. 22.2)', () => {
  it('le catalogue n’a pas de doublon méthode+chemin', () => {
    const keys = OPENAPI_CATALOG.map((op) => `${op.method} ${op.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('couvre un plancher réaliste de la surface Express (pas un échantillon jouet)', () => {
    expect(OPENAPI_OPERATION_COUNT).toBeGreaterThanOrEqual(350);
  });

  it('documente les surfaces ops / publiques récentes (§9)', () => {
    const keys = new Set(OPENAPI_CATALOG.map((op) => `${op.method} ${op.path}`));
    for (const required of [
      'get /status',
      'get /diagnostics',
      'get /admin/contact-messages',
      'post /admin/contact-messages/:id/convert',
      'post /admin/contact-messages/:id/provision-demo',
      'get /admin/dunning-queue',
      'get /institutions/:id/onboarding',
      'post /institutions/:id/offboard/export',
      'get /services/transport/routes',
      'post /contact',
      'post /support/tickets/:id/escalate',
      'get /analytics/export',
      'post /reports/schedule',
    ]) {
      expect(keys.has(required)).toBe(true);
    }
  });

  it('GET /openapi.json sert un document OpenAPI 3 valide', async () => {
    const res = await request(app).get('/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.3');
    expect(res.body.info?.title).toBe('CaddyNote API');
    expect(res.body.components?.securitySchemes?.bearerAuth).toBeTruthy();
    expect(res.body.paths['/health']?.get).toBeTruthy();
    expect(res.body.paths['/auth/login']?.post).toBeTruthy();
    expect(res.body.paths['/documents/verify/{token}']?.get?.security).toEqual([]);
    expect(res.body.paths['/students']?.get?.security).toEqual([{ bearerAuth: [] }]);
  });

  it('le document généré contient exactement le catalogue', () => {
    const doc = buildOpenApiDocument();
    const documented = Object.entries(doc.paths).flatMap(([path, methods]) =>
      Object.keys(methods as object).map((m) => `${m} ${path}`)
    );
    expect(documented.length).toBe(OPENAPI_OPERATION_COUNT);
  });

  it('GET /docs sert l’UI qui pointe vers /openapi.json', async () => {
    const res = await request(app).get('/docs');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('/openapi.json');
    expect(res.text).toContain('swagger-ui');
  });

  it('les chemins documentés comme publics répondent autre chose qu’un 404', async () => {
    const health = await request(app).get('/health');
    expect(health.status).not.toBe(404);

    const login = await request(app).post('/auth/login').send({});
    expect(login.status).not.toBe(404);

    const institutions = await request(app).get('/admissions/institutions');
    expect(institutions.status).toBe(200);
  });
});
