/**
 * Genre élève — valeurs canoniques stockées en base : `female` | `male`.
 * Accepte aussi les libellés FR courants (fille / garçon) en entrée.
 */

export const STUDENT_GENDERS = ['female', 'male'] as const;
export type StudentGender = (typeof STUDENT_GENDERS)[number];

const FEMALE_ALIASES = new Set(['female', 'f', 'fille', 'girl', 'féminin', 'feminin']);
const MALE_ALIASES = new Set(['male', 'm', 'garçon', 'garcon', 'boy', 'masculin']);

export const parseStudentGender = (raw: unknown): StudentGender | null => {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (FEMALE_ALIASES.has(v)) return 'female';
  if (MALE_ALIASES.has(v)) return 'male';
  return null;
};

export type GenderHeadcount = {
  female: number;
  male: number;
  unknown: number;
  total: number;
};

export const emptyGenderHeadcount = (): GenderHeadcount => ({
  female: 0,
  male: 0,
  unknown: 0,
  total: 0,
});

export const tallyGender = (genders: Array<string | null | undefined>): GenderHeadcount => {
  const out = emptyGenderHeadcount();
  for (const g of genders) {
    out.total += 1;
    if (g === 'female') out.female += 1;
    else if (g === 'male') out.male += 1;
    else out.unknown += 1;
  }
  return out;
};
