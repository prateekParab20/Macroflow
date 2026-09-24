import type { ActivityLevel, Food, Goal, LogEntry, MealPlan, MetricUnit, NutritionBasis, Profile, UnitSystem, WeighIn } from '../types';
import { createSeedFoods } from './seed';

export const STORAGE_KEY = 'macroflow.v1';

export interface AppData {
  version: 1;
  profile: Profile | null;
  foods: Food[];
  logs: LogEntry[];
  weighIns: WeighIn[];
  mealPlan: MealPlan | null;
}

export function initialData(): AppData {
  return {
    version: 1,
    profile: null,
    foods: createSeedFoods(),
    logs: [],
    weighIns: [],
    mealPlan: null,
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
    const source = item.source === 'manual' || item.source === 'scan' || item.source === 'seed' ? item.source : 'manual';
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
