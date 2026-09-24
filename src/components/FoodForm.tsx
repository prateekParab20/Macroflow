import { useMemo, useState } from 'react';
import { macroMismatch } from '../lib/macros';
import { measureFromServing, portionFromFood } from '../lib/quantity';
import type { FieldKey, FieldConfidence } from '../lib/parseLabel';
import type { Food, NutritionBasis } from '../types';

export interface FoodDraft {
  id?: string;
  name: string;
  servingSize: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  favorite: boolean;
  source: Food['source'];
  basis?: NutritionBasis;
  basisAmount?: number;
  basisUnit?: Food['basisUnit'];
  householdUnit?: string;
  householdCount?: number;
  householdMetric?: number;
}

interface NumericState {
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  fiber: string;
  sugar: string;
  sodium: string;
}

function num(value: number | undefined): string {
  return value == null || Number.isNaN(value) ? '' : String(value);
}

function parseNum(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function FoodForm({
  title,
  initial,
  confidence,
  banner,
  imageUrl,
  rawText,
  submitLabel = 'Save',
  onCancel,
  onSubmit,
  onDelete,
}: {
  title: string;
  initial: Partial<FoodDraft>;
  confidence?: Partial<Record<FieldKey, FieldConfidence>>;
  banner?: { tone: 'ok' | 'warn'; text: string };
  imageUrl?: string;
  rawText?: string;
  submitLabel?: string;
  onCancel: () => void;
  onSubmit: (draft: FoodDraft) => void;
  onDelete?: () => void;
}) {
  const starting = portionFromFood({
    servingSize: initial.servingSize ?? '',
    basis: initial.basis,
    basisAmount: initial.basisAmount,
    basisUnit: initial.basisUnit,
    householdUnit: initial.householdUnit,
    householdCount: initial.householdCount,
    householdMetric: initial.householdMetric,
  });
  const [name, setName] = useState(initial.name ?? '');
  const [servingSize, setServingSize] = useState(initial.servingSize ?? '');
  const [basis, setBasis] = useState<NutritionBasis>(initial.basis ?? starting.basis);
  const [favorite, setFavorite] = useState(initial.favorite ?? false);
  const [fields, setFields] = useState<NumericState>({
    calories: num(initial.calories),
    protein: num(initial.protein),
    carbs: num(initial.carbs),
    fat: num(initial.fat),
    fiber: num(initial.fiber),
    sugar: num(initial.sugar),
    sodium: num(initial.sodium),
  });

  const numbers = useMemo(
    () => ({
      calories: parseNum(fields.calories),
      protein: parseNum(fields.protein) ?? 0,
      carbs: parseNum(fields.carbs) ?? 0,
      fat: parseNum(fields.fat) ?? 0,
      fiber: parseNum(fields.fiber),
      sugar: parseNum(fields.sugar),
      sodium: parseNum(fields.sodium),
    }),
    [fields],
  );

  const mismatch =
    numbers.calories != null ? macroMismatch(numbers.calories, numbers.protein, numbers.carbs, numbers.fat) : null;
  const canSave = name.trim().length > 0 && numbers.calories != null && numbers.calories >= 0;
  const lowCount = Object.values(confidence ?? {}).filter((value) => value === 'low').length;
  const showMissing = confidence != null;

  const setField = (key: keyof NumericState, value: string) => {
    const cleaned = value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    setFields((current) => ({ ...current, [key]: cleaned }));
  };

  const basisNote =
    basis === 'per100g'
      ? 'These numbers are for 100 g. Logging asks for the grams you ate.'
      : basis === 'per100ml'
        ? 'These numbers are for 100 ml. Logging asks for the milliliters you ate.'
        : 'These numbers are for the serving size above. Logging can use grams or the amount printed here.';

  return (
    <div className="modal">
      <header className="modal-bar">
        <button type="button" className="text-btn" onClick={onCancel}>
          Cancel
        </button>
        <h2>{title}</h2>
        <button
          type="button"
          className="text-btn strong"
          disabled={!canSave}
          onClick={() => {
            if (!canSave || numbers.calories == null) return;
            const measured = measureFromServing(basis, servingSize);
            onSubmit({
              id: initial.id,
              name: name.trim(),
              servingSize: measured.servingSize,
              calories: numbers.calories,
              protein: numbers.protein,
              carbs: numbers.carbs,
              fat: numbers.fat,
              fiber: numbers.fiber,
              sugar: numbers.sugar,
              sodium: numbers.sodium,
              favorite,
              source: initial.source ?? 'manual',
              basis: measured.basis,
              basisAmount: measured.basisAmount,
              basisUnit: measured.basisUnit,
              householdUnit: measured.householdUnit,
              householdCount: measured.householdCount,
              householdMetric: measured.householdMetric,
            });
          }}
        >
          {submitLabel}
        </button>
      </header>
      <div className="modal-body">
        {imageUrl ? (
          <div className="scan-preview">
            <img src={imageUrl} alt="Nutrition label you captured" />
            <div>
              <strong>Your photo</strong>
              <p>Compare each field with the panel, then save.</p>
            </div>
          </div>
        ) : null}
        {banner ? (
          <div className={banner.tone === 'ok' ? 'banner banner-ok' : 'banner banner-warn'}>{banner.text}</div>
        ) : null}
        {lowCount ? (
          <p className="footnote tight">
            {lowCount === 1 ? '1 field is uncertain.' : `${lowCount} fields are uncertain.`} Highlighted rows need a look.
          </p>
        ) : null}
        <div className="group">
          <label className={confidence?.name === 'low' ? 'field check' : 'field'}>
            <span className="label">
              Name
              {confidence?.name === 'low' ? <em className="check-tag">Check</em> : null}
            </span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Greek yogurt"
              autoComplete="off"
              enterKeyHint="next"
            />
          </label>
          <label className={confidence?.servingSize === 'low' ? 'field check' : 'field'}>
            <span className="label">
              {basis === 'serving' ? 'Serving' : 'Package serving'}
              {basis !== 'serving' ? <small> Optional</small> : null}
              {confidence?.servingSize === 'low' ? <em className="check-tag">Check</em> : null}
            </span>
            <input
              value={servingSize}
              onChange={(event) => setServingSize(event.target.value)}
              placeholder={basis === 'serving' ? '1 bar (40 g)' : '1 bar (40 g)'}
              autoComplete="off"
            />
          </label>
        </div>
        <div className="segmented basis-segment" role="group" aria-label="These numbers are for">
          <button type="button" aria-pressed={basis === 'serving'} onClick={() => setBasis('serving')}>
            Serving
          </button>
          <button type="button" aria-pressed={basis === 'per100g'} onClick={() => setBasis('per100g')}>
            100 g
          </button>
          <button type="button" aria-pressed={basis === 'per100ml'} onClick={() => setBasis('per100ml')}>
            100 ml
          </button>
        </div>
        <p className="footnote">{basisNote}</p>
        <div className="group">
          <NumberField
            label="Calories"
            suffix="kcal"
            value={fields.calories}
            check={confidence?.calories === 'low'}
            missing={showMissing && fields.calories.trim() === ''}
            onChange={(value) => setField('calories', value)}
          />
          <NumberField
            label="Protein"
            suffix="g"
            value={fields.protein}
            check={confidence?.protein === 'low'}
            missing={showMissing && fields.protein.trim() === ''}
            onChange={(value) => setField('protein', value)}
          />
          <NumberField
            label="Carbs"
            suffix="g"
            value={fields.carbs}
            check={confidence?.carbs === 'low'}
            missing={showMissing && fields.carbs.trim() === ''}
            onChange={(value) => setField('carbs', value)}
          />
          <NumberField
            label="Fat"
            suffix="g"
            value={fields.fat}
            check={confidence?.fat === 'low'}
            missing={showMissing && fields.fat.trim() === ''}
            onChange={(value) => setField('fat', value)}
          />
          <NumberField
            label="Fiber"
            suffix="g"
            optional
            value={fields.fiber}
            check={confidence?.fiber === 'low'}
            onChange={(value) => setField('fiber', value)}
          />
          <NumberField
            label="Sugar"
            suffix="g"
            optional
            value={fields.sugar}
            check={confidence?.sugar === 'low'}
            onChange={(value) => setField('sugar', value)}
          />
          <NumberField
            label="Sodium"
            suffix="mg"
            optional
            value={fields.sodium}
            check={confidence?.sodium === 'low'}
            onChange={(value) => setField('sodium', value)}
          />
        </div>
        {mismatch != null ? (
          <p className="footnote warn">
            Protein, carbs, and fat add up to about {Math.round(numbers.protein * 4 + numbers.carbs * 4 + numbers.fat * 9)}{' '}
            kcal. The calorie field says {Math.round(numbers.calories ?? 0)}. Worth a second look — labels round, but a
            large gap usually means a misread digit.
          </p>
        ) : (
          <p className="footnote">Fiber, sugar, and sodium are optional. Leave them blank if the label doesn’t list them.</p>
        )}
        <button type="button" className={favorite ? 'favorite-row on' : 'favorite-row'} onClick={() => setFavorite((value) => !value)}>
          <span>{favorite ? 'Starred for meal plans' : 'Star as a favorite'}</span>
          <strong>{favorite ? 'On' : 'Off'}</strong>
        </button>
        {rawText ? (
          <details className="raw-text">
            <summary>Recognized text</summary>
            <pre>{rawText}</pre>
          </details>
        ) : null}
        {onDelete ? (
          <button type="button" className="btn btn-quiet danger-text" onClick={onDelete}>
            Delete food
          </button>
        ) : null}
      </div>
    </div>
  );
}

function NumberField({
  label,
  suffix,
  value,
  optional,
  check,
  missing,
  onChange,
}: {
  label: string;
  suffix: string;
  value: string;
  optional?: boolean;
  check?: boolean;
  missing?: boolean;
  onChange: (value: string) => void;
}) {
  const tone = check || missing ? 'field check' : 'field';
  return (
    <label className={tone}>
      <span className="label">
        {label}
        {optional ? <small> Optional</small> : null}
        {check ? <em className="check-tag">Check</em> : null}
        {!check && missing ? <em className="check-tag">Missing</em> : null}
      </span>
      <input
        inputMode="decimal"
        value={value}
        placeholder="0"
        onChange={(event) => onChange(event.target.value)}
        aria-label={`${label} in ${suffix}`}
      />
      <em className="suffix">{suffix}</em>
    </label>
  );
}
