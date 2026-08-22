import argon2 from 'argon2';

// argon2id : recommandé OWASP pour le hachage de mots de passe (IAM-002).
export const hashPassword = (plain: string): Promise<string> =>
  argon2.hash(plain, { type: argon2.argon2id });

export const verifyPassword = (hash: string, plain: string): Promise<boolean> =>
  argon2.verify(hash, plain);
