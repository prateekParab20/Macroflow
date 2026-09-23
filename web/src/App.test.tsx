import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { App } from './App';

const summary = {
  date: '2026-01-15',
  goals: { calories: 2200, protein: 160, carbs: 220, fat: 70 },
  consumed: { calories: 330, protein: 62, carbs: 0, fat: 7.2 },
  remaining: { calories: 1870, protein: 98, carbs: 220, fat: 62.8 },
  entryCount: 1
};

const entries = [
  {
    id: 'e1',
    name: 'Chicken breast',
    date: '2026-01-15',
    servings: 2,
    calories: 165,
    protein: 31,
    carbs: 0,
    fat: 3.6,
    createdAt: '2026-01-15T10:00:00.000Z'
  }
];

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const body = url.includes('/summary') ? summary : entries;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    })
  );
});

describe('<App />', () => {
  it('renders the header and loaded data', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /MacroFlow/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Chicken breast')).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: 'Calories' })).toBeInTheDocument();
  });
});
