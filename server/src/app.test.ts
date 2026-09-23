import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { Store } from './store.js';

function appWithMemoryStore() {
  return createApp(new Store(null));
}

describe('MacroFlow API', () => {
  it('reports health', async () => {
    const res = await request(appWithMemoryStore()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('returns default goals', async () => {
    const res = await request(appWithMemoryStore()).get('/api/goals');
    expect(res.status).toBe(200);
    expect(res.body.calories).toBe(2200);
  });

  it('updates goals', async () => {
    const app = appWithMemoryStore();
    const res = await request(app)
      .put('/api/goals')
      .send({ calories: 2000, protein: 150, carbs: 200, fat: 60 });
    expect(res.status).toBe(200);
    expect(res.body.calories).toBe(2000);
  });

  it('rejects invalid goals', async () => {
    const res = await request(appWithMemoryStore())
      .put('/api/goals')
      .send({ calories: -1 });
    expect(res.status).toBe(400);
  });

  it('adds, lists and deletes entries and computes a summary', async () => {
    const app = appWithMemoryStore();
    const date = '2026-01-15';

    const add = await request(app).post('/api/entries').send({
      name: 'Chicken breast',
      date,
      servings: 2,
      calories: 165,
      protein: 31,
      carbs: 0,
      fat: 3.6
    });
    expect(add.status).toBe(201);
    const id = add.body.id as string;
    expect(id).toBeTruthy();

    const list = await request(app).get('/api/entries').query({ date });
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);

    const summary = await request(app).get('/api/summary').query({ date });
    expect(summary.status).toBe(200);
    expect(summary.body.consumed.calories).toBe(330);
    expect(summary.body.consumed.protein).toBe(62);
    expect(summary.body.remaining.calories).toBe(2200 - 330);

    const del = await request(app).delete(`/api/entries/${id}`);
    expect(del.status).toBe(204);

    const empty = await request(app).get('/api/entries').query({ date });
    expect(empty.body).toHaveLength(0);
  });

  it('validates new entry payloads', async () => {
    const res = await request(appWithMemoryStore())
      .post('/api/entries')
      .send({ name: '', date: 'nope' });
    expect(res.status).toBe(400);
  });
});
