import type { ActivityLevel, Goal, MacroTargets, MacroTotals, Profile, WeighIn } from '../types';
import { addDays, daysBetween } from './dates';

export const ACTIVITY: { id: ActivityLevel; label: string; detail: string; factor: number }[] = [
  { id: 'sedentary', label: 'Sedentary', detail: 'Desk day, little exercise', factor: 1.2 },
  { id: 'light', label: 'Light', detail: 'Easy movement, 1–3 days a week', factor: 1.375 },
  { id: 'moderate', label: 'Moderate', detail: 'Exercise 3–5 days a week', factor: 1.55 },
  { id: 'active', label: 'Active', detail: 'Hard sessions most days', factor: 1.725 },
  { id: 'very_active', label: 'Very active', detail: 'Physical work or two-a-days', factor: 1.9 },
];

export const GOALS: { id: Goal; label: string; detail: string }[] = [
  { id: 'lose', label: 'Lose weight', detail: 'A 500 kcal deficit' },
  { id: 'maintain', label: 'Maintain', detail: 'Stay near your current weight' },
  { id: 'gain', label: 'Gain weight', detail: 'A steady 400 kcal surplus' },
];

const GOAL_DELTA: Record<Goal, number> = {
  lose: -500,
  maintain: 0,
  gain: 400,
};

const CALORIE_FLOOR = 1200;

export function activityFactor(level: ActivityLevel): number {
  return ACTIVITY.find((item) => item.id === level)?.factor ?? 1.2;
}

export function bmrMifflin(profile: Pick<Profile, 'gender' | 'age' | 'heightCm' | 'weightKg'>): number {
  const base = 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age;
  return profile.gender === 'male' ? base + 5 : base - 161;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function roundTo(n: number, step: number): number {
  return Math.round(n / step) * step;
}

export function computeTargets(profile: Profile): MacroTargets {
  const bmr = bmrMifflin(profile);
  const tdee = bmr * activityFactor(profile.activity);
  const goalDelta = GOAL_DELTA[profile.goal];
  const adjustment = profile.calorieAdjustment || 0;
  const raw = tdee + goalDelta + adjustment;
  const calories = Math.max(CALORIE_FLOOR, roundTo(raw, 10));
  const floorApplied = raw < CALORIE_FLOOR;

  const perKg = profile.goal === 'lose' ? 2 : 1.8;
  let protein = Math.round(clamp(profile.weightKg * perKg, profile.weightKg * 1.6, profile.weightKg * 2.2));
  let fat = Math.round((calories * 0.275) / 9);
  let carbKcal = calories - protein * 4 - fat * 9;

  if (carbKcal < calories * 0.2) {
    fat = Math.round((calories * 0.25) / 9);
    carbKcal = calories - protein * 4 - fat * 9;
  }
  if (carbKcal < calories * 0.15) {
    protein = Math.round(profile.weightKg * 1.6);
    carbKcal = calories - protein * 4 - fat * 9;
  }

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    calories,
    protein,
    carbs: Math.max(0, Math.round(carbKcal / 4)),
    fat,
    adjustment,
    goalDelta,
    floorApplied,
  };
}

export function emptyTotals(): MacroTotals {
  return { calories: 0, protein: 0, carbs: 0, fat: 0 };
}

export function addMacros(
  totals: MacroTotals,
  item: MacroTotals,
  servings = 1,
): MacroTotals {
  return {
    calories: totals.calories + item.calories * servings,
    protein: totals.protein + item.protein * servings,
    carbs: totals.carbs + item.carbs * servings,
    fat: totals.fat + item.fat * servings,
  };
}

export function impliedCalories(protein: number, carbs: number, fat: number): number {
  return protein * 4 + carbs * 4 + fat * 9;
}

export function macroMismatch(calories: number, protein: number, carbs: number, fat: number): number | null {
  if (calories <= 0) return null;
  const implied = impliedCalories(protein, carbs, fat);
  const delta = implied - calories;
  if (Math.abs(delta) >= 30 && Math.abs(delta) / calories >= 0.12) return delta;
  return null;
}

const CALORIE_FIELD_MAX = 5000;
const MACRO_FIELD_MAX = 500;

function plausibleAmount(value: number, max: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= max;
}

/**
 * Compare the numbers currently typed in the confirm form.
 * Blank fields are skipped — they are not treated as zero — and values that
 * cannot be a real label (including raw OCR digit runs) never appear in the text.
 */
export function calorieWarningText(fields: {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}): string | null {
  const { calories, protein, carbs, fat } = fields;
  const implausible =
    (calories != null && !plausibleAmount(calories, CALORIE_FIELD_MAX)) ||
    (protein != null && !plausibleAmount(protein, MACRO_FIELD_MAX)) ||
    (carbs != null && !plausibleAmount(carbs, MACRO_FIELD_MAX)) ||
    (fat != null && !plausibleAmount(fat, MACRO_FIELD_MAX));
  if (implausible) {
    return 'These amounts don’t look like a nutrition label. Check calories, protein, carbs, and fat.';
  }
  if (calories == null || protein == null || carbs == null || fat == null) return null;
  if (macroMismatch(calories, protein, carbs, fat) == null) return null;
  const implied = Math.round(impliedCalories(protein, carbs, fat));
  return `Protein, carbs, and fat add up to about ${implied} kcal. The calorie field says ${Math.round(calories)}. Worth a second look — labels round, but a large gap usually means a misread digit.`;
}

/**
 * Compare the last few weeks of weigh-ins with the goal and nudge calories
 * in 50 kcal steps, capped at ±300. One trend, not a stack of penalties.
 */
export function trendAdjustment(
  weighIns: WeighIn[],
  goal: Goal,
): { calorieAdjustment: number; adjustmentNote?: string } {
  const sorted = [...weighIns].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  if (sorted.length < 2) return { calorieAdjustment: 0 };

  const latest = sorted[sorted.length - 1];
  const window = sorted.filter((item) => item.date >= addDays(latest.date, -28));
  if (window.length < 2) return { calorieAdjustment: 0 };

  const first = window[0];
  const days = daysBetween(first.date, latest.date);
  if (days < 7) {
    return {
      calorieAdjustment: 0,
      adjustmentNote: 'One more week of weigh-ins will show whether to nudge calories.',
    };
  }

  const weekly = ((latest.weightKg - first.weightKg) / days) * 7;
  const desired = goal === 'lose' ? -0.45 : goal === 'gain' ? 0.3 : 0;
  const diff = weekly - desired;

  if (Math.abs(diff) < 0.12) {
    return {
      calorieAdjustment: 0,
      adjustmentNote: 'Your recent trend lines up with your goal, so the target stays put.',
    };
  }

  const calorieAdjustment = clamp(Math.round(((-diff * 7700) / 7) / 50) * 50, -300, 300);
  if (calorieAdjustment === 0) {
    return {
      calorieAdjustment: 0,
      adjustmentNote: 'Your recent trend lines up with your goal, so the target stays put.',
    };
  }

  const amount = Math.abs(calorieAdjustment);
  let adjustmentNote: string;
  if (goal === 'lose' && calorieAdjustment < 0) {
    adjustmentNote = `Weight is coming down slower than planned, so the target is ${amount} kcal lower.`;
  } else if (goal === 'lose') {
    adjustmentNote = `Weight is dropping quickly, so the target is ${amount} kcal higher.`;
  } else if (goal === 'gain' && calorieAdjustment > 0) {
    adjustmentNote = `Weight is rising slower than planned, so the target is ${amount} kcal higher.`;
  } else if (goal === 'gain') {
    adjustmentNote = `Weight is rising quickly, so the target is ${amount} kcal lower.`;
  } else if (calorieAdjustment < 0) {
    adjustmentNote = `Weight is drifting up, so the target is ${amount} kcal lower.`;
  } else {
    adjustmentNote = `Weight is drifting down, so the target is ${amount} kcal higher.`;
  }

  return { calorieAdjustment, adjustmentNote };
}

export function goalLabel(goal: Goal): string {
  return GOALS.find((item) => item.id === goal)?.label ?? goal;
}

export function activityLabel(level: ActivityLevel): string {
  return ACTIVITY.find((item) => item.id === level)?.label ?? level;
}
