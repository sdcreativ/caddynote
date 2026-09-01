/**
 * Salutation selon l’heure locale.
 * Bonjour : 5h–17h59 · Bonsoir : 18h–4h59.
 */
export const dayGreetingKey = (now: Date = new Date()): 'hello' | 'helloEvening' => {
  const hour = now.getHours();
  if (hour >= 18 || hour < 5) return 'helloEvening';
  return 'hello';
};
