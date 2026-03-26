import type { ItemDef, ItemState, NudgeSettings } from './types';

const LAYOUT_ENDPOINT = '/__justanudge/layout';
const SAVE_ENDPOINT = '/__justanudge/save';

export type LayoutData = {
  items: ItemDef[];
  states: Record<string, ItemState>;
  settings?: Partial<NudgeSettings>;
};

/**
 * Load layout from the committed JSON file.
 * Returns null if no saved layout exists yet.
 */
export async function loadLayout(): Promise<LayoutData | null> {
  try {
    const res = await fetch(LAYOUT_ENDPOINT);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.items && data.states) return data as LayoutData;
    return null;
  } catch {
    return null;
  }
}

/**
 * Save layout to the JSON file via the Vite dev server.
 * Returns true on success.
 */
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingData: LayoutData | null = null;

export function saveLayout(data: LayoutData) {
  pendingData = data;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 800);
}

async function flushSave() {
  if (!pendingData) return;
  const data = pendingData;
  pendingData = null;
  try {
    await fetch(SAVE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data, null, 2),
    });
  } catch {
    // Dev server not available (production build) — silent no-op
  }
}

/**
 * Force an immediate save (e.g. before navigating away).
 */
export async function saveLayoutNow(data: LayoutData): Promise<boolean> {
  if (saveTimer) clearTimeout(saveTimer);
  pendingData = null;
  try {
    const res = await fetch(SAVE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data, null, 2),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Flush any pending debounced save immediately (e.g. on beforeunload).
 * Uses sendBeacon so it works even during page teardown.
 */
export function flushPendingSave() {
  if (saveTimer) clearTimeout(saveTimer);
  if (!pendingData) return;
  const data = pendingData;
  pendingData = null;
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    navigator.sendBeacon(SAVE_ENDPOINT, blob);
  } catch {
    // Silent — page is closing
  }
}

/**
 * Build default states from initialItems when no layout file exists.
 */
export function defaultStatesFromItems(items: ItemDef[]): Record<string, ItemState> {
  const states: Record<string, ItemState> = {};
  for (const item of items) {
    states[item.label] = {
      x: item.x,
      y: item.y,
      scale: 1,
      rot: item.rot,
      z: item.z,
    };
  }
  return states;
}
