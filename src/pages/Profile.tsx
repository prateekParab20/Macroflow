import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { ConfirmDialog, Segmented } from '../components/ui';
import { ACTIVITY, activityLabel, goalLabel, GOALS } from '../lib/macros';
import { cmToFeetInches, feetInchesToCm, formatHeight, formatWeight, kgToLb, lbToKg, trim } from '../lib/units';
import { useStore } from '../state/Store';
import type { ActivityLevel, Gender, UnitSystem } from '../types';

export function Profile() {
  const { profile, updateProfile, resetAll, targets } = useStore();
  const [confirmReset, setConfirmReset] = useState(false);
  if (!profile || !targets) return null;

  const perKg = profile.goal === 'lose' ? '2.0' : '1.8';

  return (
    <div className="page view-enter">
      <header className="page-head">
        <div>
          <h1>Profile</h1>
          <p>
            {goalLabel(profile.goal)} · {activityLabel(profile.activity)}
          </p>
        </div>
      </header>

      <section className="card hero-card compact">
        <p className="eyebrow">Daily target</p>
        <p className="hero-number">{targets.calories.toLocaleString()}</p>
        <p className="hero-unit">kcal</p>
        <div className="macro-pills">
          <span>Protein {targets.protein}g</span>
          <span>Carbs {targets.carbs}g</span>
          <span>Fat {targets.fat}g</span>
        </div>
      </section>
      {profile.adjustmentNote ? <div className="banner banner-ok">{profile.adjustmentNote}</div> : null}

      <h2 className="section-label">Goal</h2>
      <div className="group">
        {GOALS.map((item) => (
          <button key={item.id} type="button" className="choice" onClick={() => updateProfile({ goal: item.id })}>
            <span className="choice-copy">
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </span>
            {profile.goal === item.id ? <Check size={18} className="check-icon" /> : null}
          </button>
        ))}
      </div>

      <h2 className="section-label">Activity</h2>
      <div className="group">
        {ACTIVITY.map((item) => (
          <button key={item.id} type="button" className="choice" onClick={() => updateProfile({ activity: item.id as ActivityLevel })}>
            <span className="choice-copy">
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </span>
            {profile.activity === item.id ? <Check size={18} className="check-icon" /> : null}
          </button>
        ))}
      </div>

      <h2 className="section-label">Body</h2>
      <BodyEditor />

      <h2 className="section-label">About these numbers</h2>
      <p className="footnote block">
        Maintenance is about {targets.tdee.toLocaleString()} kcal. BMR is {targets.bmr.toLocaleString()} kcal from the
        Mifflin–St Jeor equation
        {profile.goal === 'lose' ? ', then 500 kcal is taken off for the loss goal' : ''}
        {profile.goal === 'gain' ? ', then 400 kcal is added — within the usual 300–500 surplus for a steady gain' : ''}
        {profile.goal === 'maintain' ? ', and the goal stays there' : ''}. Protein is about {perKg} g per kg of body
        weight. Fat is about 25–30% of calories, and carbs fill the rest.
        {targets.floorApplied ? ' The result was kept at a 1,200 kcal minimum.' : ''}
        {targets.adjustment !== 0 ? ` Weigh-ins have shifted it by ${targets.adjustment > 0 ? '+' : ''}${targets.adjustment} kcal.` : ''}
      </p>
      <p className="footnote block">
        MacroFlow is not medical advice and does not diagnose or treat any condition. Talk with a clinician before
        changing how you eat, especially if you are pregnant, managing an illness, or have a history of disordered eating.
      </p>

      <h2 className="section-label">Data</h2>
      <p className="footnote block">Your profile, foods, log, and weigh-ins stay in this browser. Nothing is uploaded.</p>
      <button type="button" className="btn btn-quiet danger-text align-start" onClick={() => setConfirmReset(true)}>
        Reset everything
      </button>

      {confirmReset ? (
        <ConfirmDialog
          title="Reset MacroFlow?"
          message="This clears your profile, foods, log, plan, and weigh-ins on this device."
          confirmLabel="Reset"
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => {
            resetAll();
            setConfirmReset(false);
          }}
        />
      ) : null}
    </div>
  );
}

function initialBody(profile: { age: number; heightCm: number; weightKg: number; unitSystem: UnitSystem } | null) {
  if (!profile) return { age: '', height: '', feet: '', inches: '', weight: '' };
  const imperial = profile.unitSystem === 'imperial';
  const converted = cmToFeetInches(profile.heightCm);
  return {
    age: String(profile.age),
    height: String(Math.round(profile.heightCm)),
    feet: String(converted.feet),
    inches: String(converted.inches),
    weight: imperial ? trim(kgToLb(profile.weightKg), 1) : trim(profile.weightKg, 1),
  };
}

function BodyEditor() {
  const { profile, updateProfile } = useStore();
  const seed = initialBody(profile);
  const [age, setAge] = useState(seed.age);
  const [height, setHeight] = useState(seed.height);
  const [feet, setFeet] = useState(seed.feet);
  const [inches, setInches] = useState(seed.inches);
  const [weight, setWeight] = useState(seed.weight);

  useEffect(() => {
    if (!profile) return;
    setAge(String(profile.age));
    if (profile.unitSystem === 'metric') {
      setHeight(String(Math.round(profile.heightCm)));
    } else {
      const converted = cmToFeetInches(profile.heightCm);
      setFeet(String(converted.feet));
      setInches(String(converted.inches));
    }
    setWeight(profile.unitSystem === 'imperial' ? trim(kgToLb(profile.weightKg), 1) : trim(profile.weightKg, 1));
  }, [profile]);

  if (!profile) return null;

  function changeUnits(next: UnitSystem) {
    if (!profile || next === profile.unitSystem) return;
    updateProfile({ unitSystem: next });
  }

  function commitAge() {
    if (!profile) return;
    const value = Number(age);
    if (!Number.isInteger(value) || value < 16 || value > 90) {
      setAge(String(profile.age));
      return;
    }
    updateProfile({ age: value });
  }

  function commitHeight() {
    if (!profile) return;
    if (profile.unitSystem === 'metric') {
      const cm = Number(height);
      if (!Number.isFinite(cm) || cm < 120 || cm > 230) {
        setHeight(String(Math.round(profile.heightCm)));
        return;
      }
      updateProfile({ heightCm: cm });
      return;
    }
    const cm = feetInchesToCm(Number(feet) || 0, Number(inches) || 0);
    if (cm < 120 || cm > 230) {
      const converted = cmToFeetInches(profile.heightCm);
      setFeet(String(converted.feet));
      setInches(String(converted.inches));
      return;
    }
    updateProfile({ heightCm: cm });
  }

  function commitWeight() {
    if (!profile) return;
    const value = Number(weight);
    const kg = profile.unitSystem === 'imperial' ? lbToKg(value) : value;
    if (!Number.isFinite(kg) || kg < 35 || kg > 250) {
      setWeight(profile.unitSystem === 'imperial' ? trim(kgToLb(profile.weightKg), 1) : trim(profile.weightKg, 1));
      return;
    }
    updateProfile({ weightKg: kg });
  }

  return (
    <>
      <Segmented
        label="Units"
        value={profile.unitSystem}
        onChange={changeUnits}
        options={[
          { id: 'metric' as UnitSystem, label: 'Metric' },
          { id: 'imperial' as UnitSystem, label: 'Imperial' },
        ]}
      />
      <div className="group" style={{ marginTop: 12 }}>
        <div className="field gender-field">
          <span className="label">Gender</span>
          <Segmented
            label="Gender"
            value={profile.gender}
            onChange={(gender: Gender) => updateProfile({ gender })}
            options={[
              { id: 'female', label: 'Female' },
              { id: 'male', label: 'Male' },
            ]}
          />
        </div>
        <label className="field">
          <span className="label">Age</span>
          <input
            inputMode="numeric"
            value={age}
            onChange={(event) => setAge(event.target.value.replace(/\D/g, '').slice(0, 2))}
            onBlur={commitAge}
          />
        </label>
        {profile.unitSystem === 'metric' ? (
          <label className="field">
            <span className="label">Height</span>
            <input
              inputMode="decimal"
              value={height}
              onChange={(event) => setHeight(event.target.value.replace(/[^0-9.]/g, ''))}
              onBlur={commitHeight}
            />
            <em className="suffix">cm</em>
          </label>
        ) : (
          <>
            <label className="field">
              <span className="label">Height</span>
              <input
                inputMode="numeric"
                aria-label="Feet"
                value={feet}
                onChange={(event) => setFeet(event.target.value.replace(/\D/g, '').slice(0, 1))}
                onBlur={commitHeight}
              />
              <em className="suffix">ft</em>
            </label>
            <label className="field">
              <span className="label">Inches</span>
              <input
                inputMode="numeric"
                aria-label="Inches"
                value={inches}
                onChange={(event) => setInches(event.target.value.replace(/\D/g, '').slice(0, 2))}
                onBlur={commitHeight}
              />
              <em className="suffix">in</em>
            </label>
          </>
        )}
        <label className="field">
          <span className="label">Weight</span>
          <input
            inputMode="decimal"
            value={weight}
            onChange={(event) => setWeight(event.target.value.replace(/[^0-9.]/g, ''))}
            onBlur={commitWeight}
          />
          <em className="suffix">{profile.unitSystem === 'imperial' ? 'lb' : 'kg'}</em>
        </label>
      </div>
      <p className="footnote">
        {formatHeight(profile.heightCm, profile.unitSystem)} · {formatWeight(profile.weightKg, profile.unitSystem)}. Changing
        sex, age, size, or goal updates the target immediately.
      </p>
    </>
  );
}
