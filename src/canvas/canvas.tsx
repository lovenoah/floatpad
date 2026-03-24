import { useState, useCallback, useRef, useEffect } from 'react';
import { AnimatePresence } from 'motion/react';
import { CanvasItem } from './canvas-item';
import { ControlPanel } from './control-panel';
import { Grid } from './grid';
import { Guides, computeGuides, type Guide } from './guides';
import { Marquee, type MarqueeRect } from './marquee';
import { BoundingBox } from './bounding-box';
import { Measurements } from './measurements';
import { SelectionGaps } from './selection-gaps';
import { ZoomControls } from './zoom-controls';
import { useCamera } from './use-camera';
import { loadLayout, saveLayout, defaultStatesFromItems } from './persistence';
import { createHistory } from './history';
import { useToast } from './toast';
import type { ItemDef, ItemState, FloatpadSettings } from './types';

export type Renderer = (props: Record<string, unknown>) => React.ReactNode;

let nextId = 1;

export const DEFAULT_SETTINGS: FloatpadSettings = {
  gridSize: 20,
  snapThreshold: 5,
  nudgeSmall: 1,
  nudgeLarge: 10,
  duplicateOffset: 30,
  bgColor: '#f8fafc',
};

export type FloatpadCanvasProps = {
  initialItems: ItemDef[];
  renderers: Record<string, Renderer>;
  settings?: Partial<FloatpadSettings>;
  onInfoClick?: () => void;
  onSettingsClick?: () => void;
  onSelectionChange?: (hasSelection: boolean) => void;
};

export function FloatpadCanvas({ initialItems, renderers, settings: settingsOverride, onInfoClick, onSettingsClick, onSelectionChange }: FloatpadCanvasProps) {
  const settings = { ...DEFAULT_SETTINGS, ...settingsOverride };
  const { gridSize, snapThreshold, nudgeSmall, nudgeLarge, duplicateOffset } = settings;
  const [items, setItems] = useState<ItemDef[]>(initialItems);
  const [states, setStates] = useState<Record<string, ItemState>>(() => defaultStatesFromItems(initialItems));
  const [loaded, setLoaded] = useState(false);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [gridEnabled, setGridEnabled] = useState(false);
  const [activeGuides, setActiveGuides] = useState<Guide[]>([]);
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [altHeld, setAltHeld] = useState(false);
  const clipboardRef = useRef<ItemDef[]>([]);
  const historyRef = useRef(createHistory());
  const viewportRef = useRef<HTMLDivElement>(null);
  const marqueeStart = useRef<{ x: number; y: number } | null>(null);
  const isPanning = useRef(false);
  const panStart = useRef({ mx: 0, my: 0, panX: 0, panY: 0 });
  const [toast, toastNode] = useToast();

  // Camera
  const { camera, setCamera, screenToCanvas, zoomTo, resetView, fitToView } = useCamera(viewportRef);


  // Load layout from file on mount
  useEffect(() => {
    loadLayout().then(data => {
      if (data) {
        setItems(data.items);
        setStates(data.states);
        historyRef.current.push(data.items, data.states);
      } else {
        historyRef.current.push(initialItems, defaultStatesFromItems(initialItems));
      }
      setLoaded(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Notify parent of selection changes
  useEffect(() => {
    onSelectionChange?.(selection.size > 0);
  }, [selection.size, onSelectionChange]);

  // Auto-save to file (debounced in persistence.ts)
  useEffect(() => {
    if (!loaded) return;
    saveLayout({ items, states });
  }, [items, states, loaded]);

  const pushHistory = useCallback((nextItems: ItemDef[], nextStates: Record<string, ItemState>) => {
    historyRef.current.push(nextItems, nextStates);
  }, []);

  const getDefaultState = useCallback((item: ItemDef): ItemState => ({
    x: item.x, y: item.y, scale: 1, rot: item.rot, z: item.z,
  }), []);

  // ── Fit to view helper ─────────────────────────────────────────────
  const doFitToView = useCallback(() => {
    const bounds = items.map(item => {
      const st = states[item.label];
      if (!st) return null;
      return { x: st.x, y: st.y, w: item.w * st.scale, h: item.h * st.scale };
    }).filter(Boolean) as { x: number; y: number; w: number; h: number }[];
    fitToView(bounds);
  }, [items, states, fitToView]);

  // ── Drag ───────────────────────────────────────────────────────────
  const dragSnapshot = useRef<Record<string, { x: number; y: number }>>({});

  const handleDragStart = useCallback((label: string) => {
    const snap: Record<string, { x: number; y: number }> = {};
    const labelsToSnapshot = selection.has(label) ? selection : new Set([label]);
    for (const l of labelsToSnapshot) {
      const s = states[l];
      if (s) snap[l] = { x: s.x, y: s.y };
    }
    dragSnapshot.current = snap;
  }, [selection, states]);

  const handleDragMove = useCallback((label: string, dx: number, dy: number) => {
    setStates(prev => {
      const snap = dragSnapshot.current;
      const startPos = snap[label];
      if (!startPos) return prev;

      let newX = startPos.x + dx;
      let newY = startPos.y + dy;

      if (gridEnabled) {
        newX = Math.round(newX / gridSize) * gridSize;
        newY = Math.round(newY / gridSize) * gridSize;
      }

      const current = prev[label];
      if (!current) return prev;

      const item = items.find(i => i.label === label);
      if (item) {
        const w = Math.round(item.w * current.scale);
        const h = Math.round(item.h * current.scale);
        const allBounds = items
          .filter(i => i.label !== label && !snap[i.label])
          .map(i => {
            const s = prev[i.label];
            return s ? { label: i.label, x: s.x, y: s.y, w: Math.round(i.w * s.scale), h: Math.round(i.h * s.scale) } : null;
          })
          .filter(Boolean) as { label: string; x: number; y: number; w: number; h: number }[];

        const result = computeGuides(label, { x: newX, y: newY, w, h }, allBounds, snapThreshold);
        setActiveGuides(result.guides);
        if (result.snapX !== null) newX = result.snapX;
        if (result.snapY !== null) newY = result.snapY;
      }

      const effectiveDx = newX - startPos.x;
      const effectiveDy = newY - startPos.y;

      const next = { ...prev, [label]: { ...current, x: newX, y: newY } };
      for (const [sel, start] of Object.entries(snap)) {
        if (sel === label) continue;
        const s = prev[sel];
        if (s) {
          next[sel] = { ...s, x: start.x + effectiveDx, y: start.y + effectiveDy };
        }
      }

      return next;
    });
  }, [gridEnabled, gridSize, snapThreshold, items]);

  const clearGuides = useCallback(() => { setActiveGuides([]); }, []);

  const commitDrag = useCallback(() => {
    clearGuides();
    setStates(prev => {
      setItems(currentItems => {
        pushHistory(currentItems, prev);
        return currentItems;
      });
      return prev;
    });
  }, [pushHistory, clearGuides]);

  // ── Resize (scale) ─────────────────────────────────────────────────
  const handleScaleChange = useCallback((label: string, newScale: number) => {
    setStates(prev => ({
      ...prev,
      [label]: { ...prev[label], scale: newScale },
    }));
  }, []);

  const handleScaleCommit = useCallback(() => {
    setStates(prev => {
      setItems(currentItems => {
        pushHistory(currentItems, prev);
        return currentItems;
      });
      return prev;
    });
  }, [pushHistory]);

  // ── Gap adjustment (selection gaps) ──────────────────────────────────
  const handleGapPositionUpdate = useCallback((label: string, x: number, y: number) => {
    setStates(prev => ({
      ...prev,
      [label]: { ...prev[label], x, y },
    }));
  }, []);

  const handleGapCommit = useCallback(() => {
    setStates(prev => {
      setItems(currentItems => {
        pushHistory(currentItems, prev);
        return currentItems;
      });
      return prev;
    });
  }, [pushHistory]);

  // ── Selection ──────────────────────────────────────────────────────
  const handleSelect = useCallback((label: string | null, shiftKey: boolean) => {
    if (label === null) {
      setSelection(new Set());
      return;
    }
    if (shiftKey) {
      setSelection(prev => {
        const next = new Set(prev);
        if (next.has(label)) next.delete(label);
        else next.add(label);
        return next;
      });
    } else {
      setSelection(prev => {
        if (prev.has(label) && prev.size > 1) return prev;
        return new Set([label]);
      });
    }
  }, []);

  // ── Item operations ────────────────────────────────────────────────
  const duplicateItems = useCallback((labels: Set<string>) => {
    let nextItems = [...items];
    let nextStates = { ...states };
    const newSelection = new Set<string>();

    for (const label of labels) {
      const item = items.find(i => i.label === label);
      if (!item) continue;
      const currentState = states[label] ?? getDefaultState(item);
      const newLabel = `${item.type}_${Date.now()}_${nextId++}`;
      const newState: ItemState = { ...currentState, x: currentState.x + duplicateOffset, y: currentState.y + duplicateOffset };
      const newItem: ItemDef = { ...item, label: newLabel, x: newState.x, y: newState.y };
      nextItems = [...nextItems, newItem];
      nextStates = { ...nextStates, [newLabel]: newState };
      newSelection.add(newLabel);
    }

    setItems(nextItems);
    setStates(nextStates);
    setSelection(newSelection);
    pushHistory(nextItems, nextStates);
  }, [items, states, getDefaultState, pushHistory]);

  const deleteItems = useCallback((labels: Set<string>) => {
    const nextItems = items.filter(i => !labels.has(i.label));
    const nextStates = { ...states };
    for (const label of labels) {
      delete nextStates[label];
    }
    setItems(nextItems);
    setStates(nextStates);
    setSelection(new Set());
    pushHistory(nextItems, nextStates);
  }, [items, states, pushHistory]);

  const renameItem = useCallback((oldLabel: string, newLabel: string) => {
    if (!newLabel || oldLabel === newLabel) return;
    const nextStates = { ...states };
    nextStates[newLabel] = states[oldLabel];
    delete nextStates[oldLabel];
    const nextItems = items.map(i => i.label === oldLabel ? { ...i, label: newLabel } : i);
    setStates(nextStates);
    setItems(nextItems);
    setSelection(new Set([newLabel]));
    pushHistory(nextItems, nextStates);
  }, [items, states, pushHistory]);

  const handleCommitChange = useCallback((label: string, patch: Partial<ItemState>) => {
    const nextStates = { ...states, [label]: { ...states[label], ...patch } };
    setStates(nextStates);
    pushHistory(items, nextStates);
  }, [items, states, pushHistory]);

  // ── Undo / Redo ────────────────────────────────────────────────────
  const undo = useCallback(() => {
    const snapshot = historyRef.current.undo();
    if (!snapshot) return;
    setItems(snapshot.items);
    setStates(snapshot.states);
  }, []);

  const redo = useCallback(() => {
    const snapshot = historyRef.current.redo();
    if (!snapshot) return;
    setItems(snapshot.items);
    setStates(snapshot.states);
  }, []);

  // ── Keyboard ───────────────────────────────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Space = pan mode
      if (e.key === ' ' && !e.repeat && (e.target as HTMLElement).tagName !== 'INPUT') {
        e.preventDefault();
        setSpaceHeld(true);
        return;
      }

      // Alt = measure mode
      if ((e.key === 'Alt' || e.key === 'Option') && !e.repeat) {
        setAltHeld(true);
        return;
      }

      // Undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault(); undo(); toast('Undo'); return;
      }
      // Redo
      if ((e.metaKey || e.ctrlKey) && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault(); redo(); toast('Redo'); return;
      }

      // Zoom: Cmd+= / Cmd+-
      if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault(); zoomTo(camera.zoom * 1.25); return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '-') {
        e.preventDefault(); zoomTo(camera.zoom / 1.25); return;
      }
      // Cmd+0 = fit, Cmd+1 = 100%
      if ((e.metaKey || e.ctrlKey) && e.key === '0') {
        e.preventDefault(); doFitToView(); return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '1') {
        e.preventDefault(); resetView(); return;
      }

      // Grid
      if (e.key === 'g' && !e.metaKey && !e.ctrlKey && (e.target as HTMLElement).tagName !== 'INPUT') {
        setGridEnabled(prev => {
          toast(!prev ? `Snap to grid on (${gridSize}px)` : 'Snap to grid off');
          return !prev;
        });
        return;
      }

      // Select all
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault();
        setSelection(new Set(items.map(i => i.label)));
        toast(`Selected ${items.length} items`);
        return;
      }

      if (selection.size === 0) return;

      if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault(); duplicateItems(selection);
        toast(`Duplicated ${selection.size} item${selection.size > 1 ? 's' : ''}`);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        clipboardRef.current = items.filter(i => selection.has(i.label));
        toast('Copied to clipboard');
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        if (clipboardRef.current.length > 0) {
          e.preventDefault();
          duplicateItems(new Set(clipboardRef.current.map(i => i.label)));
          toast('Pasted');
        }
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if ((e.target as HTMLElement).tagName === 'INPUT') return;
        e.preventDefault();
        const count = selection.size;
        deleteItems(selection);
        toast(`Deleted ${count} item${count > 1 ? 's' : ''}`);
        return;
      }

      // Arrow nudge
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        if ((e.target as HTMLElement).tagName === 'INPUT') return;
        e.preventDefault();
        const step = e.shiftKey ? nudgeLarge : nudgeSmall;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        const nextStates = { ...states };
        for (const label of selection) {
          const s = nextStates[label];
          if (s) nextStates[label] = { ...s, x: s.x + dx, y: s.y + dy };
        }
        setStates(nextStates);
        pushHistory(items, nextStates);
      }
    };

    const up = (e: KeyboardEvent) => {
      if (e.key === ' ') setSpaceHeld(false);
      if (e.key === 'Alt' || e.key === 'Option') setAltHeld(false);
    };

    const blur = () => { setSpaceHeld(false); setAltHeld(false); };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [selection, items, states, camera, duplicateItems, deleteItems, undo, redo, pushHistory, zoomTo, resetView, doFitToView, toast, gridSize, nudgeSmall, nudgeLarge]);

  // ── Marquee / pan pointer events ──────────────────────────────────
  const onViewportPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.target !== e.currentTarget) return;

    // Space+click = pan
    if (spaceHeld) {
      isPanning.current = true;
      panStart.current = { mx: e.clientX, my: e.clientY, panX: camera.panX, panY: camera.panY };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    // Normal click on canvas = deselect + start marquee
    if (!e.shiftKey) setSelection(new Set());
    marqueeStart.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [spaceHeld, camera.panX, camera.panY]);

  const onViewportPointerMove = useCallback((e: React.PointerEvent) => {
    if (isPanning.current) {
      const dx = e.clientX - panStart.current.mx;
      const dy = e.clientY - panStart.current.my;
      setCamera(prev => ({
        ...prev,
        panX: panStart.current.panX + dx,
        panY: panStart.current.panY + dy,
      }));
      return;
    }
    if (!marqueeStart.current) return;
    setMarquee({
      x1: marqueeStart.current.x,
      y1: marqueeStart.current.y,
      x2: e.clientX,
      y2: e.clientY,
    });
  }, [setCamera]);

  const onViewportPointerUp = useCallback((e: React.PointerEvent) => {
    if (isPanning.current) {
      isPanning.current = false;
      return;
    }
    if (!marqueeStart.current) return;

    if (marquee) {
      // Convert marquee screen coords to canvas coords
      const m1 = screenToCanvas(marquee.x1, marquee.y1);
      const m2 = screenToCanvas(marquee.x2, marquee.y2);
      const mLeft = Math.min(m1.x, m2.x);
      const mRight = Math.max(m1.x, m2.x);
      const mTop = Math.min(m1.y, m2.y);
      const mBottom = Math.max(m1.y, m2.y);

      const selected = new Set<string>();
      for (const item of items) {
        const s = states[item.label];
        if (!s) continue;
        const w = Math.round(item.w * s.scale);
        const h = Math.round(item.h * s.scale);
        const iLeft = s.x - w / 2;
        const iRight = s.x + w / 2;
        const iTop = s.y - h / 2;
        const iBottom = s.y + h / 2;

        if (iRight > mLeft && iLeft < mRight && iBottom > mTop && iTop < mBottom) {
          selected.add(item.label);
        }
      }

      if (e.shiftKey) {
        setSelection(prev => {
          const next = new Set(prev);
          for (const label of selected) next.add(label);
          return next;
        });
      } else if (selected.size > 0) {
        setSelection(selected);
      }
    }

    marqueeStart.current = null;
    setMarquee(null);
  }, [marquee, items, states, screenToCanvas]);

  // ── Control panel state ────────────────────────────────────────────
  const singleSelected = selection.size === 1 ? [...selection][0] : null;
  const singleSelectedState = singleSelected ? states[singleSelected] : null;
  const [copied, setCopied] = useState(false);

  const handleGroupScaleUpdate = useCallback((updates: Record<string, { x: number; y: number; scale: number }>) => {
    setStates(prev => {
      const next = { ...prev };
      for (const [label, u] of Object.entries(updates)) {
        const s = next[label];
        if (s) next[label] = { ...s, x: u.x, y: u.y, scale: Math.round(u.scale * 100) / 100 };
      }
      return next;
    });
  }, []);

  const handleGroupScaleCommit = useCallback(() => {
    setStates(prev => {
      setItems(currentItems => {
        pushHistory(currentItems, prev);
        return currentItems;
      });
      return prev;
    });
  }, [pushHistory]);

  const handleAlignItems = useCallback((positions: Record<string, { x?: number; y?: number }>) => {
    const nextStates = { ...states };
    for (const [label, pos] of Object.entries(positions)) {
      const s = nextStates[label];
      if (s) {
        nextStates[label] = {
          ...s,
          ...(pos.x !== undefined ? { x: Math.round(pos.x) } : {}),
          ...(pos.y !== undefined ? { y: Math.round(pos.y) } : {}),
        };
      }
    }
    setStates(nextStates);
    pushHistory(items, nextStates);
  }, [items, states, pushHistory]);

  const handleMultiCommitChange = useCallback((patch: Partial<ItemState>) => {
    const nextStates = { ...states };
    for (const label of selection) {
      const s = nextStates[label];
      if (s) nextStates[label] = { ...s, ...patch };
    }
    setStates(nextStates);
    pushHistory(items, nextStates);
  }, [items, states, selection, pushHistory]);

  const handleMultiDeltaChange = useCallback((delta: Partial<ItemState>) => {
    const nextStates = { ...states };
    for (const label of selection) {
      const s = nextStates[label];
      if (s) {
        const patched = { ...s };
        if (delta.scale !== undefined) patched.scale = Math.round(Math.max(0.1, Math.min(4, s.scale + delta.scale)) * 100) / 100;
        if (delta.rot !== undefined) patched.rot = Math.round((s.rot + delta.rot) * 100) / 100;
        if (delta.z !== undefined) patched.z = s.z + delta.z;
        if (delta.x !== undefined) patched.x = s.x + delta.x;
        if (delta.y !== undefined) patched.y = s.y + delta.y;
        nextStates[label] = patched;
      }
    }
    setStates(nextStates);
    pushHistory(items, nextStates);
  }, [items, states, selection, pushHistory]);

  const placeValues = useCallback(() => {
    const selectedItems = items.filter(i => selection.has(i.label));
    const lines = selectedItems.map(item => {
      const s = states[item.label];
      if (!s) return '';
      const w = Math.round(item.w * s.scale);
      const h = Math.round(item.h * s.scale);
      return `[${item.label}] x={${s.x}} y={${s.y}} w={${w}} h={${h}} rot={${s.rot}} z={${s.z}}`;
    });
    const code = selectedItems.length === 1
      ? (() => {
          const item = selectedItems[0];
          const s = states[item.label]!;
          const w = Math.round(item.w * s.scale);
          const h = Math.round(item.h * s.scale);
          return `x={${s.x}} y={${s.y}} w={${w}} h={${h}} rot={${s.rot}} z={${s.z}}`;
        })()
      : lines.join('\n');
    navigator.clipboard.writeText(code);
    console.log('\nPlaced:\n' + lines.join('\n') + '\n');
    toast('Copied placement values');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    setSelection(new Set());
  }, [items, states, selection]);

  // ── Layers data for ControlPanel ──────────────────────────────────
  const allLayers = items.map(item => {
    const render = renderers[item.type];
    return {
      label: item.label,
      z: states[item.label]?.z ?? item.z,
      preview: render ? render(item.props) : undefined,
    };
  });

  const handleReorderAllZ = useCallback((orderedLabels: string[]) => {
    const nextStates = { ...states };
    orderedLabels.forEach((label, i) => {
      const s = nextStates[label];
      if (s) nextStates[label] = { ...s, z: i };
    });
    setStates(nextStates);
    pushHistory(items, nextStates);
  }, [items, states, pushHistory]);

  // ── Measurements data ──────────────────────────────────────────────
  const showMeasurements = altHeld && hoveredItem && selection.size > 0 && !selection.has(hoveredItem);
  const measureSelectedItems = showMeasurements
    ? items.filter(i => selection.has(i.label))
    : [];
  const measureSelectedStates = measureSelectedItems.map(i => states[i.label]).filter(Boolean) as ItemState[];
  const measureHoveredItem = showMeasurements ? items.find(i => i.label === hoveredItem) : null;
  const measureHoveredState = measureHoveredItem ? states[measureHoveredItem.label] : null;

  // ── Cursor ─────────────────────────────────────────────────────────
  const getCursor = () => {
    if (isPanning.current) return 'grabbing';
    if (spaceHeld) return 'grab';
    if (altHeld) return 'crosshair';
    return 'default';
  };

  return (
    <div
      ref={viewportRef}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        cursor: getCursor(),
      }}
      onPointerDown={onViewportPointerDown}
      onPointerMove={onViewportPointerMove}
      onPointerUp={onViewportPointerUp}
    >
      {/* Grid (fixed layer) */}
      {gridEnabled && <Grid gridSize={gridSize} camera={camera} />}

      {/* Canvas layer (transforms with camera) */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: `translate(${camera.panX}px, ${camera.panY}px) scale(${camera.zoom})`,
          transformOrigin: '0 0',
          pointerEvents: 'none',
        }}
      >
        {/* Origin marker */}
        <div style={{
          position: 'absolute',
          left: -4,
          top: -4,
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: 'rgba(0,0,0,0.10)',
          pointerEvents: 'none',
        }} />

        {/* Items */}
        {items.map(item => {
          const render = renderers[item.type];
          if (!render) return null;
          const state = states[item.label] ?? getDefaultState(item);
          return (
            <CanvasItem
              key={item.label}
              label={item.label}
              initW={item.w}
              initH={item.h}
              state={state}
              zoom={camera.zoom}
              onDragStart={() => handleDragStart(item.label)}
              onDragMove={(dx, dy) => handleDragMove(item.label, dx, dy)}
              onDragEnd={commitDrag}
              onScaleChange={(newScale) => handleScaleChange(item.label, newScale)}
              onScaleCommit={handleScaleCommit}
              selected={selection.has(item.label)}
              onSelect={handleSelect}
              onHover={setHoveredItem}
            >
              {render(item.props)}
            </CanvasItem>
          );
        })}

        {/* Multi-select bounding box */}
        <BoundingBox items={items} states={states} selection={selection} zoom={camera.zoom} onAlign={handleAlignItems} onGroupScaleUpdate={handleGroupScaleUpdate} onGroupScaleCommit={handleGroupScaleCommit} />

        {/* Selection gaps (interactive distance between selected items) */}
        {selection.size >= 2 && (
          <SelectionGaps
            items={items}
            states={states}
            selection={selection}
            zoom={camera.zoom}
            onPositionUpdate={handleGapPositionUpdate}
            onCommit={handleGapCommit}
          />
        )}

        {/* Distance measurements */}
        {showMeasurements && measureHoveredItem && measureHoveredState && measureSelectedStates.length > 0 && (
          <Measurements
            selectedItems={measureSelectedItems}
            selectedStates={measureSelectedStates}
            hoveredItem={measureHoveredItem}
            hoveredState={measureHoveredState}
            zoom={camera.zoom}
          />
        )}
      </div>

      {/* Guides (fixed layer) */}
      <Guides guides={activeGuides} camera={camera} />

      {/* Marquee (fixed layer) */}
      {marquee && <Marquee rect={marquee} />}

      {/* Zoom controls */}
      <ZoomControls
        camera={camera}
        onZoomTo={zoomTo}
        onReset={resetView}
        onFit={doFitToView}
      />

      {/* Control panel */}
      <AnimatePresence>
        {selection.size > 0 && (
          singleSelected && singleSelectedState ? (
            <ControlPanel
              key="single"
              mode="single"
              label={singleSelected}
              state={singleSelectedState}
              copied={copied}
              onCommitChange={(patch) => handleCommitChange(singleSelected, patch)}
              onDuplicate={() => duplicateItems(selection)}
              onDelete={() => deleteItems(selection)}
              onRename={newLabel => renameItem(singleSelected, newLabel)}
              onPlace={placeValues}
              onInfoClick={onInfoClick}
              onSettingsClick={onSettingsClick}
              layers={allLayers}
              onReorderAllZ={handleReorderAllZ}
              onRenameLayer={(oldLabel, newLabel) => renameItem(oldLabel, newLabel)}
            />
          ) : selection.size > 1 ? (
            <ControlPanel
              key="multi"
              mode="multi"
              count={selection.size}
              labels={[...selection]}
              states={[...selection].map(l => states[l]).filter(Boolean) as ItemState[]}
              previews={Object.fromEntries([...selection].map(label => {
                const item = items.find(i => i.label === label);
                if (!item) return [label, null];
                const render = renderers[item.type];
                return [label, render ? render(item.props) : null];
              }))}
              copied={copied}
              onCommitChange={handleMultiCommitChange}
              onDeltaChange={handleMultiDeltaChange}
              onDuplicate={() => duplicateItems(selection)}
              onDelete={() => deleteItems(selection)}
              onDeselectItem={(label) => setSelection(prev => { const next = new Set(prev); next.delete(label); return next; })}
              onRenameItem={(oldLabel, newLabel) => renameItem(oldLabel, newLabel)}
              onReorderZ={(orderedLabels) => {
                const nextStates = { ...states };
                orderedLabels.forEach((label, i) => {
                  const s = nextStates[label];
                  if (s) nextStates[label] = { ...s, z: i };
                });
                setStates(nextStates);
                pushHistory(items, nextStates);
              }}
              onPlace={placeValues}
              onInfoClick={onInfoClick}
              onSettingsClick={onSettingsClick}
              layers={allLayers}
              onReorderAllZ={handleReorderAllZ}
              onRenameLayer={(oldLabel, newLabel) => renameItem(oldLabel, newLabel)}
            />
          ) : null
        )}
      </AnimatePresence>

      {/* Help bar */}

      {toastNode}
    </div>
  );
}
