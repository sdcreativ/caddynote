/**
 * Renvoie l'année scolaire en cours sous la forme "AAAA-AAAA+1".
 *
 * Convention : l'année scolaire N/N+1 démarre en septembre.
 * - Sept → Déc → N / N+1
 * - Jan → Août → (N-1) / N
 *
 * @param now Date de référence (défaut : `new Date()`). Paramètre injectable pour les tests.
 */
export function currentSchoolYear(now: Date = new Date()): string {
  const month = now.getMonth(); // 0-indexed: 0 = Jan, 8 = Sep
  const year = now.getFullYear();
  const startYear = month >= 8 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}
