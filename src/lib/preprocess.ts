export interface PreparedImages {
  contrast: Blob;
  binary: Blob;
  width: number;
  height: number;
}

const MAX_SIDE = 2200;
const MIN_SIDE = 1400;

export async function prepareLabelImages(file: Blob): Promise<PreparedImages> {
  const bitmap = await createImageBitmap(file);
  try {
    const sized = drawScaled(bitmap, targetSize(bitmap.width, bitmap.height));
    const straightened = deskewCanvas(sized);
    const cropped = cropToLabel(straightened);
    const readable = ensureReadableSize(cropped);
    const gray = canvasGray(readable);
    const binary = paintGray(sauvola(gray, readable.width, readable.height), readable.width, readable.height);
    const contrast = paintGray(unsharp(stretch(gray), readable.width, readable.height), readable.width, readable.height);
    const [contrastBlob, binaryBlob] = await Promise.all([canvasToBlob(contrast), canvasToBlob(binary)]);
    return { contrast: contrastBlob, binary: binaryBlob, width: readable.width, height: readable.height };
  } finally {
    bitmap.close();
  }
}

function targetSize(width: number, height: number): { width: number; height: number } {
  const long = Math.max(width, height);
  let scale = 1;
  if (long > MAX_SIDE) scale = MAX_SIDE / long;
  else if (long < MIN_SIDE) scale = Math.min(3, MIN_SIDE / long);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function drawScaled(bitmap: ImageBitmap, size: { width: number; height: number }): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return canvas;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size.width, size.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  return canvas;
}

function canvasGray(canvas: HTMLCanvasElement): Float32Array {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return new Float32Array(canvas.width * canvas.height);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const gray = new Float32Array(canvas.width * canvas.height);
  const data = image.data;
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    gray[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }
  return gray;
}

function paintGray(gray: ArrayLike<number>, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return canvas;
  const image = context.createImageData(width, height);
  for (let i = 0, p = 0; i < gray.length; i += 1, p += 4) {
    const value = Math.max(0, Math.min(255, gray[i]));
    image.data[p] = value;
    image.data[p + 1] = value;
    image.data[p + 2] = value;
    image.data[p + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not prepare the photo'))), 'image/png');
  });
}

function deskewCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const gray = canvasGray(source);
  const sample = downscale(gray, source.width, source.height, 640);
  const angle = bestAngle(sample.gray, sample.width, sample.height);
  if (Math.abs(angle) < 0.4) return source;
  const radians = (angle * Math.PI) / 180;
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));
  const width = Math.round(source.width * cos + source.height * sin);
  const height = Math.round(source.width * sin + source.height * cos);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return source;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.translate(width / 2, height / 2);
  // bestAngle is the clockwise rotation that makes label rules horizontal.
  context.rotate(radians);
  context.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

function bestAngle(gray: Float32Array, width: number, height: number): number {
  const binary = inkBinary(gray);
  const base = projectionScore(binary, width, height, 0);
  let best = 0;
  let bestScore = base;
  for (let angle = -12; angle <= 12; angle += 0.5) {
    if (angle === 0) continue;
    const score = projectionScore(binary, width, height, angle);
    if (score > bestScore) {
      bestScore = score;
      best = angle;
    }
  }
  if (Math.abs(best) < 0.4 || bestScore <= base * 1.01) return 0;
  return best;
}

function inkBinary(gray: Float32Array, cutoff = Math.min(otsu(gray), 105)): Uint8Array {
  const binary = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i += 1) binary[i] = gray[i] <= cutoff ? 1 : 0;
  return binary;
}

function projectionScore(binary: Uint8Array, width: number, height: number, angle: number): number {
  const radians = (angle * Math.PI) / 180;
  const sin = Math.sin(radians);
  const cos = Math.cos(radians);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const offset = Math.ceil(Math.abs(sin) * cx + Math.abs(cos) * cy) + 2;
  const bins = new Float32Array(height + width + offset * 2);
  let count = 0;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      if (!binary[y * width + x]) continue;
      const projected = Math.round((x - cx) * sin + (y - cy) * cos + offset);
      if (projected >= 0 && projected < bins.length) bins[projected] += 1;
      count += 1;
    }
  }
  if (count < 30) return 0;
  let sum = 0;
  let sumSquares = 0;
  let used = 0;
  for (let i = 0; i < bins.length; i += 1) {
    if (!bins[i]) continue;
    sum += bins[i];
    sumSquares += bins[i] * bins[i];
    used += 1;
  }
  if (!used) return 0;
  const mean = sum / used;
  return sumSquares / used - mean * mean;
}

function cropToLabel(source: HTMLCanvasElement): HTMLCanvasElement {
  const gray = canvasGray(source);
  const sample = downscale(gray, source.width, source.height, 780, true);
  const rect = findLabelRect(sample.gray, sample.width, sample.height) ?? contentBounds(sample.gray, sample.width, sample.height);
  if (!rect) return source;
  const scaleX = source.width / sample.width;
  const scaleY = source.height / sample.height;
  const padX = Math.round(rect.width * scaleX * 0.03);
  const padY = Math.round(rect.height * scaleY * 0.03);
  let x = Math.max(0, Math.floor(rect.x * scaleX) - padX);
  let y = Math.max(0, Math.floor(rect.y * scaleY) - padY);
  let width = Math.min(source.width - x, Math.ceil(rect.width * scaleX) + padX * 2);
  let height = Math.min(source.height - y, Math.ceil(rect.height * scaleY) + padY * 2);
  if (width < 40 || height < 40) return source;
  if (width > source.width * 0.97 && height > source.height * 0.97) return source;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return source;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(source, x, y, width, height, 0, 0, width, height);
  return canvas;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RuleBand {
  y0: number;
  y1: number;
  x0: number;
  x1: number;
}

function findLabelRect(gray: Float32Array, width: number, height: number): Rect | null {
  let best: { score: number; rect: Rect } | null = null;
  for (let cutoff = 136; cutoff <= 172; cutoff += 6) {
    const found = labelRectAt(gray, width, height, cutoff);
    if (found && (!best || found.score > best.score)) best = found;
  }
  return best?.rect ?? null;
}

function labelRectAt(
  gray: Float32Array,
  width: number,
  height: number,
  cutoff: number,
): { score: number; rect: Rect } | null {
  const dark = inkBinary(gray, cutoff);
  const minWidth = Math.max(40, Math.round(width * 0.18));
  const bands: RuleBand[] = [];
  for (let y = 0; y < height; y += 1) {
    const span = longestSpan(dark, width, height, y, false, 3);
    if (span.length < minWidth) continue;
    let ink = 0;
    const offset = y * width;
    for (let x = span.start; x < span.end; x += 1) ink += dark[offset + x];
    if (ink / (span.end - span.start) < 0.55) continue;
    const band = bands[bands.length - 1];
    if (
      band &&
      y - band.y1 <= 4 &&
      Math.abs(span.start - band.x0) <= 14 &&
      Math.abs(span.end - band.x1) <= 14
    ) {
      band.y1 = y;
      band.x0 = Math.min(band.x0, span.start);
      band.x1 = Math.max(band.x1, span.end);
    } else {
      bands.push({ y0: y, y1: y, x0: span.start, x1: span.end });
    }
  }
  if (bands.length < 3) return null;

  const tolerance = Math.max(8, Math.round(width * 0.05));
  const clusters: RuleBand[][] = [];
  for (const band of bands) {
    let placed = false;
    for (const cluster of clusters) {
      const x0 = median(cluster.map((item) => item.x0));
      const x1 = median(cluster.map((item) => item.x1));
      if (Math.abs(band.x0 - x0) <= tolerance && Math.abs(band.x1 - x1) <= tolerance) {
        cluster.push(band);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([band]);
  }

  const cluster = clusters
    .filter((group) => group.length >= 3)
    .sort((a, b) => b.length - a.length)[0];
  if (!cluster) return null;

  const y0 = Math.min(...cluster.map((band) => band.y0));
  const y1 = Math.max(...cluster.map((band) => band.y1));
  const x0 = Math.min(...cluster.map((band) => band.x0));
  const x1 = Math.max(...cluster.map((band) => band.x1));
  if (x1 - x0 < minWidth || y1 - y0 < height * 0.12) return null;
  if (x1 - x0 > width * 0.96 && y1 - y0 > height * 0.96) return null;
  return {
    score: cluster.length + (1 - (x1 - x0) / width) * 0.25,
    rect: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? 0;
}

function contentBounds(gray: Float32Array, width: number, height: number): Rect | null {
  const threshold = otsu(gray);
  const rowInk = new Float32Array(height);
  const colInk = new Float32Array(width);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (gray[y * width + x] < threshold) {
        rowInk[y] += 1;
        colInk[x] += 1;
      }
    }
  }
  const rowCut = width * 0.012;
  const colCut = height * 0.012;
  let top = 0;
  let bottom = height - 1;
  let left = 0;
  let right = width - 1;
  while (top < bottom && rowInk[top] < rowCut) top += 1;
  while (bottom > top && rowInk[bottom] < rowCut) bottom -= 1;
  while (left < right && colInk[left] < colCut) left += 1;
  while (right > left && colInk[right] < colCut) right -= 1;
  const rectWidth = right - left + 1;
  const rectHeight = bottom - top + 1;
  if (rectWidth < width * 0.2 || rectHeight < height * 0.2) return null;
  return { x: left, y: top, width: rectWidth, height: rectHeight };
}

function longestSpan(
  dark: Uint8Array,
  width: number,
  height: number,
  index: number,
  vertical: boolean,
  gap: number,
): { start: number; end: number; length: number } {
  const limit = vertical ? height : width;
  let bestStart = 0;
  let bestEnd = 0;
  let runStart = 0;
  let run = 0;
  let holes = 0;
  for (let i = 0; i < limit; i += 1) {
    const pixel = vertical ? dark[i * width + index] : dark[index * width + i];
    if (pixel) {
      if (run === 0) runStart = i - holes;
      run += holes + 1;
      holes = 0;
      if (run > bestEnd - bestStart) {
        bestStart = Math.max(0, runStart);
        bestEnd = i + 1;
      }
    } else {
      holes += 1;
      if (holes > gap) {
        run = 0;
        holes = 0;
      }
    }
  }
  return { start: bestStart, end: bestEnd, length: bestEnd - bestStart };
}

function ensureReadableSize(source: HTMLCanvasElement): HTMLCanvasElement {
  const long = Math.max(source.width, source.height);
  if (long >= 1100) return source;
  const scale = Math.min(3, 1200 / long);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  const context = canvas.getContext('2d');
  if (!context) return source;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function downscale(
  gray: Float32Array,
  width: number,
  height: number,
  maxSide: number,
  darkest = false,
): { gray: Float32Array; width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  if (scale === 1) return { gray, width, height };
  const nextWidth = Math.max(1, Math.round(width * scale));
  const nextHeight = Math.max(1, Math.round(height * scale));
  const out = new Float32Array(nextWidth * nextHeight);
  for (let y = 0; y < nextHeight; y += 1) {
    const y0 = Math.min(height - 1, Math.floor((y * height) / nextHeight));
    const y1 = Math.min(height, Math.max(y0 + 1, Math.floor(((y + 1) * height) / nextHeight)));
    for (let x = 0; x < nextWidth; x += 1) {
      const x0 = Math.min(width - 1, Math.floor((x * width) / nextWidth));
      const x1 = Math.min(width, Math.max(x0 + 1, Math.floor(((x + 1) * width) / nextWidth)));
      let sum = 0;
      let count = 0;
      let darkestValue = 255;
      for (let yy = y0; yy < y1; yy += 1) {
        for (let xx = x0; xx < x1; xx += 1) {
          const value = gray[yy * width + xx];
          sum += value;
          count += 1;
          if (value < darkestValue) darkestValue = value;
        }
      }
      out[y * nextWidth + x] = darkest ? darkestValue : count ? sum / count : gray[y0 * width + x0];
    }
  }
  return { gray: out, width: nextWidth, height: nextHeight };
}

function otsu(gray: Float32Array): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i += 1) {
    const value = gray[i] < 0 ? 0 : gray[i] > 255 ? 255 : gray[i] | 0;
    hist[value] += 1;
  }
  let sum = 0;
  for (let i = 0; i < 256; i += 1) sum += i * hist[i];
  let sumBackground = 0;
  let weightBackground = 0;
  let max = 0;
  let threshold = 128;
  const total = gray.length;
  for (let i = 0; i < 256; i += 1) {
    weightBackground += hist[i];
    if (!weightBackground) continue;
    const weightForeground = total - weightBackground;
    if (!weightForeground) break;
    sumBackground += i * hist[i];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const between = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;
    if (between > max) {
      max = between;
      threshold = i;
    }
  }
  return threshold;
}

function stretch(gray: Float32Array): Float32Array {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i += 1) {
    const value = gray[i] < 0 ? 0 : gray[i] > 255 ? 255 : gray[i] | 0;
    hist[value] += 1;
  }
  const total = gray.length;
  let seen = 0;
  let low = 0;
  let high = 255;
  for (let i = 0; i < 256; i += 1) {
    seen += hist[i];
    if (seen >= total * 0.02) {
      low = i;
      break;
    }
  }
  seen = 0;
  for (let i = 255; i >= 0; i -= 1) {
    seen += hist[i];
    if (seen >= total * 0.02) {
      high = i;
      break;
    }
  }
  const range = Math.max(1, high - low);
  const out = new Float32Array(gray.length);
  for (let i = 0; i < gray.length; i += 1) {
    out[i] = Math.max(0, Math.min(255, ((gray[i] - low) * 255) / range));
  }
  return out;
}

function unsharp(gray: Float32Array, width: number, height: number): Float32Array {
  const blur = new Float32Array(gray.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      for (let yy = Math.max(0, y - 1); yy <= Math.min(height - 1, y + 1); yy += 1) {
        for (let xx = Math.max(0, x - 1); xx <= Math.min(width - 1, x + 1); xx += 1) {
          sum += gray[yy * width + xx];
          count += 1;
        }
      }
      blur[y * width + x] = sum / count;
    }
  }
  const out = new Float32Array(gray.length);
  for (let i = 0; i < gray.length; i += 1) {
    out[i] = Math.max(0, Math.min(255, gray[i] + 0.85 * (gray[i] - blur[i])));
  }
  return out;
}

function sauvola(gray: Float32Array, width: number, height: number): Uint8Array {
  const radius = 15;
  const integral = new Float64Array((width + 1) * (height + 1));
  const integralSq = new Float64Array((width + 1) * (height + 1));
  const stride = width + 1;
  for (let y = 1; y <= height; y += 1) {
    let row = 0;
    let rowSq = 0;
    for (let x = 1; x <= width; x += 1) {
      const value = gray[(y - 1) * width + (x - 1)];
      row += value;
      rowSq += value * value;
      integral[y * stride + x] = integral[(y - 1) * stride + x] + row;
      integralSq[y * stride + x] = integralSq[(y - 1) * stride + x] + rowSq;
    }
  }
  const out = new Uint8Array(gray.length);
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum = areaSum(integral, stride, x0, y0, x1, y1);
      const sumSq = areaSum(integralSq, stride, x0, y0, x1, y1);
      const mean = sum / area;
      const variance = Math.max(0, sumSq / area - mean * mean);
      const threshold = mean * (1 + 0.34 * (Math.sqrt(variance) / 128 - 1));
      out[y * width + x] = gray[y * width + x] < threshold ? 0 : 255;
    }
  }
  return out;
}

function areaSum(integral: Float64Array, stride: number, x0: number, y0: number, x1: number, y1: number): number {
  const a = integral[y0 * stride + x0];
  const b = integral[y0 * stride + (x1 + 1)];
  const c = integral[(y1 + 1) * stride + x0];
  const d = integral[(y1 + 1) * stride + (x1 + 1)];
  return d - b - c + a;
}
