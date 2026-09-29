import { useMemo, useState } from 'react';
import { Camera, PenLine, ScanBarcode } from 'lucide-react';
import { mealLabel } from '../lib/format';
import { defaultQuantity, portionFromFood } from '../lib/quantity';
import { foodFromRecipe, sumMacros } from '../lib/recipe';
import type { Food, LogEntry, MealSlot, Recipe } from '../types';
import { FoodForm, type FoodDraft } from './FoodForm';
import { FoodLibrary, type LibraryItem } from './FoodLibrary';
import { QuantityEditor, type QuantityDraft } from './QuantityEditor';
import { ScanLabel } from './ScanLabel';
import { Sheet } from './ui';

export function AddFood({
  meal,
  foods,
  recipes,
  logs,
  onClose,
  onSaveFood,
  onLog,
}: {
  meal?: MealSlot;
  foods?: Food[];
  recipes?: Recipe[];
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

  const recipeList = library ? recipes ?? [] : [];

  const recent = useMemo(() => {
    if (!library || !logs) return [];
    const ids: string[] = [];
    for (let i = logs.length - 1; i >= 0; i -= 1) {
      const id = logs[i].foodId;
      if (!ids.includes(id)) ids.push(id);
      if (ids.length === 8) break;
    }
    const found: ({ kind: 'food'; food: Food } | { kind: 'recipe'; recipe: Recipe })[] = [];
    for (const id of ids) {
      const food = library.find((item) => item.id === id);
      if (food) {
        found.push({ kind: 'food', food });
        continue;
      }
      const recipe = recipeList.find((item) => item.id === id);
      if (recipe) found.push({ kind: 'recipe', recipe });
    }
    return found;
  }, [library, logs, recipeList]);

  const rows = useMemo(() => {
    if (!library) return [];
    const q = query.trim().toLowerCase();
    const foodRows = library
      .filter((food) => !q || food.name.toLowerCase().includes(q))
      .map((food) => ({ kind: 'food' as const, id: food.id, name: food.name, favorite: food.favorite, food }));
    const recipeRows = recipeList
      .filter((recipe) => !q || recipe.name.toLowerCase().includes(q))
      .map((recipe) => ({ kind: 'recipe' as const, id: recipe.id, name: recipe.name, favorite: false, recipe }));
    return [...foodRows, ...recipeRows].sort(
      (a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name),
    );
  }, [library, query, recipeList]);

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

  function pickRecipe(recipe: Recipe) {
    pick(foodFromRecipe(recipe));
  }

  const libraryItems: LibraryItem[] = rows.map((row) =>
    row.kind === 'food'
      ? {
          id: row.food.id,
          name: row.food.name,
          subtitle: `${row.food.servingSize} · ${Math.round(row.food.calories)} kcal`,
          favorite: row.food.favorite,
          onPick: () => pick(row.food),
        }
      : {
          id: row.recipe.id,
          name: row.recipe.name,
          subtitle: `${row.recipe.cookedGrams.toLocaleString()} g cooked · ${Math.round(sumMacros(row.recipe.ingredients).calories)} kcal`,
          tag: 'Recipe',
          onPick: () => pickRecipe(row.recipe),
        },
  );
  const recentItems: LibraryItem[] = recent.map((item) =>
    item.kind === 'food'
      ? {
          id: item.food.id,
          name: item.food.name,
          subtitle: item.food.servingSize,
          favorite: item.food.favorite,
          onPick: () => pick(item.food),
        }
      : {
          id: item.recipe.id,
          name: item.recipe.name,
          subtitle: `${item.recipe.cookedGrams} g cooked`,
          tag: 'Recipe',
          onPick: () => pickRecipe(item.recipe),
        },
  );
  const pendingIsRecipe = pending != null && recipeList.some((recipe) => recipe.id === pending.id);

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
              <FoodLibrary
                items={libraryItems}
                recents={recentItems}
                query={query}
                onQuery={setQuery}
                autoFocus
                emptyLabel="Nothing matches that search."
              />
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
            initial={
              pendingIsRecipe ? { amount: Number.NaN, unit: 'g' } : defaultQuantity(portionFromFood(pending))
            }
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
