import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Minus, Plus, Search } from 'lucide-react';
import { FoodForm } from '../components/FoodForm';
import { MacroMeter, ProgressRing, Sheet } from '../components/ui';
import { addDays, formatLongDate, todayISO } from '../lib/dates';
import { formatKcal, formatServings, mealLabel } from '../lib/format';
import { addMacros, emptyTotals, goalLabel } from '../lib/macros';
import { useStore } from '../state/Store';
import type { Food, LogEntry, MealSlot } from '../types';

const MEALS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export function Today() {
  const store = useStore();
  const today = todayISO();
  const [date, setDate] = useState(today);
  const [adding, setAdding] = useState<MealSlot | null>(null);
  const [editing, setEditing] = useState<LogEntry | null>(null);
  const [creating, setCreating] = useState(false);

  const entries = store.logs.filter((entry) => entry.date === date);
  const totals = entries.reduce((sum, entry) => addMacros(sum, entry, entry.servings), emptyTotals());
  const targets = store.targets;
  if (!targets || !store.profile) return null;

  const remaining = targets.calories - totals.calories;
  const over = remaining < 0;
  const title = date === today ? 'Today' : formatLongDate(date).split(',')[0];

  return (
    <div className="page view-enter">
      <header className="page-head">
        <div>
          <h1>{title}</h1>
          <p>{formatLongDate(date)}</p>
        </div>
        <div className="date-nav">
          <button type="button" aria-label="Previous day" onClick={() => setDate((value) => addDays(value, -1))} disabled={date <= addDays(today, -14)}>
            <ChevronLeft size={22} />
          </button>
          <button type="button" aria-label="Next day" onClick={() => setDate((value) => addDays(value, 1))} disabled={date >= today}>
            <ChevronRight size={22} />
          </button>
        </div>
      </header>

      <section className="card hero-card">
        <ProgressRing value={totals.calories} max={targets.calories} over={over} />
        <p className={over ? 'hero-number over' : 'hero-number'}>{formatKcal(Math.abs(remaining))}</p>
        <p className="hero-unit">{over ? 'kcal over' : 'kcal left'}</p>
        <p className="hero-sub">
          {formatKcal(totals.calories)} eaten · {formatKcal(targets.calories)} goal · {goalLabel(store.profile.goal)}
        </p>
        <div className="macro-list">
          <MacroMeter label="Protein" value={totals.protein} target={targets.protein} color="var(--pink)" />
          <MacroMeter label="Carbs" value={totals.carbs} target={targets.carbs} color="var(--orange)" />
          <MacroMeter label="Fat" value={totals.fat} target={targets.fat} color="var(--indigo)" />
        </div>
      </section>

      {MEALS.map((meal) => {
        const rows = entries.filter((entry) => entry.meal === meal);
        const mealKcal = rows.reduce((sum, entry) => sum + entry.calories * entry.servings, 0);
        return (
          <section key={meal}>
            <div className="section-head">
              <h2>{mealLabel(meal)}</h2>
              {rows.length ? <span>{formatKcal(mealKcal)} kcal</span> : null}
            </div>
            <div className="group">
              {rows.map((entry) => (
                <button key={entry.id} type="button" className="log-row" onClick={() => setEditing(entry)}>
                  <span className="choice-copy">
                    <strong>{entry.name}</strong>
                    <small>
                      {formatServings(entry.servings)} · {Math.round(entry.protein * entry.servings)}g protein
                    </small>
                  </span>
                  <span className="kcal">{formatKcal(entry.calories * entry.servings)}</span>
                </button>
              ))}
              <button type="button" className="add-row" onClick={() => setAdding(meal)}>
                <Plus size={16} /> Add food
              </button>
            </div>
          </section>
        );
      })}

      {adding ? (
        <AddFoodSheet
          meal={adding}
          foods={store.foods}
          logs={store.logs}
          onClose={() => setAdding(null)}
          onCreate={() => setCreating(true)}
          onAdd={(food, servings) => {
            store.addLog({ date, meal: adding, food, servings });
            setAdding(null);
          }}
        />
      ) : null}

      {creating ? (
        <FoodForm
          title="New food"
          initial={{ source: 'manual', favorite: false }}
          onCancel={() => setCreating(false)}
          onSubmit={(draft) => {
            store.saveFood(draft);
            setCreating(false);
          }}
        />
      ) : null}

      {editing ? (
        <EditLogSheet
          entry={editing}
          onClose={() => setEditing(null)}
          onSave={(servings) => {
            store.updateLog(editing.id, servings);
            setEditing(null);
          }}
          onDelete={() => {
            store.deleteLog(editing.id);
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function AddFoodSheet({
  meal,
  foods,
  logs,
  onClose,
  onAdd,
  onCreate,
}: {
  meal: MealSlot;
  foods: Food[];
  logs: LogEntry[];
  onClose: () => void;
  onAdd: (food: Food, servings: number) => void;
  onCreate: () => void;
}) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Food | null>(null);
  const [servings, setServings] = useState(1);

  const recent = useMemo(() => {
    const ids: string[] = [];
    for (let i = logs.length - 1; i >= 0; i -= 1) {
      const id = logs[i].foodId;
      if (!ids.includes(id)) ids.push(id);
      if (ids.length === 8) break;
    }
    return ids.map((id) => foods.find((food) => food.id === id)).filter((food): food is Food => !!food);
  }, [foods, logs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...foods]
      .filter((food) => !q || food.name.toLowerCase().includes(q))
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name));
  }, [foods, query]);

  return (
    <Sheet title={picked ? picked.name : mealLabel(meal)} onClose={onClose}>
      {picked ? (
        <div className="picker-detail">
          <button type="button" className="text-btn" onClick={() => setPicked(null)}>
            All foods
          </button>
          <p className="picker-serving">{picked.servingSize}</p>
          <div className="stepper">
            <button type="button" aria-label="Fewer servings" onClick={() => setServings((value) => Math.max(0.25, Math.round((value - 0.25) * 4) / 4))}>
              <Minus size={18} />
            </button>
            <strong>{formatServings(servings).replace(' servings', '').replace(' serving', '')}</strong>
            <button type="button" aria-label="More servings" onClick={() => setServings((value) => Math.min(8, Math.round((value + 0.25) * 4) / 4))}>
              <Plus size={18} />
            </button>
          </div>
          <p className="picker-macros">
            {formatKcal(picked.calories * servings)} kcal · {Math.round(picked.protein * servings)}p · {Math.round(picked.carbs * servings)}c · {Math.round(picked.fat * servings)}f
          </p>
          <button type="button" className="btn btn-primary" onClick={() => onAdd(picked, servings)}>
            Add to {mealLabel(meal).toLowerCase()}
          </button>
        </div>
      ) : (
        <>
          <label className="search">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search foods" autoFocus />
          </label>
          {!query && recent.length ? (
            <div className="chips" aria-label="Recent foods">
              {recent.map((food) => (
                <button key={food.id} type="button" onClick={() => { setPicked(food); setServings(1); }}>
                  {food.name}
                </button>
              ))}
            </div>
          ) : null}
          <div className="group sheet-group">
            {filtered.map((food) => (
              <button
                key={food.id}
                type="button"
                className="log-row"
                onClick={() => {
                  setPicked(food);
                  setServings(1);
                }}
              >
                <span className="choice-copy">
                  <strong>{food.name}</strong>
                  <small>
                    {food.servingSize} · {Math.round(food.calories)} kcal
                  </small>
                </span>
              </button>
            ))}
            {!filtered.length ? <p className="empty-inline">No foods match that search.</p> : null}
          </div>
          <button type="button" className="btn btn-quiet" onClick={onCreate}>
            Create a new food
          </button>
        </>
      )}
    </Sheet>
  );
}

function EditLogSheet({
  entry,
  onClose,
  onSave,
  onDelete,
}: {
  entry: LogEntry;
  onClose: () => void;
  onSave: (servings: number) => void;
  onDelete: () => void;
}) {
  const [servings, setServings] = useState(entry.servings);
  return (
    <Sheet title={entry.name} onClose={onClose}>
      <p className="picker-serving">{entry.servingSize}</p>
      <div className="stepper">
        <button type="button" aria-label="Fewer servings" onClick={() => setServings((value) => Math.max(0.25, Math.round((value - 0.25) * 4) / 4))}>
          <Minus size={18} />
        </button>
        <strong>{formatServings(servings).replace(' servings', '').replace(' serving', '')}</strong>
        <button type="button" aria-label="More servings" onClick={() => setServings((value) => Math.min(8, Math.round((value + 0.25) * 4) / 4))}>
          <Plus size={18} />
        </button>
      </div>
      <p className="picker-macros">
        {formatKcal(entry.calories * servings)} kcal · {Math.round(entry.protein * servings)}p · {Math.round(entry.carbs * servings)}c · {Math.round(entry.fat * servings)}f
      </p>
      <div className="stack">
        <button type="button" className="btn btn-primary" onClick={() => onSave(servings)}>
          Save
        </button>
        <button type="button" className="btn btn-quiet danger-text" onClick={onDelete}>
          Remove from log
        </button>
      </div>
    </Sheet>
  );
}
