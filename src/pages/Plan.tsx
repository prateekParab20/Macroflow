import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { MacroMeter } from '../components/ui';
import { formatMonthDay, formatWeekday, todayISO } from '../lib/dates';
import { formatKcal, formatServings, mealLabel } from '../lib/format';
import { dayTotals, poolDescription } from '../lib/planner';
import { useStore } from '../state/Store';
import type { MealSlot } from '../types';

const ORDER: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export function Plan() {
  const store = useStore();
  const today = todayISO();
  const plan = store.mealPlan;
  const [selected, setSelected] = useState(today);

  useEffect(() => {
    if (!plan) store.shufflePlan();
  }, [plan, store]);

  if (!store.targets) return null;

  const day = plan?.days.find((item) => item.date === selected) ?? plan?.days[0];
  const activeDate = day?.date ?? selected;
  const totals = day ? dayTotals(day.meals) : null;
  const stale = plan != null && Math.abs(plan.targetCalories - store.targets.calories) >= 40;
  const logged =
    day != null &&
    day.meals.length > 0 &&
    day.meals.every((meal) =>
      store.logs.some((entry) => entry.date === day.date && entry.meal === meal.meal && entry.foodId === meal.foodId),
    );

  return (
    <div className="page view-enter">
      <header className="page-head">
        <div>
          <h1>Plan</h1>
          <p>{plan ? formatRange(plan.weekStart) : 'This week'}</p>
        </div>
        <button type="button" className="text-btn strong" onClick={() => store.shufflePlan(plan?.weekStart)}>
          <RefreshCw size={16} /> Shuffle
        </button>
      </header>

      <p className="footnote tight">{poolDescription(store.foods, store.logs)}</p>
      {stale ? (
        <div className="banner banner-warn">Your calorie target changed. Shuffle to rebuild the week around it.</div>
      ) : null}

      {plan ? (
        <div className="week-strip" role="tablist" aria-label="Days">
          {plan.days.map((item) => {
            const isToday = item.date === today;
            const isSelected = item.date === activeDate;
            return (
              <button
                key={item.date}
                type="button"
                role="tab"
                aria-selected={isSelected}
                className={isToday ? 'day-pill today' : 'day-pill'}
                onClick={() => setSelected(item.date)}
              >
                <span className="dow">{formatWeekday(item.date)}</span>
                <span className="dom">{item.date.slice(-2).replace(/^0/, '')}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="footnote">Building a week from your foods…</p>
      )}

      {day && totals ? (
        <section className="card plan-day">
          <div className="section-head in-card">
            <h2>{day.date === today ? 'Today' : formatWeekday(day.date, 'long')}</h2>
            <span className={fitTone(totals.calories, store.targets.calories)}>{fitText(totals.calories, store.targets.calories)}</span>
          </div>
          <p className="plan-date">{formatMonthDay(day.date)}</p>
          {ORDER.map((meal) => {
            const items = day.meals.filter((item) => item.meal === meal);
            if (!items.length) return null;
            return (
              <div key={meal} className="plan-meal">
                <h3>{mealLabel(meal)}</h3>
                {items.map((item) => (
                  <div key={`${item.meal}-${item.foodId}`} className="plan-item">
                    <span>
                      <strong>{item.name}</strong>
                      <small>
                        {formatServings(item.servings)} · {item.servingSize}
                      </small>
                    </span>
                    <em>{formatKcal(item.calories * item.servings)}</em>
                  </div>
                ))}
              </div>
            );
          })}
          <div className="macro-list">
            <MacroMeter label="Calories" value={totals.calories} target={store.targets.calories} color="var(--blue)" unit=" kcal" />
            <MacroMeter label="Protein" value={totals.protein} target={store.targets.protein} color="var(--pink)" />
            <MacroMeter label="Carbs" value={totals.carbs} target={store.targets.carbs} color="var(--orange)" />
            <MacroMeter label="Fat" value={totals.fat} target={store.targets.fat} color="var(--indigo)" />
          </div>
          {logged ? (
            <p className="logged-note">Logged</p>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => store.applyPlanDay(day.date)}>
              Log this day
            </button>
          )}
        </section>
      ) : null}
    </div>
  );
}

function formatRange(start: string): string {
  const end = new Date(start + 'T12:00:00');
  end.setDate(end.getDate() + 6);
  const startDate = new Date(start + 'T12:00:00');
  const sameMonth = startDate.getMonth() === end.getMonth();
  const left = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(startDate);
  const right = new Intl.DateTimeFormat(undefined, {
    month: sameMonth ? undefined : 'short',
    day: 'numeric',
  }).format(end);
  return `${left} – ${right}`;
}

function fitText(calories: number, target: number): string {
  const delta = Math.round(calories - target);
  const abs = Math.abs(delta);
  if (abs <= 80) return 'On target';
  return delta > 0 ? `${abs} over` : `${abs} under`;
}

function fitTone(calories: number, target: number): string {
  const abs = Math.abs(calories - target);
  if (abs <= 80) return 'fit good';
  if (abs <= 160) return 'fit near';
  return 'fit off';
}
