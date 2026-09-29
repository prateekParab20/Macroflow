import { addMacros, emptyTotals } from './macros';
import { portionFromFood, scaleForQuantity } from './quantity';
import type { Food, MacroTotals, Recipe } from '../types';

export function sumMacros(items: MacroTotals[]): MacroTotals {
  return items.reduce((sum, item) => addMacros(sum, item), emptyTotals());
}

export function rawGrams(ingredients: { grams: number }[]): number {
  return ingredients.reduce((sum, item) => sum + item.grams, 0);
}

/** Macros for `grams` of a saved food. Null when that food has no gram or milliliter weight. */
export function macrosForGrams(food: Food, grams: number): MacroTotals | null {
  if (!(grams > 0) || !Number.isFinite(grams)) return null;
  const portion = portionFromFood(food);
  if (portion.referenceUnit !== 'g' && portion.referenceUnit !== 'ml') return null;
  const scale = scaleForQuantity(portion, { amount: grams, unit: portion.referenceUnit });
  if (scale == null) return null;
  return {
    calories: food.calories * scale,
    protein: food.protein * scale,
    carbs: food.carbs * scale,
    fat: food.fat * scale,
  };
}

/** Scale a per-100 g label by the raw grams used. */
export function macrosFromPer100(per100: MacroTotals, grams: number): MacroTotals | null {
  if (!(grams > 0) || !Number.isFinite(grams)) return null;
  const factor = grams / 100;
  return {
    calories: per100.calories * factor,
    protein: per100.protein * factor,
    carbs: per100.carbs * factor,
    fat: per100.fat * factor,
  };
}

/**
 * Cooked batch weight. When both a scale reading and a pot weight are present,
 * cooked weight is gross minus tare. Otherwise the typed cooked weight is used.
 * Zero and negative results are rejected.
 */
export function cookedNetGrams(input: {
  cookedGrams?: number | null;
  grossGrams?: number | null;
  tareGrams?: number | null;
}): number | null {
  const gross = input.grossGrams;
  const tare = input.tareGrams;
  const hasGross = gross != null && Number.isFinite(gross);
  const hasTare = tare != null && Number.isFinite(tare);
  if (hasGross && hasTare) {
    if (!(gross > 0) || tare < 0) return null;
    const net = gross - tare;
    return net > 0 ? net : null;
  }
  const cooked = input.cookedGrams;
  if (cooked == null || !Number.isFinite(cooked) || !(cooked > 0)) return null;
  return cooked;
}

/** servingGrams × totals ÷ cookedGrams. */
export function servingFromBatch(
  totals: MacroTotals,
  cookedGrams: number,
  servingGrams: number,
): MacroTotals | null {
  if (!(cookedGrams > 0) || !Number.isFinite(cookedGrams)) return null;
  if (!(servingGrams > 0) || !Number.isFinite(servingGrams)) return null;
  const factor = servingGrams / cookedGrams;
  return {
    calories: totals.calories * factor,
    protein: totals.protein * factor,
    carbs: totals.carbs * factor,
    fat: totals.fat * factor,
  };
}

export function per100Cooked(totals: MacroTotals, cookedGrams: number): MacroTotals | null {
  return servingFromBatch(totals, cookedGrams, 100);
}

/** A food-shaped snapshot of the whole pot, so the existing gram logger can scale it. */
export function foodFromRecipe(recipe: Recipe): Food {
  const totals = sumMacros(recipe.ingredients);
  return {
    id: recipe.id,
    name: recipe.name,
    servingSize: `${recipe.cookedGrams} g`,
    calories: totals.calories,
    protein: totals.protein,
    carbs: totals.carbs,
    fat: totals.fat,
    favorite: false,
    createdAt: recipe.createdAt,
    source: 'manual',
    basis: 'serving',
    basisAmount: recipe.cookedGrams,
    basisUnit: 'g',
  };
}
