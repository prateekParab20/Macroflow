import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, ScanBarcode } from 'lucide-react';
import { lookupBarcode, normalizeBarcode } from '../lib/openFoodFacts';
import { recognizeLabel } from '../lib/ocr';
import type { ParsedLabel } from '../lib/parseLabel';
import { HistoryStep, useHistoryLayer } from '../lib/useHistoryLayer';
import { FoodForm, type FoodDraft } from './FoodForm';

type Phase = 'barcode-entry' | 'barcode-camera' | 'label-entry' | 'label-camera' | 'reading' | 'review';
type Entry = 'barcode' | 'photo' | 'manual';
type Start = 'barcode' | 'label';

interface BarcodeHit {
  rawValue: string;
}

type Detector = {
  detect: (source: CanvasImageSource) => Promise<BarcodeHit[]>;
};

function detectorFactory(): (new (options?: { formats?: string[] }) => Detector) | null {
  if (typeof window === 'undefined') return null;
  const candidate = (window as Window & { BarcodeDetector?: new (options?: { formats?: string[] }) => Detector }).BarcodeDetector;
  return candidate ?? null;
}

export function canScanBarcodes(): boolean {
  return !!navigator.mediaDevices?.getUserMedia;
}

function friendlyStatus(status: string): string {
  if (/language|traineddata/i.test(status)) return 'Loading the reader';
  if (/core|initial/i.test(status)) return 'Starting the reader';
  if (/prepar|photo/i.test(status)) return 'Preparing the photo';
  if (/check/i.test(status)) return 'Checking the numbers';
  if (/line/i.test(status)) return 'Reading each line';
  if (/recogn/i.test(status)) return 'Reading the label';
  return status || 'Reading the label';
}

function emptyLabel(): ParsedLabel {
  return { basis: 'serving', confidence: {}, warnings: [], rawText: '' };
}

function initialPhase(start: Start): Phase {
  return start === 'barcode' ? 'barcode-entry' : 'label-entry';
}

export function ScanLabel({
  start,
  onClose,
  onSave,
}: {
  start: Start;
  onClose: () => void;
  onSave: (draft: FoodDraft) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<Detector | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [phases, setPhases] = useState<Phase[]>([initialPhase(start)]);
  const [entry, setEntry] = useState<Entry>(start === 'barcode' ? 'barcode' : 'photo');
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Preparing the photo');
  const [parsed, setParsed] = useState<ParsedLabel | null>(null);
  const [error, setError] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [barcode, setBarcode] = useState('');
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [scanReady] = useState(canScanBarcodes);
  const phase = phases[phases.length - 1];

  useHistoryLayer(true, () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    onClose();
  });

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if ((phase !== 'label-camera' && phase !== 'barcode-camera') || !videoRef.current || !streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play().catch(() => undefined);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'barcode-camera') return;
    const video = videoRef.current;
    if (!video) return;
    let stopped = false;
    let timer = 0;
    const canvas = document.createElement('canvas');
    let reader: { decodeFromCanvas: (source: HTMLCanvasElement) => { getText: () => string } } | null = null;

    const finish = (raw: string) => {
      if (stopped || !normalizeBarcode(raw)) return;
      stopped = true;
      window.clearTimeout(timer);
      stopCamera();
      void lookup(raw);
    };

    const tick = async () => {
      if (stopped) return;
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
        const native = detectorRef.current;
        if (native) {
          try {
            const hits = await native.detect(video);
            const raw = hits.map((hit) => hit.rawValue).find((value) => normalizeBarcode(value));
            if (raw) {
              finish(raw);
              return;
            }
          } catch {
            // A frame can fail while the camera is still starting.
          }
        } else if (reader) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          context?.drawImage(video, 0, 0);
          try {
            const raw = reader.decodeFromCanvas(canvas).getText();
            if (normalizeBarcode(raw)) {
              finish(raw);
              return;
            }
          } catch {
            // Most frames have no barcode.
          }
        }
      }
      timer = window.setTimeout(() => {
        void tick();
      }, 200);
    };

    void (async () => {
      if (!detectorRef.current) {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import('@zxing/browser'),
          import('@zxing/library'),
        ]);
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
        ]);
        reader = new BrowserMultiFormatReader(hints);
      }
      if (!stopped) void tick();
    })();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [phase]);

  useEffect(() => {
    if (!file) return;
    const token = { cancelled: false };
    const url = URL.createObjectURL(file);
    setPreview(url);
    setProgress(0.04);
    setStatus('Preparing the photo');
    setError('');
    setParsed(null);

    (async () => {
      try {
        const result = await recognizeLabel(file, {
          signal: token,
          onProgress: (value, nextStatus) => {
            if (token.cancelled) return;
            setProgress(value);
            setStatus(friendlyStatus(nextStatus));
          },
        });
        if (token.cancelled) return;
        setEntry('photo');
        setParsed(result);
        showReview();
      } catch (caught) {
        if (token.cancelled) return;
        const message = caught instanceof Error ? caught.message : '';
        if (message !== 'cancelled') {
          setError('Couldn’t read that photo. Enter the numbers yourself — the picture stays here so you can copy from it.');
        }
        setEntry('photo');
        setParsed(emptyLabel());
        showReview();
      }
    })();

    return () => {
      token.cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function pushPhase(next: Phase) {
    setPhases((current) => (current[current.length - 1] === next ? current : [...current, next]));
  }

  function showReview() {
    setPhases((current) => {
      const top = current[current.length - 1];
      if (top === 'reading' || top === 'label-camera' || top === 'barcode-camera') {
        return [...current.slice(0, -1), 'review'];
      }
      if (top === 'review') return current;
      return [...current, 'review'];
    });
  }

  function retreatTo(count: number) {
    stopCamera();
    setFile(null);
    setPhases((current) => current.slice(0, Math.max(1, count)));
  }

  function popPhase() {
    if (phases.length <= 1) {
      stopCamera();
      onClose();
      return;
    }
    retreatTo(phases.length - 1);
  }

  function beginPhoto(next: File) {
    setError('');
    setParsed(null);
    setPhases((current) => {
      const top = current[current.length - 1];
      if (top === 'label-camera' || top === 'reading') return [...current.slice(0, -1), 'reading'];
      return [...current, 'reading'];
    });
    setFile(next);
  }

  async function openCamera() {
    setCameraError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 2560 },
        },
      });
      streamRef.current = stream;
      pushPhase('label-camera');
    } catch {
      setCameraError('The camera isn’t available. Choose a photo instead.');
      cameraRef.current?.click();
    }
  }

  async function openBarcodeCamera() {
    setLookupError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setLookupError('This browser can’t use the camera. Type the digits under the barcode.');
      return;
    }
    const Factory = detectorFactory();
    detectorRef.current = null;
    if (Factory) {
      try {
        detectorRef.current = new Factory({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
      } catch {
        try {
          detectorRef.current = new Factory();
        } catch {
          detectorRef.current = null;
        }
      }
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' } },
      });
      streamRef.current = stream;
      pushPhase('barcode-camera');
    } catch {
      setLookupError('The camera isn’t available. Type the barcode instead.');
    }
  }

  async function captureFrame() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    stopCamera();
    if (!blob) return;
    beginPhoto(new File([blob], 'label.jpg', { type: 'image/jpeg' }));
  }

  async function lookup(raw: string) {
    setLookupError('');
    setLooking(true);
    stopCamera();
    try {
      const result = await lookupBarcode(raw);
      setBarcode(normalizeBarcode(raw) ?? raw.replace(/\D/g, ''));
      setEntry('barcode');
      setParsed(result);
      setPreview(null);
      setError('');
      showReview();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '';
      setLookupError(message || 'Couldn’t look up that barcode.');
      setPhases((current) => (current[current.length - 1] === 'barcode-camera' ? current.slice(0, -1) : current));
    } finally {
      setLooking(false);
    }
  }

  const digits = barcode.replace(/\D/g, '');
  const header =
    phase === 'barcode-entry' || phase === 'barcode-camera' ? 'Barcode' : phase === 'review' ? 'Confirm' : 'Label';

  return (
    <>
      {phases.slice(1).map((_, index) => (
        <HistoryStep key={index} onBack={() => retreatTo(index + 1)} />
      ))}
      {phase === 'review' && parsed ? (
        <FoodForm
          trackHistory={false}
          title={entry === 'photo' ? 'Confirm label' : 'Confirm food'}
          initial={{
            name: parsed.name ?? '',
            servingSize: parsed.servingSize ?? '',
            calories: parsed.calories,
            protein: parsed.protein,
            carbs: parsed.carbs,
            fat: parsed.fat,
            fiber: parsed.fiber,
            sugar: parsed.sugar,
            sodium: parsed.sodium,
            favorite: false,
            source: entry === 'barcode' ? 'barcode' : entry === 'photo' ? 'scan' : 'manual',
            basis: parsed.basis,
            basisAmount: parsed.basisAmount,
            basisUnit: parsed.basisUnit,
            householdUnit: parsed.householdUnit,
            householdCount: parsed.householdCount,
            householdMetric: parsed.householdMetric,
          }}
          confidence={entry === 'manual' ? undefined : parsed.confidence}
          banner={
            entry === 'barcode'
              ? {
                  tone:
                    parsed.calories == null || parsed.protein == null || parsed.carbs == null || parsed.fat == null
                      ? 'warn'
                      : 'ok',
                  text:
                    parsed.calories == null || parsed.protein == null || parsed.carbs == null || parsed.fat == null
                      ? 'Open Food Facts didn’t include every number. Fill the highlighted fields, then save.'
                      : parsed.warnings[0] || 'From Open Food Facts. Compare the serving and macros with the package, then save.',
                }
              : entry === 'manual'
                ? undefined
                : error
                  ? { tone: 'warn', text: error }
                  : parsed.calories == null || parsed.protein == null || parsed.carbs == null || parsed.fat == null
                    ? { tone: 'warn', text: parsed.warnings[0] || 'Some numbers need a look before saving.' }
                    : { tone: 'ok', text: parsed.warnings[0] || 'Numbers are filled in. Compare them with the label, then save.' }
          }
          imageUrl={preview ?? undefined}
          rawText={parsed.rawText || undefined}
          submitLabel="Save food"
          onCancel={popPhase}
          onSubmit={onSave}
        />
      ) : (
        <div className="modal">
          <header className="modal-bar">
            <button
              type="button"
              className="text-btn"
              onClick={() => {
                if (phases.length > 1) popPhase();
                else {
                  stopCamera();
                  onClose();
                }
              }}
            >
              {phases.length > 1 ? 'Back' : 'Cancel'}
            </button>
            <h2>{header}</h2>
            <span />
          </header>
          <div className="modal-body">
            {phase === 'barcode-entry' ? (
              <>
                <div className="scan-hero">
                  <h3>Barcode</h3>
                  <p>Scan the package. If the camera can’t see it, type the digits under the code.</p>
                </div>
                <div className="stack">
                  {scanReady ? (
                    <button type="button" className="btn btn-primary" disabled={looking} onClick={() => void openBarcodeCamera()}>
                      <ScanBarcode size={18} /> Scan
                    </button>
                  ) : (
                    <p className="footnote block">Type the digits under the barcode. This browser can’t read EAN or UPC from the camera.</p>
                  )}
                </div>
                <div className="group">
                  <label className="field">
                    <span className="label">Barcode</span>
                    <input
                      className="barcode-input"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="012345678905"
                      value={barcode}
                      aria-label="Barcode"
                      onChange={(event) => {
                        setLookupError('');
                        setBarcode(event.target.value.replace(/[^\d\s]/g, ''));
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && digits.length >= 8 && !looking) void lookup(digits);
                      }}
                    />
                  </label>
                </div>
                <div className="stack barcode-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={looking || digits.length < 8}
                    onClick={() => void lookup(digits)}
                  >
                    {looking ? 'Looking up…' : 'Look up'}
                  </button>
                </div>
                {lookupError ? <p className="footnote warn">{lookupError}</p> : null}
              </>
            ) : null}
            {phase === 'barcode-camera' ? (
              <div className="camera-wrap">
                <div className="camera-stage barcode-stage">
                  <video ref={videoRef} playsInline muted autoPlay />
                  <div className="camera-guide barcode-guide" />
                </div>
                <p className="footnote tight">Point the camera at the barcode. EAN and UPC codes fill in on their own.</p>
                <button type="button" className="btn btn-quiet" onClick={popPhase}>
                  Type the barcode instead
                </button>
              </div>
            ) : null}
            {phase === 'label-entry' ? (
              <>
                <div className="scan-hero">
                  <h3>Label</h3>
                  <p>Photograph the nutrition facts, or choose a picture you already have. Reading stays on this device.</p>
                </div>
                <div className="stack">
                  <button type="button" className="btn btn-primary" onClick={() => void openCamera()}>
                    <Camera size={18} /> Scan
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => libraryRef.current?.click()}>
                    <ImagePlus size={18} /> Choose photo
                  </button>
                </div>
                {cameraError ? <p className="footnote warn">{cameraError}</p> : null}
              </>
            ) : null}
            {phase === 'label-camera' ? (
              <div className="camera-wrap">
                <div className="camera-stage">
                  <video ref={videoRef} playsInline muted autoPlay />
                  <div className="camera-guide" />
                </div>
                <p className="footnote tight">Fit the nutrition facts inside the frame.</p>
                <button type="button" className="shutter" aria-label="Capture photo" onClick={() => void captureFrame()}>
                  <i />
                </button>
                <button type="button" className="btn btn-quiet" onClick={popPhase}>
                  Back
                </button>
              </div>
            ) : null}
            {phase === 'reading' ? (
              <div className="reading">
                {preview ? <img src={preview} alt="" /> : null}
                <p>{status}</p>
                <div className="meter-track">
                  <div className="meter-fill" style={{ width: `${Math.round(progress * 100)}%`, background: 'var(--blue)' }} />
                </div>
                <button type="button" className="btn btn-quiet" onClick={popPhase}>
                  Choose a different photo
                </button>
              </div>
            ) : null}
            <input
              ref={cameraRef}
              className="sr-only"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => {
                const next = event.target.files?.[0];
                if (next) beginPhoto(next);
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
                if (next) beginPhoto(next);
                event.target.value = '';
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
