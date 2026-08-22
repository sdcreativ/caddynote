import type { Prisma } from '@prisma/client';

/** Champs de profil sûrs à exposer côté API (jamais passwordHash/mfaSecret/tokens). */
export const PUBLIC_PROFILE_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phoneNumber: true,
  profileImage: true,
  role: true,
  institutionId: true,
  groupId: true,
  mfaEnabled: true,
  isActive: true,
  deactivatedAt: true,
  createdAt: true,
  updatedAt: true,
  // RPT-003 : nécessaire pour un calcul réel d'utilisateurs actifs — `updatedAt`
  // seul ne distingue pas une connexion d'une simple modification de profil.
  lastLoginAt: true,
} satisfies Prisma.StrkProfileSelect;
