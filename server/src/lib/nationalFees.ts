/**
 * Référentiel national des frais officiels (Côte d’Ivoire, etc.).
 *
 * Les montants viennent des seeds / imports (`StrkNationalFeeVersion` /
 * `StrkNationalFeeRate`) — jamais hardcodés ici. Le référentiel est géré
 * par l’État (`managedBy = state_ci`), pas par le super-admin plateforme.
 */
import { prisma } from './prisma.js';

export type NationalFeeLookup = {
  countryCode: string;
  academicYear: string;
  cycleCode: string;
  /** public | private | mixed — `mixed` ne matche pas une ligne nationale seule. */
  fundingSector: string;
  feeTypeCode?: string;
};

export type NationalFeeAmount = {
  versionId: string;
  version: number;
  currency: string;
  amountCents: number;
  feeTypeCode: string;
  cycleCode: string;
  fundingSector: string;
};

/** Version PUBLISHED la plus récente pour un pays / année. */
export async function getPublishedNationalFeeVersion(
  countryCode: string,
  academicYear: string
) {
  return prisma.strkNationalFeeVersion.findFirst({
    where: {
      countryCode,
      academicYear,
      status: 'published',
    },
    orderBy: { version: 'desc' },
    include: { rates: true },
  });
}

/**
 * Montant officiel (entier) pour un cycle + secteur.
 * Retourne `null` si aucune version publiée / aucune ligne (≠ 0 explicite).
 */
export async function getNationalFeeAmount(
  lookup: NationalFeeLookup
): Promise<NationalFeeAmount | null> {
  const feeTypeCode = lookup.feeTypeCode ?? 'STATE_REGISTRATION';
  const sector = lookup.fundingSector === 'mixed' ? null : lookup.fundingSector;
  if (!sector || (sector !== 'public' && sector !== 'private')) {
    return null;
  }

  const version = await getPublishedNationalFeeVersion(lookup.countryCode, lookup.academicYear);
  if (!version) return null;

  const rate = version.rates.find(
    (r) =>
      r.cycleCode === lookup.cycleCode &&
      r.fundingSector === sector &&
      r.feeTypeCode === feeTypeCode
  );
  if (!rate) return null;

  return {
    versionId: version.id,
    version: version.version,
    currency: rate.currency || version.currency,
    amountCents: rate.amountCents,
    feeTypeCode: rate.feeTypeCode,
    cycleCode: rate.cycleCode,
    fundingSector: rate.fundingSector,
  };
}

/**
 * Ligne de frais officiel à facturer, ou `null` si montant 0 / absent
 * (ex. primaire / préscolaire public → aucun frais officiel généré, CA-05).
 */
export async function resolveOfficialRegistrationLine(
  lookup: NationalFeeLookup
): Promise<{
  feeTypeCode: string;
  label: string;
  amountCents: number;
  currency: string;
  feeOrigin: 'state';
  isMandatory: true;
} | null> {
  const amount = await getNationalFeeAmount({
    ...lookup,
    feeTypeCode: lookup.feeTypeCode ?? 'STATE_REGISTRATION',
  });
  if (!amount || amount.amountCents <= 0) {
    return null;
  }
  return {
    feeTypeCode: amount.feeTypeCode,
    label: 'Inscription nationale en ligne',
    amountCents: amount.amountCents,
    currency: amount.currency,
    feeOrigin: 'state',
    isMandatory: true,
  };
}
