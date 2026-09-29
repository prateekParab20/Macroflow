import { useMemo, useState } from 'react';
import { Plus, Search, Star, Utensils } from 'lucide-react';
import { AddFood } from '../components/AddFood';
import { FoodForm } from '../components/FoodForm';
import { RecipeDetail } from '../components/RecipeDetail';
import { RecipeForm } from '../components/RecipeForm';
import { ConfirmDialog, EmptyState, Segmented } from '../components/ui';
import { formatKcal } from '../lib/format';
import { sumMacros } from '../lib/recipe';
import { useStore } from '../state/Store';
import type { Food, Recipe } from '../types';

export function Foods() {
  const { foods, recipes, logs, saveFood, deleteFood, toggleFavorite, saveRecipe, deleteRecipe } = useStore();
  const [section, setSection] = useState<'foods' | 'recipes'>('foods');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Food | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Food | null>(null);
  const [creatingRecipe, setCreatingRecipe] = useState(false);
  const [viewingRecipe, setViewingRecipe] = useState<Recipe | null>(null);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [pendingRecipeDelete, setPendingRecipeDelete] = useState<Recipe | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...foods]
      .filter((food) => !q || food.name.toLowerCase().includes(q))
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name));
  }, [foods, query]);

  const favorites = visible.filter((food) => food.favorite).length;
  const visibleRecipes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...recipes]
      .filter((recipe) => !q || recipe.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [query, recipes]);
  const openRecipe = recipes.find((recipe) => recipe.id === viewingRecipe?.id) ?? null;

  return (
    <div className="page view-enter">
      <header className="page-head">
        <div>
          <h1>{section === 'foods' ? 'Foods' : 'Recipes'}</h1>
          <p>
            {section === 'foods'
              ? `${foods.length} saved${favorites ? ` · ${favorites} starred` : ''}`
              : `${recipes.length} saved`}
          </p>
        </div>
        <button
          type="button"
          className="icon-fab"
          aria-label={section === 'foods' ? 'Add food' : 'Add recipe'}
          onClick={() => (section === 'foods' ? setAdding(true) : setCreatingRecipe(true))}
        >
          <Plus size={22} />
        </button>
      </header>
      <Segmented
        label="Library"
        value={section}
        options={[
          { id: 'foods', label: 'Foods' },
          { id: 'recipes', label: 'Recipes' },
        ]}
        onChange={(next) => {
          setSection(next);
          setQuery('');
        }}
      />
      <label className="search">
        <Search size={16} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={section === 'foods' ? 'Search' : 'Search recipes'}
        />
      </label>
      {section === 'foods' ? (
        <p className="footnote tight">Star foods you actually eat. The weekly plan prefers those, plus anything you’ve logged.</p>
      ) : (
        <p className="footnote tight">A recipe is the whole pot. You log the cooked grams in your bowl.</p>
      )}
      {section === 'recipes' ? (
        visibleRecipes.length ? (
          <div className="group">
            {visibleRecipes.map((recipe) => {
              const totals = sumMacros(recipe.ingredients);
              return (
                <button key={recipe.id} type="button" className="food-main recipe-row" onClick={() => setViewingRecipe(recipe)}>
                  <span className="choice-copy">
                    <span className="name-line">
                      <strong>{recipe.name}</strong>
                      <em className="tag">Recipe</em>
                    </span>
                    <small>
                      {recipe.cookedGrams.toLocaleString()} g cooked · {formatKcal(totals.calories)} kcal
                    </small>
                  </span>
                  <span className="chevron">›</span>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<Utensils size={28} />}
            title={query ? 'No recipes match' : 'No recipes yet'}
            body={query ? 'Try another name.' : 'Weigh the raw ingredients, then the cooked pot, and log a bowl by grams.'}
          />
        )
      ) : (
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
      )}

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

      {creatingRecipe ? (
        <RecipeForm
          foods={foods}
          logs={logs}
          onCancel={() => setCreatingRecipe(false)}
          onSave={(draft) => {
            const saved = saveRecipe(draft);
            setCreatingRecipe(false);
            setViewingRecipe(saved);
          }}
        />
      ) : null}

      {openRecipe ? (
        <div hidden={editingRecipe != null} inert={editingRecipe != null}>
          <RecipeDetail
            recipe={openRecipe}
            onClose={() => setViewingRecipe(null)}
            onEdit={() => setEditingRecipe(openRecipe)}
            onDelete={() => setPendingRecipeDelete(openRecipe)}
          />
        </div>
      ) : null}

      {editingRecipe ? (
        <RecipeForm
          initial={editingRecipe}
          foods={foods}
          logs={logs}
          onCancel={() => setEditingRecipe(null)}
          onSave={(draft) => {
            const saved = saveRecipe(draft);
            setEditingRecipe(null);
            setViewingRecipe(saved);
          }}
        />
      ) : null}

      {pendingRecipeDelete ? (
        <ConfirmDialog
          title={`Delete ${pendingRecipeDelete.name}?`}
          message="Past log entries keep their numbers. The recipe leaves your library."
          confirmLabel="Delete"
          onCancel={() => setPendingRecipeDelete(null)}
          onConfirm={() => {
            deleteRecipe(pendingRecipeDelete.id);
            setPendingRecipeDelete(null);
            setEditingRecipe(null);
            setViewingRecipe(null);
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
