import type { MetricUnit, NutritionBasis } from '../types';

export interface MeasureParts {
  metricAmount?: number;
  metricUnit?: MetricUnit;
  householdCount?: number;
  householdUnit?: string;
}

export interface PortionSource {
  servingSize: string;
  basis?: NutritionBasis;
  basisAmount?: number;
  basisUnit?: MetricUnit;
  householdUnit?: string;
  householdCount?: number;
  /** Grams or ml covered by `householdCount` of `householdUnit`. */
  householdMetric?: number;
}

export interface PortionAlternate {
  unit: string;
  /** How many stored servings one of these units represents. */
  servingsEach: number;
  /** Grams or ml in one of these units, when the baseline is metric. */
  metricEach?: number;
}

export interface Portion {
  basis: NutritionBasis;
  servingSize: string;
  /** Amount of `referenceUnit` that matches the stored macros. */
  referenceAmount: number;
  referenceUnit: 'g' | 'ml' | 'serving';
  /** Metric size of the printed household serving, when known. */
  printedMetric?: number;
  alternate?: PortionAlternate;
}

export interface QuantityInput {
  amount: number;
  unit: string;
}

const HOUSEHOLD = new Set([
  'bar',
  'cup',
  'tbsp',
  'tsp',
  'piece',
  'slice',
  'container',
  'package',
  'packet',
  'bottle',
  'can',
  'pouch',
  'bag',
  'scoop',
  'cookie',
  'cracker',
  'medium',
  'large',
  'small',
  'patty',
  'link',
  'egg',
  'oz',
  'bowl',
  'fillet',
  'breast',
  'wrap',
  'sandwich',
  'stick',
]);

const UNCOUNTED = new Set(['tbsp', 'tsp', 'oz', 'medium', 'large', 'small']);

const SINGULAR: Record<string, string> = {
  bars: 'bar',
  cups: 'cup',
  tablespoons: 'tbsp',
  tablespoon: 'tbsp',
  teaspoons: 'tsp',
  teaspoon: 'tsp',
  pieces: 'piece',
  slices: 'slice',
  containers: 'container',
  packages: 'package',
  packets: 'packet',
  bottles: 'bottle',
  cans: 'can',
  pouches: 'pouch',
  bags: 'bag',
  scoops: 'scoop',
  cookies: 'cookie',
  crackers: 'cracker',
  patties: 'patty',
  links: 'link',
  eggs: 'egg',
  bowls: 'bowl',
  fillets: 'fillet',
  breasts: 'breast',
  wraps: 'wrap',
  sandwiches: 'sandwich',
  sticks: 'stick',
};

export function normalizeUnit(unit: string): string {
  const word = unit.trim().toLowerCase().replace(/\.$/, '');
  return SINGULAR[word] ?? word;
}

export function parseCount(token: string): number | undefined {
  const mixed = token.trim().match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const den = Number(mixed[3]);
    if (!den) return undefined;
    return Number(mixed[1]) + Number(mixed[2]) / den;
  }
  const frac = token.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) {
    const den = Number(frac[2]);
    if (!den) return undefined;
    return Number(frac[1]) / den;
  }
  const value = Number(token);
  return Number.isFinite(value) ? value : undefined;
}

export function parseAmount(raw: string): number | undefined {
  const text = raw.trim();
  if (!text) return undefined;
  return parseCount(text);
}

function metricUnit(token: string): MetricUnit | undefined {
  if (/^g/i.test(token)) return 'g';
  if (/^ml|^millilit/i.test(token)) return 'ml';
  return undefined;
}

export function parseMeasure(raw: string): MeasureParts {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return {};

  const paren = text.match(/\(\s*(\d+(?:\.\d+)?)\s*(g|grams?|ml|mL|millilit(?:er|re)s?)\s*\)/i);
  const any = text.match(/(\d+(?:\.\d+)?)\s*(g|grams?|ml|mL|millilit(?:er|re)s?)\b/i);
  const metric = paren ?? any;
  const metricAmount = metric ? Number(metric[1]) : undefined;
  const unit = metric ? metricUnit(metric[2]) : undefined;

  const rest = text
    .replace(/\([^)]*\)/g, ' ')
    .replace(/(\d+(?:\.\d+)?)\s*(g|grams?|ml|mL|millilit(?:er|re)s?)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const lead = rest.match(/^(\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:\.\d+)?)\s+([A-Za-z][A-Za-z-]*)/);
  if (lead) {
    const count = parseCount(lead[1]);
    const word = normalizeUnit(lead[2]);
    if (count != null && count > 0 && HOUSEHOLD.has(word)) {
      return { metricAmount, metricUnit: unit, householdCount: count, householdUnit: word };
    }
  }

  return { metricAmount, metricUnit: unit };
}

export function measureFromServing(basis: NutritionBasis, servingSize: string): PortionSource & { basis: NutritionBasis } {
  const text = servingSize.trim() || (basis === 'per100g' ? '100 g' : basis === 'per100ml' ? '100 ml' : '1 serving');
  const parsed = parseMeasure(text);
  if (basis === 'per100g' || basis === 'per100ml') {
    return {
      basis,
      servingSize: text,
      basisAmount: 100,
      basisUnit: basis === 'per100g' ? 'g' : 'ml',
      householdUnit: parsed.householdUnit,
      householdCount: parsed.householdCount,
      householdMetric: parsed.metricAmount,
    };
  }
  return {
    basis: 'serving',
    servingSize: text,
    basisAmount: parsed.metricAmount,
    basisUnit: parsed.metricUnit,
    householdUnit: parsed.householdUnit,
    householdCount: parsed.householdCount,
    householdMetric: parsed.metricAmount,
  };
}

function inferredBasis(servingSize: string): NutritionBasis {
  if (/per\s*100\s*ml/i.test(servingSize)) return 'per100ml';
  if (/per\s*100\s*g/i.test(servingSize)) return 'per100g';
  return 'serving';
}

export function portionFromFood(food: PortionSource): Portion {
  const servingSize = food.servingSize || '1 serving';
  const parsed = parseMeasure(servingSize);
  const basis = food.basis ?? inferredBasis(servingSize);
  const householdUnit = food.householdUnit ?? parsed.householdUnit;
  const householdCount = food.householdCount ?? parsed.householdCount;
  const householdMetric = food.householdMetric ?? parsed.metricAmount;

  let referenceAmount = 1;
  let referenceUnit: Portion['referenceUnit'] = 'serving';
  if (basis === 'per100g') {
    referenceAmount = food.basisAmount && food.basisUnit !== 'ml' ? food.basisAmount : 100;
    referenceUnit = 'g';
  } else if (basis === 'per100ml') {
    referenceAmount = food.basisAmount && food.basisUnit !== 'g' ? food.basisAmount : 100;
    referenceUnit = 'ml';
  } else if (food.basisAmount && food.basisAmount > 0 && food.basisUnit) {
    referenceAmount = food.basisAmount;
    referenceUnit = food.basisUnit;
  } else if (parsed.metricAmount && parsed.metricAmount > 0 && parsed.metricUnit) {
    referenceAmount = parsed.metricAmount;
    referenceUnit = parsed.metricUnit;
  }

  let alternate: PortionAlternate | undefined;
  if (householdUnit && householdCount && householdCount > 0) {
    if (householdMetric && householdMetric > 0 && (referenceUnit === 'g' || referenceUnit === 'ml')) {
      const metricEach = householdMetric / householdCount;
      alternate = {
        unit: householdUnit,
        metricEach,
        servingsEach: metricEach / referenceAmount,
      };
    } else {
      alternate = {
        unit: householdUnit,
        servingsEach: 1 / householdCount,
        metricEach:
          referenceUnit === 'g' || referenceUnit === 'ml' ? referenceAmount / householdCount : undefined,
      };
    }
  }

  const printedMetric =
    householdMetric && householdMetric > 0 && (referenceUnit === 'g' || referenceUnit === 'ml')
      ? householdMetric
      : undefined;

  return {
    basis,
    servingSize,
    referenceAmount,
    referenceUnit,
    printedMetric,
    alternate,
  };
}

export function defaultQuantity(portion: Portion): QuantityInput {
  if ((portion.referenceUnit === 'g' || portion.referenceUnit === 'ml') && portion.printedMetric) {
    return { amount: portion.printedMetric, unit: portion.referenceUnit };
  }
  if (portion.referenceUnit === 'g' || portion.referenceUnit === 'ml') {
    return { amount: portion.referenceAmount, unit: portion.referenceUnit };
  }
  if (portion.alternate && portion.alternate.servingsEach > 0) {
    return { amount: 1 / portion.alternate.servingsEach, unit: portion.alternate.unit };
  }
  return { amount: 1, unit: 'serving' };
}

export function scaleForQuantity(portion: Portion, input: QuantityInput): number | null {
  if (!(input.amount > 0) || !Number.isFinite(input.amount)) return null;
  if (
    (input.unit === 'g' || input.unit === 'ml') &&
    portion.referenceUnit === input.unit &&
    portion.referenceAmount > 0
  ) {
    return input.amount / portion.referenceAmount;
  }
  if (portion.alternate && normalizeUnit(input.unit) === normalizeUnit(portion.alternate.unit)) {
    return input.amount * portion.alternate.servingsEach;
  }
  if (input.unit === 'serving') return input.amount;
  return null;
}

export function quantityFromScale(portion: Portion, scale: number): QuantityInput {
  if (!(scale > 0) || !Number.isFinite(scale)) return { amount: 1, unit: 'serving' };
  if (portion.referenceUnit === 'g' || portion.referenceUnit === 'ml') {
    return { amount: roundAmount(portion.referenceAmount * scale), unit: portion.referenceUnit };
  }
  if (portion.alternate && portion.alternate.servingsEach > 0) {
    return { amount: roundAmount(scale / portion.alternate.servingsEach), unit: portion.alternate.unit };
  }
  return { amount: roundAmount(scale), unit: 'serving' };
}

export function convertQuantity(portion: Portion, input: QuantityInput, nextUnit: string): QuantityInput {
  const scale = scaleForQuantity(portion, input);
  if (scale == null) return { amount: input.amount, unit: nextUnit };
  if ((nextUnit === 'g' || nextUnit === 'ml') && portion.referenceUnit === nextUnit) {
    return { amount: roundAmount(portion.referenceAmount * scale), unit: nextUnit };
  }
  if (portion.alternate && normalizeUnit(nextUnit) === normalizeUnit(portion.alternate.unit) && portion.alternate.servingsEach > 0) {
    return { amount: roundAmount(scale / portion.alternate.servingsEach), unit: portion.alternate.unit };
  }
  if (nextUnit === 'serving') return { amount: roundAmount(scale), unit: 'serving' };
  return { amount: input.amount, unit: nextUnit };
}

export function unitChoices(portion: Portion): { id: string; label: string }[] {
  const choices: { id: string; label: string }[] = [];
  if (portion.referenceUnit === 'g' || portion.referenceUnit === 'ml') {
    choices.push({ id: portion.referenceUnit, label: portion.referenceUnit });
  }
  if (portion.alternate) {
    choices.push({ id: portion.alternate.unit, label: portion.alternate.unit });
  }
  if (!choices.length) choices.push({ id: 'serving', label: 'serving' });
  return choices;
}

export function baselineLabel(portion: Portion, calories: number): string {
  const kcal = Math.round(calories).toLocaleString();
  if (portion.referenceUnit === 'g' || portion.referenceUnit === 'ml') {
    return `${kcal} kcal per ${formatAmount(portion.referenceAmount)} ${portion.referenceUnit}`;
  }
  if (portion.alternate && portion.alternate.servingsEach > 0) {
    const count = 1 / portion.alternate.servingsEach;
    return `${kcal} kcal per ${formatQuantity(count, portion.alternate.unit)}`;
  }
  return `${kcal} kcal per serving`;
}

export function portionHint(portion: Portion): string | undefined {
  if (!portion.alternate?.metricEach || !portion.alternate.unit) return undefined;
  const unit = portion.referenceUnit === 'ml' ? 'ml' : 'g';
  return `1 ${portion.alternate.unit} = ${formatAmount(portion.alternate.metricEach)} ${unit}`;
}

export function formatAmount(amount: number): string {
  if (!Number.isFinite(amount)) return '';
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  const whole = Math.floor(abs + 1e-6);
  const frac = abs - whole;
  const fracs: [number, string][] = [
    [1 / 8, '1/8'],
    [1 / 4, '1/4'],
    [1 / 3, '1/3'],
    [1 / 2, '1/2'],
    [2 / 3, '2/3'],
    [3 / 4, '3/4'],
  ];
  for (const [value, label] of fracs) {
    if (Math.abs(frac - value) < 0.02) {
      if (whole > 0) return `${sign}${whole} ${label}`;
      return `${sign}${label}`;
    }
  }
  const rounded = Math.round(abs * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${sign}${text}`;
}

export function formatQuantity(amount: number, unit: string): string {
  const n = formatAmount(amount);
  const normalized = normalizeUnit(unit);
  if (normalized === 'g') return `${n} g`;
  if (normalized === 'ml') return `${n} ml`;
  if (normalized === 'serving') {
    return `${n} ${Math.abs(amount - 1) < 0.001 ? 'serving' : 'servings'}`;
  }
  return `${n} ${labelUnit(normalized, amount)}`;
}

export function roundAmount(amount: number): number {
  return Math.round(amount * 1000) / 1000;
}

function labelUnit(unit: string, amount: number): string {
  if (Math.abs(amount - 1) < 0.001 || UNCOUNTED.has(unit)) return unit;
  if (unit.endsWith('s')) return unit;
  if (unit.endsWith('y') && unit.length > 1 && !'aeiou'.includes(unit[unit.length - 2] ?? '')) {
    return `${unit.slice(0, -1)}ies`;
  }
  return `${unit}s`;
}

export function loggedQuantity(food: PortionSource, scale: number): { quantity: number; quantityUnit: string } {
  const quantity = quantityFromScale(portionFromFood(food), scale);
  return { quantity: quantity.amount, quantityUnit: quantity.unit };
}

export function formatLoggedAmount(
  entry: { quantity?: number; quantityUnit?: string; servings: number; servingSize: string },
  food?: PortionSource,
): string {
  if (entry.quantity != null && entry.quantityUnit && entry.quantity > 0) {
    return formatQuantity(entry.quantity, entry.quantityUnit);
  }
  const quantity = quantityFromScale(portionFromFood(food ?? { servingSize: entry.servingSize }), entry.servings);
  return formatQuantity(quantity.amount, quantity.unit);
}
