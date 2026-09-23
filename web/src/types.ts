export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface FoodEntry {
  id: string;
  name: string;
  date: string;
  servings: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  createdAt: string;
}

export interface Summary {
  date: string;
  goals: Macros;
  consumed: Macros;
  remaining: Macros;
  entryCount: number;
}
