const normalizeUnit = (value?: string | null) =>
  String(value ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const weightAliases: Record<string, string> = {
  G: 'G',
  GR: 'G',
  GRAMO: 'G',
  GRAMOS: 'G',
  KG: 'KG',
  KILO: 'KG',
  'KILO(S)': 'KG',
  KILOS: 'KG',
  TON: 'TON',
  TONELADA: 'TON',
  TONELADAS: 'TON',
};

const volumeAliases: Record<string, string> = {
  ML: 'ML',
  MILILITRO: 'ML',
  MILILITROS: 'ML',
  L: 'L',
  LT: 'L',
  LITRO: 'L',
  LITROS: 'L',
};

const lengthAliases: Record<string, string> = {
  MM: 'MM',
  MILIMETRO: 'MM',
  MILIMETROS: 'MM',
  CM: 'CM',
  CENTIMETRO: 'CM',
  CENTIMETROS: 'CM',
  M: 'M',
  MTR: 'M',
  METRO: 'M',
  METROS: 'M',
};

const toCanonicalUnit = (value?: string | null) => {
  const normalized = normalizeUnit(value);
  return (
    weightAliases[normalized] ||
    volumeAliases[normalized] ||
    lengthAliases[normalized] ||
    normalized
  );
};

const conversionMatrix: Record<string, Record<string, number>> = {
  TON: { KG: 1000, G: 1000000 },
  KG: { G: 1000, TON: 0.001 },
  G: { KG: 0.001, TON: 0.000001 },
  L: { ML: 1000 },
  ML: { L: 0.001 },
  M: { CM: 100, MM: 1000 },
  CM: { M: 0.01, MM: 10 },
  MM: { M: 0.001, CM: 0.1 },
};

export interface ResolveFactorToBaseInput {
  configuredFactor?: number | null;
  selectedUnitCode?: string | null;
  selectedUnitName?: string | null;
  baseUnitCode?: string | null;
  baseUnitName?: string | null;
}

export const resolveFactorToBase = (input: ResolveFactorToBaseInput) => {
  const configuredFactor = Number(input.configuredFactor ?? 0);
  const selected = toCanonicalUnit(input.selectedUnitCode || input.selectedUnitName);
  const base = toCanonicalUnit(input.baseUnitCode || input.baseUnitName);

  if (!selected || !base) {
    return Number.isFinite(configuredFactor) && configuredFactor > 0 ? configuredFactor : 1;
  }

  if (selected === base) return 1;
  if (Number.isFinite(configuredFactor) && configuredFactor > 0 && configuredFactor !== 1) {
    return configuredFactor;
  }

  const inferredFactor = conversionMatrix[selected]?.[base];
  if (Number.isFinite(inferredFactor) && inferredFactor > 0) return inferredFactor;

  return Number.isFinite(configuredFactor) && configuredFactor > 0 ? configuredFactor : 1;
};
