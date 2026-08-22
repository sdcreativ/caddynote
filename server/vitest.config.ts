import { defineConfig } from 'vitest/config';

// Suite d'intégration ORG-004 (isolation multi-tenant) — voir
// src/__tests__/. Tourne contre une base Postgres dédiée (caddynote_test),
// jamais contre la base de développement/production : cf. DATABASE_URL
// ci-dessous, qui prime sur .env car vitest l'injecte avant tout import
// (dotenv ne réécrit jamais une variable déjà définie).
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    testTimeout: 20000,
    hookTimeout: 20000,
    // Les routes d'auth (argon2) et de nombreux appels Prisma séquentiels
    // rendent les tests plus lents en parallèle sur une même connexion DB ;
    // on force l'exécution des fichiers de test en série pour rester stable.
    fileParallelism: false,
    // `npm run build` compile src/ dans dist/ (les tests étaient jusqu'ici
    // inclus, cf. tsconfig.json) — sans cette restriction explicite, vitest
    // ramassait aussi les .test.js compilés et exécutait chaque test en double.
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgresql://user:postgres@127.0.0.1:5432/caddynote_test',
      JWT_SECRET: 'test-only-secret-do-not-use-in-production',
      JWT_EXPIRES_IN: '1h',
      CORS_ORIGIN: 'http://localhost:8080',
    },
  },
});
