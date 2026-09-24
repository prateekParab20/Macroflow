export type Gender = 'female' | 'male';
export type Goal = 'lose' | 'maintain' | 'gain';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type UnitSystem = 'metric' | 'imperial';
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type NutritionBasis = 'serving' | 'per100g' | 'per100ml';
export type MetricUnit = 'g' | 'ml';

export interface Profile {
  gender: Gender;
  age: number;
  heightCm: number;
  weightKg: number;
  goal: Goal;
  activity: ActivityLevel;
  unitSystem: UnitSystem;
  createdAt: string;
  /** Added on top of the goal-adjusted TDEE after weigh-in trends. */
  calorieAdjustment: number;
  adjustmentNote?: string;
}

export interface Food {
  id: string;
  name: string;
  servingSize: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  favorite: boolean;
  createdAt: string;
  source: 'seed' | 'manual' | 'scan';
  /** What the stored macros describe. */
  basis?: NutritionBasis;
  basisAmount?: number;
  basisUnit?: MetricUnit;
  householdUnit?: string;
  householdCount?: number;
  /** Grams or ml covered by householdCount of householdUnit. */
  householdMetric?: number;
}

/** Macros are stored per one serving so edits to the food don't rewrite history. */
export interface LogEntry {
  id: string;
  date: string;
  meal: MealSlot;
  foodId: string;
  /** Scale applied to the food's stored macros. */
  servings: number;
  /** Exact amount the person ate, in quantityUnit. */
  quantity?: number;
  quantityUnit?: string;
  name: string;
  servingSize: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface WeighIn {
  id: string;
  date: string;
  weightKg: number;
  note?: string;
}

export interface PlannedMeal {
  meal: MealSlot;
  foodId: string;
  name: string;
  servingSize: string;
  servings: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface MealPlanDay {
  date: string;
  meals: PlannedMeal[];
}

export interface MealPlan {
  id: string;
  weekStart: string;
  createdAt: string;
  seed: number;
  targetCalories: number;
  days: MealPlanDay[];
}

export interface MacroTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface MacroTargets extends MacroTotals {
  bmr: number;
  tdee: number;
  adjustment: number;
  goalDelta: number;
  floorApplied: boolean;
}
