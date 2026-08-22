/** Valeur sentinelle Radix Select : `value=""` est interdit sur `<SelectItem />`. */
export const SELECT_NONE = '__none__';

export const isSelectNone = (value: string | undefined | null): boolean =>
  !value || value === SELECT_NONE;

export const classIdFromSelect = (value: string): string | undefined =>
  isSelectNone(value) ? undefined : value;
