import type { ItemDef, ItemState } from './types';

/** Direct children of a group/frame */
export function getChildren(items: ItemDef[], parentLabel: string): ItemDef[] {
  return items.filter(i => i.group === parentLabel);
}

/** All descendants (recursive) */
export function getDescendants(items: ItemDef[], parentLabel: string): ItemDef[] {
  const direct = getChildren(items, parentLabel);
  const result: ItemDef[] = [...direct];
  for (const child of direct) {
    if (child.type === 'Group' || child.type === 'Frame') {
      result.push(...getDescendants(items, child.label));
    }
  }
  return result;
}

/**
 * Walk up the group chain to find the item that should be selected.
 * Returns the first ancestor whose parent === activeGroup (or top-level if activeGroup is null).
 */
export function getSelectableLabel(items: ItemDef[], label: string, activeGroup: string | null): string {
  const item = items.find(i => i.label === label);
  if (!item) return label;

  // If the item has no parent, it's top-level → select directly
  if (!item.group) return label;

  // If the item's parent IS the active group, select directly (we're "inside" the group)
  if (item.group === activeGroup) return label;

  // Otherwise, walk up: find the ancestor that's a direct child of activeGroup (or top-level)
  let current = item;
  while (current.group && current.group !== activeGroup) {
    const parent = items.find(i => i.label === current.group);
    if (!parent) break;
    current = parent;
  }
  return current.label;
}

/** Compute bounding box of a group's children */
export function computeGroupBounds(
  items: ItemDef[],
  states: Record<string, ItemState>,
  parentLabel: string,
): { x: number; y: number; w: number; h: number } | null {
  const children = getChildren(items, parentLabel);
  if (children.length === 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const child of children) {
    const s = states[child.label];
    if (!s) continue;
    const hw = (child.w * s.scale) / 2;
    const hh = (child.h * s.scale) / 2;
    minX = Math.min(minX, s.x - hw);
    minY = Math.min(minY, s.y - hh);
    maxX = Math.max(maxX, s.x + hw);
    maxY = Math.max(maxY, s.y + hh);
  }

  if (!isFinite(minX)) return null;

  const w = maxX - minX;
  const h = maxY - minY;
  return { x: minX + w / 2, y: minY + h / 2, w, h };
}

/** Check if a label is a Group or Frame */
export function isContainer(items: ItemDef[], label: string): boolean {
  const item = items.find(i => i.label === label);
  return item?.type === 'Group' || item?.type === 'Frame';
}
