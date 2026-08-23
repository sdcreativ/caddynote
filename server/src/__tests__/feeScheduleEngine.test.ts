import { describe, it, expect } from 'vitest';
import {
  constituteFeeLines,
  computeNetPayable,
  splitByPercent,
  type ScheduleItemLike,
} from '../lib/feeScheduleEngine.js';

const baseItems = (): ScheduleItemLike[] => [
  {
    id: 'i1',
    feeTypeCode: 'STATE_REGISTRATION',
    label: 'Inscription nationale',
    cycleCode: 'COLLEGE',
    feeOrigin: 'state',
    amountCents: 3000,
    currency: 'XOF',
    isMandatory: true,
    isDiscountable: false,
  },
  {
    id: 'i2',
    feeTypeCode: 'ANNUAL_TUITION',
    label: 'Scolarité',
    cycleCode: 'COLLEGE',
    feeOrigin: 'institution',
    amountCents: 240000,
    currency: 'XOF',
    isMandatory: true,
    isDiscountable: true,
  },
  {
    id: 'i3',
    feeTypeCode: 'CANTEEN',
    label: 'Cantine',
    cycleCode: 'COLLEGE',
    feeOrigin: 'institution',
    amountCents: 25000,
    currency: 'XOF',
    isMandatory: false,
    isDiscountable: true,
  },
  {
    id: 'i4',
    feeTypeCode: 'ANNUAL_TUITION',
    label: 'Scolarité lycée',
    cycleCode: 'LYCEE',
    feeOrigin: 'institution',
    amountCents: 300000,
    currency: 'XOF',
    isMandatory: true,
  },
];

describe('feeScheduleEngine — constitution', () => {
  it('inclut les frais obligatoires du cycle et ignore les autres cycles', () => {
    const lines = constituteFeeLines({
      scheduleItems: baseItems(),
      cycleCode: 'COLLEGE',
    });
    expect(lines.map((l) => l.feeTypeCode).sort()).toEqual(['ANNUAL_TUITION', 'STATE_REGISTRATION']);
    expect(lines.every((l) => l.amountCents > 0)).toBe(true);
  });

  it('n’inclut un service facultatif qu’après souscription explicite (RG-05)', () => {
    const without = constituteFeeLines({
      scheduleItems: baseItems(),
      cycleCode: 'COLLEGE',
    });
    expect(without.some((l) => l.feeTypeCode === 'CANTEEN')).toBe(false);

    const withOpt = constituteFeeLines({
      scheduleItems: baseItems(),
      cycleCode: 'COLLEGE',
      optionalFeeTypeCodes: ['CANTEEN'],
    });
    expect(withOpt.some((l) => l.feeTypeCode === 'CANTEEN')).toBe(true);
  });

  it('ignore les montants à 0 (pas de ligne générée)', () => {
    const lines = constituteFeeLines({
      scheduleItems: [
        {
          feeTypeCode: 'STATE_REGISTRATION',
          feeOrigin: 'state',
          amountCents: 0,
          currency: 'XOF',
          isMandatory: true,
          cycleCode: 'PRIMARY',
        },
      ],
      cycleCode: 'PRIMARY',
    });
    expect(lines).toHaveLength(0);
  });

  it('refuse un montant non entier', () => {
    expect(() =>
      constituteFeeLines({
        scheduleItems: [
          {
            feeTypeCode: 'X',
            feeOrigin: 'institution',
            amountCents: 10.5 as unknown as number,
            currency: 'XOF',
            isMandatory: true,
          },
        ],
      })
    ).toThrow('FEE_AMOUNT_NOT_INTEGER');
  });
});

describe('feeScheduleEngine — net §9.1', () => {
  it('sépare state / institution et calcule le net', () => {
    const feeLines = constituteFeeLines({
      scheduleItems: baseItems(),
      cycleCode: 'COLLEGE',
      optionalFeeTypeCodes: ['CANTEEN'],
    });
    const result = computeNetPayable({ feeLines });
    expect(result.stateCents).toBe(3000);
    expect(result.institutionCents).toBe(265000);
    expect(result.netCents).toBe(268000);
  });

  it('applique exonération puis remise ciblée sur frais remisables', () => {
    const feeLines = constituteFeeLines({
      scheduleItems: baseItems(),
      cycleCode: 'COLLEGE',
    });
    const result = computeNetPayable({
      feeLines,
      adjustments: [
        {
          code: 'FEE_WAIVER',
          kind: 'waiver',
          label: 'Exonération inscription',
          appliesToFeeTypeCodes: ['STATE_REGISTRATION'],
        },
        {
          code: 'FAMILY_DISCOUNT',
          kind: 'discount',
          label: 'Remise famille',
          percent: 10,
          appliesToFeeTypeCodes: ['ANNUAL_TUITION'],
        },
      ],
    });
    // Inscription neutralisée ; 10 % de 240000 = 24000
    expect(result.stateCents).toBe(0);
    expect(result.discountCents).toBe(24000);
    expect(result.netCents).toBe(216000);
  });

  it('plafonne un avoir au solde disponible', () => {
    const feeLines = constituteFeeLines({
      scheduleItems: [
        {
          feeTypeCode: 'ANNUAL_TUITION',
          feeOrigin: 'institution',
          amountCents: 10000,
          currency: 'XOF',
          isMandatory: true,
        },
      ],
    });
    const result = computeNetPayable({
      feeLines,
      adjustments: [
        { code: 'CREDIT_NOTE', kind: 'credit', label: 'Avoir', amountCents: 50000 },
      ],
    });
    expect(result.creditCents).toBe(10000);
    expect(result.netCents).toBe(0);
  });

  it('ajoute les pénalités après les remises', () => {
    const feeLines = constituteFeeLines({
      scheduleItems: [
        {
          feeTypeCode: 'ANNUAL_TUITION',
          feeOrigin: 'institution',
          amountCents: 100000,
          currency: 'XOF',
          isMandatory: true,
          isDiscountable: true,
        },
      ],
    });
    const result = computeNetPayable({
      feeLines,
      adjustments: [
        { code: 'DISC', kind: 'discount', label: 'Remise', percent: 10 },
        { code: 'LATE_PENALTY', kind: 'penalty', label: 'Retard', amountCents: 5000 },
      ],
    });
    expect(result.discountCents).toBe(10000);
    expect(result.penaltyCents).toBe(5000);
    expect(result.netCents).toBe(95000);
  });
});

describe('feeScheduleEngine — échéances %', () => {
  it('exige une somme de pourcentages = 100 et place le reste sur la dernière', () => {
    expect(splitByPercent(1000, [50, 50])).toEqual([500, 500]);
    expect(splitByPercent(1000, [33, 33, 34])).toEqual([330, 330, 340]);
    // 1000 * 33/100 = 330 floor ×2 = 660 ; reste 340 sur dernière si 34 %
    expect(splitByPercent(100, [33, 33, 34])).toEqual([33, 33, 34]);
  });

  it('refuse une somme ≠ 100', () => {
    expect(() => splitByPercent(1000, [40, 40])).toThrow('INSTALLMENT_PERCENT_SUM');
  });

  it('refuse les pourcentages non entiers', () => {
    expect(() => splitByPercent(1000, [50.5 as unknown as number, 49.5 as unknown as number])).toThrow(
      'INSTALLMENT_PERCENT_NOT_INTEGER'
    );
  });
});
