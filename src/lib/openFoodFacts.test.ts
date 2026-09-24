import { afterEach, describe, expect, it, vi } from 'vitest';
import { labelFromOffProduct, lookupBarcode, normalizeBarcode, type OffProductResponse } from './openFoodFacts';

const cheerios: OffProductResponse = {
  status: 1,
  product: {
    product_name: 'Gmills hny nut cheerios sweetened whl grn oat cereal',
    product_name_en: 'Honey Nut Cheerios',
    brands: 'General Mills',
    serving_size: '3/4 cup (28 g) (28 g)',
    serving_quantity: 28,
    nutrition_data_per: '100g',
    nutriments: {
      'energy-kcal_100g': 393,
      'energy-kcal_serving': 110,
      proteins_100g: 7.14,
      proteins_serving: 2,
      carbohydrates_100g: 78.57,
      carbohydrates_serving: 22,
      fat_100g: 5.36,
      fat_serving: 1.5,
      fiber_serving: 1.99,
      sugars_serving: 9,
      sodium_serving: 0.16,
      sodium_unit: 'g',
    },
  },
};

const nutella: OffProductResponse = {
  status: 1,
  product: {
    product_name: 'Nutella',
    serving_size: undefined,
    nutrition_data_per: '100g',
    nutriments: {
      'energy-kcal_100g': 539,
      proteins_100g: 6.3,
      carbohydrates_100g: 57.5,
      fat_100g: 30.9,
      fiber_100g: 0,
      sugars_100g: 56.3,
      sodium_100g: 0.0428,
      sodium_unit: 'g',
    },
  },
};

describe('Open Food Facts mapping', () => {
  it('keeps a digit run from a scanned barcode', () => {
    expect(normalizeBarcode('UPC 016000275270 extra')).toBe('016000275270');
    expect(normalizeBarcode('123')).toBeNull();
  });

  it('uses per-serving macros and converts sodium from grams', () => {
    const parsed = labelFromOffProduct(cheerios);
    expect(parsed?.name).toBe('Honey Nut Cheerios');
    expect(parsed?.servingSize).toBe('3/4 cup (28 g)');
    expect(parsed?.basis).toBe('serving');
    expect(parsed?.basisAmount).toBe(28);
    expect(parsed?.basisUnit).toBe('g');
    expect(parsed?.calories).toBe(110);
    expect(parsed?.protein).toBe(2);
    expect(parsed?.carbs).toBe(22);
    expect(parsed?.fat).toBe(1.5);
    expect(parsed?.fiber).toBe(2);
    expect(parsed?.sugar).toBe(9);
    expect(parsed?.sodium).toBe(160);
    expect(parsed?.confidence.calories).toBe('high');
  });

  it('falls back to per 100 g when the product has no serving column', () => {
    const parsed = labelFromOffProduct(nutella);
    expect(parsed?.name).toBe('Nutella');
    expect(parsed?.basis).toBe('per100g');
    expect(parsed?.basisAmount).toBe(100);
    expect(parsed?.calories).toBe(539);
    expect(parsed?.fat).toBe(30.9);
    expect(parsed?.sodium).toBe(43);
    expect(parsed?.fiber).toBe(0);
  });

  it('looks up a product and retries a 12-digit UPC with a leading zero', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const missed = String(url).includes('/product/016000275270');
      return {
        ok: true,
        json: async () => (missed ? { status: 0 } : cheerios),
      };
    });
    vi.stubGlobal('fetch', fetchMock);
    const parsed = await lookupBarcode('016000275270');
    expect(parsed.name).toBe('Honey Nut Cheerios');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain('0016000275270');
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
