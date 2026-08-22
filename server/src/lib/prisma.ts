import { PrismaClient } from '@prisma/client';

// Client Prisma unique (évite l'épuisement du pool de connexions en dev
// avec le rechargement à chaud de tsx watch).
declare global {
  // eslint-disable-next-line no-var
  var __prisma__: PrismaClient | undefined;
}

export const prisma =
  global.__prisma__ ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.__prisma__ = prisma;
}
