import { z } from 'zod';

export const macroSchema = z.object({
  calories: z.number().nonnegative(),
  protein: z.number().nonnegative(),
  carbs: z.number().nonnegative(),
  fat: z.number().nonnegative()
});

export type Macros = z.infer<typeof macroSchema>;

export const goalsSchema = macroSchema;
export type Goals = Macros;

export const newEntrySchema = z.object({
  name: z.string().min(1, 'name is required').max(120),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  servings: z.number().positive().default(1),
  calories: z.number().nonnegative(),
  protein: z.number().nonnegative(),
  carbs: z.number().nonnegative(),
  fat: z.number().nonnegative()
});

export type NewEntry = z.infer<typeof newEntrySchema>;

export interface FoodEntry extends NewEntry {
  id: string;
  createdAt: string;
}

export interface Database {
  goals: Goals;
  entries: FoodEntry[];
}
