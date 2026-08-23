/**
 * Moteur de grille financière (Lot 2) — calculs purs, entiers uniquement.
 *
 * Ordre §9.1 :
 * 1. Constituer les frais (obligatoires + options souscrites)
 * 2. Exonérations
 * 3. Remises
 * 4. Prises en charge
 * 5. Pénalités
 * 6. Avoirs
 * 7. Échéances (fonction séparée sur le net)
 *
 * Les services facultatifs ne sont inclus que s’ils figurent dans
 * `optionalFeeTypeCodes` (RG-05). feeOrigin state | institution séparé (RG-01).
 */

export type FeeOrigin = 'state' | 'institution';

export type ScheduleItemLike = {
  id?: string;
  feeTypeCode: string;
  label?: string | null;
  cycleCode?: string | null;
  gradeLevelId?: string | null;
  enrollmentType?: string | null;
  studentStatus?: string | null;
  feeOrigin: string;
  amountCents: number;
  currency: string;
  isMandatory: boolean;
  isRefundable?: boolean;
  isDiscountable?: boolean;
  frequency?: string | null;
};

export type ComputedFeeLine = {
  feeTypeCode: string;
  label: string;
  amountCents: number;
  currency: string;
  feeOrigin: FeeOrigin;
  isMandatory: boolean;
  isDiscountable: boolean;
  feeScheduleItemId?: string;
  /** fee = charge ; discount = remise / prise en charge / avoir */
  lineType: 'fee' | 'discount';
  source?: string;
};

export type Adjustment = {
  code: string;
  /** waiver = exonération ; discount ; sponsorship ; penalty ; credit */
  kind: 'waiver' | 'discount' | 'sponsorship' | 'penalty' | 'credit';
  label: string;
  /** Montant fixe entier (prioritaire si fourni avec percent pour penalty/credit). */
  amountCents?: number;
  /** Pourcentage entier 0–100 appliqué aux lignes éligibles. */
  percent?: number;
  /** Si défini, ne cible que ces codes de frais. */
  appliesToFeeTypeCodes?: string[];
};

export type ConstituteParams = {
  scheduleItems: ScheduleItemLike[];
  cycleCode?: string | null;
  gradeLevelId?: string | null;
  enrollmentType?: string | null;
  studentStatus?: string | null;
  /** Codes des services facultatifs explicitement souscrits. */
  optionalFeeTypeCodes?: string[];
};

const asOrigin = (raw: string): FeeOrigin => (raw === 'state' ? 'state' : 'institution');

const itemMatchesContext = (
  item: ScheduleItemLike,
  params: ConstituteParams
): boolean => {
  if (item.cycleCode && params.cycleCode && item.cycleCode !== params.cycleCode) return false;
  if (item.gradeLevelId && params.gradeLevelId && item.gradeLevelId !== params.gradeLevelId) {
    return false;
  }
  if (
    item.enrollmentType &&
    item.enrollmentType !== 'any' &&
    params.enrollmentType &&
    item.enrollmentType !== params.enrollmentType
  ) {
    return false;
  }
  if (
    item.studentStatus &&
    item.studentStatus !== 'any' &&
    params.studentStatus &&
    item.studentStatus !== params.studentStatus
  ) {
    return false;
  }
  return true;
};

/**
 * 1. Constitution des frais : obligatoires toujours ; optionnels seulement
 *    s’ils sont dans `optionalFeeTypeCodes`.
 */
export function constituteFeeLines(params: ConstituteParams): ComputedFeeLine[] {
  const subscribed = new Set(params.optionalFeeTypeCodes ?? []);
  const lines: ComputedFeeLine[] = [];

  for (const item of params.scheduleItems) {
    if (!itemMatchesContext(item, params)) continue;
    if (!Number.isInteger(item.amountCents) || item.amountCents < 0) {
      throw new Error('FEE_AMOUNT_NOT_INTEGER');
    }
    if (!item.isMandatory && !subscribed.has(item.feeTypeCode)) {
      continue;
    }
    // Montant 0 : ne pas générer de ligne (ex. inscription officielle à 0).
    if (item.amountCents === 0) continue;

    lines.push({
      feeTypeCode: item.feeTypeCode,
      label: item.label?.trim() || item.feeTypeCode,
      amountCents: item.amountCents,
      currency: item.currency || 'XOF',
      feeOrigin: asOrigin(item.feeOrigin),
      isMandatory: item.isMandatory,
      isDiscountable: item.isDiscountable !== false,
      feeScheduleItemId: item.id,
      lineType: 'fee',
      source: 'schedule',
    });
  }

  return lines;
}

const assertInt = (n: number, code: string) => {
  if (!Number.isInteger(n)) throw new Error(code);
};

const targetsLine = (adj: Adjustment, line: ComputedFeeLine): boolean => {
  if (!adj.appliesToFeeTypeCodes || adj.appliesToFeeTypeCodes.length === 0) return true;
  return adj.appliesToFeeTypeCodes.includes(line.feeTypeCode);
};

const percentOf = (baseCents: number, percent: number): number => {
  assertInt(percent, 'ADJUSTMENT_PERCENT_NOT_INTEGER');
  if (percent < 0 || percent > 100) throw new Error('ADJUSTMENT_PERCENT_OUT_OF_RANGE');
  // Division entière : floor — le reste n’est pas facturé au parent.
  return Math.floor((baseCents * percent) / 100);
};

export type NetPayableResult = {
  lines: ComputedFeeLine[];
  stateCents: number;
  institutionCents: number;
  mandatoryCents: number;
  optionalCents: number;
  discountCents: number;
  sponsorshipCents: number;
  penaltyCents: number;
  creditCents: number;
  netCents: number;
};

/**
 * Applique l’ordre §9.1 sur des lignes déjà constituées.
 * Toute sortie reste en entiers ; lineType compatible facture (fee|discount).
 */
export function computeNetPayable(params: {
  feeLines: ComputedFeeLine[];
  adjustments?: Adjustment[];
}): NetPayableResult {
  const working = params.feeLines.map((l) => ({ ...l }));
  const out: ComputedFeeLine[] = [];
  const adjustments = params.adjustments ?? [];

  // 2. Exonérations — neutralisent des lignes fee ciblées.
  for (const adj of adjustments.filter((a) => a.kind === 'waiver')) {
    for (const line of working) {
      if (line.lineType !== 'fee') continue;
      if (!targetsLine(adj, line)) continue;
      line.amountCents = 0;
      line.source = `waiver:${adj.code}`;
    }
  }

  for (const line of working) {
    if (line.amountCents > 0) out.push({ ...line });
  }

  let discountCents = 0;
  let sponsorshipCents = 0;
  let penaltyCents = 0;
  let creditCents = 0;

  const eligibleBase = (adj: Adjustment): number =>
    out
      .filter((l) => l.lineType === 'fee' && l.isDiscountable && targetsLine(adj, l))
      .reduce((s, l) => s + l.amountCents, 0);

  // 3. Remises
  for (const adj of adjustments.filter((a) => a.kind === 'discount')) {
    let amount = 0;
    if (adj.amountCents != null) {
      assertInt(adj.amountCents, 'ADJUSTMENT_AMOUNT_NOT_INTEGER');
      amount = adj.amountCents;
    } else if (adj.percent != null) {
      amount = percentOf(eligibleBase(adj), adj.percent);
    }
    if (amount <= 0) continue;
    discountCents += amount;
    out.push({
      feeTypeCode: adj.code,
      label: adj.label,
      amountCents: amount,
      currency: out[0]?.currency ?? 'XOF',
      feeOrigin: 'institution',
      isMandatory: false,
      isDiscountable: false,
      lineType: 'discount',
      source: `discount:${adj.code}`,
    });
  }

  // 4. Prises en charge
  for (const adj of adjustments.filter((a) => a.kind === 'sponsorship')) {
    let amount = 0;
    if (adj.amountCents != null) {
      assertInt(adj.amountCents, 'ADJUSTMENT_AMOUNT_NOT_INTEGER');
      amount = adj.amountCents;
    } else if (adj.percent != null) {
      amount = percentOf(eligibleBase(adj), adj.percent);
    }
    if (amount <= 0) continue;
    sponsorshipCents += amount;
    out.push({
      feeTypeCode: adj.code,
      label: adj.label,
      amountCents: amount,
      currency: out[0]?.currency ?? 'XOF',
      feeOrigin: 'institution',
      isMandatory: false,
      isDiscountable: false,
      lineType: 'discount',
      source: `sponsorship:${adj.code}`,
    });
  }

  // 5. Pénalités
  for (const adj of adjustments.filter((a) => a.kind === 'penalty')) {
    let amount = adj.amountCents ?? 0;
    assertInt(amount, 'ADJUSTMENT_AMOUNT_NOT_INTEGER');
    if (amount <= 0) continue;
    penaltyCents += amount;
    out.push({
      feeTypeCode: adj.code,
      label: adj.label,
      amountCents: amount,
      currency: out[0]?.currency ?? 'XOF',
      feeOrigin: 'institution',
      isMandatory: false,
      isDiscountable: false,
      lineType: 'fee',
      source: `penalty:${adj.code}`,
    });
  }

  // 6. Avoirs — plafonnés au solde courant (fees - discounts - sponsorships + penalties).
  let running =
    out.filter((l) => l.lineType === 'fee').reduce((s, l) => s + l.amountCents, 0) -
    out.filter((l) => l.lineType === 'discount').reduce((s, l) => s + l.amountCents, 0);

  for (const adj of adjustments.filter((a) => a.kind === 'credit')) {
    let amount = adj.amountCents ?? 0;
    assertInt(amount, 'ADJUSTMENT_AMOUNT_NOT_INTEGER');
    if (amount <= 0) continue;
    amount = Math.min(amount, Math.max(0, running));
    if (amount <= 0) continue;
    creditCents += amount;
    running -= amount;
    out.push({
      feeTypeCode: adj.code,
      label: adj.label,
      amountCents: amount,
      currency: out[0]?.currency ?? 'XOF',
      feeOrigin: 'institution',
      isMandatory: false,
      isDiscountable: false,
      lineType: 'discount',
      source: `credit:${adj.code}`,
    });
  }

  const feeLines = out.filter((l) => l.lineType === 'fee');
  const discountLines = out.filter((l) => l.lineType === 'discount');
  const grossFees = feeLines.reduce((s, l) => s + l.amountCents, 0);
  const grossDiscounts = discountLines.reduce((s, l) => s + l.amountCents, 0);
  const netCents = grossFees - grossDiscounts;
  if (netCents < 0) throw new Error('NET_NEGATIVE');

  return {
    lines: out,
    stateCents: feeLines.filter((l) => l.feeOrigin === 'state').reduce((s, l) => s + l.amountCents, 0),
    institutionCents: feeLines
      .filter((l) => l.feeOrigin === 'institution')
      .reduce((s, l) => s + l.amountCents, 0),
    mandatoryCents: feeLines.filter((l) => l.isMandatory).reduce((s, l) => s + l.amountCents, 0),
    optionalCents: feeLines.filter((l) => !l.isMandatory).reduce((s, l) => s + l.amountCents, 0),
    discountCents,
    sponsorshipCents,
    penaltyCents,
    creditCents,
    netCents,
  };
}

/**
 * 7. Répartition d’un net en échéances par pourcentages entiers (somme = 100).
 * Le reste d’arrondi est affecté à la **dernière** échéance.
 */
export function splitByPercent(totalCents: number, percents: number[]): number[] {
  assertInt(totalCents, 'INSTALLMENT_TOTAL_NOT_INTEGER');
  if (totalCents < 0) throw new Error('INSTALLMENT_TOTAL_NEGATIVE');
  if (percents.length === 0) throw new Error('INSTALLMENT_EMPTY');
  if (percents.some((p) => !Number.isInteger(p) || p < 0)) {
    throw new Error('INSTALLMENT_PERCENT_NOT_INTEGER');
  }
  const sum = percents.reduce((a, b) => a + b, 0);
  if (sum !== 100) throw new Error('INSTALLMENT_PERCENT_SUM');

  const amounts = percents.map((p) => Math.floor((totalCents * p) / 100));
  const allocated = amounts.reduce((a, b) => a + b, 0);
  amounts[amounts.length - 1] += totalCents - allocated;
  return amounts;
}
