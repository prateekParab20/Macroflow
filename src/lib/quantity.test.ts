import { describe, expect, it } from 'vitest';
import {
  convertQuantity,
  defaultQuantity,
  formatLoggedAmount,
  formatQuantity,
  measureFromServing,
  parseAmount,
  parseMeasure,
  portionFromFood,
  scaleForQuantity,
} from './quantity';

describe('parseMeasure', () => {
  it('reads grams, milliliters, and household amounts', () => {
    expect(parseMeasure('170 g')).toEqual({ metricAmount: 170, metricUnit: 'g' });
    expect(parseMeasure('1 bar (40 g)')).toMatchObject({
      metricAmount: 40,
      metricUnit: 'g',
      householdCount: 1,
      householdUnit: 'bar',
    });
    expect(parseMeasure('2/3 cup (55g)')).toMatchObject({
      metricAmount: 55,
      metricUnit: 'g',
      householdUnit: 'cup',
    });
    expect(parseMeasure('2/3 cup (55g)').householdCount).toBeCloseTo(2 / 3);
    expect(parseMeasure('1 cup (240 ml)')).toMatchObject({ metricAmount: 240, metricUnit: 'ml', householdUnit: 'cup' });
    expect(parseMeasure('2 large')).toMatchObject({ householdCount: 2, householdUnit: 'large' });
    expect(parseMeasure('1 tbsp (14 g)').householdUnit).toBe('tbsp');
  });
});

describe('quantity scaling', () => {
  it('scales a gram serving by the grams eaten', () => {
    const portion = portionFromFood({ servingSize: '170 g' });
    expect(defaultQuantity(portion)).toEqual({ amount: 170, unit: 'g' });
    expect(scaleForQuantity(portion, { amount: 85, unit: 'g' })).toBeCloseTo(0.5);
    expect(scaleForQuantity(portion, { amount: 170, unit: 'g' })).toBeCloseTo(1);
  });

  it('accepts either grams or the printed bar', () => {
    const measured = measureFromServing('serving', '1 bar (40 g)');
    const portion = portionFromFood(measured);
    expect(defaultQuantity(portion)).toEqual({ amount: 40, unit: 'g' });
    expect(scaleForQuantity(portion, { amount: 20, unit: 'g' })).toBeCloseTo(0.5);
    expect(scaleForQuantity(portion, { amount: 2, unit: 'bar' })).toBeCloseTo(2);
    expect(convertQuantity(portion, { amount: 40, unit: 'g' }, 'bar')).toEqual({ amount: 1, unit: 'bar' });
  });

  it('scales a fractional cup from grams or cups', () => {
    const portion = portionFromFood(measureFromServing('serving', '2/3 cup (55g)'));
    expect(scaleForQuantity(portion, { amount: 55, unit: 'g' })).toBeCloseTo(1);
    expect(scaleForQuantity(portion, { amount: parseAmount('2/3') ?? 0, unit: 'cup' })).toBeCloseTo(1);
    expect(scaleForQuantity(portion, { amount: 1, unit: 'cup' })).toBeCloseTo(1.5);
  });

  it('scales per 100 g, including a printed bar', () => {
    const plain = portionFromFood({ servingSize: '100 g', basis: 'per100g', basisAmount: 100, basisUnit: 'g' });
    expect(defaultQuantity(plain)).toEqual({ amount: 100, unit: 'g' });
    expect(scaleForQuantity(plain, { amount: 150, unit: 'g' })).toBeCloseTo(1.5);

    const bar = portionFromFood(measureFromServing('per100g', '1 bar (40 g)'));
    expect(bar.referenceAmount).toBe(100);
    expect(defaultQuantity(bar)).toEqual({ amount: 40, unit: 'g' });
    expect(scaleForQuantity(bar, { amount: 1, unit: 'bar' })).toBeCloseTo(0.4);
    expect(scaleForQuantity(bar, { amount: 40, unit: 'g' })).toBeCloseTo(0.4);
  });

  it('scales household-only foods by the printed count', () => {
    const portion = portionFromFood({ servingSize: '2 large' });
    expect(defaultQuantity(portion)).toEqual({ amount: 2, unit: 'large' });
    expect(scaleForQuantity(portion, { amount: 1, unit: 'large' })).toBeCloseTo(0.5);
    expect(scaleForQuantity(portion, { amount: 2, unit: 'large' })).toBeCloseTo(1);
    expect(formatQuantity(1, 'large')).toBe('1 large');
    expect(formatQuantity(3, 'large')).toBe('3 large');
  });

  it('describes saved logs from the quantity, not a serving multiplier', () => {
    expect(formatLoggedAmount({ servings: 0.5, servingSize: '170 g', quantity: 85, quantityUnit: 'g' })).toBe('85 g');
    expect(formatLoggedAmount({ servings: 1.5, servingSize: '170 g' })).toBe('255 g');
    expect(formatLoggedAmount({ servings: 1, servingSize: '2 large' })).toBe('2 large');
  });

  it('parses mixed amounts', () => {
    expect(parseAmount('1 1/2')).toBeCloseTo(1.5);
    expect(parseAmount('2/3')).toBeCloseTo(2 / 3);
    expect(parseAmount('40')).toBe(40);
  });
});
