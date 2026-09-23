import type { UnitSystem } from '../types';

export function kgToLb(kg: number): number {
  return kg * 2.2046226218;
}

export function lbToKg(lb: number): number {
  return lb / 2.2046226218;
}

export function cmToInches(cm: number): number {
  return cm / 2.54;
}

export function feetInchesToCm(feet: number, inches: number): number {
  return (feet * 12 + inches) * 2.54;
}

export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const total = cmToInches(cm);
  let feet = Math.floor(total / 12);
  let inches = Math.round(total - feet * 12);
  if (inches === 12) {
    feet += 1;
    inches = 0;
  }
  return { feet, inches };
}

export function formatWeight(kg: number, units: UnitSystem, digits = 1): string {
  const value = units === 'imperial' ? kgToLb(kg) : kg;
  const unit = units === 'imperial' ? 'lb' : 'kg';
  return `${trim(value, digits)} ${unit}`;
}

export function formatHeight(cm: number, units: UnitSystem): string {
  if (units === 'imperial') {
    const { feet, inches } = cmToFeetInches(cm);
    return `${feet} ft ${inches} in`;
  }
  return `${Math.round(cm)} cm`;
}

export function trim(n: number, digits: number): string {
  const factor = 10 ** digits;
  const rounded = Math.round(n * factor) / factor;
  return rounded.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}
