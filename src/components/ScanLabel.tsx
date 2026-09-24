import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, ScanBarcode } from 'lucide-react';
import { lookupBarcode, normalizeBarcode } from '../lib/openFoodFacts';
import { recognizeLabel } from '../lib/ocr';
import type { ParsedLabel } from '../lib/parseLabel';
import { FoodForm, type FoodDraft } from './FoodForm';

type Phase = 'choose' | 'barcode' | 'camera' | 'reading' | 'review';
type Entry = 'barcode' | 'photo' | 'manual';

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

export function ScanLabel({ onClose, onSave }: { onClose: () => void; onSave: (draft: FoodDraft) => void }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<Detector | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('choose');
  const [entry, setEntry] = useState<Entry>('barcode');
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Preparing the photo');
  const [parsed, setParsed] = useState<ParsedLabel | null>(null);
  const [error, setError] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [barcode, setBarcode] = useState('');
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [scanReady] = useState(canScanBarcodes);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if ((phase !== 'camera' && phase !== 'barcode') || !videoRef.current || !streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play().catch(() => undefined);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'barcode') return;
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
    setPhase('reading');
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
        setPhase('review');
      } catch (caught) {
        if (token.cancelled) return;
        const message = caught instanceof Error ? caught.message : '';
        if (message !== 'cancelled') {
          setError('Couldn’t read that photo. Enter the numbers yourself — the picture stays here so you can copy from it.');
        }
        setEntry('photo');
        setParsed(emptyLabel());
        setPhase('review');
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
      setPhase('camera');
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
      setPhase('barcode');
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
    setFile(new File([blob], 'label.jpg', { type: 'image/jpeg' }));
  }

  async function lookup(raw: string) {
    setLookupError('');
    setLooking(true);
    setPhase('choose');
    try {
      const result = await lookupBarcode(raw);
      setBarcode(normalizeBarcode(raw) ?? raw.replace(/\D/g, ''));
      setEntry('barcode');
      setParsed(result);
      setPreview(null);
      setError('');
      setPhase('review');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '';
      setLookupError(message || 'Couldn’t look up that barcode.');
      setPhase('choose');
    } finally {
      setLooking(false);
    }
  }

  if (phase === 'review' && parsed) {
    const missing = parsed.calories == null || parsed.protein == null || parsed.carbs == null || parsed.fat == null;
    const banner =
      entry === 'barcode'
        ? {
            tone: missing ? ('warn' as const) : ('ok' as const),
            text: missing
              ? 'Open Food Facts didn’t include every number. Fill the highlighted fields, then save.'
              : parsed.warnings[0] || 'From Open Food Facts. Compare the serving and macros with the package, then save.',
          }
        : entry === 'manual'
          ? undefined
          : error
            ? { tone: 'warn' as const, text: error }
            : missing
              ? { tone: 'warn' as const, text: parsed.warnings[0] || 'Some numbers need a look before saving.' }
              : { tone: 'ok' as const, text: parsed.warnings[0] || 'Numbers are filled in. Compare them with the label, then save.' };

    return (
      <FoodForm
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
        banner={banner}
        imageUrl={preview ?? undefined}
        rawText={parsed.rawText || undefined}
        submitLabel="Save food"
        onCancel={onClose}
        onSubmit={onSave}
      />
    );
  }

  const digits = barcode.replace(/\D/g, '');
  const header = phase === 'barcode' ? 'Scan barcode' : phase === 'choose' ? 'Add food' : 'Scan label';

  return (
    <div className="modal">
      <header className="modal-bar">
        <button
          type="button"
          className="text-btn"
          onClick={() => {
            stopCamera();
            onClose();
          }}
        >
          Cancel
        </button>
        <h2>{header}</h2>
        <span />
      </header>
      <div className="modal-body">
        {phase === 'choose' ? (
          <>
            <div className="scan-hero">
              <h3>Look up a barcode</h3>
              <p>Type the digits or scan the package. Open Food Facts fills the name and macros when it knows the product. You confirm the serving and every number before it’s saved.</p>
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
                className="btn btn-primary"
                disabled={looking || digits.length < 8}
                onClick={() => void lookup(digits)}
              >
                {looking ? 'Looking up…' : 'Look up'}
              </button>
              {scanReady ? (
                <button type="button" className="btn btn-secondary" disabled={looking} onClick={() => void openBarcodeCamera()}>
                  <ScanBarcode size={18} /> Scan barcode
                </button>
              ) : (
                <p className="footnote block">Type the digits under the barcode. This browser can’t read EAN or UPC from the camera.</p>
              )}
            </div>
            {lookupError ? <p className="footnote warn">{lookupError}</p> : null}
            <div className="scan-secondary">
              <h3>Or read a label photo</h3>
              <p className="footnote block">Photo reading stays on this device. It’s a fallback for packages that aren’t in the database, and you’ll correct anything it misses.</p>
              <div className="stack">
                <button type="button" className="btn btn-secondary" onClick={() => void openCamera()}>
                  <Camera size={18} /> Scan label photo
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => libraryRef.current?.click()}>
                  <ImagePlus size={18} /> Choose label photo
                </button>
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={() => {
                    setEntry('manual');
                    setParsed(emptyLabel());
                    setPreview(null);
                    setError('');
                    setPhase('review');
                  }}
                >
                  Type the numbers yourself
                </button>
              </div>
              {cameraError ? <p className="footnote warn">{cameraError}</p> : null}
            </div>
          </>
        ) : null}
        {phase === 'barcode' ? (
          <div className="camera-wrap">
            <div className="camera-stage barcode-stage">
              <video ref={videoRef} playsInline muted autoPlay />
              <div className="camera-guide barcode-guide" />
            </div>
            <p className="footnote tight">Point the camera at the barcode. EAN and UPC codes fill in on their own.</p>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => {
                stopCamera();
                setPhase('choose');
              }}
            >
              Type the barcode instead
            </button>
          </div>
        ) : null}
        {phase === 'camera' ? (
          <div className="camera-wrap">
            <div className="camera-stage">
              <video ref={videoRef} playsInline muted autoPlay />
              <div className="camera-guide" />
            </div>
            <p className="footnote tight">Fit the nutrition facts inside the frame.</p>
            <button type="button" className="shutter" aria-label="Capture photo" onClick={() => void captureFrame()}>
              <i />
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => {
                stopCamera();
                setPhase('choose');
              }}
            >
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
        ) : null}
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
