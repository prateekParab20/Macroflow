import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Database, FoodEntry, Goals, NewEntry } from './types.js';

const DEFAULT_GOALS: Goals = {
  calories: 2200,
  protein: 160,
  carbs: 220,
  fat: 70
};

function emptyDb(): Database {
  return { goals: { ...DEFAULT_GOALS }, entries: [] };
}

/**
 * A tiny JSON-file backed store. Persistence is intentionally simple so the
 * app runs anywhere with zero external services. When `filePath` is null the
 * store stays fully in-memory (used by tests).
 */
export class Store {
  private db: Database;

  constructor(private readonly filePath: string | null) {
    this.db = this.load();
  }

  private load(): Database {
    if (!this.filePath || !existsSync(this.filePath)) {
      return emptyDb();
    }
    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<Database>;
      return {
        goals: { ...DEFAULT_GOALS, ...(parsed.goals ?? {}) },
        entries: Array.isArray(parsed.entries) ? parsed.entries : []
      };
    } catch {
      return emptyDb();
    }
  }

  private persist(): void {
    if (!this.filePath) return;
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.db, null, 2), 'utf-8');
  }

  getGoals(): Goals {
    return { ...this.db.goals };
  }

  setGoals(goals: Goals): Goals {
    this.db.goals = { ...goals };
    this.persist();
    return this.getGoals();
  }

  listEntries(date?: string): FoodEntry[] {
    const entries = date
      ? this.db.entries.filter((e) => e.date === date)
      : [...this.db.entries];
    return entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  addEntry(input: NewEntry): FoodEntry {
    const entry: FoodEntry = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    };
    this.db.entries.push(entry);
    this.persist();
    return entry;
  }

  removeEntry(id: string): boolean {
    const before = this.db.entries.length;
    this.db.entries = this.db.entries.filter((e) => e.id !== id);
    const removed = this.db.entries.length < before;
    if (removed) this.persist();
    return removed;
  }
}
