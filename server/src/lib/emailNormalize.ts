/**
 * Normalise un e-mail pour unicité et login (trim + minuscules).
 * PostgreSQL UNIQUE est sensible à la casse : sans ceci, A@x.com ≠ a@x.com.
 */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** Pour les champs optionnels : chaîne vide / null → undefined, sinon normalisé. */
export const normalizeOptionalEmail = (
  email: string | null | undefined
): string | undefined => {
  if (email == null) return undefined;
  const normalized = normalizeEmail(email);
  return normalized.length > 0 ? normalized : undefined;
};
