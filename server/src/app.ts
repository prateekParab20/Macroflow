import cors from 'cors';
import express, { type Request, type Response } from 'express';
import { Store } from './store.js';
import { goalsSchema, newEntrySchema, type FoodEntry } from './types.js';

function totalsFor(entries: FoodEntry[]) {
  return entries.reduce(
    (acc, e) => {
      const factor = e.servings ?? 1;
      acc.calories += e.calories * factor;
      acc.protein += e.protein * factor;
      acc.carbs += e.carbs * factor;
      acc.fat += e.fat * factor;
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function createApp(store: Store) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'macroflow', time: new Date().toISOString() });
  });

  app.get('/api/goals', (_req: Request, res: Response) => {
    res.json(store.getGoals());
  });

  app.put('/api/goals', (req: Request, res: Response) => {
    const parsed = goalsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    res.json(store.setGoals(parsed.data));
  });

  app.get('/api/entries', (req: Request, res: Response) => {
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    res.json(store.listEntries(date));
  });

  app.post('/api/entries', (req: Request, res: Response) => {
    const parsed = newEntrySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const entry = store.addEntry(parsed.data);
    res.status(201).json(entry);
  });

  app.delete('/api/entries/:id', (req: Request, res: Response) => {
    const removed = store.removeEntry(req.params.id);
    if (!removed) return res.status(404).json({ error: 'entry not found' });
    res.status(204).end();
  });

  app.get('/api/summary', (req: Request, res: Response) => {
    const date = typeof req.query.date === 'string' ? req.query.date : todayIso();
    const entries = store.listEntries(date);
    const goals = store.getGoals();
    const consumed = totalsFor(entries);
    const remaining = {
      calories: goals.calories - consumed.calories,
      protein: goals.protein - consumed.protein,
      carbs: goals.carbs - consumed.carbs,
      fat: goals.fat - consumed.fat
    };
    res.json({ date, goals, consumed, remaining, entryCount: entries.length });
  });

  return app;
}
