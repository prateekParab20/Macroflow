export function formatKcal(value: number): string {
  return Math.round(value).toLocaleString();
}

export function formatGrams(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (Math.abs(rounded) >= 10) return Math.round(rounded).toLocaleString();
  return rounded.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export function formatServings(servings: number): string {
  const rounded = Math.round(servings * 4) / 4;
  const label = Number.isInteger(rounded) ? String(rounded) : String(rounded);
  return `${label} ${rounded === 1 ? 'serving' : 'servings'}`;
}

export function mealLabel(meal: 'breakfast' | 'lunch' | 'dinner' | 'snack'): string {
  if (meal === 'snack') return 'Snacks';
  return meal.charAt(0).toUpperCase() + meal.slice(1);
}
