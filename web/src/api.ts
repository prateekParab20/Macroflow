import type { FoodEntry, Macros, Summary } from './types';

const BASE = '/api';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Request failed (${res.status}): ${body}`);
  }
  return res.json() as Promise<T>;
}

export interface NewEntryInput {
  name: string;
  date: string;
  servings: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export const api = {
  async getSummary(date: string): Promise<Summary> {
    return json(await fetch(`${BASE}/summary?date=${date}`));
  },
  async getEntries(date: string): Promise<FoodEntry[]> {
    return json(await fetch(`${BASE}/entries?date=${date}`));
  },
  async getGoals(): Promise<Macros> {
    return json(await fetch(`${BASE}/goals`));
  },
  async setGoals(goals: Macros): Promise<Macros> {
    return json(
      await fetch(`${BASE}/goals`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(goals)
      })
    );
  },
  async addEntry(input: NewEntryInput): Promise<FoodEntry> {
    return json(
      await fetch(`${BASE}/entries`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input)
      })
    );
  },
  async deleteEntry(id: string): Promise<void> {
    const res = await fetch(`${BASE}/entries/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Delete failed (${res.status})`);
  }
};
