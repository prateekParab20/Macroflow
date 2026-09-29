import { useMemo, useState } from 'react';
import { Plus, Search, Star } from 'lucide-react';
import { AddFood } from '../components/AddFood';
import { FoodForm } from '../components/FoodForm';
import { ConfirmDialog } from '../components/ui';
import { useStore } from '../state/Store';
import type { Food } from '../types';

export function Foods() {
  const { foods, saveFood, deleteFood, toggleFavorite } = useStore();
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Food | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Food | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...foods]
      .filter((food) => !q || food.name.toLowerCase().includes(q))
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name));
  }, [foods, query]);

  const favorites = visible.filter((food) => food.favorite).length;

  return (
    <div className="page view-enter">
      <header className="page-head">
        <div>
          <h1>Foods</h1>
          <p>
            {foods.length} saved{favorites ? ` · ${favorites} starred` : ''}
          </p>
        </div>
        <button type="button" className="icon-fab" aria-label="Add food" onClick={() => setAdding(true)}>
          <Plus size={22} />
        </button>
      </header>
      <label className="search">
        <Search size={16} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" />
      </label>
      <p className="footnote tight">Star foods you actually eat. The weekly plan prefers those, plus anything you’ve logged.</p>
      <div className="group">
        {visible.map((food) => (
          <div key={food.id} className="food-row">
            <button
              type="button"
              className={food.favorite ? 'icon-btn on' : 'icon-btn'}
              aria-label={food.favorite ? `Unstar ${food.name}` : `Star ${food.name}`}
              onClick={() => toggleFavorite(food.id)}
            >
              <Star size={18} fill={food.favorite ? 'currentColor' : 'none'} />
            </button>
            <button type="button" className="food-main" onClick={() => setEditing(food)}>
              <span className="choice-copy">
                <strong>{food.name}</strong>
                <small>
                  {Math.round(food.calories)} kcal · {trimMacro(food.protein)}p · {trimMacro(food.carbs)}c · {trimMacro(food.fat)}f
                </small>
              </span>
              <span className="chevron">›</span>
            </button>
          </div>
        ))}
        {!visible.length ? <p className="empty-inline">No foods match that search.</p> : null}
      </div>

      {adding ? <AddFood onClose={() => setAdding(false)} onSaveFood={(draft) => saveFood(draft)} /> : null}

      {editing ? (
        <FoodForm
          title="Edit food"
          initial={editing}
          onCancel={() => setEditing(null)}
          onSubmit={(draft) => {
            saveFood(draft);
            setEditing(null);
          }}
          onDelete={() => setPendingDelete(editing)}
          submitLabel="Save"
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title={`Delete ${pendingDelete.name}?`}
          message="Past log entries keep their numbers. The food just leaves your library."
          confirmLabel="Delete"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            deleteFood(pendingDelete.id);
            setPendingDelete(null);
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function trimMacro(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
