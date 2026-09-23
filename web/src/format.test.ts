import { describe, expect, it } from 'vitest';
import { macroLabel, pctOfGoal, round, unitFor } from './format';

describe('format helpers', () => {
  it('rounds to one decimal', () => {
    expect(round(1.234)).toBe(1.2);
    expect(round(2)).toBe(2);
  });

  it('computes percentage of goal capped at 100', () => {
    expect(pctOfGoal(50, 100)).toBe(50);
    expect(pctOfGoal(150, 100)).toBe(100);
    expect(pctOfGoal(10, 0)).toBe(0);
  });

  it('labels macros', () => {
    expect(macroLabel('calories')).toBe('Calories');
    expect(macroLabel('protein')).toBe('Protein');
  });

  it('uses correct units', () => {
    expect(unitFor('calories')).toBe('kcal');
    expect(unitFor('protein')).toBe('g');
  });
});
