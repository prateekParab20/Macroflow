import { useMemo, useState, type ReactNode } from 'react';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { Segmented } from '../components/ui';
import { ACTIVITY, activityLabel, computeTargets, goalLabel } from '../lib/macros';
import { cmToFeetInches, feetInchesToCm, kgToLb, lbToKg, trim } from '../lib/units';
import { useStore } from '../state/Store';
import type { ActivityLevel, Gender, Goal, Profile, UnitSystem } from '../types';

const STEPS = ['welcome', 'body', 'goal', 'activity', 'review'] as const;

export function Onboarding() {
  const { completeOnboarding } = useStore();
  const [step, setStep] = useState(0);
  const [gender, setGender] = useState<Gender>('female');
  const [age, setAge] = useState('30');
  const [units, setUnits] = useState<UnitSystem>('metric');
  const [heightCm, setHeightCm] = useState('165');
  const [feet, setFeet] = useState('5');
  const [inches, setInches] = useState('5');
  const [weight, setWeight] = useState('65');
  const [goal, setGoal] = useState<Goal>('lose');
  const [activity, setActivity] = useState<ActivityLevel>('sedentary');
  const [error, setError] = useState('');

  const heightValue = units === 'metric' ? Number(heightCm) : feetInchesToCm(Number(feet) || 0, Number(inches) || 0);
  const weightKg = units === 'metric' ? Number(weight) : lbToKg(Number(weight) || 0);

  const draft = useMemo<Profile | null>(() => {
    if (!Number.isFinite(heightValue) || !Number.isFinite(weightKg) || !Number.isFinite(Number(age))) return null;
    return {
      gender,
      age: Number(age),
      heightCm: heightValue,
      weightKg,
      goal,
      activity,
      unitSystem: units,
      createdAt: '',
      calorieAdjustment: 0,
    };
  }, [activity, age, gender, goal, heightValue, units, weightKg]);

  const targets = draft ? computeTargets(draft) : null;

  function changeUnits(next: UnitSystem) {
    if (next === units) return;
    const currentWeight = Number(weight);
    if (Number.isFinite(currentWeight) && currentWeight > 0) {
      const kg = units === 'imperial' ? lbToKg(currentWeight) : currentWeight;
      setWeight(next === 'imperial' ? trim(kgToLb(kg), 1) : trim(kg, 1));
    }
    if (next === 'imperial') {
      const cm = Number(heightCm);
      if (Number.isFinite(cm) && cm > 0) {
        const converted = cmToFeetInches(cm);
        setFeet(String(converted.feet));
        setInches(String(converted.inches));
      }
    } else {
      setHeightCm(String(Math.round(feetInchesToCm(Number(feet) || 0, Number(inches) || 0))));
    }
    setUnits(next);
    setError('');
  }

  function validateBody(): boolean {
    const ageNum = Number(age);
    if (!Number.isInteger(ageNum) || ageNum < 16 || ageNum > 90) {
      setError('Enter an age from 16 to 90.');
      return false;
    }
    if (!Number.isFinite(heightValue) || heightValue < 120 || heightValue > 230) {
      setError('Enter a height between 120 and 230 cm.');
      return false;
    }
    if (!Number.isFinite(weightKg) || weightKg < 35 || weightKg > 250) {
      setError('Enter a weight between 35 and 250 kg.');
      return false;
    }
    setError('');
    return true;
  }

  function next() {
    if (STEPS[step] === 'body' && !validateBody()) return;
    setStep((value) => Math.min(value + 1, STEPS.length - 1));
  }

  function finish() {
    if (!draft || !validateBody()) {
      setStep(1);
      return;
    }
    completeOnboarding(draft);
  }

  return (
    <div className="onboard">
      <div className="dots" aria-hidden="true">
        {STEPS.map((id, index) => (
          <i key={id} className={index === step ? 'on' : undefined} />
        ))}
      </div>
      <div className="grow view-enter" key={STEPS[step]}>
        {STEPS[step] === 'welcome' ? <Welcome /> : null}
        {STEPS[step] === 'body' ? (
          <section>
            <h1>About you</h1>
            <p className="lede">A few measurements so the day has a target. You can change these later.</p>
            <div className="stack-sm">
              <span className="field-caption">Gender</span>
              <Segmented
                label="Gender"
                value={gender}
                onChange={setGender}
                options={[
                  { id: 'female', label: 'Female' },
                  { id: 'male', label: 'Male' },
                ]}
              />
              <p className="footnote tight">Used by the Mifflin–St Jeor equation. It only has these two formulas.</p>
            </div>
            <div className="group">
              <label className="field">
                <span className="label">Age</span>
                <input inputMode="numeric" value={age} onChange={(event) => setAge(event.target.value.replace(/\D/g, '').slice(0, 2))} />
              </label>
            </div>
            <div className="stack-sm">
              <span className="field-caption">Units</span>
              <Segmented
                label="Units"
                value={units}
                onChange={changeUnits}
                options={[
                  { id: 'metric', label: 'Metric' },
                  { id: 'imperial', label: 'Imperial' },
                ]}
              />
            </div>
            <div className="group">
              {units === 'metric' ? (
                <label className="field">
                  <span className="label">Height</span>
                  <input inputMode="decimal" value={heightCm} onChange={(event) => setHeightCm(event.target.value.replace(/[^0-9.]/g, ''))} />
                  <em className="suffix">cm</em>
                </label>
              ) : (
                <>
                  <label className="field">
                    <span className="label">Height</span>
                    <input inputMode="numeric" value={feet} onChange={(event) => setFeet(event.target.value.replace(/\D/g, '').slice(0, 1))} aria-label="Feet" />
                    <em className="suffix">ft</em>
                  </label>
                  <label className="field">
                    <span className="label">Inches</span>
                    <input inputMode="numeric" value={inches} onChange={(event) => setInches(event.target.value.replace(/\D/g, '').slice(0, 2))} aria-label="Inches" />
                    <em className="suffix">in</em>
                  </label>
                </>
              )}
              <label className="field">
                <span className="label">Weight</span>
                <input inputMode="decimal" value={weight} onChange={(event) => setWeight(event.target.value.replace(/[^0-9.]/g, ''))} />
                <em className="suffix">{units === 'metric' ? 'kg' : 'lb'}</em>
              </label>
            </div>
            {error ? <p className="footnote warn">{error}</p> : null}
          </section>
        ) : null}
        {STEPS[step] === 'goal' ? (
          <section>
            <h1>Your goal</h1>
            <p className="lede">This sets the calorie target. Protein stays high either way.</p>
            <div className="stack">
              <GoalButton id="lose" current={goal} onSelect={setGoal} icon={<TrendingDown size={18} />} title="Lose weight" detail="About 500 kcal below maintenance." />
              <GoalButton id="maintain" current={goal} onSelect={setGoal} icon={<Minus size={18} />} title="Maintain" detail="Stay near the weight you are now." />
              <GoalButton id="gain" current={goal} onSelect={setGoal} icon={<TrendingUp size={18} />} title="Gain weight" detail="A steady 400 kcal surplus." />
            </div>
          </section>
        ) : null}
        {STEPS[step] === 'activity' ? (
          <section>
            <h1>Activity</h1>
            <p className="lede">Optional. Skip this and we’ll assume a mostly sedentary day.</p>
            <div className="group">
              {ACTIVITY.map((item) => (
                <button key={item.id} type="button" className="choice" onClick={() => setActivity(item.id)}>
                  <span className="choice-copy">
                    <strong>{item.label}</strong>
                    <small>{item.detail}</small>
                  </span>
                  {activity === item.id ? <span className="check">✓</span> : <span className="check off" />}
                </button>
              ))}
            </div>
          </section>
        ) : null}
        {STEPS[step] === 'review' && targets ? (
          <section>
            <h1>Your day</h1>
            <p className="lede">
              {goalLabel(goal)} · {activityLabel(activity)}
            </p>
            <div className="card hero-card">
              <p className="eyebrow">Daily target</p>
              <p className="hero-number">{targets.calories.toLocaleString()}</p>
              <p className="hero-unit">kcal</p>
              <div className="macro-pills">
                <span>Protein {targets.protein}g</span>
                <span>Carbs {targets.carbs}g</span>
                <span>Fat {targets.fat}g</span>
              </div>
            </div>
            <p className="footnote">
              Maintenance is about {targets.tdee.toLocaleString()} kcal from Mifflin–St Jeor and your activity.
              {goal === 'lose' ? ' The goal takes 500 kcal off that.' : null}
              {goal === 'gain' ? ' The goal adds 400 kcal, within the usual 300–500 range for a steady gain.' : null}
              {goal === 'maintain' ? ' The goal stays at maintenance.' : null}
              {targets.floorApplied ? ' The result was kept at a 1,200 kcal minimum.' : null} This is an estimate, not medical advice.
            </p>
          </section>
        ) : null}
      </div>
      <div className="onboard-actions">
        {step > 0 ? (
          <button type="button" className="btn btn-quiet" onClick={() => setStep((value) => value - 1)}>
            Back
          </button>
        ) : null}
        {STEPS[step] === 'activity' ? (
          <button type="button" className="btn btn-secondary" onClick={() => { setActivity('sedentary'); setStep(4); }}>
            Skip for now
          </button>
        ) : null}
        {STEPS[step] === 'review' ? (
          <button type="button" className="btn btn-primary" onClick={finish}>
            Start tracking
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={next}>
            Continue
          </button>
        )}
      </div>
    </div>
  );
}

function Welcome() {
  return (
    <section className="welcome">
      <div className="mark" aria-hidden="true">
        <svg viewBox="0 0 80 80" width="72" height="72">
          <circle cx="40" cy="40" r="28" fill="none" stroke="var(--track)" strokeWidth="6" />
          <circle
            cx="40"
            cy="40"
            r="28"
            fill="none"
            stroke="var(--blue)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray="120 56"
            transform="rotate(-90 40 40)"
          />
        </svg>
      </div>
      <h1>MacroFlow</h1>
      <p className="lede">A calm place for meals, macros, and the week ahead.</p>
      <p className="footnote">Everything stays on this device. No account, no cloud.</p>
    </section>
  );
}

function GoalButton({
  id,
  current,
  onSelect,
  icon,
  title,
  detail,
}: {
  id: Goal;
  current: Goal;
  onSelect: (goal: Goal) => void;
  icon: ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <button type="button" className={current === id ? 'goal-card on' : 'goal-card'} onClick={() => onSelect(id)} aria-pressed={current === id}>
      <span className="goal-icon">{icon}</span>
      <span className="choice-copy">
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
    </button>
  );
}
