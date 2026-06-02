// In-memory, per-note edit history for the editor textarea. Native textarea
// undo breaks on any programmatic value write (React onChange), so the editor
// routes every mutation through this hook instead.
//
// Snapshots are { body, sel }. Plain typing is coalesced into one entry within
// a short idle window (word-ish chunks); structural ops push immediately.
import { useCallback, useRef } from 'react';

export interface Snapshot { body: string; sel: [number, number] }
type Kind = 'type' | 'structural';

const MAX = 200;
const COALESCE_MS = 400;

export interface HistoryApi {
  // Seed/reset the stack for a note (no coalescing across this boundary).
  reset: (body: string, sel: [number, number]) => void;
  // Record a new state. `kind: 'type'` coalesces rapid typing; 'structural'
  // always pushes a discrete entry.
  push: (snap: Snapshot, kind: Kind) => void;
  undo: () => Snapshot | null;
  redo: () => Snapshot | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export function useHistory(): HistoryApi {
  const stack = useRef<Snapshot[]>([{ body: '', sel: [0, 0] }]);
  const idx = useRef(0);
  const lastType = useRef(0); // timestamp of the last coalesced 'type' push

  const reset = useCallback((body: string, sel: [number, number]) => {
    stack.current = [{ body, sel }];
    idx.current = 0;
    lastType.current = 0;
  }, []);

  const push = useCallback((snap: Snapshot, kind: Kind) => {
    // Drop any redo tail.
    if (idx.current < stack.current.length - 1) {
      stack.current = stack.current.slice(0, idx.current + 1);
    }
    const now = Date.now();
    const coalesce =
      kind === 'type' &&
      stack.current[idx.current] &&
      now - lastType.current < COALESCE_MS &&
      lastType.current !== 0;

    if (coalesce) {
      stack.current[idx.current] = snap; // overwrite the in-progress typing entry
    } else {
      stack.current.push(snap);
      idx.current = stack.current.length - 1;
      if (stack.current.length > MAX) {
        stack.current.shift();
        idx.current = stack.current.length - 1;
      }
    }
    lastType.current = kind === 'type' ? now : 0;
  }, []);

  const undo = useCallback((): Snapshot | null => {
    if (idx.current <= 0) return null;
    idx.current -= 1;
    lastType.current = 0;
    return stack.current[idx.current];
  }, []);

  const redo = useCallback((): Snapshot | null => {
    if (idx.current >= stack.current.length - 1) return null;
    idx.current += 1;
    lastType.current = 0;
    return stack.current[idx.current];
  }, []);

  const canUndo = useCallback(() => idx.current > 0, []);
  const canRedo = useCallback(() => idx.current < stack.current.length - 1, []);

  return { reset, push, undo, redo, canUndo, canRedo };
}
