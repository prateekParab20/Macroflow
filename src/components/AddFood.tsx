import { useState } from 'react';
import { Camera, PenLine, ScanBarcode } from 'lucide-react';
import { mealLabel } from '../lib/format';
import { defaultQuantity, portionFromFood } from '../lib/quantity';
import type { Food, MealSlot } from '../types';
import { FoodForm, type FoodDraft } from './FoodForm';
import { QuantityEditor, type QuantityDraft } from './QuantityEditor';
import { ScanLabel } from './ScanLabel';
import { Sheet } from './ui';

export function AddFood({
  meal,
  onClose,
  onSaveFood,
  onLog,
}: {
  meal?: MealSlot;
  onClose: () => void;
  onSaveFood: (draft: FoodDraft) => Food;
  onLog?: (food: Food, draft: QuantityDraft) => void;
}) {
  const [mode, setMode] = useState<'barcode' | 'label' | 'manual' | null>(null);
  const [pending, setPending] = useState<Food | null>(null);
  const [quantity, setQuantity] = useState<QuantityDraft | null>(null);
  const busy = mode !== null || pending !== null;

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
        <Sheet title="Add food" onClose={onClose}>
          <div className="group sheet-group">
            <button type="button" className="choice" onClick={() => setMode('barcode')}>
              <ScanBarcode size={18} />
              <span className="choice-copy">
                <strong>Barcode</strong>
                <small>Scan the package barcode.</small>
              </span>
              <span className="chevron">›</span>
            </button>
            <button type="button" className="choice" onClick={() => setMode('label')}>
              <Camera size={18} />
              <span className="choice-copy">
                <strong>Label</strong>
                <small>Photo of the nutrition facts.</small>
              </span>
              <span className="chevron">›</span>
            </button>
            <button type="button" className="choice" onClick={() => setMode('manual')}>
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
