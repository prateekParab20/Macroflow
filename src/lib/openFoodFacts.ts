import type { ParsedLabel } from './parseLabel';
import type { MetricUnit, NutritionBasis } from '../types';

const FIELDS = [
  'code',
  'product_name',
  'product_name_en',
  'brands',
  'serving_size',
  'serving_quantity',
  'nutrition_data_per',
  'nutriments',
].join(',');

export class BarcodeLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BarcodeLookupError';
  }
}

interface Nutriments {
  sodium_unit?: string;
  [key: string]: number | string | undefined;
}

export interface OffProductResponse {
  status?: number;
  product?: {
    product_name?: string;
    product_name_en?: string;
    brands?: string;
    serving_size?: string;
    serving_quantity?: number | string;
    nutrition_data_per?: string;
    nutriments?: Nutriments;
  };
}

export function normalizeBarcode(raw: string): string | null {
  const runs = raw.match(/\d{8,14}/g);
  if (!runs?.length) return null;
  return [...runs].sort((a, b) => b.length - a.length)[0];
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function tidyServing(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(\([^)]+\))\s*\1/g, '$1');
  if (!cleaned) return undefined;
  return cleaned.slice(0, 48);
}

function bounded(value: number | undefined, max: number, digits: number): number | undefined {
  if (value == null || value < 0 || value > max) return undefined;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function sodiumMg(nutriments: Nutriments, suffix: 'serving' | '100g'): number | undefined {
  const raw = asNumber(nutriments[`sodium_${suffix}`]);
  if (raw == null) {
    const salt = asNumber(nutriments[`salt_${suffix}`]);
    if (salt == null) return undefined;
    return bounded(salt * 400, 15000, 0);
  }
  const unit = String(nutriments.sodium_unit || 'g').toLowerCase();
  return bounded(unit === 'mg' ? raw : raw * 1000, 15000, 0);
}

function productName(product: NonNullable<OffProductResponse['product']>): string | undefined {
  const candidates = [product.product_name_en, product.product_name]
    .map((value) => value?.replace(/\s+/g, ' ').trim())
    .filter((value): value is string => !!value && value.length >= 2 && value.length <= 80);
  return candidates[0];
}

export function labelFromOffProduct(payload: OffProductResponse): ParsedLabel | null {
  if (payload.status !== 1 || !payload.product) return null;
  const product = payload.product;
  const nutriments = product.nutriments ?? {};
  const servingKeys = ['energy-kcal_serving', 'proteins_serving', 'carbohydrates_serving', 'fat_serving'];
  const useServing = servingKeys.filter((key) => asNumber(nutriments[key]) != null).length >= 2;
  const suffix = useServing ? 'serving' : '100g';
  const per = String(product.nutrition_data_per || '').toLowerCase();
  let basis: NutritionBasis = 'serving';
  if (!useServing) basis = per.includes('ml') ? 'per100ml' : 'per100g';

  const confidence: ParsedLabel['confidence'] = {};
  const parsed: ParsedLabel = {
    basis,
    confidence,
    warnings: ['From Open Food Facts. Compare the serving and macros with the package, then save.'],
    rawText: '',
  };

  const name = productName(product);
  if (name) {
    parsed.name = name;
    confidence.name = 'high';
  }

  const servingSize = tidyServing(product.serving_size) ?? (useServing && asNumber(product.serving_quantity) != null
    ? `${bounded(asNumber(product.serving_quantity), 5000, 1)} g`
    : undefined);
  if (servingSize) {
    parsed.servingSize = servingSize;
    confidence.servingSize = 'high';
  }

  const calories = bounded(asNumber(nutriments[`energy-kcal_${suffix}`]), 5000, 0);
  const protein = bounded(asNumber(nutriments[`proteins_${suffix}`]), 500, 1);
  const carbs = bounded(asNumber(nutriments[`carbohydrates_${suffix}`]), 500, 1);
  const fat = bounded(asNumber(nutriments[`fat_${suffix}`]), 500, 1);
  const fiber = bounded(asNumber(nutriments[`fiber_${suffix}`]), 500, 1);
  const sugar = bounded(asNumber(nutriments[`sugars_${suffix}`]), 500, 1);
  const sodium = sodiumMg(nutriments, suffix);

  const fill = (key: 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber' | 'sugar' | 'sodium', value: number | undefined) => {
    if (value == null) {
      if (key === 'calories' || key === 'protein' || key === 'carbs' || key === 'fat') confidence[key] = 'low';
      return;
    }
    parsed[key] = value;
    confidence[key] = 'high';
  };
  fill('calories', calories);
  fill('protein', protein);
  fill('carbs', carbs);
  fill('fat', fat);
  fill('fiber', fiber);
  fill('sugar', sugar);
  fill('sodium', sodium);

  if (basis === 'per100g' || basis === 'per100ml') {
    parsed.basisAmount = 100;
    parsed.basisUnit = basis === 'per100g' ? 'g' : 'ml';
  } else {
    const quantity = asNumber(product.serving_quantity);
    const unit: MetricUnit | undefined = servingSize && /\bml\b/i.test(servingSize) ? 'ml' : quantity != null ? 'g' : undefined;
    if (quantity != null && quantity > 0 && quantity <= 5000 && unit) {
      parsed.basisAmount = quantity;
      parsed.basisUnit = unit;
    }
  }

  if (!name && calories == null && protein == null && carbs == null && fat == null) return null;
  return parsed;
}

async function fetchPayload(code: string): Promise<OffProductResponse> {
  const direct = `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${FIELDS}`;
  try {
    const response = await fetch(direct, { headers: { Accept: 'application/json' } });
    if (response.ok) return (await response.json()) as OffProductResponse;
  } catch {
    // Browser blocked the call. The same-origin proxy is the fallback.
  }
  try {
    const response = await fetch(`/api/off/${code}`, { headers: { Accept: 'application/json' } });
    if (response.ok) return (await response.json()) as OffProductResponse;
  } catch {
    // Both paths failed.
  }
  throw new BarcodeLookupError('Couldn’t reach Open Food Facts. Check your connection, or type the label.');
}

export async function lookupBarcode(raw: string): Promise<ParsedLabel> {
  const code = normalizeBarcode(raw);
  if (!code) {
    throw new BarcodeLookupError('Enter the 8 to 14 digits printed under the barcode.');
  }
  const attempts = code.length === 12 ? [code, `0${code}`] : [code];
  let sawProduct = false;
  for (const attempt of attempts) {
    const payload = await fetchPayload(attempt);
    if (payload.status === 1) sawProduct = true;
    const parsed = labelFromOffProduct(payload);
    if (parsed) return parsed;
  }
  if (!sawProduct) {
    throw new BarcodeLookupError('No Open Food Facts product for that barcode. Type the label, or scan a photo.');
  }
  throw new BarcodeLookupError('That product has no nutrition facts on Open Food Facts. Type the label, or scan a photo.');
}
