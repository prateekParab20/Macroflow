import type { Food, LogEntry, MacroTargets, MealPlan, MealSlot, PlannedMeal } from '../types';
import { addDays } from './dates';
import { uid } from './id';

const MEALS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

const SPLIT: Record<MealSlot, { cal: number; pro: number }> = {
  breakfast: { cal: 0.26, pro: 0.18 },
  lunch: { cal: 0.33, pro: 0.36 },
  dinner: { cal: 0.31, pro: 0.34 },
  snack: { cal: 0.1, pro: 0.12 },
};

type Role = 'protein' | 'carb' | 'produce' | 'fat' | 'breakfast' | 'side' | 'snack';

interface Draft {
  meal: MealSlot;
  food: Food;
  servings: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(rng: () => number, items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function roundQuarter(n: number): number {
  return Math.round(n * 4) / 4;
}

export function rolesOf(food: Food): Set<Role> {
  const roles = new Set<Role>();
  const name = food.name.toLowerCase();
  const calories = Math.max(food.calories, 1);
  const fatShare = (food.fat * 9) / calories;

  if (food.protein >= 12 || (food.protein * 4) / calories >= 0.4) roles.add('protein');
  if (food.carbs >= 12 && fatShare < 0.7) roles.add('carb');
  if (food.calories <= 80 && food.carbs >= 4 && food.protein < 10) roles.add('produce');
  if (fatShare >= 0.75 && food.protein < 8) roles.add('fat');
  if (/oat|yogurt|egg|bread|cottage|pancake|toast|cereal/.test(name)) roles.add('breakfast');
  if (food.calories <= 140 && food.carbs >= 15 && food.protein < 8 && fatShare < 0.45) roles.add('side');
  if (
    !roles.has('produce') &&
    !(roles.has('breakfast') && food.calories > 130) &&
    !(roles.has('protein') && food.calories > 120) &&
    fatShare < 0.85 &&
    food.calories >= 60 &&
    food.calories <= 200
  ) {
    roles.add('snack');
  }
  return roles;
}

export function planPool(foods: Food[], logs: LogEntry[]): Food[] {
  const eaten = new Set(logs.map((entry) => entry.foodId));
  const personal = foods.filter((food) => food.favorite || eaten.has(food.id));
  if (personal.length >= 4) return personal;
  const map = new Map<string, Food>();
  foods.filter((food) => food.source === 'seed').forEach((food) => map.set(food.id, food));
  personal.forEach((food) => map.set(food.id, food));
  const mixed = [...map.values()];
  return mixed.length ? mixed : foods;
}

export function poolDescription(foods: Food[], logs: LogEntry[]): string {
  const eaten = new Set(logs.map((entry) => entry.foodId));
  const personal = foods.filter((food) => food.favorite || eaten.has(food.id)).length;
  if (personal >= 4) return 'Built from foods you log and star.';
  return 'Sample foods fill the week until you log or star a few of your own.';
}

function pickFoods(
  rng: () => number,
  candidates: Food[],
  count: number,
  usedToday: Set<string>,
  avoid: Set<string>,
): Food[] {
  const unique = candidates.filter((food, index, all) => all.findIndex((item) => item.id === food.id) === index);
  const fresh = unique.filter((food) => !usedToday.has(food.id) && !avoid.has(food.id));
  const unused = unique.filter((food) => !usedToday.has(food.id));
  const pool = fresh.length >= count ? fresh : unused;
  if (!pool.length) return [];
  const picked = shuffle(rng, pool).slice(0, Math.min(count, pool.length));
  picked.forEach((food) => usedToday.add(food.id));
  return picked;
}

function sumDraft(items: Draft[]) {
  return items.reduce(
    (totals, item) => ({
      calories: totals.calories + item.food.calories * item.servings,
      protein: totals.protein + item.food.protein * item.servings,
    }),
    { calories: 0, protein: 0 },
  );
}

function fitMeal(items: Draft[], calorieTarget: number, proteinTarget: number): void {
  if (!items.length || calorieTarget <= 0) return;
  const score = () => {
    let calories = 0;
    let protein = 0;
    let portion = 0;
    for (const item of items) {
      calories += item.food.calories * item.servings;
      protein += item.food.protein * item.servings;
      portion += Math.abs(item.servings - 1);
    }
    const calErr = Math.abs(calories - calorieTarget) / calorieTarget;
    const proShort = Math.max(0, proteinTarget - protein) / Math.max(proteinTarget, 1);
    const proOver = Math.max(0, protein - proteinTarget * 1.35) / Math.max(proteinTarget, 1);
    return calErr * 4 + proShort * 2 + proOver * 0.3 + portion * 0.035;
  };

  for (let pass = 0; pass < 5; pass += 1) {
    for (const item of items) {
      let best = item.servings;
      let bestScore = Number.POSITIVE_INFINITY;
      for (let servings = 0.5; servings <= 3.001; servings += 0.25) {
        item.servings = roundQuarter(servings);
        const next = score();
        if (next < bestScore - 1e-9) {
          bestScore = next;
          best = item.servings;
        }
      }
      item.servings = best;
    }
  }
}

function nudgeDay(items: Draft[], targets: MacroTargets): void {
  let guard = 0;
  while (guard < 18) {
    guard += 1;
    const totals = sumDraft(items);
    const calLow = totals.calories < targets.calories * 0.92;
    const calHigh = totals.calories > targets.calories * 1.08;
    const proLow = totals.protein < targets.protein * 0.9;
    if (!calLow && !calHigh && !proLow) break;

    if (calHigh) {
      const item = [...items]
        .filter((entry) => entry.servings > 0.5)
        .sort((a, b) => b.food.calories * b.servings - a.food.calories * a.servings)[0];
      if (!item) break;
      item.servings = roundQuarter(item.servings - 0.25);
      continue;
    }

    const room = items.filter((entry) => entry.servings < 3);
    if (!room.length) break;
    room.sort((a, b) => {
      if (proLow) {
        return (
          b.food.protein / Math.max(b.food.calories, 1) - a.food.protein / Math.max(a.food.calories, 1)
        );
      }
      return b.food.calories - a.food.calories;
    });
    room[0].servings = roundQuarter(room[0].servings + 0.25);
  }
}

function toPlanned(item: Draft): PlannedMeal {
  return {
    meal: item.meal,
    foodId: item.food.id,
    name: item.food.name,
    servingSize: item.food.servingSize,
    servings: item.servings,
    calories: item.food.calories,
    protein: item.food.protein,
    carbs: item.food.carbs,
    fat: item.food.fat,
  };
}

export function generateMealPlan(options: {
  foods: Food[];
  logs: LogEntry[];
  targets: MacroTargets;
  weekStart: string;
  seed: number;
}): MealPlan {
  const pool = planPool(options.foods, options.logs);
  const rng = mulberry32(options.seed || 1);
  const withRole = (role: Role) => pool.filter((food) => rolesOf(food).has(role));
  const previous: Record<MealSlot, Set<string>> = {
    breakfast: new Set(),
    lunch: new Set(),
    dinner: new Set(),
    snack: new Set(),
  };

  const days = Array.from({ length: 7 }, (_, index) => {
    const used = new Set<string>();
    const take = (candidates: Food[], count: number, meal: MealSlot) =>
      pickFoods(rng, candidates, count, used, previous[meal]).map((food) => ({
        meal,
        food,
        servings: 1,
      }));

    const breakfastMain = withRole('breakfast');
    const breakfast = [
      ...take(breakfastMain.length ? breakfastMain : withRole('carb'), 1, 'breakfast'),
      ...take(withRole('side'), 1, 'breakfast'),
    ];
    const lunch = [
      ...take(withRole('protein'), 1, 'lunch'),
      ...take(withRole('carb'), 1, 'lunch'),
      ...take(withRole('produce'), 1, 'lunch'),
    ];
    const fat = withRole('fat');
    const produce = withRole('produce');
    const dinnerExtra = rng() > 0.5 && fat.length ? fat : produce.length ? produce : fat;
    const dinner = [
      ...take(withRole('protein'), 1, 'dinner'),
      ...take(withRole('carb'), 1, 'dinner'),
      ...take(dinnerExtra, 1, 'dinner'),
    ];
    const snacks = withRole('snack');
    const snack = take(snacks.length ? snacks : pool, 1, 'snack');

    const items = [...breakfast, ...lunch, ...dinner, ...snack];
    for (const meal of MEALS) {
      if (items.some((item) => item.meal === meal)) continue;
      const food = pool.find((candidate) => !used.has(candidate.id));
      if (!food) continue;
      used.add(food.id);
      items.push({ meal, food, servings: 1 });
    }

    for (const meal of MEALS) {
      const group = items.filter((item) => item.meal === meal);
      fitMeal(group, options.targets.calories * SPLIT[meal].cal, options.targets.protein * SPLIT[meal].pro);
    }
    nudgeDay(items, options.targets);

    for (const meal of MEALS) {
      previous[meal] = new Set(items.filter((item) => item.meal === meal).map((item) => item.food.id));
    }

    const meals = MEALS.flatMap((meal) =>
      items.filter((item) => item.meal === meal).map(toPlanned),
    );

    return { date: addDays(options.weekStart, index), meals };
  });

  return {
    id: uid(),
    weekStart: options.weekStart,
    createdAt: new Date().toISOString(),
    seed: options.seed,
    targetCalories: options.targets.calories,
    days,
  };
}

export function dayTotals(meals: PlannedMeal[]) {
  return meals.reduce(
    (totals, meal) => ({
      calories: totals.calories + meal.calories * meal.servings,
      protein: totals.protein + meal.protein * meal.servings,
      carbs: totals.carbs + meal.carbs * meal.servings,
      fat: totals.fat + meal.fat * meal.servings,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}
