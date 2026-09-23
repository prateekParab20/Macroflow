import { createWorker, PSM, type Worker } from 'tesseract.js';
import { parseNutritionLabel, type ParsedLabel } from './parseLabel';

export interface RecognizeOptions {
  onProgress?: (progress: number, status: string) => void;
  signal?: { cancelled: boolean };
}

function base(path: string): string {
  const root = import.meta.env.BASE_URL || '/';
  return `${root}${path}`.replace(/\/{2,}/g, '/');
}

export async function recognizeLabel(image: Blob | string, options: RecognizeOptions = {}): Promise<ParsedLabel> {
  const report = (progress: number, status: string) => options.onProgress?.(progress, status);
  report(0.02, 'Preparing the reader');

  let worker: Worker | null = null;
  try {
    worker = await createWorker('eng', 1, {
      workerPath: base('tesseract/worker.min.js'),
      corePath: base('tesseract'),
      langPath: base('tessdata'),
      workerBlobURL: false,
      gzip: true,
      logger: (message) => {
        if (options.signal?.cancelled) return;
        const progress = typeof message.progress === 'number' ? message.progress : 0;
        report(Math.max(0.05, Math.min(0.98, progress)), message.status || 'Reading label');
      },
    });

    if (options.signal?.cancelled) {
      await worker.terminate();
      throw new Error('cancelled');
    }

    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    });

    const result = await worker.recognize(image);
    report(1, 'Done');
    return parseNutritionLabel(result.data.text || '');
  } finally {
    if (worker) await worker.terminate();
  }
}

export async function preprocessLabelImage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(2.2, Math.max(1, 1400 / Math.max(bitmap.width, 1)));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return file;
  context.drawImage(bitmap, 0, 0, width, height);
  const image = context.getImageData(0, 0, width, height);
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const contrasted = Math.min(255, Math.max(0, (gray - 128) * 1.45 + 128));
    data[i] = contrasted;
    data[i + 1] = contrasted;
    data[i + 2] = contrasted;
  }
  context.putImageData(image, 0, 0);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  return blob ?? file;
}
