/** The six per-child accents offered at onboarding, in picker order. */
export const ACCENTS = [
  'oklch(0.76 0.13 34)',
  'oklch(0.74 0.11 205)',
  'oklch(0.78 0.11 130)',
  'oklch(0.74 0.11 310)',
  'oklch(0.80 0.11 85)',
  'oklch(0.72 0.10 255)',
] as const;

export const accentOf = (i: number | undefined) => ACCENTS[(i ?? 0) % ACCENTS.length];
