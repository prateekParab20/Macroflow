import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type NewEntryInput } from './api';
import type { FoodEntry, Macros, Summary } from './types';
import { macroLabel, pctOfGoal, round, unitFor } from './format';

const MACRO_KEYS: (keyof Macros)[] = ['calories', 'protein', 'carbs', 'fat'];

const emptyForm: NewEntryInput = {
  name: '',
  date: '',
  servings: 1,
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function App() {
  const [date, setDate] = useState<string>(today());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [form, setForm] = useState<NewEntryInput>({ ...emptyForm, date: today() });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (forDate: string) => {
    setLoading(true);
    setError(null);
    try {
      const [s, e] = await Promise.all([
        api.getSummary(forDate),
        api.getEntries(forDate)
      ]);
      setSummary(s);
      setEntries(e);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(date);
  }, [date, refresh]);

  const canSubmit = useMemo(
    () => form.name.trim().length > 0 && form.calories >= 0,
    [form]
  );

  async function handleAdd(evt: React.FormEvent) {
    evt.preventDefault();
    if (!canSubmit) return;
    try {
      await api.addEntry({ ...form, date });
      setForm({ ...emptyForm, date });
      await refresh(date);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add entry');
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.deleteEntry(id);
      await refresh(date);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete entry');
    }
  }

  function updateField(field: keyof NewEntryInput, value: string) {
    setForm((prev) => ({
      ...prev,
      [field]: field === 'name' ? value : Number(value)
    }));
  }

  return (
    <div className="app">
      <header className="app__header">
        <h1>
          <span aria-hidden>🥗</span> MacroFlow
        </h1>
        <p className="app__subtitle">Track your daily macros with ease.</p>
        <label className="date-picker">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      </header>

      {error && <div className="alert" role="alert">{error}</div>}

      <section className="macros" aria-label="Daily progress">
        {MACRO_KEYS.map((key) => {
          const consumed = summary ? round(summary.consumed[key]) : 0;
          const goal = summary ? summary.goals[key] : 0;
          const pct = summary ? pctOfGoal(summary.consumed[key], goal) : 0;
          return (
            <article className="macro-card" key={key}>
              <h3>{macroLabel(key)}</h3>
              <div className="macro-card__value">
                {consumed}
                <span className="macro-card__unit"> / {goal} {unitFor(key)}</span>
              </div>
              <div className="progress">
                <div
                  className={`progress__bar progress__bar--${key}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="macro-card__pct">{pct}% of goal</div>
            </article>
          );
        })}
      </section>

      <div className="layout">
        <section className="panel" aria-label="Add food">
          <h2>Add food</h2>
          <form className="entry-form" onSubmit={handleAdd}>
            <label className="entry-form__full">
              Food name
              <input
                type="text"
                placeholder="e.g. Greek yogurt"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
              />
            </label>
            <label>
              Servings
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={form.servings}
                onChange={(e) => updateField('servings', e.target.value)}
              />
            </label>
            <label>
              Calories
              <input
                type="number"
                min={0}
                step="any"
                value={form.calories}
                onChange={(e) => updateField('calories', e.target.value)}
              />
            </label>
            <label>
              Protein (g)
              <input
                type="number"
                min={0}
                step="any"
                value={form.protein}
                onChange={(e) => updateField('protein', e.target.value)}
              />
            </label>
            <label>
              Carbs (g)
              <input
                type="number"
                min={0}
                step="any"
                value={form.carbs}
                onChange={(e) => updateField('carbs', e.target.value)}
              />
            </label>
            <label>
              Fat (g)
              <input
                type="number"
                min={0}
                step="any"
                value={form.fat}
                onChange={(e) => updateField('fat', e.target.value)}
              />
            </label>
            <button type="submit" className="btn btn--primary" disabled={!canSubmit}>
              Add entry
            </button>
          </form>
        </section>

        <section className="panel" aria-label="Logged foods">
          <h2>
            Today&apos;s log{' '}
            <span className="badge">{entries.length}</span>
          </h2>
          {loading && <p className="muted">Loading…</p>}
          {!loading && entries.length === 0 && (
            <p className="muted">No entries yet. Add your first food on the left.</p>
          )}
          <ul className="entry-list">
            {entries.map((entry) => (
              <li key={entry.id} className="entry">
                <div className="entry__main">
                  <span className="entry__name">{entry.name}</span>
                  <span className="entry__meta">
                    {entry.servings}× · {round(entry.calories * entry.servings)} kcal ·
                    {' '}P {round(entry.protein * entry.servings)}g ·
                    {' '}C {round(entry.carbs * entry.servings)}g ·
                    {' '}F {round(entry.fat * entry.servings)}g
                  </span>
                </div>
                <button
                  className="btn btn--ghost"
                  aria-label={`Delete ${entry.name}`}
                  onClick={() => handleDelete(entry.id)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
