import { describe, expect, it } from 'vitest';
import { portionFromFood, scaleForQuantity } from './quantity';
import {
  cookedNetGrams,
  foodFromRecipe,
  macrosForGrams,
  macrosFromPer100,
  per100Cooked,
  rawGrams,
  servingFromBatch,
  sumMacros,
} from './recipe';
import { sanitize } from './storage';
import type { Food, Recipe } from '../types';

const toorPer100 = { calories: 343, protein: 22, carbs: 63, fat: 1.5 };

function dalRecipe(cookedGrams: number): Recipe {
  const dal = macrosFromPer100(toorPer100, 200);
  if (!dal) throw new Error('dal');
  return {
    id: 'dal',
    name: 'Dal',
    cookedGrams,
    ingredients: [
      { id: 'dal-in', name: 'Toor dal', grams: 200, foodId: 'toor', ...dal },
      { id: 'oil-in', name: 'Oil', grams: 10, calories: 90, protein: 0, carbs: 0, fat: 10 },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('batch recipe math', () => {
  it('scales 200 g of toor dal from per-100 g numbers', () => {
    expect(macrosFromPer100(toorPer100, 200)).toEqual({
      calories: 686,
      protein: 44,
      carbs: 126,
      fat: 3,
    });
    expect(macrosFromPer100(toorPer100, 0)).toBeNull();
    expect(macrosFromPer100(toorPer100, -10)).toBeNull();
  });

  it('logs 300 g of a 1,200 g pot as exactly one quarter', () => {
    const recipe = dalRecipe(1200);
    const totals = sumMacros(recipe.ingredients);
    expect(rawGrams(recipe.ingredients)).toBe(210);
    expect(totals).toEqual({ calories: 776, protein: 44, carbs: 126, fat: 13 });

    const bowl = servingFromBatch(totals, 1200, 300);
    expect(bowl).toEqual({
      calories: totals.calories / 4,
      protein: totals.protein / 4,
      carbs: totals.carbs / 4,
      fat: totals.fat / 4,
    });
    expect(bowl).toEqual({ calories: 194, protein: 11, carbs: 31.5, fat: 3.25 });

    const per100 = per100Cooked(totals, 1200);
    expect(per100?.calories).toBe(totals.calories * (100 / 1200));
    const perGram = servingFromBatch(totals, 1200, 1);
    expect(perGram?.calories).toBe(totals.calories * (1 / 1200));

    const food = foodFromRecipe(recipe);
    const scale = scaleForQuantity(portionFromFood(food), { amount: 300, unit: 'g' });
    expect(scale).toBe(0.25);
    expect(food.calories * (scale ?? 0)).toBe(totals.calories * 0.25);
  });

  it('subtracts pot weight and rejects a non-positive cooked weight', () => {
    expect(cookedNetGrams({ grossGrams: 1500, tareGrams: 300 })).toBe(1200);
    expect(cookedNetGrams({ grossGrams: 1200, tareGrams: 0 })).toBe(1200);
    expect(cookedNetGrams({ cookedGrams: 1200 })).toBe(1200);
    expect(cookedNetGrams({ grossGrams: 1500, tareGrams: 300, cookedGrams: 999 })).toBe(1200);
    expect(cookedNetGrams({ grossGrams: 100, tareGrams: 100 })).toBeNull();
    expect(cookedNetGrams({ grossGrams: 50, tareGrams: 80 })).toBeNull();
    expect(cookedNetGrams({ cookedGrams: 0 })).toBeNull();
    expect(cookedNetGrams({ cookedGrams: -5 })).toBeNull();
    expect(cookedNetGrams({ cookedGrams: Number.NaN })).toBeNull();
    expect(servingFromBatch({ calories: 100, protein: 1, carbs: 1, fat: 1 }, 0, 50)).toBeNull();
    expect(servingFromBatch({ calories: 100, protein: 1, carbs: 1, fat: 1 }, -10, 50)).toBeNull();
    expect(servingFromBatch({ calories: 100, protein: 1, carbs: 1, fat: 1 }, 1200, 0)).toBeNull();
    expect(servingFromBatch({ calories: 100, protein: 1, carbs: 1, fat: 1 }, 1200, -20)).toBeNull();
  });

  it('keeps a logged bowl when the recipe is cooked again or edited', () => {
    const recipe = dalRecipe(1200);
    const logged = foodFromRecipe(recipe);
    const loggedServings = 300 / 1200;
    const eaten = {
      calories: logged.calories * loggedServings,
      protein: logged.protein * loggedServings,
      carbs: logged.carbs * loggedServings,
      fat: logged.fat * loggedServings,
    };

    const recooked = foodFromRecipe({ ...recipe, cookedGrams: 900 });
    expect(recooked.calories).toBe(logged.calories);
    expect(recooked.calories * (300 / 900)).not.toBe(eaten.calories);
    expect(eaten.calories).toBe(194);

    const extra = { calories: 100, protein: 1, carbs: 2, fat: 3 };
    const edited = foodFromRecipe({
      ...recipe,
      ingredients: [...recipe.ingredients, { id: 'extra', name: 'Onion', grams: 50, ...extra }],
    });
    expect(edited.calories).toBe(logged.calories + 100);
    expect(eaten).toEqual({ calories: 194, protein: 11, carbs: 31.5, fat: 3.25 });
  });

  it('scales a saved per-100 g food by the raw grams', () => {
    const food: Food = {
      id: 'toor',
      name: 'Toor dal',
      servingSize: '100 g',
      calories: 343,
      protein: 22,
      carbs: 63,
      fat: 1.5,
      favorite: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      source: 'manual',
      basis: 'per100g',
      basisAmount: 100,
      basisUnit: 'g',
    };
    expect(macrosForGrams(food, 200)).toEqual({ calories: 686, protein: 44, carbs: 126, fat: 3 });
    expect(macrosForGrams(food, 0)).toBeNull();
    expect(macrosForGrams({ ...food, servingSize: '1 piece', basis: 'serving', basisAmount: undefined, basisUnit: undefined }, 50)).toBeNull();
  });
});

describe('recipe storage', () => {
  it('keeps recipes on existing data and starts empty when they are missing', () => {
    const empty = sanitize({
      profile: null,
      foods: [],
      logs: [{ id: 'keep', name: 'Toast' }],
    });
    expect(empty.recipes).toEqual([]);
    expect(empty.logs).toHaveLength(1);

    const kept = sanitize({
      recipes: [
        {
          id: 'dal',
          name: 'Dal',
          cookedGrams: 1200,
          tareGrams: 300,
          grossGrams: 1500,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
          ingredients: [
            { id: 'a', name: 'Toor dal', grams: 200, calories: 686, protein: 44, carbs: 126, fat: 3 },
          ],
        },
        { id: 'bad', name: 'Empty', cookedGrams: 0, ingredients: [] },
      ],
    });
    expect(kept.recipes).toHaveLength(1);
    expect(kept.recipes[0].cookedGrams).toBe(1200);
    expect(kept.recipes[0].tareGrams).toBe(300);
    expect(kept.recipes[0].ingredients[0].name).toBe('Toor dal');
    expect(kept.foods.length).toBeGreaterThan(0);
  });
});
