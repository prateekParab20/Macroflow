export interface HistoryEntry {
  close: () => void;
}

export interface HistoryPort {
  pushState(state: unknown): void;
  go(delta: number): void;
  addPopListener(listener: () => void): () => void;
}

let port: HistoryPort | null = null;
let detach: (() => void) | null = null;
let desired: HistoryEntry[] = [];
let applied = 0;
let suppress = 0;
let scheduled = false;

function onPopState() {
  if (suppress > 0) {
    suppress -= 1;
    return;
  }
  if (desired.length === 0) return;
  applied = Math.max(0, applied - 1);
  const top = desired.pop();
  top?.close();
}

function flush() {
  scheduled = false;
  if (!port || desired.length >= applied) return;
  const drop = applied - desired.length;
  applied = desired.length;
  suppress += 1;
  port.go(-drop);
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(flush);
}

export function installHistory(next: HistoryPort) {
  detach?.();
  port = next;
  detach = next.addPopListener(onPopState);
  return () => {
    detach?.();
    detach = null;
    port = null;
  };
}

export function installBrowserHistory() {
  if (typeof window === 'undefined') return () => {};
  return installHistory({
    pushState(state) {
      window.history.pushState(state, '');
    },
    go(delta) {
      window.history.go(delta);
    },
    addPopListener(listener) {
      window.addEventListener('popstate', listener);
      return () => window.removeEventListener('popstate', listener);
    },
  });
}

export function pushHistoryEntry(close: () => void): HistoryEntry {
  const entry: HistoryEntry = { close };
  desired.push(entry);
  applied += 1;
  port?.pushState({ mf: applied });
  return entry;
}

export function releaseHistoryEntry(entry: HistoryEntry) {
  const index = desired.indexOf(entry);
  if (index === -1) return;
  desired.splice(index, 1);
  schedule();
}

export function historyDepth(): number {
  return desired.length;
}

export function resetHistoryForTests() {
  desired = [];
  applied = 0;
  suppress = 0;
  scheduled = false;
}
