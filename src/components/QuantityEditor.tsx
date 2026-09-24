import { useEffect, useRef, useState } from 'react';
import { formatGrams, formatKcal } from '../lib/format';
import {
  baselineLabel,
  convertQuantity,
  formatAmount,
  parseAmount,
  portionHint,
  scaleForQuantity,
  unitChoices,
  type Portion,
  type QuantityInput,
} from '../lib/quantity';

export interface QuantityDraft {
  amount: number;
  unit: string;
  scale: number;
}

export function QuantityEditor({
  portion,
  base,
  initial,
  onChange,
}: {
  portion: Portion;
  base: { calories: number; protein: number; carbs: number; fat: number };
  initial: QuantityInput;
  onChange: (draft: QuantityDraft | null) => void;
}) {
  const choices = unitChoices(portion);
  const [unit, setUnit] = useState(initial.unit);
  const [text, setText] = useState(formatAmount(initial.amount));
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const amount = parseAmount(text);
  const scale = amount != null ? scaleForQuantity(portion, { amount, unit }) : null;
  const hint = portionHint(portion);

  useEffect(() => {
    if (amount == null || scale == null) onChangeRef.current(null);
    else onChangeRef.current({ amount, unit, scale });
  }, [amount, scale, unit]);

  function selectUnit(next: string) {
    if (next === unit) return;
    const current = parseAmount(text);
    if (current == null) {
      setUnit(next);
      return;
    }
    const converted = convertQuantity(portion, { amount: current, unit }, next);
    setUnit(converted.unit);
    setText(formatAmount(converted.amount));
  }

  return (
    <div className="quantity-block">
      <p className="eyebrow">Amount you ate</p>
      <div className="quantity-row">
        <input
          inputMode={unit === 'g' || unit === 'ml' ? 'decimal' : 'text'}
          aria-label="Amount you ate"
          value={text}
          autoComplete="off"
          onChange={(event) => setText(event.target.value.replace(/[^0-9./\s]/g, '').slice(0, 12))}
        />
        {choices.length === 1 ? <span className="quantity-unit">{choices[0].label}</span> : null}
      </div>
      {choices.length > 1 ? (
        <div className="segmented quantity-units" role="group" aria-label="Unit">
          {choices.map((choice) => (
            <button key={choice.id} type="button" aria-pressed={unit === choice.id} onClick={() => selectUnit(choice.id)}>
              {choice.label}
            </button>
          ))}
        </div>
      ) : null}
      <p className="quantity-basis">{baselineLabel(portion, base.calories)}</p>
      {hint ? <p className="quantity-basis">{hint}</p> : null}
      {scale != null && amount != null ? (
        <p className="picker-macros">
          {formatKcal(base.calories * scale)} kcal · {formatGrams(base.protein * scale)}p · {formatGrams(base.carbs * scale)}c ·{' '}
          {formatGrams(base.fat * scale)}f
        </p>
      ) : (
        <p className="footnote tight">Enter the grams, milliliters, or the amount printed on the label.</p>
      )}
    </div>
  );
}
