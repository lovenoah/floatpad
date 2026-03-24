import { useState, useCallback, useRef, useEffect } from 'react';
import { CanvasItem } from './canvas-item';
import { loadItems, saveItems, loadState, saveState, removeState, markDeleted } from './persistence';
import type { ItemDef } from './types';

export type Renderer = (props: Record<string, unknown>) => React.ReactNode;

let nextId = 1;

export type FloatpadCanvasProps = {
  initialItems: ItemDef[];
  renderers: Record<string, Renderer>;
};

/**
 * FloatpadCanvas — a drag-and-drop positioning canvas for arbitrary React elements.
 *
 * Items are positioned relative to the center of the container.
 * All positions are persisted to localStorage automatically.
 *
 * Keyboard shortcuts (when an item is selected):
 *   Cmd/Ctrl+D  — duplicate
 *   Cmd/Ctrl+C  — copy
 *   Cmd/Ctrl+V  — paste
 *   Backspace   — delete
 */
export function FloatpadCanvas({ initialItems, renderers }: FloatpadCanvasProps) {
  const [items, setItems] = useState<ItemDef[]>(() => loadItems(initialItems));
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const clipboardRef = useRef<ItemDef | null>(null);

  useEffect(() => { saveItems(items); }, [items]);

  const findItem = useCallback((label: string) => items.find(i => i.label === label), [items]);

  const duplicateItem = useCallback((label: string) => {
    const item = items.find(i => i.label === label);
    if (!item) return;
    const newLabel = `${item.type}_${Date.now()}_${nextId++}`;
    const currentState = loadState(label, { x: item.x, y: item.y, scale: 1, rot: item.rot, z: item.z });
    const newItem: ItemDef = { ...item, label: newLabel, x: currentState.x + 30, y: currentState.y + 30 };
    saveState(newLabel, { ...currentState, x: currentState.x + 30, y: currentState.y + 30 });
    setItems(prev => [...prev, newItem]);
    setSelectedLabel(newLabel);
  }, [items]);

  const deleteItem = useCallback((label: string) => {
    setItems(prev => prev.filter(i => i.label !== label));
    removeState(label);
    markDeleted(label);
    setSelectedLabel(null);
  }, []);

  const renameItem = useCallback((oldLabel: string, newLabel: string) => {
    if (!newLabel || oldLabel === newLabel) return;
    const posState = loadState(oldLabel, { x: 0, y: 0, scale: 1, rot: 0, z: 0 });
    saveState(newLabel, posState);
    removeState(oldLabel);
    setItems(prev => prev.map(i => i.label === oldLabel ? { ...i, label: newLabel } : i));
    setSelectedLabel(newLabel);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!selectedLabel) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault();
        duplicateItem(selectedLabel);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        const item = findItem(selectedLabel);
        if (item) clipboardRef.current = item;
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        if (clipboardRef.current) {
          e.preventDefault();
          duplicateItem(clipboardRef.current.label);
        }
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if ((e.target as HTMLElement).tagName === 'INPUT') return;
        e.preventDefault();
        deleteItem(selectedLabel);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedLabel, duplicateItem, deleteItem, findItem]);

  const onCanvasPointerDown = useCallback(() => {
    setSelectedLabel(null);
  }, []);

  return (
    <div
      style={{ position: 'absolute', inset: 0 }}
      onPointerDown={onCanvasPointerDown}
    >
      {items.map(item => {
        const render = renderers[item.type];
        if (!render) return null;
        return (
          <CanvasItem
            key={item.label}
            label={item.label}
            x={item.x}
            y={item.y}
            w={item.w}
            h={item.h}
            rot={item.rot}
            z={item.z}
            selectedLabel={selectedLabel}
            onSelect={setSelectedLabel}
            onDuplicate={() => duplicateItem(item.label)}
            onDelete={() => deleteItem(item.label)}
            onRename={newLabel => renameItem(item.label, newLabel)}
          >
            {render(item.props)}
          </CanvasItem>
        );
      })}
    </div>
  );
}
