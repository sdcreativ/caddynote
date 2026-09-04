import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { isTestMode } from '../lib/testMode.js';
import { findSsoInstitutionByEmail, loadSsoConfig, publicSsoView } from '../lib/ssoConfig.js';
import {
  buildAuthorizeRedirect,
  consumePending,
  emailFromClaims,
  exchangeCodeForClaims,
  getAppUrl,
} from '../lib/ssoOidc.js';
import { completeSsoLogin } from '../lib/ssoLogin.js';
import { issueAdoptCode } from '../lib/ssoAdopt.js';
import { UnsafeSsoUrlError } from '../lib/safeOutboundUrl.js';

export const ssoRouter = Router();

const ssoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives SSO, réessayez plus tard.' },
  skip: () => process.env.NODE_ENV === 'test' || isTestMode(),
});

const frontendRedirect = (params: Record<string, string>) => {
  const base = `${getAppUrl()}/sign`;
  const hash = new URLSearchParams(params).toString();
  return `${base}#${hash}`;
};

/** Config publique (pas de secrets) pour afficher le bouton SSO. */
ssoRouter.get('/public-config', ssoLimiter, async (req, res) => {
  const institutionId = typeof req.query.institutionId === 'string' ? req.query.institutionId : '';
  if (!z.string().uuid().safeParse(institutionId).success) {
    return res.status(400).json({ error: 'institutionId UUID requis' });
  }
  const cfg = await loadSsoConfig(institutionId);
  res.json(publicSsoView(cfg, institutionId));
});

/** Découverte par domaine e-mail (établissements ayant configuré emailDomains). */
ssoRouter.get('/discover', ssoLimiter, async (req, res) => {
  const email = typeof req.query.email === 'string' ? req.query.email.trim().toLowerCase() : '';
  if (!z.string().email().safeParse(email).success) {
    return res.status(400).json({ error: 'email invalide' });
  }
  const hit = await findSsoInstitutionByEmail(email);
  if (!hit) {
    return res.json({ enabled: false });
  }
  res.json(publicSsoView(hit.config, hit.institutionId));
});

/** Démarre le flux OIDC (redirect IdP). */
ssoRouter.get('/start', ssoLimiter, async (req, res) => {
  const institutionId = typeof req.query.institutionId === 'string' ? req.query.institutionId : '';
  if (!z.string().uuid().safeParse(institutionId).success) {
    return res.status(400).json({ error: 'institutionId UUID requis' });
  }
  const stubEmail =
    typeof req.query.email === 'string' && req.query.email.includes('@')
      ? req.query.email.trim().toLowerCase()
      : undefined;

  try {
    const url = await buildAuthorizeRedirect({ institutionId, stubEmail });
    return res.redirect(302, url);
  } catch (e) {
    const message = e instanceof UnsafeSsoUrlError ? 'sso_issuer_invalide' : e instanceof Error ? e.message : 'SSO indisponible';
    return res.redirect(302, frontendRedirect({ sso_error: message.slice(0, 180) }));
  }
});

/** Callback OIDC — redirige vers le frontend avec un code adopt (jamais de JWT). */
ssoRouter.get('/callback', ssoLimiter, async (req, res) => {
  const err = typeof req.query.error === 'string' ? req.query.error : '';
  if (err) {
    return res.redirect(302, frontendRedirect({ sso_error: err.slice(0, 180) }));
  }

  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  if (!code || !state) {
    return res.redirect(302, frontendRedirect({ sso_error: 'callback_incomplet' }));
  }

  const pending = await consumePending(state);
  if (!pending) {
    return res.redirect(302, frontendRedirect({ sso_error: 'state_invalide_ou_expire' }));
  }

  const cfg = await loadSsoConfig(pending.institutionId);
  if (!cfg?.enabled) {
    return res.redirect(302, frontendRedirect({ sso_error: 'sso_desactive' }));
  }

  try {
    const claims = await exchangeCodeForClaims({
      cfg: cfg as typeof cfg & { clientSecret?: string },
      code,
      pending,
    });
    const email = emailFromClaims(claims);
    if (!email) {
      return res.redirect(302, frontendRedirect({ sso_error: 'email_claim_manquant' }));
    }

    const result = await completeSsoLogin({
      req,
      institutionId: pending.institutionId,
      email,
      config: cfg,
      idpSub: claims.sub,
    });

    if (result.kind === 'error') {
      return res.redirect(302, frontendRedirect({ sso_error: result.code }));
    }
    if (result.kind === 'mfa') {
      const adoptCode = await issueAdoptCode({ kind: 'mfa', token: result.challengeToken });
      return res.redirect(302, frontendRedirect({ sso_code: adoptCode }));
    }
    const adoptCode = await issueAdoptCode({ kind: 'token', token: result.token });
    return res.redirect(302, frontendRedirect({ sso_code: adoptCode }));
  } catch (e) {
    console.error('SSO callback error:', e instanceof Error ? e.message : e);
    return res.redirect(302, frontendRedirect({ sso_error: 'sso_exchange_failed' }));
  }
});
