import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import { bmrMifflin, computeTargets, trendAdjustment } from './macros';
import { parseNutritionLabel } from './parseLabel';
import { dayTotals, generateMealPlan } from './planner';
import { createSeedFoods } from './seed';
import { sanitize } from './storage';
import type { Profile, WeighIn } from '../types';

const male: Profile = {
  gender: 'male',
  age: 30,
  heightCm: 180,
  weightKg: 80,
  goal: 'lose',
  activity: 'moderate',
  unitSystem: 'metric',
  createdAt: '2026-01-01T00:00:00.000Z',
  calorieAdjustment: 0,
};

describe('macros', () => {
  it('uses Mifflin–St Jeor and a 500 kcal deficit', () => {
    expect(bmrMifflin(male)).toBe(1780);
    const targets = computeTargets(male);
    expect(targets.tdee).toBe(2759);
    expect(targets.calories).toBe(2260);
    expect(targets.protein).toBe(160);
    expect(targets.fat).toBeGreaterThanOrEqual(60);
    expect(targets.fat).toBeLessThanOrEqual(75);
    expect(targets.carbs).toBeGreaterThan(180);
    expect(targets.goalDelta).toBe(-500);
  });

  it('adds about 400 kcal for a gain', () => {
    const targets = computeTargets({ ...male, goal: 'gain' });
    expect(targets.calories).toBe(3160);
    expect(targets.protein).toBeGreaterThanOrEqual(80 * 1.6);
    expect(targets.protein).toBeLessThanOrEqual(80 * 2.2);
  });

  it('keeps a floor under very low targets', () => {
    const targets = computeTargets({
      ...male,
      gender: 'female',
      age: 60,
      heightCm: 150,
      weightKg: 45,
      activity: 'sedentary',
      goal: 'lose',
    });
    expect(targets.floorApplied).toBe(true);
    expect(targets.calories).toBe(1200);
  });

  it('nudges calories when a loss goal is stalled', () => {
    const weighIns: WeighIn[] = [
      { id: 'a', date: '2026-09-01', weightKg: 80 },
      { id: 'b', date: '2026-09-15', weightKg: 80 },
    ];
    const trend = trendAdjustment(weighIns, 'lose');
    expect(trend.calorieAdjustment).toBeLessThan(0);
    expect(trend.adjustmentNote).toMatch(/lower/i);
  });

  it('raises calories when loss is very fast', () => {
    const trend = trendAdjustment(
      [
        { id: 'a', date: '2026-09-01', weightKg: 80 },
        { id: 'b', date: '2026-09-08', weightKg: 78 },
      ],
      'lose',
    );
    expect(trend.calorieAdjustment).toBeGreaterThan(0);
  });
});

describe('parseNutritionLabel', () => {
  it('reads a standard nutrition facts panel', () => {
    const parsed = parseNutritionLabel(`
Nutrition Facts
Serving Size 2/3 cup (55g)
Servings Per Container 8
Amount Per Serving
Calories 230
Calories from Fat 72
Total Fat 8g 10%
Saturated Fat 1g 5%
Trans Fat 0g
Cholesterol 0mg
Sodium 160mg 7%
Total Carbohydrate 37g 13%
Dietary Fiber 4g 14%
Total Sugars 12g
Protein 3g
Vitamin D 2mcg
* Percent Daily Values are based on a 2,000 calorie diet.
`);
    expect(parsed.servingSize).toBe('2/3 cup (55 g)');
    expect(parsed.basis).toBe('serving');
    expect(parsed.basisAmount).toBe(55);
    expect(parsed.basisUnit).toBe('g');
    expect(parsed.householdUnit).toBe('cup');
    expect(parsed.householdCount).toBeCloseTo(2 / 3);
    expect(parsed.calories).toBe(230);
    expect(parsed.fat).toBe(8);
    expect(parsed.carbs).toBe(37);
    expect(parsed.fiber).toBe(4);
    expect(parsed.sugar).toBe(12);
    expect(parsed.protein).toBe(3);
    expect(parsed.sodium).toBe(160);
    expect(parsed.sugar).not.toBe(10);
  });

  it('tolerates split lines and OCR typos', () => {
    const parsed = parseNutritionLabel(`
Nutriti0n Facts
Serving Size 1 cup (240ml)
Calorles 150
Total Fat
2.5g
Sodium 15mg
Total Carbohydrate 3O g
Dietary Fiber 0g
Protein
8g
`);
    expect(parsed.calories).toBe(150);
    expect(parsed.fat).toBe(2.5);
    expect(parsed.sodium).toBe(15);
    expect(parsed.carbs).toBe(30);
    expect(parsed.protein).toBe(8);
    expect(parsed.confidence.protein).toBe('low');
    expect(parsed.confidence.fat).toBe('low');
  });

  it('reads a fuzzy OCR dump and ignores added sugars', () => {
    const parsed = parseNutritionLabel(`
Nutriti0n Facts
Servlng slze 1 bar (40g)
Calorles 190
Total Fat 89 9%
Saturated Fat 4g
Sodlum 140mg
Total Carbohydrate 26g
Dletary Flber 2g
Total Sugars 18g
Includes 17g Added Sugars 34%
Proteln 3g
`);
    expect(parsed.servingSize).toMatch(/1 bar/);
    expect(parsed.householdUnit).toBe('bar');
    expect(parsed.basisAmount).toBe(40);
    expect(parsed.calories).toBe(190);
    expect(parsed.fat).toBe(8);
    expect(parsed.sodium).toBe(140);
    expect(parsed.carbs).toBe(26);
    expect(parsed.fiber).toBe(2);
    expect(parsed.sugar).toBe(18);
    expect(parsed.protein).toBe(3);
  });

  it('reads per-100g values and prefers kcal over kJ', () => {
    const parsed = parseNutritionLabel(`
Nutrition Information
Per 100g
Energy 1523kJ / 364kcal
Fat 1.2g
of which saturates 0.3g
Carbohydrate 76g
of which sugars 4.5g
Fibre 3.1g
Protein 10g
Salt 0.8g
`);
    expect(parsed.basis).toBe('per100g');
    expect(parsed.basisAmount).toBe(100);
    expect(parsed.calories).toBe(364);
    expect(parsed.fat).toBe(1.2);
    expect(parsed.carbs).toBe(76);
    expect(parsed.sugar).toBe(4.5);
    expect(parsed.fiber).toBe(3.1);
    expect(parsed.protein).toBe(10);
    expect(parsed.sodium).toBe(320);
    expect(parsed.confidence.sodium).toBe('low');
  });

  it('keeps the per-serving column when the label also lists per 100 g', () => {
    const parsed = parseNutritionLabel(`
Nutrition Facts
Serving size 1 bar (40g)
Per serving Per 100g
Calories 190 475
Total Fat 7g 18g
Sodium 140mg 350mg
Total Carbohydrate 26g 65g
Dietary Fiber 2g 5g
Total Sugars 18g 45g
Protein 3g 8g
`);
    expect(parsed.basis).toBe('serving');
    expect(parsed.basisAmount).toBe(40);
    expect(parsed.calories).toBe(190);
    expect(parsed.fat).toBe(7);
    expect(parsed.sodium).toBe(140);
    expect(parsed.carbs).toBe(26);
    expect(parsed.fiber).toBe(2);
    expect(parsed.sugar).toBe(18);
    expect(parsed.protein).toBe(3);
  });

  it('zips nutrient names with a detached column of amounts', () => {
    const parsed = parseNutritionLabel(`
Nutrition Facts
Serving size 1 cup (240ml)
Amount per serving
Calories
230
Total Fat
Saturated Fat
Trans Fat
Cholesterol
Sodium
Total Carbohydrate
Dietary Fiber
Total Sugars
Protein
8g
1g
0g
0mg
160mg
37g
4g
12g
3g
`);
    expect(parsed.calories).toBe(230);
    expect(parsed.fat).toBe(8);
    expect(parsed.sodium).toBe(160);
    expect(parsed.carbs).toBe(37);
    expect(parsed.fiber).toBe(4);
    expect(parsed.sugar).toBe(12);
    expect(parsed.protein).toBe(3);
    expect(parsed.basisUnit).toBe('ml');
    expect(parsed.basisAmount).toBe(240);
  });
});

describe('meal plan', () => {
  it('builds a varied week near the calorie target', () => {
    const foods = createSeedFoods();
    const targets = computeTargets(male);
    const plan = generateMealPlan({
      foods,
      logs: [],
      targets,
      weekStart: '2026-09-21',
      seed: 42,
    });
    expect(plan.days).toHaveLength(7);
    expect(plan.days[0].date).toBe('2026-09-21');
    expect(plan.days[6].date).toBe(addDays('2026-09-21', 6));

    const breakfasts = new Set<string>();
    for (const day of plan.days) {
      const slots = new Set(day.meals.map((meal) => meal.meal));
      expect(slots).toEqual(new Set(['breakfast', 'lunch', 'dinner', 'snack']));
      const ids = day.meals.map((meal) => meal.foodId);
      expect(new Set(ids).size).toBe(ids.length);
      const totals = dayTotals(day.meals);
      expect(totals.calories).toBeGreaterThan(targets.calories * 0.85);
      expect(totals.calories).toBeLessThan(targets.calories * 1.15);
      expect(totals.protein).toBeGreaterThan(targets.protein * 0.75);
      day.meals.filter((meal) => meal.meal === 'breakfast').forEach((meal) => breakfasts.add(meal.name));
    }
    expect(breakfasts.size).toBeGreaterThanOrEqual(2);

    const again = generateMealPlan({
      foods,
      logs: [],
      targets,
      weekStart: '2026-09-21',
      seed: 42,
    });
    expect(again.days.map((day) => day.meals)).toEqual(plan.days.map((day) => day.meals));

    const other = generateMealPlan({
      foods,
      logs: [],
      targets,
      weekStart: '2026-09-21',
      seed: 99,
    });
    expect(other.days.map((day) => day.meals.map((meal) => meal.foodId))).not.toEqual(
      plan.days.map((day) => day.meals.map((meal) => meal.foodId)),
    );
  });
});

describe('storage', () => {
  it('drops a broken profile and keeps valid foods', () => {
    const data = sanitize({
      profile: { gender: 'unknown' },
      foods: [
        {
          id: 'custom',
          name: 'Toast',
          calories: 80,
          protein: 3,
          carbs: 14,
          fat: 1,
        },
      ],
    });
    expect(data.profile).toBeNull();
    expect(data.foods).toHaveLength(1);
    expect(data.foods[0].servingSize).toBe('1 serving');
    expect(data.foods[0].source).toBe('manual');
  });
});
