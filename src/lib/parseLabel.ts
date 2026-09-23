export type FieldKey =
  | 'name'
  | 'servingSize'
  | 'calories'
  | 'protein'
  | 'carbs'
  | 'fat'
  | 'fiber'
  | 'sodium';

export type FieldConfidence = 'high' | 'low';

export interface ParsedLabel {
  name?: string;
  servingSize?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  sodium?: number;
  confidence: Partial<Record<FieldKey, FieldConfidence>>;
  warnings: string[];
  rawText: string;
}

function cleanLine(line: string): string {
  return line
    .replace(/[|]/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/’/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeNumbers(text: string): string {
  return text.replace(/\b[0-9OoIl|S.,]+\b/g, (token) => {
    if (!/\d/.test(token)) return token;
    const digits = token
      .replace(/[Oo]/g, '0')
      .replace(/[Il|]/g, '1')
      .replace(/S/g, '5')
      .replace(/(\d)[,\s](?=\d{3}\b)/g, '$1');
    return /^\d+(?:\.\d+)?$/.test(digits) ? digits : token;
  });
}

function isFootnote(line: string): boolean {
  return /based on|calorie diet|daily values are|percent daily|% daily value|\*\s*the/i.test(line);
}

function looksLikeLabel(line: string): boolean {
  return /fat|carb|protein|sodium|fiber|cholesterol|calor|serving|vitamin|iron|calcium|potassium|sugar|nutrition/i.test(
    line,
  );
}

function tidyAmount(value: number, kind: 'kcal' | 'g' | 'mg'): number {
  if (kind === 'g') return Math.round(value * 10) / 10;
  return Math.round(value);
}

function extractAmount(text: string, kind: 'kcal' | 'g' | 'mg'): number | undefined {
  const normalized = normalizeNumbers(text);
  if (kind === 'mg') {
    const withUnit = normalized.match(/(\d{1,5}(?:\.\d+)?)\s*mg\b/i);
    if (withUnit) return Number(withUnit[1]);
    const bare = normalized.match(/(\d{1,5}(?:\.\d+)?)/);
    return bare ? Number(bare[1]) : undefined;
  }
  if (kind === 'g') {
    const withUnit = normalized.match(/(\d{1,4}(?:\.\d+)?)\s*g\b/i);
    if (withUnit) return Number(withUnit[1]);
    const plain = normalized.match(/(\d{1,4}(?:\.\d+)?)(?!\s*%)/);
    return plain ? Number(plain[1]) : undefined;
  }
  const match = normalized.match(/(\d{1,4})(?!\s*%)/);
  if (!match) return undefined;
  const value = Number(match[1]);
  if (value > 4000) return undefined;
  return value;
}

function findAmount(
  lines: string[],
  predicate: (line: string) => boolean,
  kind: 'kcal' | 'g' | 'mg',
): { value: number; confidence: FieldConfidence } | undefined {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!predicate(line)) continue;
    const same = extractAmount(line, kind);
    if (same != null) return { value: tidyAmount(same, kind), confidence: 'high' };
    const next = lines[i + 1];
    if (next && !looksLikeLabel(next) && !isFootnote(next)) {
      const value = extractAmount(next, kind);
      if (value != null) return { value: tidyAmount(value, kind), confidence: 'low' };
    }
  }
  return undefined;
}

function parseServing(lines: string[]): { value?: string; confidence?: FieldConfidence } {
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/serv(?:ing)?\.?\s*size\s*[:\-]?\s*(.*)$/i);
    if (!match) continue;
    let value = match[1].trim();
    let confidence: FieldConfidence = 'high';
    if (!value && lines[i + 1] && !looksLikeLabel(lines[i + 1])) {
      value = lines[i + 1].trim();
      confidence = 'low';
    }
    value = value.replace(/\s+/g, ' ').slice(0, 48);
    if (value) return { value, confidence };
  }
  return {};
}

function parseName(lines: string[]): string | undefined {
  for (const line of lines) {
    if (isFootnote(line) || looksLikeLabel(line)) continue;
    if (line.length < 3 || line.length > 42) continue;
    if (/^\d/.test(line)) continue;
    if (/amount|facts|container|ingredients/i.test(line)) continue;
    return line;
  }
  return undefined;
}

export function parseNutritionLabel(raw: string): ParsedLabel {
  const rawText = raw.replace(/\r/g, '').trim();
  const lines = rawText
    .split('\n')
    .map(cleanLine)
    .filter((line) => line.length > 0);

  const confidence: ParsedLabel['confidence'] = {};
  const parsed: ParsedLabel = { confidence, warnings: [], rawText };

  const serving = parseServing(lines);
  if (serving.value) {
    parsed.servingSize = serving.value;
    confidence.servingSize = serving.confidence;
  }

  const name = parseName(lines);
  if (name) {
    parsed.name = name;
    confidence.name = 'low';
  }

  const calories = findAmount(
    lines,
    (line) => !isFootnote(line) && !/from\s*fat/i.test(line) && /calor/i.test(line),
    'kcal',
  );
  const fat = findAmount(
    lines,
    (line) =>
      !isFootnote(line) &&
      !/saturat|trans|polyunsat|monounsat|calor/i.test(line) &&
      /\bfat\b/i.test(line),
    'g',
  );
  const carbs = findAmount(
    lines,
    (line) => !isFootnote(line) && !/fiber|sugar/i.test(line) && /carb/i.test(line),
    'g',
  );
  const fiber = findAmount(lines, (line) => /fiber/i.test(line), 'g');
  const protein = findAmount(lines, (line) => /\bprotein\b/i.test(line), 'g');
  const sodium = findAmount(lines, (line) => /\bsodium\b/i.test(line), 'mg');

  if (calories) {
    parsed.calories = calories.value;
    confidence.calories = calories.confidence;
  }
  if (fat) {
    parsed.fat = fat.value;
    confidence.fat = fat.confidence;
  }
  if (carbs) {
    parsed.carbs = carbs.value;
    confidence.carbs = carbs.confidence;
  }
  if (fiber) {
    parsed.fiber = fiber.value;
    confidence.fiber = fiber.confidence;
  }
  if (protein) {
    parsed.protein = protein.value;
    confidence.protein = protein.confidence;
  }
  if (sodium) {
    parsed.sodium = sodium.value;
    confidence.sodium = sodium.confidence;
  }

  const missing: string[] = [];
  if (parsed.calories == null) missing.push('calories');
  if (parsed.protein == null) missing.push('protein');
  if (parsed.carbs == null) missing.push('carbs');
  if (parsed.fat == null) missing.push('fat');
  if (missing.length) {
    parsed.warnings.push(`Couldn't read ${missing.join(', ')}. Fill those in before saving.`);
  } else {
    parsed.warnings.push('Check the numbers against the label, then save.');
  }

  return parsed;
}
