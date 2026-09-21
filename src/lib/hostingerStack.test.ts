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
    expect(overlay).toMatch(/CLAMAV_HOST: \$\{CLAMAV_HOST:-clamav\}/);
    expect(overlay).toMatch(/name: sdcreativ_sdcreativ/);
    expect(overlay).toMatch(/caddynote-net/);
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
    const edgeAcme = readFileSync(
      resolve(process.cwd(), 'nginx/sdcreativ-edge-caddynote-acme.conf'),
      'utf8'
    );
    const edgeTls = readFileSync(resolve(process.cwd(), 'nginx/sdcreativ-edge-caddynote.conf'), 'utf8');
    expect(edgeAcme).toMatch(/server_name caddynote\.sdcreativ\.com/);
    expect(edgeAcme).toMatch(/root \/var\/www\/certbot/);
    expect(edgeTls).toMatch(/proxy_pass http:\/\/\$upstream_caddynote:80/);
    expect(edgeTls).toMatch(/Strict-Transport-Security/);
    expect(edgeTls).toMatch(/max-age=15552000/);
    expect(edgeTls).not.toMatch(/max-age=31536000/);
    expect(edgeTls).not.toMatch(/Strict-Transport-Security[^\n]*preload/);
    expect(edgeTls).not.toMatch(/Strict-Transport-Security[^\n]*includeSubDomains/);
    expect(edgeTls).toMatch(/Content-Security-Policy/);
    expect(edgeTls).toMatch(/fonts\.googleapis\.com/);
    const webNginx = readFileSync(resolve(process.cwd(), 'nginx/nginx.conf'), 'utf8');
    expect(webNginx).toMatch(/add_header Content-Security-Policy/);
    expect(webNginx).not.toMatch(/# add_header Content-Security-Policy/);
    expect(webNginx).toMatch(/fonts\.googleapis\.com/);
    expect(webNginx).not.toMatch(/Strict-Transport-Security/);
    const api = readFileSync(resolve(process.cwd(), 'server/src/index.ts'), 'utf8');
    expect(api).toMatch(/helmet\(\{\s*hsts:\s*false\s*\}\)/);
  });

  it('déploie Hostinger depuis CI, pas Oracle A1', () => {
    const ci = readFileSync(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8');
    expect(ci).toMatch(/deploy_hostinger_self_hosted/);
    expect(ci).toMatch(/runs-on: \[self-hosted, linux, X64, hostinger\]/);
    expect(ci).toMatch(/deploy-hostinger-rebuild\.sh/);
    expect(ci).not.toMatch(/deploy_staging_self_hosted/);
    expect(ci).not.toMatch(/ARM64, staging/);
    const script = readFileSync(resolve(process.cwd(), 'scripts/deploy-hostinger-rebuild.sh'), 'utf8');
    expect(script).toMatch(/docker-compose\.hostinger\.yml/);
    expect(script).toMatch(/--profile antivirus/);
    expect(script).toMatch(/127\.0\.0\.1:14000\/health/);
    expect(script).toMatch(/\/var\/www\/caddynote/);
    expect(script).not.toMatch(/docker-compose\.staging\.yml/);
  });

  it('fournit une recette HTTPS 1 école (direction / enseignant / parent / élève)', () => {
    const pkg = readFileSync(resolve(process.cwd(), 'server/package.json'), 'utf8');
    expect(pkg).toMatch(/"recette:https"/);
    const helper = readFileSync(resolve(process.cwd(), 'server/src/lib/recetteHttpsTarget.ts'), 'utf8');
    expect(helper).toMatch(/https:\/\/caddynote\.sdcreativ\.com/);
    const script = readFileSync(resolve(process.cwd(), 'server/scripts/recette-https-ecole.ts'), 'utf8');
    expect(script).toMatch(/school_admin/);
    expect(script).toMatch(/teacher/);
    expect(script).toMatch(/parent/);
    expect(script).toMatch(/student/);
    expect(script).toMatch(/RECETTE_HTTPS_CONFIRM/);
    expect(script).not.toMatch(/[a-z0-9._%+-]+@caddynote\.test/);
    expect(script).not.toMatch(/Test1234!/);
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
