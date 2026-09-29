import { formatGrams, formatKcal } from '../lib/format';
import { per100Cooked, rawGrams, servingFromBatch, sumMacros } from '../lib/recipe';
import type { MacroTotals, RecipeIngredient } from '../types';

function lines(macros: MacroTotals) {
  return [
    `${formatKcal(macros.calories)} kcal`,
    `${formatGrams(macros.protein)} g protein`,
    `${formatGrams(macros.carbs)} g carbs`,
    `${formatGrams(macros.fat)} g fat`,
  ];
}

function weightLabel(grams: number): string {
  const rounded = Math.round(grams * 10) / 10;
  const text = Number.isInteger(rounded)
    ? rounded.toLocaleString()
    : rounded.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return `${text} g`;
}

export function RecipeCompare({
  ingredients,
  cookedGrams,
}: {
  ingredients: RecipeIngredient[];
  cookedGrams: number | null;
}) {
  const totals = sumMacros(ingredients);
  const raw = rawGrams(ingredients);
  const per100 = cookedGrams != null && cookedGrams > 0 ? per100Cooked(totals, cookedGrams) : null;
  const perGram = cookedGrams != null && cookedGrams > 0 ? servingFromBatch(totals, cookedGrams, 1) : null;

  return (
    <div>
      <div className="compare">
        <article>
          <h3>Raw</h3>
          <p className="weight">{ingredients.length ? weightLabel(raw) : '—'}</p>
          {lines(totals).map((line) => (
            <p key={line}>{line}</p>
          ))}
        </article>
        <article>
          <h3>Cooked</h3>
          <p className="weight">{cookedGrams != null && cookedGrams > 0 ? weightLabel(cookedGrams) : '—'}</p>
          {cookedGrams != null && cookedGrams > 0 ? (
            lines(totals).map((line) => <p key={line}>{line}</p>)
          ) : (
            <p>Enter the cooked weight.</p>
          )}
        </article>
      </div>
      <div className="card per-cooked">
        <h3>Per 100 g cooked</h3>
        {per100 ? (
          <>
            {lines(per100).map((line) => (
              <p key={line}>{line}</p>
            ))}
            {perGram ? (
              <p className="per-gram">
                Per gram: {trim(perGram.calories)} kcal · {trim(perGram.protein)}p · {trim(perGram.carbs)}c · {trim(perGram.fat)}f
              </p>
            ) : null}
          </>
        ) : (
          <p>Needs a cooked weight above 0 g.</p>
        )}
      </div>
    </div>
  );
}

function trim(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return rounded.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
