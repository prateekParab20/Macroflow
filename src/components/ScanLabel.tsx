import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus } from 'lucide-react';
import { preprocessLabelImage, recognizeLabel } from '../lib/ocr';
import type { ParsedLabel } from '../lib/parseLabel';
import { FoodForm, type FoodDraft } from './FoodForm';

type Phase = 'choose' | 'reading' | 'review';

function friendlyStatus(status: string): string {
  if (/language|traineddata/i.test(status)) return 'Loading the reader';
  if (/core|initial/i.test(status)) return 'Starting the reader';
  if (/recogn/i.test(status)) return 'Reading the label';
  return 'Reading the label';
}

export function ScanLabel({ onClose, onSave }: { onClose: () => void; onSave: (draft: FoodDraft) => void }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('choose');
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Preparing the reader');
  const [parsed, setParsed] = useState<ParsedLabel | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!file) return;
    const token = { cancelled: false };
    const url = URL.createObjectURL(file);
    setPreview(url);
    setPhase('reading');
    setProgress(0.04);
    setStatus('Preparing the photo');
    setError('');
    setParsed(null);

    (async () => {
      try {
        const processed = await preprocessLabelImage(file);
        if (token.cancelled) return;
        const result = await recognizeLabel(processed, {
          signal: token,
          onProgress: (value, nextStatus) => {
            if (token.cancelled) return;
            setProgress(value);
            setStatus(friendlyStatus(nextStatus));
          },
        });
        if (token.cancelled) return;
        setParsed(result);
        setPhase('review');
      } catch (caught) {
        if (token.cancelled) return;
        const message = caught instanceof Error ? caught.message : '';
        if (message !== 'cancelled') {
          setError('Couldn’t read that photo. Enter the numbers yourself — the picture stays here so you can copy from it.');
        }
        setParsed({ confidence: {}, warnings: [], rawText: '' });
        setPhase('review');
      }
    })();

    return () => {
      token.cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  if (phase === 'review' && parsed) {
    const missing =
      parsed.calories == null || parsed.protein == null || parsed.carbs == null || parsed.fat == null;
    const banner = error
      ? { tone: 'warn' as const, text: error }
      : missing
        ? { tone: 'warn' as const, text: parsed.warnings[0] || 'Some numbers need a look before saving.' }
        : { tone: 'ok' as const, text: 'Numbers are filled in. Compare them with the label, then save.' };

    return (
      <FoodForm
        title="Confirm label"
        initial={{
          name: parsed.name ?? '',
          servingSize: parsed.servingSize ?? '',
          calories: parsed.calories,
          protein: parsed.protein,
          carbs: parsed.carbs,
          fat: parsed.fat,
          fiber: parsed.fiber,
          sodium: parsed.sodium,
          favorite: false,
          source: 'scan',
        }}
        confidence={parsed.confidence}
        banner={banner}
        imageUrl={preview ?? undefined}
        rawText={parsed.rawText || undefined}
        submitLabel="Save food"
        onCancel={onClose}
        onSubmit={onSave}
      />
    );
  }

  return (
    <div className="modal">
      <header className="modal-bar">
        <button type="button" className="text-btn" onClick={onClose}>
          Cancel
        </button>
        <h2>Scan label</h2>
        <span />
      </header>
      <div className="modal-body">
        {phase === 'choose' ? (
          <>
            <div className="scan-hero">
              <h3>Read a nutrition label</h3>
              <p>Photograph the facts panel, or choose a picture you already have. Nothing is saved until you confirm the numbers.</p>
            </div>
            <div className="stack">
              <button type="button" className="btn btn-primary" onClick={() => cameraRef.current?.click()}>
                <Camera size={18} /> Take photo
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => libraryRef.current?.click()}>
                <ImagePlus size={18} /> Choose photo
              </button>
            </div>
            <ul className="tips">
              <li>Fill the frame with the nutrition facts.</li>
              <li>Avoid glare, and hold the phone steady.</li>
              <li>You’ll edit anything the reader misses.</li>
            </ul>
          </>
        ) : (
          <div className="reading">
            {preview ? <img src={preview} alt="" /> : null}
            <p>{status}</p>
            <div className="meter-track">
              <div className="meter-fill" style={{ width: `${Math.round(progress * 100)}%`, background: 'var(--blue)' }} />
            </div>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => {
                setFile(null);
                setPreview(null);
                setPhase('choose');
              }}
            >
              Choose a different photo
            </button>
          </div>
        )}
        <input
          ref={cameraRef}
          className="sr-only"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(event) => {
            const next = event.target.files?.[0];
            if (next) setFile(next);
            event.target.value = '';
          }}
        />
        <input
          ref={libraryRef}
          className="sr-only"
          type="file"
          accept="image/*"
          onChange={(event) => {
            const next = event.target.files?.[0];
            if (next) setFile(next);
            event.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
