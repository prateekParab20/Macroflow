import type { Macros } from './types';

export function round(value: number): number {
  return Math.round(value * 10) / 10;
}

export function pctOfGoal(consumed: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.min(100, Math.round((consumed / goal) * 100));
}

export function macroLabel(key: keyof Macros): string {
  switch (key) {
    case 'calories':
      return 'Calories';
    case 'protein':
      return 'Protein';
    case 'carbs':
      return 'Carbs';
    case 'fat':
      return 'Fat';
  }
}

export function unitFor(key: keyof Macros): string {
  return key === 'calories' ? 'kcal' : 'g';
}
