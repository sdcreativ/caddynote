import crypto from 'node:crypto';

/** Génère un mot de passe temporaire sécurisé (remplace l'edge function Supabase generate-temp-password). */
export const generateTempPassword = (length = 12): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (byte) => chars[byte % chars.length]).join('');
};
