import { useMemo, useState } from 'react';
import { Camera, PenLine, ScanBarcode, Search, Star } from 'lucide-react';
import { mealLabel } from '../lib/format';
import { defaultQuantity, portionFromFood } from '../lib/quantity';
import type { Food, LogEntry, MealSlot } from '../types';
import { FoodForm, type FoodDraft } from './FoodForm';
import { QuantityEditor, type QuantityDraft } from './QuantityEditor';
import { ScanLabel } from './ScanLabel';
import { Sheet } from './ui';

export function AddFood({
  meal,
  foods,
  logs,
  onClose,
  onSaveFood,
  onLog,
}: {
  meal?: MealSlot;
  foods?: Food[];
  logs?: LogEntry[];
  onClose: () => void;
  onSaveFood: (draft: FoodDraft) => Food;
  onLog?: (food: Food, draft: QuantityDraft) => void;
}) {
  const [mode, setMode] = useState<'barcode' | 'label' | 'manual' | null>(null);
  const [pending, setPending] = useState<Food | null>(null);
  const [quantity, setQuantity] = useState<QuantityDraft | null>(null);
  const [query, setQuery] = useState('');
  const library = meal && foods ? foods : null;
  const busy = mode !== null || pending !== null;

  const recent = useMemo(() => {
    if (!library || !logs) return [];
    const ids: string[] = [];
    for (let i = logs.length - 1; i >= 0; i -= 1) {
      const id = logs[i].foodId;
      if (!ids.includes(id)) ids.push(id);
      if (ids.length === 8) break;
    }
    return ids.map((id) => library.find((food) => food.id === id)).filter((food): food is Food => !!food);
  }, [library, logs]);

  const filtered = useMemo(() => {
    if (!library) return [];
    const q = query.trim().toLowerCase();
    return [...library]
      .filter((food) => !q || food.name.toLowerCase().includes(q))
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name));
  }, [library, query]);

  function blurField() {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  }

  function openMode(next: 'barcode' | 'label' | 'manual') {
    blurField();
    setMode(next);
  }

  function pick(food: Food) {
    blurField();
    setQuantity(null);
    setPending(food);
  }

  function saved(draft: FoodDraft) {
    const food = onSaveFood(draft);
    if (meal && onLog) {
      setMode(null);
      setQuantity(null);
      setPending(food);
      return;
    }
    onClose();
  }

  return (
    <>
      <div hidden={busy} inert={busy}>
        <Sheet title={library && meal ? mealLabel(meal) : 'Add food'} onClose={onClose}>
          {library ? (
            <>
              <label className="search">
                <Search size={16} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search foods"
                  autoFocus
                />
              </label>
              {!query && recent.length ? (
                <div className="chips" aria-label="Recent foods">
                  {recent.map((food) => (
                    <button key={food.id} type="button" onClick={() => pick(food)}>
                      {food.favorite ? <Star size={12} fill="currentColor" aria-hidden="true" /> : null}
                      {food.name}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="group sheet-group">
                {filtered.map((food) => (
                  <button key={food.id} type="button" className="log-row" onClick={() => pick(food)}>
                    <span className="choice-copy">
                      <strong>{food.name}</strong>
                      <small>
                        {food.servingSize} · {Math.round(food.calories)} kcal
                      </small>
                    </span>
                    {food.favorite ? <Star size={16} className="check-icon" fill="currentColor" aria-hidden="true" /> : null}
                  </button>
                ))}
                {!filtered.length ? <p className="empty-inline">No foods match that search.</p> : null}
              </div>
              <p className="section-label sheet-label">New food</p>
            </>
          ) : null}
          <div className="group sheet-group">
            <button type="button" className="choice" onClick={() => openMode('barcode')}>
              <ScanBarcode size={18} />
              <span className="choice-copy">
                <strong>Barcode</strong>
                <small>Scan the package barcode.</small>
              </span>
              <span className="chevron">›</span>
            </button>
            <button type="button" className="choice" onClick={() => openMode('label')}>
              <Camera size={18} />
              <span className="choice-copy">
                <strong>Label</strong>
                <small>Photo of the nutrition facts.</small>
              </span>
              <span className="chevron">›</span>
            </button>
            <button type="button" className="choice" onClick={() => openMode('manual')}>
              <PenLine size={18} />
              <span className="choice-copy">
                <strong>Manual</strong>
                <small>Type the numbers yourself.</small>
              </span>
              <span className="chevron">›</span>
            </button>
          </div>
        </Sheet>
      </div>
      {mode === 'barcode' || mode === 'label' ? (
        <ScanLabel start={mode} onClose={() => setMode(null)} onSave={saved} />
      ) : null}
      {mode === 'manual' ? (
        <FoodForm
          title="New food"
          initial={{ source: 'manual', favorite: false }}
          submitLabel="Save"
          onCancel={() => setMode(null)}
          onSubmit={saved}
        />
      ) : null}
      {pending && meal && onLog ? (
        <Sheet title={pending.name} onClose={() => setPending(null)}>
          <QuantityEditor
            portion={portionFromFood(pending)}
            base={pending}
            initial={defaultQuantity(portionFromFood(pending))}
            onChange={setQuantity}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={!quantity}
            onClick={() => {
              if (!quantity) return;
              onLog(pending, quantity);
            }}
          >
            Add to {mealLabel(meal).toLowerCase()}
          </button>
        </Sheet>
      ) : null}
    </>
  );
}
