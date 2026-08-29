import jwt from 'jsonwebtoken';
import type { StrkUserRole } from '@prisma/client';
import { resolveAccessTokenExpiresIn } from './sessions.js';

export interface JwtPayload {
  sub: string; // StrkProfile.id
  role: StrkUserRole;
  institutionId: string | null;
  // ORG-002 : renseigné uniquement pour un compte `group_owner`.
  groupId?: string | null;
  // IAM-004 : id de la StrkSession associée à ce jeton — c'est ce qui rend
  // une révocation réelle possible (cf. lib/sessions.ts, middleware/auth.ts).
  sid: string;
  /** Admin qui a démarré une impersonation time-boxed (support ops). */
  impersonatorId?: string;
}

const getSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('JWT_SECRET manquant ou trop court dans la configuration serveur');
  }
  return secret;
};

export const signAccessToken = (payload: JwtPayload, expiresIn?: string): string =>
  jwt.sign(payload, getSecret(), {
    expiresIn: resolveAccessTokenExpiresIn(expiresIn) as jwt.SignOptions['expiresIn'],
  });

export const verifyAccessToken = (token: string): JwtPayload => {
  const payload = jwt.verify(token, getSecret()) as JwtPayload & { type?: string };
  // Défense en profondeur (IAM-003) : un jeton "défi MFA" (émis après le mot
  // de passe mais avant la vérification TOTP) porte un champ `type` et ne
  // doit JAMAIS être accepté comme jeton d'accès normal, même s'il est signé
  // avec le même secret — sinon un compte avec MFA activé resterait
  // accessible via ce jeton intermédiaire sans jamais fournir de code TOTP.
  if (payload.type) {
    throw new Error('Jeton invalide (jeton de défi MFA utilisé comme jeton d’accès)');
  }
  // IAM-004 : un jeton sans `sid` (émis avant l'introduction des sessions
  // révocables) n'est plus accepté — l'accepter quand même contournerait
  // silencieusement toute révocation pour les jetons de cette forme.
  if (!payload.sid) {
    throw new Error('Jeton invalide (session manquante, reconnexion requise)');
  }
  return payload;
};

const MFA_CHALLENGE_TYPE = 'mfa_challenge';

/** Jeton intermédiaire, courte durée de vie, émis après un mot de passe valide
 * quand le compte a la MFA activée. Ne donne accès à rien d'autre qu'à
 * `POST /auth/mfa/login-verify` (IAM-003). */
export const signMfaChallengeToken = (sub: string): string =>
  jwt.sign({ sub, type: MFA_CHALLENGE_TYPE }, getSecret(), { expiresIn: '5m' });

export const verifyMfaChallengeToken = (token: string): { sub: string } => {
  const payload = jwt.verify(token, getSecret()) as { sub: string; type?: string };
  if (payload.type !== MFA_CHALLENGE_TYPE) {
    throw new Error('Jeton de défi MFA invalide');
  }
  return { sub: payload.sub };
};
