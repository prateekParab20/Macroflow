import { parseMeasure } from './quantity';
import type { MetricUnit, NutritionBasis } from '../types';

export type FieldKey =
  | 'name'
  | 'servingSize'
  | 'calories'
  | 'protein'
  | 'carbs'
  | 'fat'
  | 'fiber'
  | 'sugar'
  | 'sodium';

export type FieldConfidence = 'high' | 'low';

export interface OcrToken {
  text: string;
  confidence: number;
}

export interface ParsedLabel {
  name?: string;
  servingSize?: string;
  basis: NutritionBasis;
  basisAmount?: number;
  basisUnit?: MetricUnit;
  householdUnit?: string;
  householdCount?: number;
  householdMetric?: number;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  confidence: Partial<Record<FieldKey, FieldConfidence>>;
  warnings: string[];
  rawText: string;
}

type Kind = 'calories' | 'fat' | 'carbs' | 'fiber' | 'sugar' | 'protein' | 'sodium';
type Slot = Kind | 'ignore';
type UnitKind = 'kcal' | 'g' | 'mg';

interface Hit {
  value: number;
  confidence: FieldConfidence;
}

const CORE: Kind[] = ['calories', 'protein', 'carbs', 'fat'];

function repairWords(raw: string): string {
  return raw
    .replace(/\r/g, '')
    .replace(/\bnutriti[o0]n\b/gi, 'Nutrition')
    .replace(/\bserv[i1l|]ngs\b/gi, 'Servings')
    .replace(/\bserv[i1l|]ng\b/gi, 'Serving')
    .replace(/\bs[i1l|]ze\b/gi, 'size')
    .replace(/\bcalor[i1l|]es?\b/gi, 'Calories')
    .replace(/\bprot(?:ein|eln|e1n|em)\b/gi, 'Protein')
    .replace(/\bsod(?:ium|lum|1um)\b/gi, 'Sodium')
    .replace(/\bf[i1l]b(?:er|re)\b/gi, 'Fiber')
    .replace(/\bcarbohv\w*/gi, 'Carbohydrate')
    .replace(/\bcarb0hydrate\b/gi, 'Carbohydrate')
    .replace(/\bsaturat\w*/gi, 'Saturated')
    .replace(/\bcholest\w*/gi, 'Cholesterol')
    .replace(/\bsug[ae]rs?\b/gi, 'Sugars');
}

function cleanLine(line: string): string {
  const repaired = fixOcrDigits(
    line
      .replace(/[|]/g, ' ')
      .replace(/[“”]/g, '"')
      .replace(/’/g, "'")
      .replace(/(\d+(?:\.\d+)?)9(\s+\d{1,3}\s*%)/g, '$1 g$2')
      .replace(/(\d)\s*m[l1]\b/gi, '$1 ml'),
  );
  return repaired
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z%])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

function fixOcrDigits(text: string): string {
  return text
    .replace(/(\d)[Oo](?=\d|\s*[gGmM%])/g, '$10')
    .replace(/(\d)[Il|](?=\d)/g, '$11')
    .replace(/\b[Oo](?=\d)/g, '0');
}

function normalizeNumbers(text: string): string {
  return fixOcrDigits(text).replace(/\b[0-9OoIl|S.,]+\b/g, (token) => {
    if (!/\d/.test(token) && !/[OoIl|]/.test(token)) return token;
    const digits = token
      .replace(/[Oo]/g, '0')
      .replace(/[Il|]/g, '1')
      .replace(/S/g, '5')
      .replace(/(\d)[,\s](?=\d{3}\b)/g, '$1');
    return /^\d+(?:\.\d+)?$/.test(digits) ? digits : token;
  });
}

function stripPercents(line: string): string {
  return line.replace(/\d+(?:\.\d+)?\s*%/g, ' ');
}

function isFootnote(line: string): boolean {
  return /based on|calorie diet|daily values are|percent daily|% daily value|\*\s*the|daily value/i.test(line);
}

function looksLikeLabel(line: string): boolean {
  return /fat|carb|protein|sodium|fiber|fibre|cholesterol|calor|serving|vitamin|iron|calcium|potassium|sugar|nutrition|energy|salt/i.test(
    line,
  );
}

function classify(line: string): Kind | 'skip' | null {
  if (!line || isFootnote(line)) return 'skip';
  if (/from\s*fat/i.test(line)) return 'skip';
  if (/added\s*sugar|includes\s+\d/i.test(line)) return 'skip';
  if (/saturat|trans\s*fat|polyunsat|monounsat/i.test(line)) return 'skip';
  if (/cholesterol|vitamin|calcium|iron|potassium/i.test(line)) return 'skip';
  if (/soluble|insoluble/i.test(line) && /fiber|fibre/i.test(line)) return 'skip';
  if (/calor|\bkcal\b|\benergy\b/i.test(line)) return 'calories';
  if (/\bfat\b/i.test(line)) return 'fat';
  if (/fiber|fibre/i.test(line)) return 'fiber';
  if (/sugar/i.test(line)) return 'sugar';
  if (/carb/i.test(line)) return 'carbs';
  if (/protein/i.test(line)) return 'protein';
  if (/sodium/i.test(line)) return 'sodium';
  if (/\bsalt\b/i.test(line)) return 'sodium';
  return null;
}

function slotOf(line: string): Slot | null {
  const kind = classify(line);
  if (kind === 'skip') {
    if (/saturat|trans\s*fat|cholesterol/i.test(line) && !/\d/.test(stripPercents(line))) return 'ignore';
    return null;
  }
  return kind;
}

function tidy(value: number, kind: UnitKind): number {
  if (kind === 'g') return Math.round(value * 10) / 10;
  return Math.round(value);
}

function unitFor(kind: Kind, line = ''): UnitKind {
  if (kind === 'calories') return 'kcal';
  if (kind === 'sodium' && /\bsalt\b/i.test(line)) return 'g';
  if (kind === 'sodium') return 'mg';
  return 'g';
}

function numbersOf(line: string, kind: UnitKind): number[] {
  const normalized = normalizeNumbers(stripPercents(line));
  if (kind === 'kcal') {
    const labeled = [...normalized.matchAll(/(\d{1,4}(?:\.\d+)?)\s*kcal\b/gi)]
      .map((match) => Number(match[1]))
      .filter((value) => value > 0 && value <= 4000);
    if (labeled.length) return labeled;
    if (/\bkj\b/i.test(normalized) && !/kcal|calor/i.test(normalized)) return [];
    return [...normalized.matchAll(/\b(\d{1,4}(?:\.\d+)?)\b/g)]
      .map((match) => Number(match[1]))
      .filter((value) => value > 0 && value <= 4000);
  }
  if (kind === 'mg') {
    const withUnit = [...normalized.matchAll(/(\d{1,5}(?:\.\d+)?)\s*mg\b/gi)].map((match) => Number(match[1]));
    if (withUnit.length) return withUnit;
    return [...normalized.matchAll(/\b(\d{1,5}(?:\.\d+)?)\b/g)].map((match) => Number(match[1]));
  }
  const withUnit = [...normalized.matchAll(/(\d{1,4}(?:\.\d+)?)\s*g\b/gi)].map((match) => Number(match[1]));
  if (withUnit.length) return withUnit;
  return [...normalized.matchAll(/\b(\d{1,4}(?:\.\d+)?)\b/g)].map((match) => Number(match[1]));
}

function pickColumn(values: number[], index: number): number | undefined {
  if (!values.length) return undefined;
  return values[Math.min(index, values.length - 1)];
}

function detectColumns(lines: string[]): { index: number; explicit: boolean; basisHint?: NutritionBasis } {
  for (const line of lines) {
    const perServing = /per\s+serv/i.exec(line);
    const per100 = /per\s*100\s*(g|ml)/i.exec(line);
    const perContainer = /per\s+(?:container|package)/i.exec(line);
    if (perServing && per100) {
      const unit = per100[1].toLowerCase() === 'ml' ? 'per100ml' : 'per100g';
      return {
        index: perServing.index < per100.index ? 0 : 1,
        explicit: true,
        basisHint: unit,
      };
    }
    if (perServing && perContainer) {
      return {
        index: perServing.index < perContainer.index ? 0 : 1,
        explicit: true,
        basisHint: 'serving',
      };
    }
  }
  const joined = lines.join('\n');
  if (/per\s*100\s*ml/i.test(joined) && !/serving\s+size/i.test(joined) && !/per\s+serv/i.test(joined)) {
    return { index: 0, explicit: true, basisHint: 'per100ml' };
  }
  if (/per\s*100\s*g/i.test(joined) && !/serving\s+size/i.test(joined) && !/per\s+serv/i.test(joined)) {
    return { index: 0, explicit: true, basisHint: 'per100g' };
  }
  return { index: 0, explicit: false };
}

function findNutrient(lines: string[], kind: Kind, column: number, explicit: boolean): Hit | undefined {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (classify(line) !== kind) continue;
    const unit = unitFor(kind, line);
    const values = numbersOf(line, unit);
    if (values.length) {
      const picked = pickColumn(values, column);
      if (picked == null) continue;
      let value = picked;
      let confidence: FieldConfidence = !explicit && values.length > 1 ? 'low' : 'high';
      if (kind === 'sodium' && /\bsalt\b/i.test(line)) {
        value *= 400;
        confidence = 'low';
      }
      return { value: tidy(value, kind === 'sodium' && /\bsalt\b/i.test(line) ? 'mg' : unit), confidence };
    }
    const next = lines[i + 1];
    if (next && classify(next) == null && !isFootnote(next) && !inDetachedBlock(lines, i)) {
      const nextValues = numbersOf(next, unit === 'kcal' ? 'kcal' : unit);
      if (nextValues.length) {
        const picked = pickColumn(nextValues, column);
        if (picked != null) {
          const value = kind === 'sodium' && /\bsalt\b/i.test(line) ? picked * 400 : picked;
          return { value: tidy(value, unit === 'g' && kind !== 'sodium' ? 'g' : kind === 'calories' ? 'kcal' : 'mg'), confidence: 'low' };
        }
      }
    }
  }
  return undefined;
}

function lineHasAmount(line: string, kind: Kind | null): boolean {
  if (!kind) return valueNumbers(line).length > 0;
  return numbersOf(line, unitFor(kind, line)).length > 0;
}

function inDetachedBlock(lines: string[], index: number): boolean {
  let start = index;
  while (start > 0) {
    const slot = slotOf(lines[start - 1]);
    if (!slot || lineHasAmount(lines[start - 1], slot === 'ignore' ? null : slot)) break;
    start -= 1;
  }
  let end = index;
  while (end + 1 < lines.length) {
    const slot = slotOf(lines[end + 1]);
    if (!slot || lineHasAmount(lines[end + 1], slot === 'ignore' ? null : slot)) break;
    end += 1;
  }
  if (end - start + 1 < 2) return false;
  return valueNumbers(lines[end + 1] ?? '').length > 0;
}

function valueNumbers(line: string): number[] {
  const normalized = normalizeNumbers(stripPercents(line));
  const mg = [...normalized.matchAll(/(\d+(?:\.\d+)?)\s*mg\b/gi)].map((match) => Number(match[1]));
  if (mg.length) return mg;
  const grams = [...normalized.matchAll(/(\d+(?:\.\d+)?)\s*g\b/gi)].map((match) => Number(match[1]));
  if (grams.length) return grams;
  const kcal = [...normalized.matchAll(/(\d+(?:\.\d+)?)\s*kcal\b/gi)].map((match) => Number(match[1]));
  if (kcal.length) return kcal.filter((value) => value <= 4000);
  const bare = normalized.trim().match(/^(\d+(?:\.\d+)?)(?:\s+(\d+(?:\.\d+)?))?$/);
  if (!bare) return [];
  return [Number(bare[1]), ...(bare[2] ? [Number(bare[2])] : [])];
}

function zipDetached(lines: string[], column: number): Partial<Record<Kind, Hit>> {
  const found: Partial<Record<Kind, Hit>> = {};
  for (let i = 0; i < lines.length; i += 1) {
    const labels: Slot[] = [];
    let j = i;
    while (j < lines.length) {
      const slot = slotOf(lines[j]);
      if (!slot) break;
      const kind = slot === 'ignore' ? null : slot;
      const unit = kind ? unitFor(kind, lines[j]) : 'g';
      if (kind && numbersOf(lines[j], unit).length) break;
      if (slot === 'ignore' && numbersOf(lines[j], 'g').length) break;
      labels.push(slot);
      j += 1;
    }
    if (labels.length < 2) continue;
    const values: number[] = [];
    let k = j;
    while (k < lines.length && values.length < labels.length) {
      if (classify(lines[k])) break;
      if (isFootnote(lines[k])) break;
      const nums = valueNumbers(lines[k]);
      if (!nums.length) break;
      const picked = pickColumn(nums, column);
      if (picked == null) break;
      values.push(picked);
      k += 1;
    }
    if (values.length < 2) continue;
    labels.forEach((slot, index) => {
      if (slot === 'ignore' || found[slot] || values[index] == null) return;
      const unit = unitFor(slot);
      found[slot] = { value: tidy(values[index], unit === 'kcal' ? 'kcal' : slot === 'sodium' ? 'mg' : 'g'), confidence: 'low' };
    });
  }
  return found;
}

function parseServing(lines: string[]): {
  text?: string;
  confidence?: FieldConfidence;
  metricAmount?: number;
  metricUnit?: MetricUnit;
  householdCount?: number;
  householdUnit?: string;
} {
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/\bserving\s+size\b\s*[:\-]?\s*(.*)$/i);
    if (!match) continue;
    let value = match[1].trim();
    let confidence: FieldConfidence = 'high';
    if (!value) {
      const next = lines[i + 1];
      if (next && classify(next) == null && !isFootnote(next) && !/nutrition|amount per/i.test(next)) {
        value = next.trim();
        confidence = 'low';
      }
    }
    value = value.replace(/\s+/g, ' ').slice(0, 48);
    if (!value || /servings?\s+per/i.test(value)) continue;
    const measured = parseMeasure(value);
    return { text: value, confidence, ...measured };
  }
  return {};
}

function parseName(lines: string[]): string | undefined {
  for (const line of lines) {
    if (isFootnote(line) || looksLikeLabel(line)) continue;
    if (line.length < 3 || line.length > 42) continue;
    if (/^\d/.test(line)) continue;
    if (/amount|facts|container|ingredients|daily|information/i.test(line)) continue;
    return line;
  }
  return undefined;
}

function applyTokenConfidence(
  confidence: ParsedLabel['confidence'],
  key: FieldKey,
  value: number | undefined,
  tokens?: OcrToken[],
) {
  if (value == null || !tokens?.length) return;
  const needle = String(value);
  const hits = tokens.filter((token) => {
    const compact = token.text.replace(/[^\d.]/g, '');
    return compact === needle || token.text.includes(needle);
  });
  if (!hits.length) return;
  const best = Math.max(...hits.map((token) => token.confidence));
  if (best < 60) confidence[key] = 'low';
}

export function parseNutritionLabel(raw: string, tokens?: OcrToken[]): ParsedLabel {
  const rawText = raw.replace(/\r/g, '').trim();
  const lines = repairWords(rawText)
    .split('\n')
    .map(cleanLine)
    .filter((line) => line.length > 0);

  const columns = detectColumns(lines);
  const confidence: ParsedLabel['confidence'] = {};
  const parsed: ParsedLabel = {
    basis: 'serving',
    confidence,
    warnings: [],
    rawText,
  };

  const serving = parseServing(lines);
  if (serving.text) {
    parsed.servingSize = serving.text;
    confidence.servingSize = serving.confidence;
    parsed.householdUnit = serving.householdUnit;
    parsed.householdCount = serving.householdCount;
    parsed.householdMetric = serving.metricAmount;
  }

  const name = parseName(lines);
  if (name) {
    parsed.name = name;
    confidence.name = 'low';
  }

  const hits: Partial<Record<Kind, Hit>> = {};
  (['calories', 'fat', 'carbs', 'fiber', 'sugar', 'protein', 'sodium'] as Kind[]).forEach((kind) => {
    const hit = findNutrient(lines, kind, columns.index, columns.explicit);
    if (hit) hits[kind] = hit;
  });

  const detached = zipDetached(lines, columns.index);
  (Object.keys(detached) as Kind[]).forEach((kind) => {
    if (!hits[kind] && detached[kind]) hits[kind] = detached[kind];
  });

  const assign = (kind: Kind, key: FieldKey) => {
    const hit = hits[kind];
    if (!hit) return;
    parsed[key] = hit.value as never;
    confidence[key] = hit.confidence;
    applyTokenConfidence(confidence, key, hit.value, tokens);
  };

  assign('calories', 'calories');
  assign('fat', 'fat');
  assign('carbs', 'carbs');
  assign('fiber', 'fiber');
  assign('sugar', 'sugar');
  assign('protein', 'protein');
  assign('sodium', 'sodium');

  const joined = lines.join('\n');
  const per100ml = /per\s*100\s*ml/i.test(joined);
  const per100g = /per\s*100\s*g/i.test(joined);
  const hasServing = Boolean(serving.text);
  let basis: NutritionBasis = 'serving';
  if (columns.basisHint === 'serving' || (hasServing && columns.explicit && columns.basisHint)) {
    basis = 'serving';
  } else if (!hasServing && (per100ml || columns.basisHint === 'per100ml')) {
    basis = 'per100ml';
  } else if (!hasServing && (per100g || columns.basisHint === 'per100g')) {
    basis = 'per100g';
  }

  parsed.basis = basis;
  if (basis === 'per100g') {
    parsed.basisAmount = 100;
    parsed.basisUnit = 'g';
  } else if (basis === 'per100ml') {
    parsed.basisAmount = 100;
    parsed.basisUnit = 'ml';
  } else if (serving.metricAmount && serving.metricUnit) {
    parsed.basisAmount = serving.metricAmount;
    parsed.basisUnit = serving.metricUnit;
  }

  const sawTwoColumns = lines.some((line) => numbersOf(line, 'g').length > 1 || numbersOf(line, 'kcal').length > 1);
  if (sawTwoColumns && !columns.explicit) {
    parsed.warnings.push('This label lists two amounts. Confirm these are the per-serving numbers.');
  }

  const missing = CORE.filter((kind) => hits[kind] == null).map((kind) => kind);
  if (missing.length) {
    parsed.warnings.unshift(`Couldn't read ${missing.join(', ')}. Fill those in before saving.`);
  } else if (Object.values(confidence).includes('low')) {
    parsed.warnings.unshift('Check the highlighted fields against the label, then save.');
  } else {
    parsed.warnings.unshift(
      basis === 'per100g'
        ? 'Numbers are per 100 g. Compare them with the label, then save.'
        : basis === 'per100ml'
          ? 'Numbers are per 100 ml. Compare them with the label, then save.'
          : 'Numbers are filled in. Compare them with the label, then save.',
    );
  }

  return parsed;
}

export function scoreParsedLabel(parsed: ParsedLabel): number {
  let score = 0;
  if (parsed.calories != null) score += 4;
  if (parsed.protein != null) score += 3;
  if (parsed.carbs != null) score += 3;
  if (parsed.fat != null) score += 3;
  if (parsed.servingSize || parsed.basis !== 'serving') score += 3;
  if (parsed.fiber != null) score += 1;
  if (parsed.sugar != null) score += 1;
  if (parsed.sodium != null) score += 1;
  (['calories', 'protein', 'carbs', 'fat', 'servingSize'] as FieldKey[]).forEach((key) => {
    if (parsed.confidence[key] === 'high') score += 1;
    if (parsed.confidence[key] === 'low') score -= 0.5;
  });
  if (parsed.calories != null && parsed.protein != null && parsed.carbs != null && parsed.fat != null) {
    const implied = parsed.protein * 4 + parsed.carbs * 4 + parsed.fat * 9;
    if (parsed.calories > 0 && Math.abs(implied - parsed.calories) / parsed.calories > 0.45) score -= 4;
  }
  return score;
}
