import { formatGrams, formatKcal } from '../lib/format';
import { useHistoryLayer } from '../lib/useHistoryLayer';
import type { Recipe } from '../types';
import { RecipeCompare } from './RecipeCompare';

export function RecipeDetail({
  recipe,
  onClose,
  onEdit,
  onDelete,
}: {
  recipe: Recipe;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  useHistoryLayer(true, onClose);
  return (
    <div className="modal">
      <header className="modal-bar">
        <button type="button" className="text-btn" onClick={onClose}>
          Close
        </button>
        <h2>{recipe.name}</h2>
        <button type="button" className="text-btn strong" onClick={onEdit}>
          Edit
        </button>
      </header>
      <div className="modal-body">
        <RecipeCompare ingredients={recipe.ingredients} cookedGrams={recipe.cookedGrams} />
        {recipe.grossGrams != null && recipe.tareGrams != null ? (
          <p className="footnote">
            {formatGrams(recipe.grossGrams)} g on the scale, pot {formatGrams(recipe.tareGrams)} g.
          </p>
        ) : null}
        <p className="section-label sheet-label">Ingredients</p>
        <div className="group">
          {recipe.ingredients.map((ingredient) => (
            <div key={ingredient.id} className="log-row static">
              <span className="choice-copy">
                <strong>{ingredient.name}</strong>
                <small>
                  {formatGrams(ingredient.grams)} g · {formatKcal(ingredient.calories)} kcal · {formatGrams(ingredient.protein)}p
                </small>
              </span>
            </div>
          ))}
        </div>
        <p className="footnote">Editing this recipe, or cooking it again at a new weight, does not change meals you already logged.</p>
        <button type="button" className="btn btn-quiet danger-text" onClick={onDelete}>
          Delete recipe
        </button>
      </div>
    </div>
  );
}
