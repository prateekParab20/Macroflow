import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../index.css'), 'utf8');

function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThan(-1);
  const end = css.indexOf('}', start);
  return css.slice(start, end);
}

describe('mobile input shells', () => {
  it('does not use backdrop-filter, which dismisses the Android keyboard', () => {
    expect(css.length).toBeGreaterThan(1000);
    expect(css).not.toMatch(/backdrop-filter/);
  });

  it('centers the modal and tab bar without a transform ancestor', () => {
    expect(rule('.modal')).not.toMatch(/transform/);
    expect(rule('.tabbar')).not.toMatch(/transform/);
  });

  it('does not animate sheets or pages with transform', () => {
    const rise = css.slice(css.indexOf('@keyframes rise'), css.indexOf('@keyframes sheet-in'));
    const sheet = css.slice(css.indexOf('@keyframes sheet-in'), css.indexOf('@media (prefers-reduced-motion'));
    expect(rise).not.toMatch(/transform/);
    expect(sheet).not.toMatch(/transform/);
  });
});
