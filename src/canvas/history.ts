import type { ItemDef, ItemState } from './types';

type Snapshot = {
  items: ItemDef[];
  states: Record<string, ItemState>;
};

const MAX_HISTORY = 50;

export function createHistory() {
  let stack: Snapshot[] = [];
  let pointer = -1;

  return {
    push(items: ItemDef[], states: Record<string, ItemState>) {
      // Discard any redo entries after current pointer
      stack = stack.slice(0, pointer + 1);
      stack.push({
        items: items.map(i => ({ ...i })),
        states: Object.fromEntries(
          Object.entries(states).map(([k, v]) => [k, { ...v }])
        ),
      });
      if (stack.length > MAX_HISTORY) {
        stack.shift();
      }
      pointer = stack.length - 1;
    },

    undo(): Snapshot | null {
      if (pointer <= 0) return null;
      pointer--;
      return stack[pointer];
    },

    redo(): Snapshot | null {
      if (pointer >= stack.length - 1) return null;
      pointer++;
      return stack[pointer];
    },

    get canUndo() { return pointer > 0; },
    get canRedo() { return pointer < stack.length - 1; },
  };
}
