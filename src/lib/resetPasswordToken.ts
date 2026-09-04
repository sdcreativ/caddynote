/** Jeton reset : fragment `#token=` (pas la query — logs, Referer, historique proxy). */

export const readResetPasswordToken = (
  search = typeof window === 'undefined' ? '' : window.location.search,
  hash = typeof window === 'undefined' ? '' : window.location.hash
): string => {
  const fromHash = new URLSearchParams(hash.replace(/^#/, '')).get('token')?.trim();
  if (fromHash) return fromHash;
  return new URLSearchParams(search).get('token')?.trim() || '';
};

/** Liens déjà envoyés en `?token=` : bascule vers le fragment, retire la query. */
export const relocateResetTokenOutOfQuery = (): void => {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token')?.trim();
  if (!token) return;
  params.delete('token');
  const search = params.toString();
  const hash = window.location.hash.replace(/^#/, '');
  const hashParams = new URLSearchParams(hash);
  if (!hashParams.get('token')) hashParams.set('token', token);
  const next = `${window.location.pathname}${search ? `?${search}` : ''}#${hashParams.toString()}`;
  window.history.replaceState(null, '', next);
};
