import { useLayoutEffect, useRef } from 'react';
import { pushHistoryEntry, releaseHistoryEntry } from './historyNav';

export function useHistoryLayer(active: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    if (!active) return;
    const entry = pushHistoryEntry(() => onCloseRef.current());
    return () => releaseHistoryEntry(entry);
  }, [active]);
}

export function HistoryStep({ onBack }: { onBack: () => void }) {
  useHistoryLayer(true, onBack);
  return null;
}
