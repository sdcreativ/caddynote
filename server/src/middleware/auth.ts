import type { Request, Response, NextFunction } from 'express';
import type { StrkUserRole } from '@prisma/client';
import { verifyAccessToken } from '../lib/jwt.js';
import { isSessionValid } from '../lib/sessions.js';
import { isInstitutionSuspended } from '../lib/subscriptionSuspension.js';
import {
  shouldEnforcePasswordChange,
  shouldEnforceMfaSetup,
} from '../lib/mfa.js';
import { isTestMode } from '../lib/testMode.js';
import { prisma } from '../lib/prisma.js';

// SAA-004 : un établissement suspendu (jamais de suppression de données)
// garde un accès en lecture complet — seules les écritures sont bloquées.
// `/subscriptions` reste toujours accessible en écriture : c'est
// précisément la route qui permet de sortir de la suspension (renouveler,
// payer). Vérifié par préfixe de montage du routeur (`req.baseUrl`, déjà
// disponible dans le middleware d'un routeur monté via `app.use(prefix,
// router)`), pas par une liste de chemins complets qui se désynchroniserait
// vite de `index.ts`.
const SUSPENSION_EXEMPT_PREFIXES = ['/subscriptions', '/auth', '/backups', '/support'];

const isSuspensionExempt = (req: Request): boolean => {
  if (req.method === 'GET' || req.method === 'HEAD') return true;
  return SUSPENSION_EXEMPT_PREFIXES.includes(req.baseUrl);
};

/**
 * Vérifie le JWT (en-tête `Authorization: Bearer <token>`) et attache son
 * contenu décodé à `req.auth`. Base de la couche d'autorisation applicative
 * qui remplace les RLS Supabase (cf. audit §5.2/§4.1).
 *
 * IAM-004 : la signature/expiration du JWT ne suffit plus — la session
 * associée (`payload.sid`) doit aussi exister et ne pas avoir été révoquée
 * (déconnexion à distance, `DELETE /auth/sessions/:id`). Un coût réel (une
 * lecture DB par requête authentifiée) accepté en échange d'une révocation
 * qui fonctionne vraiment, plutôt qu'un jeton stateless qui resterait valide
 * jusqu'à son expiration naturelle quoi qu'il arrive.
 */
export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentification requise' });
  }

  try {
    const payload = verifyAccessToken(header.slice('Bearer '.length));
    if (!(await isSessionValid(payload.sid))) {
      return res.status(401).json({ error: 'Session révoquée ou expirée, reconnectez-vous' });
    }

    // SAA-004 : aucun effet si l'établissement n'a jamais eu d'abonnement
    // premium (la plupart des tenants aujourd'hui) — seuls ceux avec un
    // abonnement explicitement `suspended` sont concernés, jamais un blocage
    // par défaut pour absence d'abonnement.
    if (payload.institutionId && !isSuspensionExempt(req)) {
      if (await isInstitutionSuspended(payload.institutionId)) {
        return res.status(403).json({
          error:
            "Cet établissement est en lecture seule (gel ops ou abonnement suspendu) — vos données restent consultables. Contactez le support plateforme ou renouvelez l'abonnement.",
          code: 'institution_readonly',
        });
      }
    }

    req.auth = payload;

    // Gates hors `/auth` : MDP provisoire, puis MFA après grâce 7 j.
    if (req.baseUrl !== '/auth') {
      const profile = await prisma.strkProfile.findUnique({
        where: { id: payload.sub },
        select: {
          mustChangePassword: true,
          mfaEnabled: true,
          mfaGraceUntil: true,
          role: true,
        },
      });
      if (
        shouldEnforcePasswordChange({
          mustChangePassword: !!profile?.mustChangePassword,
          routeBaseUrl: req.baseUrl,
        })
      ) {
        return res.status(403).json({
          error: 'Changez votre mot de passe provisoire pour continuer.',
          code: 'password_change_required',
        });
      }
      if (
        shouldEnforceMfaSetup({
          nodeEnv: process.env.NODE_ENV,
          testMode: isTestMode(),
          role: profile?.role ?? payload.role,
          mfaEnabled: !!profile?.mfaEnabled,
          routeBaseUrl: req.baseUrl,
          mfaGraceUntil: profile?.mfaGraceUntil,
        })
      ) {
        return res.status(403).json({
          error: 'Activez l’authentification à deux facteurs pour continuer.',
          code: 'mfa_setup_required',
        });
      }
    }

    next();
  } catch {
    return res.status(401).json({ error: 'Jeton invalide ou expiré' });
  }
};

/** Restreint une route à une liste de rôles (RBAC minimal — §4.1 du cahier des charges). */
export const requireRole =
  (...roles: StrkUserRole[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({ error: 'Authentification requise' });
    }
    if (!roles.includes(req.auth.role)) {
      return res.status(403).json({ error: 'Permissions insuffisantes' });
    }
    next();
  };
