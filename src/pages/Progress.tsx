import { useMemo, useState } from 'react';
import { Scale } from 'lucide-react';
import { EmptyState, Sheet } from '../components/ui';
import { daysBetween, formatMonthDay, todayISO } from '../lib/dates';
import { formatWeight, kgToLb, lbToKg } from '../lib/units';
import { useStore } from '../state/Store';

export function Progress() {
  const { profile, weighIns, addWeighIn, deleteWeighIn, targets } = useStore();
  const [open, setOpen] = useState(false);
  if (!profile || !targets) return null;

  const sorted = [...weighIns].sort((a, b) => a.date.localeCompare(b.date));
  const summary = trendSentence(sorted, profile.unitSystem);

  return (
    <div className="page view-enter">
      <header className="page-head">
        <div>
          <h1>Progress</h1>
          <p>Weekly weigh-ins are enough</p>
        </div>
      </header>

      <section className="card weight-card">
        <p className="eyebrow">Current weight</p>
        <p className="hero-number">{formatWeight(profile.weightKg, profile.unitSystem)}</p>
        {summary ? <p className="hero-sub">{summary}</p> : <p className="hero-sub">Log a weight to start the trend.</p>}
        {sorted.length ? <TrendChart points={sorted.map((item) => ({ weightKg: item.weightKg }))} /> : null}
        <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
          Log weight
        </button>
      </section>

      {profile.adjustmentNote ? <div className="banner banner-ok">{profile.adjustmentNote}</div> : null}

      {sorted.length ? (
        <div className="group">
          {[...sorted].reverse().map((item) => (
            <div key={item.id} className="log-row static">
              <span className="choice-copy">
                <strong>{formatWeight(item.weightKg, profile.unitSystem)}</strong>
                <small>
                  {formatMonthDay(item.date)}
                  {item.note ? ` · ${item.note}` : ''}
                </small>
              </span>
              <button type="button" className="text-btn danger-text" onClick={() => deleteWeighIn(item.id)}>
                Delete
              </button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Scale size={22} />}
          title="No weigh-ins yet"
          body="A weekly check-in is enough to see whether the calorie target still fits your goal."
        />
      )}

      {open ? (
        <WeighInSheet
          units={profile.unitSystem}
          onClose={() => setOpen(false)}
          onSave={(weightKg, note) => {
            addWeighIn({ date: todayISO(), weightKg, note });
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function trendSentence(
  sorted: { date: string; weightKg: number }[],
  units: 'metric' | 'imperial',
): string | null {
  if (sorted.length < 2) return null;
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const days = daysBetween(first.date, last.date);
  if (days <= 0) return null;
  const delta = last.weightKg - first.weightKg;
  const weekly = (delta / days) * 7;
  if (Math.abs(delta) < 0.05) return `Steady over ${days} days`;
  const direction = delta < 0 ? 'Down' : 'Up';
  return `${direction} ${formatWeight(Math.abs(delta), units)} in ${days} days · ${formatWeight(Math.abs(weekly), units)} / week`;
}

function TrendChart({ points }: { points: { weightKg: number }[] }) {
  const geometry = useMemo(() => {
    const width = 320;
    const height = 128;
    const pad = 12;
    const weights = points.map((point) => point.weightKg);
    let min = Math.min(...weights);
    let max = Math.max(...weights);
    if (max - min < 0.8) {
      min -= 0.4;
      max += 0.4;
    } else {
      const slack = (max - min) * 0.25;
      min -= slack;
      max += slack;
    }
    const coords = points.map((point, index) => {
      const x = pad + (points.length === 1 ? (width - pad * 2) / 2 : (index / (points.length - 1)) * (width - pad * 2));
      const y = pad + (1 - (point.weightKg - min) / (max - min)) * (height - pad * 2);
      return { x, y };
    });
    const d = coords.map((coord, index) => `${index === 0 ? 'M' : 'L'} ${coord.x.toFixed(1)} ${coord.y.toFixed(1)}`).join(' ');
    return { width, height, d, coords };
  }, [points]);

  return (
    <svg className="trend" viewBox={`0 0 ${geometry.width} ${geometry.height}`} role="img" aria-label="Weight trend">
      <path d={geometry.d} />
      {geometry.coords.map((coord, index) => (
        <circle key={index} cx={coord.x} cy={coord.y} r="3.5" />
      ))}
    </svg>
  );
}

function WeighInSheet({
  units,
  onClose,
  onSave,
}: {
  units: 'metric' | 'imperial';
  onClose: () => void;
  onSave: (weightKg: number, note: string) => void;
}) {
  const [weight, setWeight] = useState('');
  const [note, setNote] = useState('');
  const value = Number(weight);
  const kg = units === 'imperial' ? lbToKg(value) : value;
  const valid = Number.isFinite(value) && kg >= 35 && kg <= 250;

  return (
    <Sheet title="Log weight" onClose={onClose}>
      <div className="group sheet-group">
        <label className="field">
          <span className="label">Weight</span>
          <input
            inputMode="decimal"
            value={weight}
            autoFocus
            placeholder={units === 'imperial' ? String(Math.round(kgToLb(70))) : '70'}
            onChange={(event) => setWeight(event.target.value.replace(/[^0-9.]/g, ''))}
          />
          <em className="suffix">{units === 'imperial' ? 'lb' : 'kg'}</em>
        </label>
        <label className="field">
          <span className="label">Note</span>
          <input value={note} placeholder="Optional" onChange={(event) => setNote(event.target.value)} />
        </label>
      </div>
      <p className="footnote">Today’s weight replaces an earlier entry for the same day and updates your profile.</p>
      <button type="button" className="btn btn-primary" disabled={!valid} onClick={() => onSave(kg, note)}>
        Save weigh-in
      </button>
    </Sheet>
  );
}
