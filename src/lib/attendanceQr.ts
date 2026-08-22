const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Parse un QR / code barre élève (`caddynote:student:<uuid>` ou UUID nu). */
export const extractStudentId = (raw: string): string | null => {
  const prefixed = raw.match(/caddynote:student:([0-9a-f-]{36})/i);
  if (prefixed) return prefixed[1];
  const uuid = raw.match(UUID_RE);
  return uuid ? uuid[0] : null;
};
