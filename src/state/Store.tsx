import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { uid } from '../lib/id';
import { computeTargets, trendAdjustment } from '../lib/macros';
import { generateMealPlan } from '../lib/planner';
import { initialData, loadState, saveState, type AppData } from '../lib/storage';
import { startOfWeekMonday, todayISO } from '../lib/dates';
import { loggedQuantity } from '../lib/quantity';
import type { Food, LogEntry, MacroTargets, MealSlot, Profile, WeighIn } from '../types';

interface Store {
  profile: Profile | null;
  foods: Food[];
  logs: LogEntry[];
  weighIns: WeighIn[];
  mealPlan: AppData['mealPlan'];
  targets: MacroTargets | null;
  completeOnboarding: (profile: Profile) => void;
  updateProfile: (patch: Partial<Profile>) => void;
  saveFood: (food: Omit<Food, 'id' | 'createdAt'> & { id?: string }) => void;
  deleteFood: (id: string) => void;
  toggleFavorite: (id: string) => void;
  addLog: (input: {
    date: string;
    meal: MealSlot;
    food: Food;
    servings: number;
    quantity: number;
    quantityUnit: string;
  }) => void;
  updateLog: (id: string, patch: { servings: number; quantity: number; quantityUnit: string }) => void;
  deleteLog: (id: string) => void;
  addWeighIn: (input: { date: string; weightKg: number; note?: string }) => void;
  deleteWeighIn: (id: string) => void;
  shufflePlan: (weekStart?: string) => void;
  applyPlanDay: (date: string) => void;
  resetAll: () => void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => loadState());

  useEffect(() => {
    saveState(data);
  }, [data]);

  const targets = useMemo(() => (data.profile ? computeTargets(data.profile) : null), [data.profile]);

  const store = useMemo<Store>(() => {
    return {
      profile: data.profile,
      foods: data.foods,
      logs: data.logs,
      weighIns: data.weighIns,
      mealPlan: data.mealPlan,
      targets,
      completeOnboarding: (profile) => {
        setData((current) => ({
          ...current,
          profile: {
            ...profile,
            calorieAdjustment: 0,
            adjustmentNote: undefined,
            createdAt: new Date().toISOString(),
          },
        }));
      },
      updateProfile: (patch) => {
        setData((current) => {
          if (!current.profile) return current;
          const next: Profile = { ...current.profile, ...patch };
          if (patch.goal && patch.goal !== current.profile.goal) {
            const trend = trendAdjustment(current.weighIns, next.goal);
            next.calorieAdjustment = trend.calorieAdjustment;
            next.adjustmentNote = trend.adjustmentNote;
          }
          return { ...current, profile: next };
        });
      },
      saveFood: (food) => {
        setData((current) => {
          if (food.id) {
            return {
              ...current,
              foods: current.foods.map((item) =>
                item.id === food.id ? { ...item, ...food, id: item.id, createdAt: item.createdAt } : item,
              ),
            };
          }
          const created: Food = {
            ...food,
            id: uid(),
            createdAt: new Date().toISOString(),
            favorite: food.favorite ?? false,
          };
          return { ...current, foods: [created, ...current.foods] };
        });
      },
      deleteFood: (id) => {
        setData((current) => ({ ...current, foods: current.foods.filter((food) => food.id !== id) }));
      },
      toggleFavorite: (id) => {
        setData((current) => ({
          ...current,
          foods: current.foods.map((food) => (food.id === id ? { ...food, favorite: !food.favorite } : food)),
        }));
      },
      addLog: ({ date, meal, food, servings, quantity, quantityUnit }) => {
        const entry: LogEntry = {
          id: uid(),
          date,
          meal,
          foodId: food.id,
          servings,
          quantity,
          quantityUnit,
          name: food.name,
          servingSize: food.servingSize,
          calories: food.calories,
          protein: food.protein,
          carbs: food.carbs,
          fat: food.fat,
        };
        setData((current) => ({ ...current, logs: [...current.logs, entry] }));
      },
      updateLog: (id, patch) => {
        setData((current) => ({
          ...current,
          logs: current.logs.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
        }));
      },
      deleteLog: (id) => {
        setData((current) => ({ ...current, logs: current.logs.filter((entry) => entry.id !== id) }));
      },
      addWeighIn: ({ date, weightKg, note }) => {
        setData((current) => {
          if (!current.profile) return current;
          const weighIn: WeighIn = {
            id: uid(),
            date,
            weightKg,
            note: note?.trim() || undefined,
          };
          const weighIns = [...current.weighIns.filter((item) => item.date !== date), weighIn].sort((a, b) =>
            a.date.localeCompare(b.date),
          );
          const latest = weighIns[weighIns.length - 1];
          const trend = trendAdjustment(weighIns, current.profile.goal);
          return {
            ...current,
            weighIns,
            profile: {
              ...current.profile,
              weightKg: latest.weightKg,
              calorieAdjustment: trend.calorieAdjustment,
              adjustmentNote: trend.adjustmentNote,
            },
          };
        });
      },
      deleteWeighIn: (id) => {
        setData((current) => {
          if (!current.profile) return current;
          const weighIns = current.weighIns.filter((item) => item.id !== id);
          const trend = trendAdjustment(weighIns, current.profile.goal);
          const latest = [...weighIns].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
          return {
            ...current,
            weighIns,
            profile: {
              ...current.profile,
              weightKg: latest?.weightKg ?? current.profile.weightKg,
              calorieAdjustment: trend.calorieAdjustment,
              adjustmentNote: trend.adjustmentNote,
            },
          };
        });
      },
      shufflePlan: (weekStart) => {
        setData((current) => {
          if (!current.profile) return current;
          const nextTargets = computeTargets(current.profile);
          const start = weekStart ?? current.mealPlan?.weekStart ?? startOfWeekMonday(todayISO());
          const mealPlan = generateMealPlan({
            foods: current.foods,
            logs: current.logs,
            targets: nextTargets,
            weekStart: start,
            seed: Math.floor(Math.random() * 1_000_000_000),
          });
          return { ...current, mealPlan };
        });
      },
      applyPlanDay: (date) => {
        setData((current) => {
          const day = current.mealPlan?.days.find((item) => item.date === date);
          if (!day) return current;
          const existing = new Set(
            current.logs.filter((entry) => entry.date === date).map((entry) => `${entry.meal}:${entry.foodId}`),
          );
          const added: LogEntry[] = [];
          for (const meal of day.meals) {
            const key = `${meal.meal}:${meal.foodId}`;
            if (existing.has(key)) continue;
            existing.add(key);
            const food = current.foods.find((item) => item.id === meal.foodId);
            const logged = loggedQuantity(
              food ?? { servingSize: meal.servingSize },
              meal.servings,
            );
            added.push({
              id: uid(),
              date,
              meal: meal.meal,
              foodId: meal.foodId,
              servings: meal.servings,
              quantity: logged.quantity,
              quantityUnit: logged.quantityUnit,
              name: meal.name,
              servingSize: meal.servingSize,
              calories: meal.calories,
              protein: meal.protein,
              carbs: meal.carbs,
              fat: meal.fat,
            });
          }
          if (!added.length) return current;
          return { ...current, logs: [...current.logs, ...added] };
        });
      },
      resetAll: () => setData(initialData()),
    };
  }, [data, targets]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used within StoreProvider');
  return store;
}
