import type { ItemDef, ItemState } from './types';

type Snapshot = {
  items: ItemDef[];
  states: Record<string, ItemState>;
};

const MAX_HISTORY = 50;
const DEBOUNCE_MS = 400;

function cloneSnapshot(items: ItemDef[], states: Record<string, ItemState>): Snapshot {
  return {
    items: items.map(i => ({ ...i, props: { ...i.props } })),
    states: Object.fromEntries(
      Object.entries(states).map(([k, v]) => [k, { ...v }])
    ),
  };
}

export function createHistory() {
  let stack: Snapshot[] = [];
  let pointer = -1;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingSnapshot: Snapshot | null = null;

  function commitPending() {
    if (!pendingSnapshot) return;
    stack = stack.slice(0, pointer + 1);
    stack.push(pendingSnapshot);
    if (stack.length > MAX_HISTORY) stack.shift();
    pointer = stack.length - 1;
    pendingSnapshot = null;
  }

  return {
    /** Immediate push — use for discrete operations (delete, duplicate, paste, etc.) */
    push(items: ItemDef[], states: Record<string, ItemState>) {
      // Flush any pending debounced entry first
      if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
      commitPending();

      stack = stack.slice(0, pointer + 1);
      stack.push(cloneSnapshot(items, states));
      if (stack.length > MAX_HISTORY) stack.shift();
      pointer = stack.length - 1;
    },

    /**
     * Debounced push — use for continuous operations (scrubbing, arrow keys,
     * slider drags, control panel adjustments). Rapid calls within DEBOUNCE_MS
     * coalesce into a single undo entry: the first call captures the "before"
     * snapshot, subsequent calls just update the "after" state. When the burst
     * stops, one entry is committed.
     */
    pushDebounced(items: ItemDef[], states: Record<string, ItemState>) {
      // Always update the pending snapshot to the latest state
      pendingSnapshot = cloneSnapshot(items, states);

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        commitPending();
      }, DEBOUNCE_MS);
    },

    /** Flush any pending debounced entry immediately (e.g. before undo) */
    flush() {
      if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
      commitPending();
    },

    undo(): Snapshot | null {
      // Flush pending so the current state is saved before undoing
      if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
      commitPending();

      if (pointer <= 0) return null;
      pointer--;
      return stack[pointer];
    },

    redo(): Snapshot | null {
      if (pointer >= stack.length - 1) return null;
      pointer++;
      return stack[pointer];
    },

    get canUndo() { return pointer > 0 || pendingSnapshot !== null; },
    get canRedo() { return pointer < stack.length - 1; },
  };
}
