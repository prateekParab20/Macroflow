import { createWorker, OEM, PSM, type Worker } from 'tesseract.js';
import { prepareLabelImages } from './preprocess';
import { parseNutritionLabel, scoreParsedLabel, type OcrToken, type ParsedLabel } from './parseLabel';

export interface RecognizeOptions {
  onProgress?: (progress: number, status: string) => void;
  signal?: { cancelled: boolean };
}

function base(path: string): string {
  const root = import.meta.env.BASE_URL || '/';
  return `${root}${path}`.replace(/\/{2,}/g, '/');
}

function tokensFrom(words: { text: string; confidence: number }[] | undefined): OcrToken[] {
  if (!words) return [];
  return words
    .filter((word) => word.text && word.text.trim())
    .map((word) => ({ text: word.text.trim(), confidence: word.confidence }));
}

function isStrong(parsed: ParsedLabel): boolean {
  const core = [parsed.calories, parsed.protein, parsed.carbs, parsed.fat];
  if (core.some((value) => value == null)) return false;
  const highs = (['calories', 'protein', 'carbs', 'fat'] as const).filter((key) => parsed.confidence[key] === 'high').length;
  return highs >= 3 && scoreParsedLabel(parsed) >= 14;
}

export async function recognizeLabel(image: Blob | string, options: RecognizeOptions = {}): Promise<ParsedLabel> {
  const report = (progress: number, status: string) => options.onProgress?.(progress, status);
  report(0.02, 'Preparing the photo');

  let variants: Blob[] = [];
  if (typeof image !== 'string') {
    try {
      const prepared = await prepareLabelImages(image);
      variants = [prepared.contrast, prepared.binary];
    } catch {
      variants = [image];
    }
  } else {
    variants = [];
  }
  if (options.signal?.cancelled) throw new Error('cancelled');

  report(0.08, 'Preparing the reader');
  let worker: Worker | null = null;
  try {
    worker = await createWorker('eng', OEM.LSTM_ONLY, {
      workerPath: base('tesseract/worker.min.js'),
      corePath: base('tesseract'),
      langPath: base('tessdata'),
      workerBlobURL: false,
      gzip: true,
      logger: (message) => {
        if (options.signal?.cancelled) return;
        const progress = typeof message.progress === 'number' ? message.progress : 0;
        report(Math.max(0.12, Math.min(0.92, 0.12 + progress * 0.8)), message.status || 'Reading label');
      },
    }, {
      load_system_dawg: '0',
      load_freq_dawg: '0',
      load_unambig_dawg: '0',
      load_punc_dawg: '0',
      load_number_dawg: '0',
    });

    if (options.signal?.cancelled) throw new Error('cancelled');

    const passes: { blob: Blob | string; psm: PSM; label: string }[] = [];
    if (variants.length) {
      passes.push({ blob: variants[0], psm: PSM.SINGLE_BLOCK, label: 'Reading the label' });
      if (variants[1]) passes.push({ blob: variants[1], psm: PSM.SINGLE_BLOCK, label: 'Checking the numbers' });
      passes.push({ blob: variants[0], psm: PSM.SINGLE_COLUMN, label: 'Reading each line' });
    } else {
      passes.push({ blob: image, psm: PSM.SINGLE_BLOCK, label: 'Reading the label' });
    }

    let best: ParsedLabel | null = null;
    let bestScore = -Infinity;
    for (let index = 0; index < passes.length; index += 1) {
      if (options.signal?.cancelled) throw new Error('cancelled');
      if (best && isStrong(best) && index > 0) break;
      const pass = passes[index];
      report(0.15 + index * 0.2, pass.label);
      await worker.setParameters({
        tessedit_pageseg_mode: pass.psm,
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,:%()/-+*\'" ',
      });
      const result = await worker.recognize(
        pass.blob,
        {},
        { text: true, blocks: true, hocr: false, tsv: false, box: false, unlv: false, osd: false, pdf: false },
      );
      const parsed = parseNutritionLabel(result.data.text || '', tokensFrom(result.data.words));
      const score = scoreParsedLabel(parsed);
      if (score > bestScore) {
        best = parsed;
        bestScore = score;
      }
    }

    report(1, 'Done');
    return best ?? parseNutritionLabel('');
  } finally {
    if (worker) await worker.terminate();
  }
}
