import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  historyDepth,
  installHistory,
  pushHistoryEntry,
  releaseHistoryEntry,
  resetHistoryForTests,
  type HistoryPort,
} from './historyNav';

function mockHistory() {
  let index = 0;
  const listeners = new Set<() => void>();
  const port: HistoryPort = {
    pushState() {
      index += 1;
    },
    go(delta) {
      index += delta;
      listeners.forEach((listener) => listener());
    },
    addPopListener(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    port,
    get index() {
      return index;
    },
    back() {
      port.go(-1);
    },
  };
}

async function settle() {
  await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
}

describe('history stack', () => {
  let history: ReturnType<typeof mockHistory>;
  let uninstall: () => void;

  beforeEach(() => {
    resetHistoryForTests();
    history = mockHistory();
    uninstall = installHistory(history.port);
  });

  afterEach(() => {
    uninstall();
    resetHistoryForTests();
  });

  it('closes only the top layer on back', async () => {
    const closed: string[] = [];
    pushHistoryEntry(() => closed.push('tab'));
    pushHistoryEntry(() => closed.push('sheet'));
    await settle();
    expect(history.index).toBe(2);
    history.back();
    expect(closed).toEqual(['sheet']);
    expect(historyDepth()).toBe(1);
    history.back();
    expect(closed).toEqual(['sheet', 'tab']);
    expect(historyDepth()).toBe(0);
    expect(history.index).toBe(0);
  });

  it('syncs one history.go when several layers unmount together', async () => {
    const closed: string[] = [];
    const chooser = pushHistoryEntry(() => closed.push('chooser'));
    const scan = pushHistoryEntry(() => closed.push('scan'));
    const review = pushHistoryEntry(() => closed.push('review'));
    releaseHistoryEntry(review);
    releaseHistoryEntry(scan);
    releaseHistoryEntry(chooser);
    await settle();
    expect(closed).toEqual([]);
    expect(historyDepth()).toBe(0);
    expect(history.index).toBe(0);
  });

  it('drops a layer that unmounted because a tab changed, then back restores the tab', async () => {
    const closed: string[] = [];
    const sheet = pushHistoryEntry(() => closed.push('sheet'));
    pushHistoryEntry(() => closed.push('tab'));
    releaseHistoryEntry(sheet);
    await settle();
    expect(historyDepth()).toBe(1);
    expect(history.index).toBe(1);
    history.back();
    expect(closed).toEqual(['tab']);
    expect(history.index).toBe(0);
  });

  it('survives a strict-mode remount (push, release, push) as a single entry', async () => {
    const first = pushHistoryEntry(() => undefined);
    releaseHistoryEntry(first);
    pushHistoryEntry(() => undefined);
    await settle();
    expect(historyDepth()).toBe(1);
    expect(history.index).toBe(1);
  });

  it('ignores release of an entry back already removed', async () => {
    const closed: string[] = [];
    const entry = pushHistoryEntry(() => closed.push('sheet'));
    history.back();
    releaseHistoryEntry(entry);
    await settle();
    expect(closed).toEqual(['sheet']);
    expect(history.index).toBe(0);
  });
});
