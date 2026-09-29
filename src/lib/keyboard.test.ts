import { describe, expect, it } from 'vitest';
import { decideFocusRestore } from './keyboard';

describe('decideFocusRestore', () => {
  const base = {
    pointerDownOutside: false,
    relatedTargetIsField: false,
    msSinceFocus: 120,
    msSinceKeyboardOpened: 40,
    restores: 0,
  };

  it('refocuses when the keyboard has just opened and stolen the field', () => {
    expect(decideFocusRestore(base)).toBe(true);
  });

  it('lets a tap outside dismiss the keyboard', () => {
    expect(decideFocusRestore({ ...base, pointerDownOutside: true })).toBe(false);
  });

  it('lets focus move to another field', () => {
    expect(decideFocusRestore({ ...base, relatedTargetIsField: true })).toBe(false);
  });

  it('does not refocus when the keyboard is merely closing later', () => {
    expect(decideFocusRestore({ ...base, msSinceFocus: 4000, msSinceKeyboardOpened: 4000 })).toBe(false);
  });

  it('stops after two restores so a resize loop cannot stick', () => {
    expect(decideFocusRestore({ ...base, restores: 2 })).toBe(false);
  });
});
