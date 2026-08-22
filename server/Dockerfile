# ===================================================================================
# NFR-001/002/003 : l'API (server/) n'avait jusqu'ici aucune image de
# production — absente de docker-compose.yml, qui ne connaît que le
# frontend statique (caddynote-web) et Postgres. Même structure à deux
# étapes que le Dockerfile racine (frontend), pour rester cohérent avec la
# convention déjà en place dans le projet.
# ===================================================================================

# --- Étape 1 : build (dépendances de dev, compilation TypeScript) ---
FROM node:22-alpine AS builder
WORKDIR /app

# Prisma a besoin d'openssl sur une base Alpine (musl) pour générer un
# moteur binaire compatible — absent par défaut de cette image.
RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- Étape 2 : production (dépendances de prod uniquement) ---
FROM node:22-alpine AS production
WORKDIR /app
# postgresql16-client fournit pg_dump, utilisé par lib/backup.ts
# (NFR-005/006) — sans ce paquet, la sauvegarde planifiée échouerait avec
# ENOENT dès le premier déclenchement en production.
RUN apk add --no-cache openssl postgresql16-client

LABEL project="CaddyNote"
LABEL service="api"

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Le client Prisma généré à l'étape précédente dépend de `@prisma/client`
# (présent dans les dépendances de prod) mais le générateur lui-même
# (devDependency) ne l'est pas ici — on copie directement le résultat déjà
# généré plutôt que de relancer `prisma generate` dans cette étape.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
# CLI Prisma (devDependency) : nécessaire au runtime pour `migrate deploy`
# dans docker-entrypoint.sh — le client généré ne suffit pas.
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY --from=builder /app/dist ./dist
COPY prisma ./prisma
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

EXPOSE 4000

ENTRYPOINT ["./docker-entrypoint.sh"]
