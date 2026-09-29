import type { ActivityLevel, Food, Goal, LogEntry, MealPlan, MetricUnit, NutritionBasis, Profile, Recipe, RecipeIngredient, UnitSystem, WeighIn } from '../types';
import { createSeedFoods } from './seed';

export const STORAGE_KEY = 'macroflow.v1';

export interface AppData {
  version: 1;
  profile: Profile | null;
  foods: Food[];
  logs: LogEntry[];
  weighIns: WeighIn[];
  mealPlan: MealPlan | null;
  recipes: Recipe[];
}

export function initialData(): AppData {
  return {
    version: 1,
    profile: null,
    foods: createSeedFoods(),
    logs: [],
    weighIns: [],
    mealPlan: null,
    recipes: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

const ACTIVITIES: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
const GOALS: Goal[] = ['lose', 'maintain', 'gain'];

function asProfile(value: unknown): Profile | null {
  if (!isRecord(value)) return null;
  if (value.gender !== 'female' && value.gender !== 'male') return null;
  if (typeof value.age !== 'number' || typeof value.heightCm !== 'number' || typeof value.weightKg !== 'number') {
    return null;
  }
  if (!GOALS.includes(value.goal as Goal)) return null;
  const activity = ACTIVITIES.includes(value.activity as ActivityLevel)
    ? (value.activity as ActivityLevel)
    : 'sedentary';
  const unitSystem: UnitSystem = value.unitSystem === 'imperial' ? 'imperial' : 'metric';
  return {
    gender: value.gender,
    age: value.age,
    heightCm: value.heightCm,
    weightKg: value.weightKg,
    goal: value.goal as Goal,
    activity,
    unitSystem,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date(0).toISOString(),
    calorieAdjustment: typeof value.calorieAdjustment === 'number' ? value.calorieAdjustment : 0,
    adjustmentNote: typeof value.adjustmentNote === 'string' ? value.adjustmentNote : undefined,
  };
}

function asFoods(value: unknown): Food[] {
  if (!Array.isArray(value)) return createSeedFoods();
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    if (typeof item.id !== 'string' || typeof item.name !== 'string') return [];
    if (typeof item.calories !== 'number' || typeof item.protein !== 'number') return [];
    const source =
      item.source === 'manual' || item.source === 'scan' || item.source === 'seed' || item.source === 'barcode'
        ? item.source
        : 'manual';
    const food: Food = {
      id: item.id,
      name: item.name,
      servingSize: typeof item.servingSize === 'string' && item.servingSize ? item.servingSize : '1 serving',
      calories: item.calories,
      protein: item.protein,
      carbs: typeof item.carbs === 'number' ? item.carbs : 0,
      fat: typeof item.fat === 'number' ? item.fat : 0,
      favorite: item.favorite === true,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date(0).toISOString(),
      source,
    };
    if (typeof item.fiber === 'number') food.fiber = item.fiber;
    if (typeof item.sugar === 'number') food.sugar = item.sugar;
    if (typeof item.sodium === 'number') food.sodium = item.sodium;
    if (item.basis === 'serving' || item.basis === 'per100g' || item.basis === 'per100ml') {
      food.basis = item.basis as NutritionBasis;
    }
    if (typeof item.basisAmount === 'number' && item.basisAmount > 0) food.basisAmount = item.basisAmount;
    if (item.basisUnit === 'g' || item.basisUnit === 'ml') food.basisUnit = item.basisUnit as MetricUnit;
    if (typeof item.householdUnit === 'string' && item.householdUnit) food.householdUnit = item.householdUnit;
    if (typeof item.householdCount === 'number' && item.householdCount > 0) food.householdCount = item.householdCount;
    if (typeof item.householdMetric === 'number' && item.householdMetric > 0) food.householdMetric = item.householdMetric;
    return [food];
  });
}

function asIngredient(value: unknown): RecipeIngredient | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || typeof value.name !== 'string' || !value.name.trim()) return null;
  if (typeof value.grams !== 'number' || !(value.grams > 0)) return null;
  if (typeof value.calories !== 'number' || typeof value.protein !== 'number') return null;
  if (typeof value.carbs !== 'number' || typeof value.fat !== 'number') return null;
  const ingredient: RecipeIngredient = {
    id: value.id,
    name: value.name.trim(),
    grams: value.grams,
    calories: value.calories,
    protein: value.protein,
    carbs: value.carbs,
    fat: value.fat,
  };
  if (typeof value.foodId === 'string' && value.foodId) ingredient.foodId = value.foodId;
  return ingredient;
}

function asRecipes(value: unknown): Recipe[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    if (typeof item.id !== 'string' || typeof item.name !== 'string' || !item.name.trim()) return [];
    if (typeof item.cookedGrams !== 'number' || !(item.cookedGrams > 0)) return [];
    if (!Array.isArray(item.ingredients)) return [];
    const ingredients = item.ingredients.flatMap((entry) => {
      const ingredient = asIngredient(entry);
      return ingredient ? [ingredient] : [];
    });
    if (!ingredients.length) return [];
    const recipe: Recipe = {
      id: item.id,
      name: item.name.trim(),
      ingredients,
      cookedGrams: item.cookedGrams,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date(0).toISOString(),
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date(0).toISOString(),
    };
    if (typeof item.tareGrams === 'number' && item.tareGrams >= 0) recipe.tareGrams = item.tareGrams;
    if (typeof item.grossGrams === 'number' && item.grossGrams > 0) recipe.grossGrams = item.grossGrams;
    return [recipe];
  });
}

export function sanitize(value: unknown): AppData {
  if (!isRecord(value)) return initialData();
  const foods = asFoods(value.foods);
  return {
    version: 1,
    profile: asProfile(value.profile),
    foods,
    logs: Array.isArray(value.logs) ? (value.logs as LogEntry[]) : [],
    weighIns: Array.isArray(value.weighIns) ? (value.weighIns as WeighIn[]) : [],
    mealPlan: isRecord(value.mealPlan) ? (value.mealPlan as unknown as MealPlan) : null,
    recipes: asRecipes(value.recipes),
  };
}

export function loadState(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialData();
    return sanitize(JSON.parse(raw));
  } catch {
    return initialData();
  }
}

export function saveState(data: AppData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
