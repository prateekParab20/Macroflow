import { useMemo, useState } from 'react';
import { formatGrams, formatKcal } from '../lib/format';
import { uid } from '../lib/id';
import { cookedNetGrams, macrosForGrams, macrosFromPer100, sumMacros } from '../lib/recipe';
import { useHistoryLayer } from '../lib/useHistoryLayer';
import type { Food, LogEntry, MacroTotals, Recipe, RecipeIngredient } from '../types';
import { FoodLibrary, type LibraryItem } from './FoodLibrary';
import { RecipeCompare } from './RecipeCompare';
import { Sheet } from './ui';

function cleanDecimal(value: string): string {
  return value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
}

function parseGram(value: string, allowZero = false): number | null {
  const text = value.trim();
  if (!text) return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return null;
  if (allowZero ? parsed < 0 : !(parsed > 0)) return null;
  return parsed;
}

function recentFoods(foods: Food[], logs: LogEntry[]): Food[] {
  const ids: string[] = [];
  for (let i = logs.length - 1; i >= 0; i -= 1) {
    const id = logs[i].foodId;
    if (!ids.includes(id)) ids.push(id);
    if (ids.length === 8) break;
  }
  return ids.map((id) => foods.find((food) => food.id === id)).filter((food): food is Food => !!food);
}

export function RecipeForm({
  initial,
  foods,
  logs,
  onCancel,
  onSave,
}: {
  initial?: Recipe;
  foods: Food[];
  logs: LogEntry[];
  onCancel: () => void;
  onSave: (recipe: Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>(initial?.ingredients ?? []);
  const [cookedText, setCookedText] = useState(initial && initial.grossGrams == null ? String(initial.cookedGrams) : '');
  const [potText, setPotText] = useState(initial?.tareGrams != null ? String(initial.tareGrams) : '');
  const [scaleText, setScaleText] = useState(initial?.grossGrams != null ? String(initial.grossGrams) : '');
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [weighing, setWeighing] = useState<Food | null>(null);
  const [gramsText, setGramsText] = useState('');
  const [amountMacros, setAmountMacros] = useState({ calories: '', protein: '', carbs: '', fat: '' });
  const [manual, setManual] = useState(false);
  useHistoryLayer(true, onCancel);

  const pot = parseGram(potText, true);
  const scale = parseGram(scaleText);
  const typedCooked = parseGram(cookedText);
  const usingTare = potText.trim() !== '' && scaleText.trim() !== '';
  const cookedGrams = cookedNetGrams({
    cookedGrams: usingTare ? null : typedCooked,
    grossGrams: usingTare ? scale : null,
    tareGrams: usingTare ? pot : null,
  });
  const totals = sumMacros(ingredients);
  const canSave = name.trim().length > 0 && ingredients.length > 0 && cookedGrams != null;

  const filteredFoods = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...foods]
      .filter((food) => !q || food.name.toLowerCase().includes(q))
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name));
  }, [foods, query]);

  const recents = useMemo(() => recentFoods(foods, logs), [foods, logs]);

  function addIngredient(ingredient: RecipeIngredient) {
    setIngredients((current) => [...current, ingredient]);
    setPicking(false);
    setWeighing(null);
    setManual(false);
    setQuery('');
    setGramsText('');
  }

  function pickFood(food: Food) {
    setGramsText('');
    setAmountMacros({ calories: '', protein: '', carbs: '', fat: '' });
    setWeighing(food);
  }

  const scaled = weighing ? macrosForGrams(weighing, parseGram(gramsText) ?? 0) : null;
  const needsAmountMacros = weighing != null && macrosForGrams(weighing, 1) == null;
  const amountPreview = needsAmountMacros ? macrosFromFields(amountMacros) : scaled;

  function confirmWeighing() {
    if (!weighing) return;
    const grams = parseGram(gramsText);
    if (grams == null || amountPreview == null) return;
    addIngredient({
      id: uid(),
      foodId: weighing.id,
      name: weighing.name,
      grams,
      ...amountPreview,
    });
  }

  function confirmManual(draft: { name: string; grams: number; per100: MacroTotals }) {
    const macros = macrosFromPer100(draft.per100, draft.grams);
    if (!macros) return;
    addIngredient({
      id: uid(),
      name: draft.name,
      grams: draft.grams,
      ...macros,
    });
  }

  const foodItems: LibraryItem[] = filteredFoods.map((food) => ({
    id: food.id,
    name: food.name,
    subtitle: `${food.servingSize} · ${Math.round(food.calories)} kcal`,
    favorite: food.favorite,
    onPick: () => pickFood(food),
  }));
  const recentItems: LibraryItem[] = recents.map((food) => ({
    id: food.id,
    name: food.name,
    subtitle: food.servingSize,
    favorite: food.favorite,
    onPick: () => pickFood(food),
  }));

  const busy = picking || manual;
  const pickerBusy = weighing !== null || manual;

  return (
    <>
      <div hidden={busy} inert={busy}>
        <div className="modal">
          <header className="modal-bar">
            <button type="button" className="text-btn" onClick={onCancel}>
              Cancel
            </button>
            <h2>{initial ? 'Edit recipe' : 'New recipe'}</h2>
            <button
              type="button"
              className="text-btn strong"
              disabled={!canSave}
              onClick={() => {
                if (!canSave || cookedGrams == null) return;
                onSave({
                  id: initial?.id,
                  name: name.trim(),
                  ingredients,
                  cookedGrams,
                  tareGrams: usingTare && pot != null ? pot : undefined,
                  grossGrams: usingTare && scale != null ? scale : undefined,
                });
              }}
            >
              Save
            </button>
          </header>
          <div className="modal-body">
            <div className="group">
              <label className="field">
                <span className="label">Name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Chana masala"
                  autoComplete="off"
                  enterKeyHint="next"
                />
              </label>
            </div>

            <p className="section-label sheet-label">Ingredients</p>
            {ingredients.length ? (
              <div className="group">
                {ingredients.map((ingredient) => (
                  <div key={ingredient.id} className="log-row static">
                    <span className="choice-copy">
                      <strong>{ingredient.name}</strong>
                      <small>
                        {formatGrams(ingredient.grams)} g · {formatKcal(ingredient.calories)} kcal
                      </small>
                    </span>
                    <button
                      type="button"
                      className="text-btn"
                      onClick={() => setIngredients((current) => current.filter((item) => item.id !== ingredient.id))}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="footnote">Add each raw ingredient with its weight. 250 g chickpeas, 15 g oil, 150 g onion.</p>
            )}
            <button type="button" className="btn btn-secondary" onClick={() => setPicking(true)}>
              Add ingredient
            </button>

            <p className="section-label sheet-label">Whole pot</p>
            <div className="totals" aria-label="Recipe totals">
              <div>
                <strong>{formatKcal(totals.calories)}</strong>
                <span>kcal</span>
              </div>
              <div>
                <strong>{formatGrams(totals.protein)}</strong>
                <span>protein</span>
              </div>
              <div>
                <strong>{formatGrams(totals.carbs)}</strong>
                <span>carbs</span>
              </div>
              <div>
                <strong>{formatGrams(totals.fat)}</strong>
                <span>fat</span>
              </div>
            </div>

            <div className="group">
              <GramField
                label="Scale reading"
                optional
                value={scaleText}
                onChange={setScaleText}
              />
              <GramField label="Pot weight" optional value={potText} onChange={setPotText} />
              <GramField
                label="Cooked weight"
                value={usingTare && cookedGrams != null ? String(cookedGrams) : cookedText}
                readOnly={usingTare}
                onChange={setCookedText}
              />
            </div>
            <p className="footnote">
              {usingTare && cookedGrams == null
                ? 'The pot weighs at least as much as the scale reading.'
                : 'Cooked weight is what is in the pot after cooking. If you weigh it on the pot, enter the scale reading and the empty pot.'}
            </p>
            <p className="footnote">Meals you already logged keep their numbers when you cook this again.</p>

            {ingredients.length ? <RecipeCompare ingredients={ingredients} cookedGrams={cookedGrams} /> : null}
          </div>
        </div>
      </div>

      {picking ? (
        <div hidden={pickerBusy} inert={pickerBusy}>
          <Sheet title="Ingredient" onClose={() => setPicking(false)}>
            <FoodLibrary
              items={foodItems}
              recents={recentItems}
              query={query}
              onQuery={setQuery}
              autoFocus
            />
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => {
                setManual(true);
              }}
            >
              Enter manually
            </button>
          </Sheet>
        </div>
      ) : null}

      {weighing ? (
        <Sheet title={weighing.name} onClose={() => setWeighing(null)}>
          <div className="group">
            <GramField label="Raw weight" value={gramsText} onChange={setGramsText} autoFocus />
          </div>
          {needsAmountMacros ? (
            <>
              <p className="footnote">This food isn’t stored by weight. Enter the macros for the amount you used.</p>
              <MacroFields value={amountMacros} onChange={setAmountMacros} />
            </>
          ) : null}
          <p className="picker-macros">
            {amountPreview
              ? `${formatKcal(amountPreview.calories)} kcal · ${formatGrams(amountPreview.protein)}p · ${formatGrams(amountPreview.carbs)}c · ${formatGrams(amountPreview.fat)}f`
              : 'Enter the raw weight.'}
          </p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={parseGram(gramsText) == null || amountPreview == null}
            onClick={confirmWeighing}
          >
            Add to recipe
          </button>
        </Sheet>
      ) : null}

      {manual ? (
        <ManualIngredient
          onCancel={() => setManual(false)}
          onAdd={confirmManual}
        />
      ) : null}
    </>
  );
}

function GramField({
  label,
  value,
  onChange,
  optional,
  readOnly,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
  readOnly?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <label className="field">
      <span className="label">
        {label}
        {optional ? <small> Optional</small> : null}
      </span>
      <input
        inputMode="decimal"
        value={value}
        readOnly={readOnly}
        autoFocus={autoFocus}
        autoComplete="off"
        placeholder="0"
        aria-label={label}
        onChange={(event) => onChange(cleanDecimal(event.target.value))}
      />
      <em className="suffix">g</em>
    </label>
  );
}

function MacroFields({
  value,
  onChange,
  suffixNote,
}: {
  value: { calories: string; protein: string; carbs: string; fat: string };
  onChange: (value: { calories: string; protein: string; carbs: string; fat: string }) => void;
  suffixNote?: string;
}) {
  const fields: { key: keyof typeof value; label: string; suffix: string }[] = [
    { key: 'calories', label: 'Calories', suffix: 'kcal' },
    { key: 'protein', label: 'Protein', suffix: 'g' },
    { key: 'carbs', label: 'Carbs', suffix: 'g' },
    { key: 'fat', label: 'Fat', suffix: 'g' },
  ];
  return (
    <div className="group">
      {fields.map((field) => (
        <label key={field.key} className="field">
          <span className="label">
            {field.label}
            {suffixNote ? <small> {suffixNote}</small> : null}
          </span>
          <input
            inputMode="decimal"
            value={value[field.key]}
            placeholder="0"
            autoComplete="off"
            aria-label={suffixNote ? `${field.label} ${suffixNote}` : field.label}
            onChange={(event) => onChange({ ...value, [field.key]: cleanDecimal(event.target.value) })}
          />
          <em className="suffix">{field.suffix}</em>
        </label>
      ))}
    </div>
  );
}

function macrosFromFields(value: { calories: string; protein: string; carbs: string; fat: string }): MacroTotals | null {
  const calories = value.calories.trim() === '' ? 0 : Number(value.calories);
  const protein = value.protein.trim() === '' ? 0 : Number(value.protein);
  const carbs = value.carbs.trim() === '' ? 0 : Number(value.carbs);
  const fat = value.fat.trim() === '' ? 0 : Number(value.fat);
  if (![calories, protein, carbs, fat].every((item) => Number.isFinite(item) && item >= 0)) return null;
  return { calories, protein, carbs, fat };
}

function ManualIngredient({
  onCancel,
  onAdd,
}: {
  onCancel: () => void;
  onAdd: (draft: { name: string; grams: number; per100: MacroTotals }) => void;
}) {
  const [name, setName] = useState('');
  const [gramsText, setGramsText] = useState('');
  const [per100, setPer100] = useState({ calories: '', protein: '', carbs: '', fat: '' });
  useHistoryLayer(true, onCancel);
  const grams = parseGram(gramsText);
  const macros = macrosFromFields(per100);
  const preview = grams != null && macros ? macrosFromPer100(macros, grams) : null;
  const canAdd = name.trim().length > 0 && preview != null;

  return (
    <div className="modal">
      <header className="modal-bar">
        <button type="button" className="text-btn" onClick={onCancel}>
          Cancel
        </button>
        <h2>Manual</h2>
        <button
          type="button"
          className="text-btn strong"
          disabled={!canAdd}
          onClick={() => {
            if (!canAdd || grams == null || macros == null) return;
            onAdd({ name: name.trim(), grams, per100: macros });
          }}
        >
          Add
        </button>
      </header>
      <div className="modal-body">
        <div className="group">
          <label className="field">
            <span className="label">Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Toor dal"
              autoComplete="off"
              autoFocus
            />
          </label>
          <GramField label="Raw weight" value={gramsText} onChange={setGramsText} />
        </div>
        <p className="section-label sheet-label">Per 100 g</p>
        <MacroFields value={per100} onChange={setPer100} suffixNote="per 100 g" />
        <p className="picker-macros">
          {preview
            ? `${formatKcal(preview.calories)} kcal · ${formatGrams(preview.protein)}p · ${formatGrams(preview.carbs)}c · ${formatGrams(preview.fat)}f in this amount`
            : 'These numbers are for 100 g. The pot uses the weight above.'}
        </p>
      </div>
    </div>
  );
}
