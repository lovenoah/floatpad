import type { ItemDef, ItemState } from './types';

const STORAGE_KEY = 'floatpad-positions-v1';
const ITEMS_KEY = 'floatpad-items-v1';
const DELETED_KEY = 'floatpad-deleted-v1';

export function loadState(label: string, defaults: ItemState): ItemState {
  if (typeof window === 'undefined') return defaults;
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return all[label] ?? defaults;
  } catch {
    return defaults;
  }
}

export function saveState(label: string, state: ItemState) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    all[label] = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch { /* noop */ }
}

export function removeState(label: string) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    delete all[label];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch { /* noop */ }
}

export function loadDeletedLabels(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
}

export function markDeleted(label: string) {
  try {
    const deleted = loadDeletedLabels();
    deleted.add(label);
    localStorage.setItem(DELETED_KEY, JSON.stringify([...deleted]));
  } catch { /* noop */ }
}

export function loadItems(initialItems: ItemDef[]): ItemDef[] {
  if (typeof window === 'undefined') return initialItems;
  try {
    const stored = localStorage.getItem(ITEMS_KEY);
    if (stored) {
      const items: ItemDef[] = JSON.parse(stored);
      const labels = new Set(items.map(i => i.label));
      const deleted = loadDeletedLabels();
      const missing = initialItems.filter(i => !labels.has(i.label) && !deleted.has(i.label));
      if (missing.length > 0) {
        const merged = [...items, ...missing];
        localStorage.setItem(ITEMS_KEY, JSON.stringify(merged));
        return merged;
      }
      return items;
    }
  } catch { /* noop */ }
  return initialItems;
}

export function saveItems(items: ItemDef[]) {
  try {
    localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
  } catch { /* noop */ }
}
