import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

describe('Stack Hostinger (same-origin)', () => {
  it('le nginx du conteneur web proxy /api vers caddynote-api', () => {
    const conf = readFileSync(resolve(process.cwd(), 'nginx/nginx.conf'), 'utf8');
    expect(conf).toMatch(/location \^~ \/api\//);
    expect(conf).toMatch(/proxy_pass http:\/\/caddynote-api:4000\//);
  });

  it('l’overlay Compose ne republie pas les ports : bind loopback via WEB_PORT / API_PORT', () => {
    const overlay = readFileSync(resolve(process.cwd(), 'docker-compose.hostinger.yml'), 'utf8');
    expect(overlay).not.toMatch(/!override/);
    expect(overlay).not.toMatch(/^\s+ports:/m);
    expect(overlay).toMatch(/WEB_PORT=127\.0\.0\.1:18080/);
    expect(overlay).toMatch(/CADDYNOTE_DEPLOYMENT: \$\{CADDYNOTE_DEPLOYMENT:-production\}/);
  });

  it('fournit un vhost hôte Nginx et un block Caddy pour le sous-domaine', () => {
    const nginx = readFileSync(
      resolve(process.cwd(), 'nginx/hostinger-caddynote.sdcreativ.com.conf'),
      'utf8'
    );
    const caddy = readFileSync(resolve(process.cwd(), 'nginx/Caddyfile.hostinger'), 'utf8');
    expect(nginx).toMatch(/server_name caddynote\.sdcreativ\.com/);
    expect(nginx).toMatch(/root \/var\/www\/caddynote/);
    expect(nginx).toMatch(/proxy_pass http:\/\/127\.0\.0\.1:18080/);
    expect(caddy).toMatch(/caddynote\.sdcreativ\.com/);
    expect(caddy).toMatch(/reverse_proxy 127\.0\.0\.1:18080/);
  });

  it('documente dump/restore et TLS sans secrets', () => {
    const guide = readFileSync(
      resolve(process.cwd(), 'server/scripts/passage-hostinger-caddynote-sdcreativ.md'),
      'utf8'
    );
    expect(guide).toMatch(/caddynote\.sdcreativ\.com/);
    expect(guide).toMatch(/\/var\/www\/caddynote/);
    expect(guide).toMatch(/\/var\/www\/kodiva/);
    expect(guide).toMatch(/WEB_PORT=127\.0\.0\.1:18080/);
    expect(guide).not.toMatch(/BEGIN (RSA |OPENSSH )?PRIVATE KEY/);
  });
});
