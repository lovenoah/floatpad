import { useState, useCallback, useRef, useEffect, Fragment } from 'react';
import { AnimatePresence } from 'motion/react';
import { CanvasItem } from './canvas-item';
import { squirclePath } from './shape-renderer';
import { GradientEditorOverlay } from './gradient-editor';
import { PropertiesPanel } from './properties-panel';
import { LayersPanel } from './layers-panel';
import { Grid } from './grid';
import { Guides, computeGuides, type Guide } from './guides';
import { Marquee, type MarqueeRect } from './marquee';
import { BoundingBox, computeAlignment, type AlignAction } from './bounding-box';
import { Measurements } from './measurements';
import { SelectionGaps } from './selection-gaps';
import { WindowFrame } from './window-frame';
import { WindowGaps } from './window-gaps';
import { ArtboardToolbar } from './artboard-toolbar';
import { ZoomControls } from './zoom-controls';
import { TextRendererComponent } from './text-renderer';
import { FrameRendererComponent } from './frame-renderer';
import { getChildren, getDescendants, getSelectableLabel } from './group-utils';
import { useCamera } from './use-camera';
import { loadLayout, saveLayout, flushPendingSave, defaultStatesFromItems } from './persistence';
import { createHistory } from './history';
import { useToast } from './toast';
import type { ItemDef, ItemState, NudgeSettings, Fill, ShadowDef, StrokeDef, GradientStop } from './types';
import { VectorEditOverlay, type VectorEditState } from './vector-edit';
import { parsePathData, pointsToPathData, decomposeRectangle, decomposeEllipse, deCasteljau, recomputeBounds, normalizePoints, mirrorHandle } from './vector-edit-utils';
import type { VectorPoint } from './vector-edit-utils';

export type Renderer = (props: Record<string, unknown>) => React.ReactNode;

// ── Figma CSS paste helpers ──────────────────────────────────────────

type FigmaCSSResult = {
  fills?: Fill[];
  borderRadius?: number;
  shadows?: ShadowDef[];
  strokes?: StrokeDef[];
  blur?: number;
  opacity?: number;
};

function _isFigmaCSS(text: string): boolean {
  if (!text || text.includes('<svg') || text.includes('<SVG')) return false;
  return /(?:^|\n)\s*(?:background|border-radius|box-shadow|opacity|border|filter|backdrop-filter)\s*:/im.test(text);
}

function _parseCSSColor(val: string): { hex: string; opacity: number } | null {
  val = val.trim();
  const rgba = val.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/);
  if (rgba) {
    const [, r, g, b, a] = rgba;
    const hex = '#' + [r, g, b].map(c => Math.round(parseFloat(c)).toString(16).padStart(2, '0')).join('');
    return { hex, opacity: a !== undefined ? parseFloat(a) : 1 };
  }
  if (/^#[0-9a-f]{8}$/i.test(val)) {
    const alpha = parseInt(val.slice(7, 9), 16) / 255;
    return { hex: val.slice(0, 7), opacity: Math.round(alpha * 100) / 100 };
  }
  if (/^#[0-9a-f]{3,6}$/i.test(val)) return { hex: val, opacity: 1 };
  return null;
}

function _splitByComma(value: string): string[] {
  const parts: string[] = [];
  let depth = 0, current = '';
  for (const ch of value) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) { parts.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function _parseShadow(s: string): ShadowDef | null {
  s = s.trim();
  const isInner = /^inset\b/i.test(s);
  if (isInner) s = s.replace(/^inset\s+/i, '').trim();
  const colorMatch = s.match(/rgba?\([^)]+\)|#[0-9a-f]{3,8}/i);
  if (!colorMatch) return null;
  const colorParsed = _parseCSSColor(colorMatch[0]);
  if (!colorParsed) return null;
  const noColor = s.replace(colorMatch[0], '').trim();
  const nums = noColor.match(/-?[\d.]+(?:px)?/g);
  if (!nums || nums.length < 2) return null;
  return {
    shadowType: isInner ? 'inner-shadow' : 'drop-shadow',
    x: parseFloat(nums[0]),
    y: parseFloat(nums[1]),
    blur: nums.length > 2 ? parseFloat(nums[2]) : 0,
    color: colorParsed.hex,
    opacity: colorParsed.opacity,
  };
}

function _parseGradientStops(parts: string[]): GradientStop[] {
  return parts.map(p => {
    p = p.trim();
    const offsetMatch = p.match(/([\d.]+)%\s*$/);
    if (!offsetMatch) return null;
    const offset = parseFloat(offsetMatch[1]) / 100;
    const colorStr = p.replace(/[\d.]+%\s*$/, '').trim();
    const parsed = _parseCSSColor(colorStr);
    return parsed ? { offset, color: parsed.hex } : null;
  }).filter(Boolean) as GradientStop[];
}

function parseFigmaCSS(text: string): FigmaCSSResult {
  const result: FigmaCSSResult = {};
  const lines = text.split(/;|\n/).map(l => l.replace(/\/\*[^*]*\*\//g, '').trim()).filter(Boolean);
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx < 0) continue;
    const prop = line.slice(0, colonIdx).trim().toLowerCase();
    const val = line.slice(colonIdx + 1).trim();
    if (!val) continue;

    if (prop === 'background' || prop === 'background-color') {
      if (val.includes('linear-gradient')) {
        const m = val.match(/linear-gradient\(([\s\S]+)\)/);
        if (m) {
          const parts = _splitByComma(m[1]);
          let angle = 180;
          let stopParts = parts;
          const anglePart = parts[0]?.match(/^(-?[\d.]+)deg$/);
          if (anglePart) { angle = parseFloat(anglePart[1]); stopParts = parts.slice(1); }
          const stops = _parseGradientStops(stopParts);
          if (stops.length > 0) result.fills = [{ type: 'linear-gradient', angle, stops }];
        }
      } else if (val.includes('radial-gradient')) {
        const m = val.match(/radial-gradient\(([\s\S]+)\)/);
        if (m) {
          const parts = _splitByComma(m[1]).filter(p => /[\d.]+%/.test(p));
          const stops = _parseGradientStops(parts);
          if (stops.length > 0) result.fills = [{ type: 'radial-gradient', stops }];
        }
      } else {
        const parsed = _parseCSSColor(val);
        if (parsed) result.fills = [{ type: 'solid', color: parsed.hex, opacity: parsed.opacity }];
      }
    } else if (prop === 'border-radius') {
      const m = val.match(/^([\d.]+)px/);
      if (m) result.borderRadius = parseFloat(m[1]);
    } else if (prop === 'box-shadow') {
      const shadows: ShadowDef[] = [];
      for (const part of _splitByComma(val)) {
        if (part.trim() === 'none') continue;
        const shadow = _parseShadow(part);
        if (shadow) shadows.push(shadow);
      }
      if (shadows.length > 0) result.shadows = shadows;
    } else if (prop === 'opacity') {
      const v = parseFloat(val);
      if (!isNaN(v)) result.opacity = v;
    } else if (prop === 'border') {
      const widthM = val.match(/^([\d.]+)px/);
      if (widthM) {
        const width = parseFloat(widthM[1]);
        const colorPart = val.replace(/^[\d.]+px\s+\S+\s*/, '').trim();
        const parsed = _parseCSSColor(colorPart);
        if (parsed) result.strokes = [{ color: parsed.hex, width, opacity: parsed.opacity }];
      }
    } else if (prop === 'filter' || prop === 'backdrop-filter') {
      const m = val.match(/blur\(\s*([\d.]+)px\s*\)/);
      if (m) result.blur = parseFloat(m[1]);
    }
  }
  return result;
}

export type ToolMode = 'select' | 'text' | 'rectangle' | 'ellipse' | 'line' | 'pen';

let nextId = 1;

export const DEFAULT_SETTINGS: NudgeSettings = {
  gridSize: 20,
  snapThreshold: 5,
  nudgeSmall: 1,
  nudgeLarge: 10,
  duplicateOffset: 30,
  bgColor: '#f8fafc',
  exportFormat: 'raw',
  windowBg: '#ffffff',
};

export type NudgeCanvasProps = {
  initialItems: ItemDef[];
  renderers: Record<string, Renderer>;
  settings?: Partial<NudgeSettings>;
  toolMode?: ToolMode;
  onToolModeChange?: (mode: ToolMode) => void;
  onInfoClick?: () => void;
  onSettingsClick?: () => void;
  onSelectionChange?: (hasSelection: boolean) => void;
  onSettingsLoaded?: (settings: Partial<NudgeSettings>) => void;
  onToggleWindowMode?: () => void;
  onWindowSettingsChange?: (patch: Partial<NudgeSettings>) => void;
};

export function NudgeCanvas({ initialItems, renderers, settings: settingsOverride, toolMode: externalToolMode, onToolModeChange, onInfoClick, onSettingsClick, onSelectionChange, onSettingsLoaded, onToggleWindowMode, onWindowSettingsChange }: NudgeCanvasProps) {
  const settings = { ...DEFAULT_SETTINGS, ...settingsOverride };
  const { gridSize, snapThreshold, nudgeSmall, nudgeLarge, duplicateOffset } = settings;
  const windowMode = settings.windowMode ?? false;
  const windowW = settings.windowW ?? 390;
  const windowH = settings.windowH ?? 844;
  const windowBg = settings.windowBg ?? '#ffffff';
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
  const [isPanningState, setIsPanningState] = useState(false);
  const [toolModeInternal, setToolModeInternal] = useState<ToolMode>('select');
  const toolMode = externalToolMode ?? toolModeInternal;
  const setToolMode = useCallback((mode: ToolMode | ((prev: ToolMode) => ToolMode)) => {
    setToolModeInternal(prev => {
      const next = typeof mode === 'function' ? mode(prev) : mode;
      onToolModeChange?.(next);
      return next;
    });
  }, [onToolModeChange]);
  // Sync external toolMode changes into internal state
  useEffect(() => {
    if (externalToolMode !== undefined && externalToolMode !== toolModeInternal) {
      setToolModeInternal(externalToolMode);
    }
  }, [externalToolMode]); // eslint-disable-line react-hooks/exhaustive-deps
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editingGradient, setEditingGradient] = useState(false);
  const [vectorEditItem, setVectorEditItem] = useState<string | null>(null);
  const toolModeRef = useRef(toolMode);
  toolModeRef.current = toolMode;
  const editingItemRef = useRef(editingItem);
  editingItemRef.current = editingItem;
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const activeGroupRef = useRef(activeGroup);
  activeGroupRef.current = activeGroup;
  const clipboardRef = useRef<{ item: ItemDef; state: ItemState }[]>([]);

  // ── Shape creation state ──────────────────────────────────────────
  const shapeCreateRef = useRef<{ startX: number; startY: number } | null>(null);
  const [shapePreview, setShapePreview] = useState<{
    x: number; y: number; w: number; h: number; type: 'rectangle' | 'ellipse' | 'line';
  } | null>(null);
  const shapePreviewRef = useRef(shapePreview);
  shapePreviewRef.current = shapePreview;

  // ── Pen tool state ────────────────────────────────────────────────
  // All pen state in a single mutable ref to avoid stale closures.
  // `penTick` is incremented to trigger re-renders for the overlay.
  type PenPoint = {
    x: number; y: number;
    handleIn: { x: number; y: number } | null;  // absolute position
    handleOut: { x: number; y: number } | null;  // absolute position
  };
  const penRef = useRef<{
    points: PenPoint[];
    phase: 'idle' | 'dragging-handle';
    dragAnchor: { x: number; y: number } | null; // anchor of the point being dragged
    handleBroken: boolean; // Alt was pressed mid-drag
    frozenHandleIn: { x: number; y: number } | null; // frozen handleIn when broken
    previewPos: { x: number; y: number } | null; // cursor for rubber-band preview
    closeHover: boolean; // cursor near first point
  }>({
    points: [],
    phase: 'idle',
    dragAnchor: null,
    handleBroken: false,
    frozenHandleIn: null,
    previewPos: null,
    closeHover: false,
  });
  const [penTick, setPenTick] = useState(0);
  const penRedraw = useCallback(() => setPenTick(t => t + 1), []);
  const historyRef = useRef(createHistory());
  // Measured content sizes reported by CanvasItem (unscaled px) — used for accurate snapping
  const contentSizesRef = useRef<Record<string, { w: number; h: number }>>({});
  const viewportRef = useRef<HTMLDivElement>(null);
  const marqueeStart = useRef<{ x: number; y: number } | null>(null);
  const isPanning = useRef(false);
  const panStart = useRef({ mx: 0, my: 0, panX: 0, panY: 0 });
  const [toast, toastNode] = useToast();
  const nudgeHistoryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Camera
  const { camera, setCamera, screenToCanvas, zoomTo, resetView, fitToView } = useCamera(viewportRef);

  // Refs for keyboard handler (avoids re-registering listener on every state change)
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const statesRef = useRef(states);
  statesRef.current = states;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Load layout from file on mount
  useEffect(() => {
    loadLayout().then(data => {
      if (data) {
        setItems(data.items);
        setStates(data.states);
        historyRef.current.push(data.items, data.states);
        if (data.settings) onSettingsLoaded?.(data.settings);
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
    saveLayout({ items, states, settings: settingsOverride });
  }, [items, states, settingsOverride, loaded]);

  // Flush pending save on tab close
  useEffect(() => {
    window.addEventListener('beforeunload', flushPendingSave);
    return () => window.removeEventListener('beforeunload', flushPendingSave);
  }, []);

  const pushHistory = useCallback((nextItems: ItemDef[], nextStates: Record<string, ItemState>) => {
    historyRef.current.push(nextItems, nextStates);
  }, []);

  const pushHistoryDebounced = useCallback((nextItems: ItemDef[], nextStates: Record<string, ItemState>) => {
    historyRef.current.pushDebounced(nextItems, nextStates);
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
    // Expand selection to include all descendants of any groups/frames
    const expanded = new Set(labelsToSnapshot);
    for (const l of labelsToSnapshot) {
      const item = items.find(i => i.label === l);
      if (item && (item.type === 'Group' || item.type === 'Frame')) {
        for (const desc of getDescendants(items, l)) {
          expanded.add(desc.label);
        }
      }
    }
    for (const l of expanded) {
      const s = states[l];
      if (s) snap[l] = { x: s.x, y: s.y };
    }
    dragSnapshot.current = snap;
  }, [selection, states, items]);

  const handleDragMove = useCallback((label: string, dx: number, dy: number, shiftKey?: boolean) => {
    const snap = dragSnapshot.current;
    const startPos = snap[label];
    if (!startPos) return;

    const curStates = statesRef.current;
    const curItems = itemsRef.current;
    const current = curStates[label];
    if (!current) return;

    let newX = startPos.x + dx;
    let newY = startPos.y + dy;

    // Shift = snap to large grid (nudgeLarge); G toggle = snap to gridSize
    const snapSize = shiftKey ? nudgeLarge : gridEnabled ? gridSize : 0;
    if (snapSize > 0) {
      newX = Math.round(newX / snapSize) * snapSize;
      newY = Math.round(newY / snapSize) * snapSize;
    } else {
      newX = Math.round(newX);
      newY = Math.round(newY);
    }

    // Compute guides outside the state updater to avoid side-effects in a pure updater fn
    const item = curItems.find(i => i.label === label);
    let guides: Guide[] = [];
    if (item) {
      // Use measured content size if available (matches the visible selection frame)
      const cs = contentSizesRef.current[label];
      const w = Math.round((cs?.w ?? item.w) * current.scale);
      const h = Math.round((cs?.h ?? item.h) * current.scale);
      const allBounds = curItems
        .filter(i => i.label !== label && !snap[i.label])
        .map(i => {
          const s = curStates[i.label];
          if (!s) return null;
          const ics = contentSizesRef.current[i.label];
          return { label: i.label, x: s.x, y: s.y, w: Math.round((ics?.w ?? i.w) * s.scale), h: Math.round((ics?.h ?? i.h) * s.scale) };
        })
        .filter(Boolean) as { label: string; x: number; y: number; w: number; h: number }[];

      // Add virtual window-edge snap targets when window mode is active
      const curWindowMode = settingsRef.current.windowMode ?? false;
      const curWindowW = settingsRef.current.windowW ?? 390;
      const curWindowH = settingsRef.current.windowH ?? 844;
      if (curWindowMode) {
        allBounds.push(
          { label: '__win_left',   x: -curWindowW / 2, y: 0,                w: 0,          h: curWindowH },
          { label: '__win_right',  x:  curWindowW / 2, y: 0,                w: 0,          h: curWindowH },
          { label: '__win_top',    x: 0,               y: -curWindowH / 2,  w: curWindowW, h: 0 },
          { label: '__win_bottom', x: 0,               y:  curWindowH / 2,  w: curWindowW, h: 0 },
          { label: '__win_cx',     x: 0,               y: 0,                w: 0,          h: curWindowH },
          { label: '__win_cy',     x: 0,               y: 0,                w: curWindowW, h: 0 },
        );
      }

      const result = computeGuides(label, { x: newX, y: newY, w, h }, allBounds, snapThreshold);
      guides = result.guides;
      if (result.snapX !== null) newX = result.snapX;
      if (result.snapY !== null) newY = result.snapY;
    }

    setActiveGuides(guides);

    const effectiveDx = newX - startPos.x;
    const effectiveDy = newY - startPos.y;

    setStates(prev => {
      const cur = prev[label];
      if (!cur) return prev;
      const next = { ...prev, [label]: { ...cur, x: newX, y: newY } };
      for (const [sel, start] of Object.entries(snap)) {
        if (sel === label) continue;
        const s = prev[sel];
        if (s) {
          next[sel] = { ...s, x: start.x + effectiveDx, y: start.y + effectiveDy };
        }
      }
      return next;
    });
  }, [gridEnabled, gridSize, snapThreshold, nudgeLarge]);

  const clearGuides = useCallback(() => { setActiveGuides([]); }, []);

  const commitDrag = useCallback(() => {
    clearGuides();
    pushHistory(itemsRef.current, statesRef.current);
  }, [pushHistory, clearGuides]);

  // ── Resize (scale) ─────────────────────────────────────────────────
  const handleScaleChange = useCallback((label: string, newScale: number) => {
    setStates(prev => ({
      ...prev,
      [label]: { ...prev[label], scale: newScale },
    }));
  }, []);

  const handleScaleCommit = useCallback(() => {
    pushHistory(itemsRef.current, statesRef.current);
  }, [pushHistory]);

  // ── Rotation ───────────────────────────────────────────────────────
  const handleRotationChange = useCallback((label: string, newRot: number) => {
    setStates(prev => ({
      ...prev,
      [label]: { ...prev[label], rot: Math.round(newRot * 100) / 100 },
    }));
  }, []);

  // handleScaleCommit doubles as rotation commit (same pattern: push history)

  // ── Corner radius (on-canvas handles) ────────────────────────────────
  const handleBorderRadiusChange = useCallback((label: string, r: number) => {
    setItems(prev => prev.map(i =>
      i.label === label ? { ...i, props: { ...i.props, borderRadius: r } } : i
    ));
  }, []);

  const handleBorderRadiusCommit = useCallback(() => {
    pushHistory(itemsRef.current, statesRef.current);
  }, [pushHistory]);

  // ── Edge resize (single-axis dimension change) ───────────────────────
  const edgeResizeStart = useRef<{ label: string; origW: number; origH: number; origX: number; origY: number; origShapeW: number; origShapeH: number } | null>(null);

  const handleEdgeResizeStart = useCallback((label: string) => {
    const item = itemsRef.current.find(i => i.label === label);
    const st = statesRef.current[label];
    if (!item || !st) return;
    edgeResizeStart.current = {
      label,
      origW: item.w,
      origH: item.h,
      origX: st.x,
      origY: st.y,
      origShapeW: (item.props.shapeWidth as number) ?? item.w,
      origShapeH: (item.props.shapeHeight as number) ?? item.h,
    };
  }, []);

  const handleEdgeResize = useCallback((label: string, edge: 'top' | 'right' | 'bottom' | 'left', delta: number) => {
    const start = edgeResizeStart.current;
    if (!start || start.label !== label) return;
    const { origW, origH, origX, origY, origShapeW, origShapeH } = start;

    let newW = origW, newH = origH, newX = origX, newY = origY;
    let newShapeW = origShapeW, newShapeH = origShapeH;

    const isVertical = edge === 'top' || edge === 'bottom';
    if (isVertical) {
      newH = Math.max(1, origH + delta);
      newShapeH = Math.max(1, origShapeH + delta);
      if (edge === 'top') newY = origY - delta / 2;
      else newY = origY + delta / 2;
    } else {
      newW = Math.max(1, origW + delta);
      newShapeW = Math.max(1, origShapeW + delta);
      if (edge === 'left') newX = origX - delta / 2;
      else newX = origX + delta / 2;
    }

    setItems(prev => prev.map(i =>
      i.label === label ? { ...i, w: newW, h: newH, props: { ...i.props, shapeWidth: newShapeW, shapeHeight: newShapeH } } : i
    ));
    setStates(prev => ({
      ...prev,
      [label]: { ...prev[label], x: newX, y: newY },
    }));
  }, []);

  const handleEdgeResizeCommit = useCallback(() => {
    edgeResizeStart.current = null;
    pushHistory(itemsRef.current, statesRef.current);
  }, [pushHistory]);

  // ── Vector edit mode (double-click to edit points) ───────────────────
  const vectorEditRef = useRef<VectorEditState | null>(null);
  const [vectorEditTick, setVectorEditTick] = useState(0);
  const vectorEditRedraw = useCallback(() => setVectorEditTick(t => t + 1), []);

  const enterVectorEdit = useCallback((label: string) => {
    const item = itemsRef.current.find(i => i.label === label);
    if (!item || item.type !== 'Shape') return;

    const shapeType = item.props.shapeType as string;
    const shapeW = (item.props.shapeWidth as number) ?? item.w;
    const shapeH = (item.props.shapeHeight as number) ?? item.h;
    let parsed: { points: VectorPoint[]; closed: boolean };

    if (shapeType === 'vector' && item.props.pathData) {
      parsed = parsePathData(item.props.pathData as string);
    } else if (shapeType === 'rectangle') {
      const br = (item.props.borderRadius as number) ?? 0;
      parsed = decomposeRectangle(shapeW, shapeH, br);
    } else if (shapeType === 'ellipse') {
      parsed = decomposeEllipse(shapeW, shapeH);
    } else {
      return;
    }

    if (parsed.points.length < 2) return;

    vectorEditRef.current = {
      itemLabel: label,
      points: parsed.points,
      closed: parsed.closed,
      selectedPoint: -1,
      originalShapeType: shapeType,
    };
    setVectorEditItem(label);
    setSelection(new Set([label]));
    vectorEditRedraw();
  }, [vectorEditRedraw]);

  const exitVectorEdit = useCallback((commit: boolean) => {
    const ve = vectorEditRef.current;
    if (!ve) { setVectorEditItem(null); return; }

    if (commit && ve.points.length >= 2) {
      const bounds = recomputeBounds(ve.points);
      const normalized = normalizePoints(ve.points, bounds);
      const pathData = pointsToPathData(normalized, ve.closed);
      const bw = bounds.w;
      const bh = bounds.h;

      // Update item to vector type with new pathData
      const label = ve.itemLabel;
      setItems(prev => prev.map(i => {
        if (i.label !== label) return i;
        const _st = statesRef.current[label]; void _st;
        return {
          ...i,
          w: Math.round(bw),
          h: Math.round(bh),
          props: {
            ...i.props,
            shapeType: 'vector',
            shapeWidth: Math.round(bw),
            shapeHeight: Math.round(bh),
            pathData,
            viewBox: `0 0 ${bw.toFixed(2)} ${bh.toFixed(2)}`,
            // Remove rectangle-specific props
            borderRadius: undefined,
            cornerSmoothing: undefined,
          },
        };
      }));

      // Adjust position: the bounding box origin may have shifted
      const item = itemsRef.current.find(i => i.label === label);
      const st = statesRef.current[label];
      if (item && st) {
        const sc = st.scale ?? 1;
        // Original item center was at st.x, st.y
        // Original viewBox was positioned at item center - (itemW*sc/2, itemH*sc/2)
        // New bounds have shifted by (bounds.minX, bounds.minY) relative to old viewBox origin
        const oldW = (item.props.shapeWidth as number) ?? item.w;
        const oldH = (item.props.shapeHeight as number) ?? item.h;
        const newCx = st.x + (bounds.minX - 0) * sc + (bw * sc - oldW * sc) / 2;
        const newCy = st.y + (bounds.minY - 0) * sc + (bh * sc - oldH * sc) / 2;
        setStates(prev => ({
          ...prev,
          [label]: { ...prev[label], x: newCx, y: newCy },
        }));
      }

      if (ve.originalShapeType !== 'vector') {
        toast('Converted to vector');
      }
      pushHistory(itemsRef.current, statesRef.current);
    }

    vectorEditRef.current = null;
    setVectorEditItem(null);
  }, [pushHistory, toast]);

  // Vector edit: point manipulation callbacks
  const vePointSelect = useCallback((index: number) => {
    const ve = vectorEditRef.current;
    if (ve) { ve.selectedPoint = index; vectorEditRedraw(); }
  }, [vectorEditRedraw]);

  const vePointDragStart = useCallback((_index: number) => {
    // Nothing special needed on drag start
  }, []);

  const vePointDrag = useCallback((index: number, x: number, y: number) => {
    const ve = vectorEditRef.current;
    if (!ve) return;
    const p = ve.points[index];
    // Move handles along with the point
    const dx = x - p.x, dy = y - p.y;
    if (p.handleIn) { p.handleIn.x += dx; p.handleIn.y += dy; }
    if (p.handleOut) { p.handleOut.x += dx; p.handleOut.y += dy; }
    p.x = x; p.y = y;

    // Live-update the shape's pathData for real-time feedback
    const pathData = pointsToPathData(ve.points, ve.closed);
    const label = ve.itemLabel;
    setItems(prev => prev.map(i =>
      i.label === label ? { ...i, props: { ...i.props, pathData } } : i
    ));
    vectorEditRedraw();
  }, [vectorEditRedraw]);

  const vePointDragEnd = useCallback(() => {
    // Recompute bounds and update item dimensions
    const ve = vectorEditRef.current;
    if (!ve) return;
    const bounds = recomputeBounds(ve.points);
    const normalized = normalizePoints(ve.points, bounds);
    const pathData = pointsToPathData(normalized, ve.closed);
    ve.points = normalized;

    const label = ve.itemLabel;
    const item = itemsRef.current.find(i => i.label === label);
    const st = statesRef.current[label];
    if (!item || !st) return;

    const sc = st.scale ?? 1;
    const oldW = (item.props.shapeWidth as number) ?? item.w;
    const oldH = (item.props.shapeHeight as number) ?? item.h;
    const bw = bounds.w;
    const bh = bounds.h;

    setItems(prev => prev.map(i =>
      i.label === label ? {
        ...i, w: Math.round(bw), h: Math.round(bh),
        props: {
          ...i.props,
          shapeType: 'vector',
          shapeWidth: Math.round(bw), shapeHeight: Math.round(bh),
          pathData,
          viewBox: `0 0 ${bw.toFixed(2)} ${bh.toFixed(2)}`,
          borderRadius: undefined, cornerSmoothing: undefined,
        },
      } : i
    ));

    const newCx = st.x + bounds.minX * sc + (bw * sc - oldW * sc) / 2;
    const newCy = st.y + bounds.minY * sc + (bh * sc - oldH * sc) / 2;
    setStates(prev => ({
      ...prev,
      [label]: { ...prev[label], x: newCx, y: newCy },
    }));

    if (ve.originalShapeType !== 'vector') ve.originalShapeType = 'vector';
    pushHistory(itemsRef.current, statesRef.current);
    vectorEditRedraw();
  }, [pushHistory, vectorEditRedraw]);

  const veHandleDragStart = useCallback((_index: number, _which: 'in' | 'out') => {
    // Nothing needed
  }, []);

  const veHandleDrag = useCallback((index: number, which: 'in' | 'out', x: number, y: number, altKey: boolean) => {
    const ve = vectorEditRef.current;
    if (!ve) return;
    const p = ve.points[index];

    if (which === 'in') {
      p.handleIn = { x, y };
      if (!altKey && p.handleOut) {
        p.handleOut = mirrorHandle(p, { x, y });
      }
    } else {
      p.handleOut = { x, y };
      if (!altKey && p.handleIn) {
        p.handleIn = mirrorHandle(p, { x, y });
      }
    }

    // Live update
    const pathData = pointsToPathData(ve.points, ve.closed);
    const label = ve.itemLabel;
    setItems(prev => prev.map(i =>
      i.label === label ? { ...i, props: { ...i.props, pathData } } : i
    ));
    vectorEditRedraw();
  }, [vectorEditRedraw]);

  const veHandleDragEnd = useCallback(() => {
    vePointDragEnd(); // Same recompute logic
  }, [vePointDragEnd]);

  const veSegmentClick = useCallback((segmentIndex: number) => {
    const ve = vectorEditRef.current;
    if (!ve) return;

    const p0 = ve.points[segmentIndex];
    const p1Idx = (segmentIndex + 1) % ve.points.length;
    const p1 = ve.points[p1Idx];

    // Use De Casteljau to split at t=0.5
    const { leftHandleOut, mid, rightHandleIn } = deCasteljau(p0, p1, 0.5);

    // Update adjacent points' handles
    p0.handleOut = leftHandleOut;
    p1.handleIn = rightHandleIn;

    // Insert new midpoint
    ve.points.splice(segmentIndex + 1, 0, mid);
    ve.selectedPoint = segmentIndex + 1;

    // Live update
    const pathData = pointsToPathData(ve.points, ve.closed);
    const label = ve.itemLabel;
    setItems(prev => prev.map(i =>
      i.label === label ? { ...i, props: { ...i.props, pathData } } : i
    ));
    vectorEditRedraw();
  }, [vectorEditRedraw]);

  const vePointDoubleClick = useCallback((index: number) => {
    const ve = vectorEditRef.current;
    if (!ve) return;
    const p = ve.points[index];

    if (p.handleIn || p.handleOut) {
      // Has handles → remove them (convert to straight)
      p.handleIn = null;
      p.handleOut = null;
    } else {
      // No handles → add default handles based on adjacent points
      const prevIdx = (index - 1 + ve.points.length) % ve.points.length;
      const nextIdx = (index + 1) % ve.points.length;
      const prev = ve.points.length > 1 ? ve.points[prevIdx] : null;
      const next = ve.points.length > 1 ? ve.points[nextIdx] : null;

      if (prev && next) {
        const dx = next.x - prev.x;
        const dy = next.y - prev.y;
        const len = Math.hypot(dx, dy) / 4;
        if (len > 0) {
          const nx = dx / Math.hypot(dx, dy);
          const ny = dy / Math.hypot(dx, dy);
          p.handleIn = { x: p.x - nx * len, y: p.y - ny * len };
          p.handleOut = { x: p.x + nx * len, y: p.y + ny * len };
        }
      }
    }

    ve.selectedPoint = index;
    const pathData = pointsToPathData(ve.points, ve.closed);
    const label = ve.itemLabel;
    setItems(prev => prev.map(i =>
      i.label === label ? { ...i, props: { ...i.props, pathData } } : i
    ));
    vectorEditRedraw();
  }, [vectorEditRedraw]);

  const veDeletePoint = useCallback(() => {
    const ve = vectorEditRef.current;
    if (!ve || ve.selectedPoint < 0) return;

    ve.points.splice(ve.selectedPoint, 1);

    if (ve.points.length < 2) {
      // Too few points — delete the shape and exit
      const label = ve.itemLabel;
      setItems(prev => prev.filter(i => i.label !== label));
      setStates(prev => { const next = { ...prev }; delete next[label]; return next; });
      setSelection(new Set());
      vectorEditRef.current = null;
      setVectorEditItem(null);
      pushHistory(itemsRef.current, statesRef.current);
      toast('Shape deleted');
      return;
    }

    // Adjust selected point
    if (ve.selectedPoint >= ve.points.length) {
      ve.selectedPoint = ve.points.length - 1;
    }

    const pathData = pointsToPathData(ve.points, ve.closed);
    const label = ve.itemLabel;
    setItems(prev => prev.map(i =>
      i.label === label ? { ...i, props: { ...i.props, pathData } } : i
    ));
    vectorEditRedraw();
  }, [pushHistory, toast, vectorEditRedraw]);

  // ── Gap adjustment (selection gaps) ──────────────────────────────────
  const handleGapPositionUpdate = useCallback((label: string, x: number, y: number) => {
    setStates(prev => ({
      ...prev,
      [label]: { ...prev[label], x, y },
    }));
  }, []);

  const handleGapCommit = useCallback(() => {
    pushHistory(itemsRef.current, statesRef.current);
  }, [pushHistory]);

  // ── Window gap drag (moves all selected items by delta) ───────────
  const handleWindowGapDelta = useCallback((dx: number, dy: number) => {
    setStates(prev => {
      const next = { ...prev };
      for (const label of selectionRef.current) {
        const s = next[label];
        if (s && !s.locked) next[label] = { ...s, x: s.x + dx, y: s.y + dy };
      }
      return next;
    });
  }, []);

  const handleWindowGapCommit = useCallback(() => {
    pushHistory(itemsRef.current, statesRef.current);
  }, [pushHistory]);

  // ── Selection ──────────────────────────────────────────────────────
  const handleSelect = useCallback((label: string | null, shiftKey: boolean) => {
    if (vectorEditRef.current && label !== vectorEditRef.current.itemLabel) {
      exitVectorEdit(true);
    }
    if (label === null) {
      // Clicking empty space: exit active group if any
      if (activeGroupRef.current) {
        setActiveGroup(null);
      }
      setSelection(new Set());
      return;
    }
    // Route click to the correct selectable ancestor based on activeGroup
    const target = getSelectableLabel(itemsRef.current, label, activeGroupRef.current);
    if (shiftKey) {
      setSelection(prev => {
        const next = new Set(prev);
        if (next.has(target)) next.delete(target);
        else next.add(target);
        return next;
      });
    } else {
      setSelection(prev => {
        if (prev.has(target) && prev.size > 1) return prev;
        return new Set([target]);
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
    // Expand to include descendants of any groups/frames being deleted
    const expanded = new Set(labels);
    for (const label of labels) {
      for (const desc of getDescendants(items, label)) {
        expanded.add(desc.label);
      }
    }
    const nextItems = items.filter(i => !expanded.has(i.label));
    const nextStates = { ...states };
    for (const label of expanded) {
      delete nextStates[label];
    }
    setItems(nextItems);
    setStates(nextStates);
    setSelection(new Set());
    pushHistory(nextItems, nextStates);
  }, [items, states, pushHistory]);

  // ── Group / Ungroup ──────────────────────────────────────────────
  const groupItems = useCallback((labels: Set<string>, type: 'Group' | 'Frame' = 'Group') => {
    if (labels.size < 2 && type === 'Group') return;
    const selected = items.filter(i => labels.has(i.label));
    if (selected.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let maxZ = -Infinity;
    for (const item of selected) {
      const s = states[item.label];
      if (!s) continue;
      const hw = (item.w * s.scale) / 2;
      const hh = (item.h * s.scale) / 2;
      minX = Math.min(minX, s.x - hw);
      minY = Math.min(minY, s.y - hh);
      maxX = Math.max(maxX, s.x + hw);
      maxY = Math.max(maxY, s.y + hh);
      maxZ = Math.max(maxZ, s.z);
    }

    const groupLabel = `${type}_${Date.now()}_${nextId++}`;
    const gw = maxX - minX;
    const gh = maxY - minY;
    const gx = minX + gw / 2;
    const gy = minY + gh / 2;

    const groupItem: ItemDef = {
      label: groupLabel, type,
      x: gx, y: gy, w: gw, h: gh, rot: 0, z: maxZ + 1,
      props: type === 'Frame'
        ? { frameW: gw, frameH: gh, frameFill: 'transparent', frameBorderColor: '#e5e7eb', frameBorderWidth: 1, frameRadius: 0, clipContent: false }
        : {},
    };
    const groupState: ItemState = { x: gx, y: gy, scale: 1, rot: 0, z: maxZ + 1 };

    const nextItems = items.map(i => labels.has(i.label) ? { ...i, group: groupLabel } : i);
    nextItems.push(groupItem);
    const nextStates = { ...states, [groupLabel]: groupState };

    setItems(nextItems);
    setStates(nextStates);
    setSelection(new Set([groupLabel]));
    pushHistory(nextItems, nextStates);
  }, [items, states, pushHistory]);

  const ungroupItems = useCallback((labels: Set<string>) => {
    let nextItems = [...items];
    const nextStates = { ...states };
    const newSelection = new Set<string>();

    for (const label of labels) {
      const item = nextItems.find(i => i.label === label);
      if (!item || (item.type !== 'Group' && item.type !== 'Frame')) {
        newSelection.add(label);
        continue;
      }
      nextItems = nextItems.map(i => i.group === label ? { ...i, group: undefined } : i);
      for (const child of getChildren(nextItems, label)) {
        newSelection.add(child.label);
      }
      nextItems = nextItems.filter(i => i.label !== label);
      delete nextStates[label];
    }

    setItems(nextItems);
    setStates(nextStates);
    setSelection(newSelection);
    pushHistory(nextItems, nextStates);
  }, [items, states, pushHistory]);

  const pasteFromClipboard = useCallback(() => {
    const entries = clipboardRef.current;
    if (entries.length === 0) return;
    let nextItems = [...items];
    let nextStates = { ...states };
    const newSelection = new Set<string>();
    for (const { item, state } of entries) {
      const newLabel = `${item.type}_${Date.now()}_${nextId++}`;
      const newState: ItemState = { ...state, x: state.x + duplicateOffset, y: state.y + duplicateOffset };
      const newItem: ItemDef = { ...item, props: { ...item.props }, label: newLabel, x: newState.x, y: newState.y };
      nextItems = [...nextItems, newItem];
      nextStates = { ...nextStates, [newLabel]: newState };
      newSelection.add(newLabel);
    }
    setItems(nextItems);
    setStates(nextStates);
    setSelection(newSelection);
    pushHistory(nextItems, nextStates);
  }, [items, states, pushHistory, duplicateOffset]);

  const renameItem = useCallback((oldLabel: string, newLabel: string) => {
    if (!newLabel || oldLabel === newLabel) return;
    if (items.some(i => i.label === newLabel)) {
      toast('Name already in use');
      return;
    }
    const nextStates = { ...states };
    nextStates[newLabel] = states[oldLabel];
    delete nextStates[oldLabel];
    const nextItems = items.map(i => i.label === oldLabel ? { ...i, label: newLabel } : i);
    setStates(nextStates);
    setItems(nextItems);
    setSelection(new Set([newLabel]));
    pushHistory(nextItems, nextStates);
  }, [items, states, pushHistory, toast]);

  const handleCommitChange = useCallback((label: string, patch: Partial<ItemState>) => {
    const nextStates = { ...states, [label]: { ...states[label], ...patch } };

    // If position changed on a group/frame, move all descendants by the same delta
    if (patch.x !== undefined || patch.y !== undefined) {
      const item = items.find(i => i.label === label);
      if (item && (item.type === 'Group' || item.type === 'Frame')) {
        const oldState = states[label];
        const dx = (patch.x ?? oldState.x) - oldState.x;
        const dy = (patch.y ?? oldState.y) - oldState.y;
        if (dx !== 0 || dy !== 0) {
          for (const desc of getDescendants(items, label)) {
            const ds = nextStates[desc.label];
            if (ds) {
              nextStates[desc.label] = { ...ds, x: ds.x + dx, y: ds.y + dy };
            }
          }
        }
      }
    }

    setStates(nextStates);
    pushHistoryDebounced(items, nextStates);
  }, [items, states, pushHistoryDebounced]);

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

  // ── Create shape item helper ─────────────────────────────────────
  const createShapeItem = useCallback((
    shapeType: 'rectangle' | 'ellipse' | 'vector',
    cx: number, cy: number,
    w: number, h: number,
    extraProps?: Record<string, unknown>,
  ) => {
    const label = `${shapeType}_${Date.now()}_${nextId++}`;
    const newItem: ItemDef = {
      label,
      type: 'Shape',
      x: cx, y: cy,
      w, h, rot: 0, z: 0,
      props: {
        shapeType,
        shapeWidth: w,
        shapeHeight: h,
        fills: shapeType === 'vector'
          ? [{ type: 'none' as const }]
          : [{ type: 'solid' as const, color: '#d9d9d9', opacity: 1 }],
        strokes: shapeType === 'vector'
          ? [{ color: '#333333', width: 2, opacity: 1 }]
          : [{ color: '#b3b3b3', width: 1, opacity: 1 }],
        shadows: [],
        blur: 0,
        borderRadius: 0,
        cornerSmoothing: 0,
        ...extraProps,
      },
    };
    const newState: ItemState = { x: cx, y: cy, scale: 1, rot: 0, z: 0 };
    const nextItems = [...itemsRef.current, newItem];
    const nextStates = { ...statesRef.current, [label]: newState };
    setItems(nextItems);
    setStates(nextStates);
    setSelection(new Set([label]));
    pushHistory(nextItems, nextStates);
    return label;
  }, [pushHistory]);

  // ── Pen tool helpers ───────────────────────────────────────────────
  /** Constrain a point to 45-degree increments relative to an origin */
  const constrainAngle = (origin: { x: number; y: number }, pt: { x: number; y: number }): { x: number; y: number } => {
    const dx = pt.x - origin.x;
    const dy = pt.y - origin.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return pt;
    const angle = Math.atan2(dy, dx);
    const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    return { x: origin.x + Math.cos(snapped) * dist, y: origin.y + Math.sin(snapped) * dist };
  };

  // mirrorHandle imported from vector-edit-utils

  /** Build a cubic bezier segment string between two pen points */
  const penSegment = (prev: PenPoint, cur: PenPoint): string => {
    const hasCurve = prev.handleOut || cur.handleIn;
    if (hasCurve) {
      const cp1 = prev.handleOut ?? prev;
      const cp2 = cur.handleIn ?? cur;
      return `C ${cp1.x.toFixed(2)},${cp1.y.toFixed(2)} ${cp2.x.toFixed(2)},${cp2.y.toFixed(2)} ${cur.x.toFixed(2)},${cur.y.toFixed(2)}`;
    }
    return `L ${cur.x.toFixed(2)},${cur.y.toFixed(2)}`;
  };

  /** Reset pen state to empty */
  const resetPen = useCallback(() => {
    penRef.current = {
      points: [], phase: 'idle', dragAnchor: null,
      handleBroken: false, frozenHandleIn: null,
      previewPos: null, closeHover: false,
    };
    penRedraw();
  }, [penRedraw]);

  // ── Finish pen path ───────────────────────────────────────────────
  const finishPenPath = useCallback((close: boolean) => {
    const pen = penRef.current;
    const pts = pen.points;
    if (pts.length < 2) {
      resetPen();
      return;
    }

    // Build SVG path data in absolute canvas coords
    const segments: string[] = [`M ${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`];
    for (let i = 1; i < pts.length; i++) {
      segments.push(penSegment(pts[i - 1], pts[i]));
    }
    if (close) {
      segments.push(penSegment(pts[pts.length - 1], pts[0]));
      segments.push('Z');
    }

    // Compute bounding box from all points and handles
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const expand = (px: number, py: number) => {
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    };
    for (const pt of pts) {
      expand(pt.x, pt.y);
      if (pt.handleIn) expand(pt.handleIn.x, pt.handleIn.y);
      if (pt.handleOut) expand(pt.handleOut.x, pt.handleOut.y);
    }
    const pad = 2;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    const bw = Math.max(1, Math.round(maxX - minX));
    const bh = Math.max(1, Math.round(maxY - minY));
    const cx = Math.round((minX + maxX) / 2);
    const cy = Math.round((minY + maxY) / 2);

    // Translate all coordinates so viewBox starts at (0,0)
    const translated: string[] = [`M ${(pts[0].x - minX).toFixed(2)},${(pts[0].y - minY).toFixed(2)}`];
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const cur = pts[i];
      const hasCurve = prev.handleOut || cur.handleIn;
      if (hasCurve) {
        const cp1 = prev.handleOut ?? prev;
        const cp2 = cur.handleIn ?? cur;
        translated.push(`C ${(cp1.x - minX).toFixed(2)},${(cp1.y - minY).toFixed(2)} ${(cp2.x - minX).toFixed(2)},${(cp2.y - minY).toFixed(2)} ${(cur.x - minX).toFixed(2)},${(cur.y - minY).toFixed(2)}`);
      } else {
        translated.push(`L ${(cur.x - minX).toFixed(2)},${(cur.y - minY).toFixed(2)}`);
      }
    }
    if (close) {
      const last = pts[pts.length - 1];
      const first = pts[0];
      const hasCurve = last.handleOut || first.handleIn;
      if (hasCurve) {
        const cp1 = last.handleOut ?? last;
        const cp2 = first.handleIn ?? first;
        translated.push(`C ${(cp1.x - minX).toFixed(2)},${(cp1.y - minY).toFixed(2)} ${(cp2.x - minX).toFixed(2)},${(cp2.y - minY).toFixed(2)} ${(first.x - minX).toFixed(2)},${(first.y - minY).toFixed(2)}`);
      }
      translated.push('Z');
    }

    createShapeItem('vector', cx, cy, bw, bh, {
      pathData: translated.join(' '),
      viewBox: `0 0 ${bw} ${bh}`,
      fills: close ? [{ type: 'solid' as const, color: '#d9d9d9', opacity: 1 }] : [{ type: 'none' as const }],
      strokes: [{ color: '#333333', width: 2, opacity: 1 }],
    });

    resetPen();
    setToolMode('select');
    toast('Path created');
  }, [createShapeItem, toast, resetPen]);
  const finishPenPathRef = useRef(finishPenPath);
  finishPenPathRef.current = finishPenPath;

  // ── Keyboard ───────────────────────────────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const sel = selectionRef.current;
      const curItems = itemsRef.current;
      const curStates = statesRef.current;
      const cam = cameraRef.current;

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

      // Suppress all shortcuts while editing text inline
      // (contentEditable's onKeyDown calls stopPropagation, but this is a safety guard)
      if ((e.target as HTMLElement).isContentEditable) return;

      // Tool shortcuts (T, R, O, L, P)
      // R only activates rectangle tool when nothing is selected (otherwise it resets items)
      if (!e.metaKey && !e.ctrlKey && (e.target as HTMLElement).tagName !== 'INPUT') {
        const toolMap: Record<string, { mode: ToolMode; label: string; requireNoSel?: boolean }> = {
          t: { mode: 'text', label: 'Text tool — click to place' },
          r: { mode: 'rectangle', label: 'Rectangle tool — click and drag', requireNoSel: true },
          o: { mode: 'ellipse', label: 'Ellipse tool — click and drag' },
          l: { mode: 'line', label: 'Line tool — click and drag' },
          p: { mode: 'pen', label: 'Pen tool — click to place points' },
        };
        const tool = toolMap[e.key];
        if (tool && !(tool.requireNoSel && sel.size > 0)) {
          e.preventDefault();
          setToolMode(prev => {
            const next = prev === tool.mode ? 'select' : tool.mode;
            toast(next === 'select' ? 'Select mode' : tool.label);
            return next;
          });
          setSelection(new Set());
          resetPen();
          return;
        }
      }

      // Enter = finish pen path (open)
      if (e.key === 'Enter' && toolModeRef.current === 'pen' && (e.target as HTMLElement).tagName !== 'INPUT') {
        e.preventDefault();
        finishPenPathRef.current(false);
        setToolMode('select');
        toast('Select mode');
        return;
      }

      // Escape = exit vector edit, exit tool mode, finish pen, or deselect
      if (e.key === 'Escape' && (e.target as HTMLElement).tagName !== 'INPUT') {
        if (vectorEditRef.current) {
          exitVectorEdit(true);
          return;
        }
        const tm = toolModeRef.current;
        if (tm !== 'select') {
          // If pen tool has points, finish the path (open)
          if (tm === 'pen') finishPenPathRef.current(false);
          setToolMode('select');
          resetPen();
          toast('Select mode');
          return;
        }
        if (activeGroupRef.current) {
          setSelection(new Set([activeGroupRef.current]));
          setActiveGroup(null);
          return;
        }
        setSelection(new Set());
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
        e.preventDefault(); zoomTo(cam.zoom * 1.25); return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '-') {
        e.preventDefault(); zoomTo(cam.zoom / 1.25); return;
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

      // Window mode
      if (e.key === 'w' && !e.metaKey && !e.ctrlKey && (e.target as HTMLElement).tagName !== 'INPUT') {
        e.preventDefault();
        onToggleWindowMode?.();
        return;
      }

      // Tab = cycle selection
      if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey && (e.target as HTMLElement).tagName !== 'INPUT') {
        e.preventDefault();
        if (curItems.length === 0) return;
        const allLabels = curItems.map(i => i.label);
        const current = sel.size > 0 ? [...sel][0] : null;
        const idx = current ? allLabels.indexOf(current) : -1;
        const nextIdx = e.shiftKey
          ? (idx <= 0 ? allLabels.length - 1 : idx - 1)
          : (idx >= allLabels.length - 1 ? 0 : idx + 1);
        setSelection(new Set([allLabels[nextIdx]]));
        return;
      }

      // Select all
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault();
        setSelection(new Set(curItems.map(i => i.label)));
        toast(`Selected ${curItems.length} items`);
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        if (clipboardRef.current.length > 0) {
          e.preventDefault();
          pasteFromClipboard();
          toast('Pasted');
        }
        return;
      }

      if (sel.size === 0) return;

      // R = reset selected items to their defaults
      if (e.key === 'r' && !e.metaKey && !e.ctrlKey && (e.target as HTMLElement).tagName !== 'INPUT') {
        e.preventDefault();
        const nextStates = { ...curStates };
        for (const label of sel) {
          const item = curItems.find(i => i.label === label);
          if (!item) continue;
          nextStates[label] = { x: item.x, y: item.y, scale: 1, rot: item.rot, z: item.z };
        }
        setStates(nextStates);
        pushHistory(curItems, nextStates);
        toast(sel.size > 1 ? `Reset ${sel.size} items` : 'Reset item');
        return;
      }

      // Group: Cmd+G
      if ((e.metaKey || e.ctrlKey) && e.key === 'g' && !e.shiftKey) {
        e.preventDefault();
        if (sel.size >= 2) {
          groupItems(sel, 'Group');
          toast('Grouped');
        }
        return;
      }
      // Ungroup: Cmd+Shift+G
      if ((e.metaKey || e.ctrlKey) && e.key === 'g' && e.shiftKey) {
        e.preventDefault();
        ungroupItems(sel);
        toast('Ungrouped');
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault(); duplicateItems(sel);
        toast(`Duplicated ${sel.size} item${sel.size > 1 ? 's' : ''}`);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        clipboardRef.current = curItems
          .filter(i => sel.has(i.label))
          .map(i => ({ item: { ...i, props: { ...i.props } }, state: { ...curStates[i.label] } }));
        toast('Copied to clipboard');
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if ((e.target as HTMLElement).tagName === 'INPUT') return;
        e.preventDefault();
        if (vectorEditRef.current && vectorEditRef.current.selectedPoint >= 0) {
          veDeletePoint();
          return;
        }
        const count = sel.size;
        deleteItems(sel);
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
        const nextStates = { ...curStates };
        for (const label of sel) {
          const s = nextStates[label];
          if (s && !s.locked) nextStates[label] = { ...s, x: s.x + dx, y: s.y + dy };
        }
        setStates(nextStates);
        pushHistoryDebounced(curItems, nextStates);
        return;
      }

      // ── Z-order shortcuts ───────────────────────────────────────────
      // Cmd+] = bring forward, Cmd+[ = send backward
      // Cmd+Opt+] = bring to front, Cmd+Opt+[ = send to back
      if ((e.metaKey || e.ctrlKey) && (e.key === ']' || e.key === '[')) {
        e.preventDefault();
        const allZ = Object.values(curStates).map(s => s.z);
        const maxZ = allZ.length > 0 ? Math.max(...allZ) : 0;
        const minZ = allZ.length > 0 ? Math.min(...allZ) : 0;
        const nextStates = { ...curStates };
        for (const label of sel) {
          const s = nextStates[label];
          if (!s) continue;
          if (e.key === ']') {
            nextStates[label] = { ...s, z: e.altKey ? maxZ + 1 : s.z + 1 };
          } else {
            nextStates[label] = { ...s, z: e.altKey ? minZ - 1 : s.z - 1 };
          }
        }
        setStates(nextStates);
        pushHistory(curItems, nextStates);
        toast(e.key === ']'
          ? (e.altKey ? 'Brought to front' : 'Brought forward')
          : (e.altKey ? 'Sent to back' : 'Sent backward'));
        return;
      }

      // ── Flip shortcuts ──────────────────────────────────────────────
      // Shift+H = flip horizontal, Shift+V = flip vertical
      if (e.key === 'H' && e.shiftKey && !e.metaKey && !e.ctrlKey && (e.target as HTMLElement).tagName !== 'INPUT') {
        e.preventDefault();
        const nextStates = { ...curStates };
        for (const label of sel) {
          const s = nextStates[label];
          if (s && !s.locked) nextStates[label] = { ...s, flipX: !s.flipX };
        }
        setStates(nextStates);
        pushHistory(curItems, nextStates);
        toast('Flipped horizontal');
        return;
      }
      if (e.key === 'V' && e.shiftKey && !e.metaKey && !e.ctrlKey && (e.target as HTMLElement).tagName !== 'INPUT') {
        e.preventDefault();
        const nextStates = { ...curStates };
        for (const label of sel) {
          const s = nextStates[label];
          if (s && !s.locked) nextStates[label] = { ...s, flipY: !s.flipY };
        }
        setStates(nextStates);
        pushHistory(curItems, nextStates);
        toast('Flipped vertical');
        return;
      }

      // ── Alignment shortcuts (Opt+A/D/W/S/H/V) ──────────────────────
      if (e.altKey && !e.metaKey && !e.ctrlKey && sel.size >= 2 && (e.target as HTMLElement).tagName !== 'INPUT') {
        const alignMap: Record<string, AlignAction> = {
          a: 'left', d: 'right', h: 'centerH',
          w: 'top', s: 'bottom', v: 'centerV',
        };
        const action = alignMap[e.key.toLowerCase()];
        if (action) {
          e.preventDefault();
          const labels = [...sel];
          const positions = computeAlignment(action, labels, curItems, curStates);
          if (Object.keys(positions).length > 0) {
            const nextStates = { ...curStates };
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
            pushHistory(curItems, nextStates);
            const names: Record<AlignAction, string> = {
              left: 'Aligned left', right: 'Aligned right', centerH: 'Aligned centers',
              top: 'Aligned top', bottom: 'Aligned bottom', centerV: 'Aligned middles',
              distributeH: 'Distributed', distributeV: 'Distributed',
            };
            toast(names[action]);
          }
          return;
        }
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
  }, [duplicateItems, deleteItems, groupItems, ungroupItems, pasteFromClipboard, undo, redo, pushHistory, zoomTo, resetView, doFitToView, toast, gridSize, nudgeSmall, nudgeLarge, onToggleWindowMode]);

  // ── Paste SVG from clipboard (Figma, etc.) ─────────────────────
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      // Don't intercept when typing in inputs
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;

      const html = e.clipboardData?.getData('text/html') ?? '';
      const text = e.clipboardData?.getData('text/plain') ?? '';

      // ── Figma "Copy properties" CSS paste ──────────────────────
      if (_isFigmaCSS(text)) {
        const sel = selectionRef.current;
        if (sel.size === 0) return;
        const figmaProps = parseFigmaCSS(text);
        const hasAny = figmaProps.fills || figmaProps.borderRadius !== undefined ||
          figmaProps.shadows || figmaProps.strokes || figmaProps.blur !== undefined ||
          figmaProps.opacity !== undefined;
        if (!hasAny) return;
        e.preventDefault();
        const curItems = itemsRef.current;
        const curStates = statesRef.current;
        const nextItems = curItems.map(i => {
          if (!sel.has(i.label)) return i;
          const patch: Record<string, unknown> = {};
          if (figmaProps.fills) patch.fills = figmaProps.fills;
          if (figmaProps.borderRadius !== undefined) patch.borderRadius = figmaProps.borderRadius;
          if (figmaProps.shadows) patch.shadows = figmaProps.shadows;
          if (figmaProps.strokes) patch.strokes = figmaProps.strokes;
          if (figmaProps.blur !== undefined) patch.blur = figmaProps.blur;
          return { ...i, props: { ...i.props, ...patch } };
        });
        let nextStates = curStates;
        if (figmaProps.opacity !== undefined) {
          nextStates = { ...curStates };
          for (const label of sel) {
            if (nextStates[label]) nextStates[label] = { ...nextStates[label], opacity: figmaProps.opacity };
          }
        }
        setItems(nextItems);
        setStates(nextStates);
        pushHistory(nextItems, nextStates);
        toast('Applied Figma properties');
        return;
      }

      const svgSource = html || text;

      // Quick check: does it contain SVG?
      if (!svgSource.includes('<svg') && !svgSource.includes('<SVG')) return;

      // Extract the SVG element
      const match = svgSource.match(/<svg[\s\S]*?<\/svg>/i);
      if (!match) return;

      e.preventDefault();

      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(match[0], 'image/svg+xml');
        const svg = doc.querySelector('svg');
        if (!svg) return;

        // Get SVG dimensions
        const vb = svg.getAttribute('viewBox');
        const svgW = parseFloat(svg.getAttribute('width') ?? '100');
        const svgH = parseFloat(svg.getAttribute('height') ?? '100');
        const viewBox = vb ?? `0 0 ${svgW} ${svgH}`;

        // Collect all shape elements
        const shapes: { pathData: string; fill: string; fillOpacity: number; stroke: string; strokeWidth: number }[] = [];

        const extractColor = (el: Element, attr: string, fallback: string): string => {
          const val = el.getAttribute(attr) ?? (el as HTMLElement).style?.getPropertyValue(attr) ?? '';
          if (!val || val === 'none') return fallback;
          // Handle rgb() → hex
          const rgbMatch = val.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
          if (rgbMatch) {
            const [, r, g, b] = rgbMatch;
            return `#${[r, g, b].map(c => parseInt(c).toString(16).padStart(2, '0')).join('')}`;
          }
          if (val.startsWith('#')) return val;
          return fallback;
        };

        // Process paths
        svg.querySelectorAll('path').forEach(path => {
          const d = path.getAttribute('d');
          if (!d) return;
          shapes.push({
            pathData: d,
            fill: extractColor(path, 'fill', '#000000'),
            fillOpacity: parseFloat(path.getAttribute('fill-opacity') ?? '1'),
            stroke: extractColor(path, 'stroke', 'none'),
            strokeWidth: parseFloat(path.getAttribute('stroke-width') ?? '0'),
          });
        });

        // Process rects
        svg.querySelectorAll('rect').forEach(rect => {
          const x = parseFloat(rect.getAttribute('x') ?? '0');
          const y = parseFloat(rect.getAttribute('y') ?? '0');
          const w = parseFloat(rect.getAttribute('width') ?? '0');
          const h = parseFloat(rect.getAttribute('height') ?? '0');
          const rx = parseFloat(rect.getAttribute('rx') ?? '0');
          if (w === 0 || h === 0) return;
          // Convert rect to path
          const r = Math.min(rx, w / 2, h / 2);
          const d = r > 0
            ? `M${x + r},${y} h${w - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - 2 * r} a${r},${r} 0 0 1 ${-r},${r} h${-(w - 2 * r)} a${r},${r} 0 0 1 ${-r},${-r} v${-(h - 2 * r)} a${r},${r} 0 0 1 ${r},${-r} z`
            : `M${x},${y} h${w} v${h} h${-w} z`;
          shapes.push({
            pathData: d,
            fill: extractColor(rect, 'fill', '#000000'),
            fillOpacity: parseFloat(rect.getAttribute('fill-opacity') ?? '1'),
            stroke: extractColor(rect, 'stroke', 'none'),
            strokeWidth: parseFloat(rect.getAttribute('stroke-width') ?? '0'),
          });
        });

        // Process circles and ellipses
        svg.querySelectorAll('circle, ellipse').forEach(el => {
          const cx = parseFloat(el.getAttribute('cx') ?? '0');
          const cy = parseFloat(el.getAttribute('cy') ?? '0');
          const rx = parseFloat(el.getAttribute('rx') ?? el.getAttribute('r') ?? '0');
          const ry = parseFloat(el.getAttribute('ry') ?? el.getAttribute('r') ?? '0');
          if (rx === 0 || ry === 0) return;
          // Convert to path
          const d = `M${cx - rx},${cy} a${rx},${ry} 0 1 0 ${rx * 2},0 a${rx},${ry} 0 1 0 ${-rx * 2},0 z`;
          shapes.push({
            pathData: d,
            fill: extractColor(el, 'fill', '#000000'),
            fillOpacity: parseFloat(el.getAttribute('fill-opacity') ?? '1'),
            stroke: extractColor(el, 'stroke', 'none'),
            strokeWidth: parseFloat(el.getAttribute('stroke-width') ?? '0'),
          });
        });

        if (shapes.length === 0) return;

        // Create items at canvas center
        const cam = cameraRef.current;
        const vp = viewportRef.current;
        const centerX = vp ? Math.round((-cam.panX + vp.clientWidth / 2 - vp.clientWidth / 2) / cam.zoom) : 0;
        const centerY = vp ? Math.round((-cam.panY + vp.clientHeight / 2 - vp.clientHeight / 2) / cam.zoom) : 0;

        let curItems = itemsRef.current;
        let curStates = statesRef.current;
        const newSelection = new Set<string>();

        // If single composite shape, group as one item
        if (shapes.length >= 1) {
          // Use all paths combined into a single vector, or individual items
          for (let i = 0; i < shapes.length; i++) {
            const s = shapes[i];
            const w = Math.round(svgW);
            const h = Math.round(svgH);
            const label = `Paste_${Date.now()}_${nextId++}`;
            const strokes: { color: string; width: number; opacity: number }[] =
              s.stroke !== 'none' && s.strokeWidth > 0
                ? [{ color: s.stroke, width: s.strokeWidth, opacity: 1 }]
                : [];
            const newItem: ItemDef = {
              label,
              type: 'Shape',
              x: centerX + i * 20,
              y: centerY + i * 20,
              w, h, rot: 0, z: 0,
              props: {
                shapeType: 'vector',
                shapeWidth: w,
                shapeHeight: h,
                pathData: s.pathData,
                viewBox,
                fills: [{ type: 'solid' as const, color: s.fill, opacity: s.fillOpacity }],
                strokes,
                shadows: [],
                blur: 0,
              },
            };
            const newState: ItemState = { x: centerX + i * 20, y: centerY + i * 20, scale: 1, rot: 0, z: 0 };
            curItems = [...curItems, newItem];
            curStates = { ...curStates, [label]: newState };
            newSelection.add(label);
          }
        }

        setItems(curItems);
        setStates(curStates);
        setSelection(newSelection);
        pushHistory(curItems, curStates);
        toast(`Pasted ${shapes.length} shape${shapes.length > 1 ? 's' : ''}`);
      } catch {
        // Silent fail on parse errors
      }
    };

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [pushHistory, toast]);

  // ── Middle-click pan (capture phase, works over items) ────────────
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const onMiddleDown = (e: PointerEvent) => {
      if (e.button !== 1) return;
      e.preventDefault();
      isPanning.current = true;
      setIsPanningState(true);
      panStart.current = { mx: e.clientX, my: e.clientY, panX: cameraRef.current.panX, panY: cameraRef.current.panY };
      el.setPointerCapture(e.pointerId);
    };

    const onMiddleUp = (e: PointerEvent) => {
      if (e.button !== 1) return;
      if (!isPanning.current) return;
      isPanning.current = false;
      setIsPanningState(false);
      try { el.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    };

    const onMiddleMove = (e: PointerEvent) => {
      if (!isPanning.current || e.buttons !== 4) return;
      const dx = e.clientX - panStart.current.mx;
      const dy = e.clientY - panStart.current.my;
      setCamera(prev => ({
        ...prev,
        panX: panStart.current.panX + dx,
        panY: panStart.current.panY + dy,
      }));
    };

    el.addEventListener('pointerdown', onMiddleDown, { capture: true });
    el.addEventListener('pointerup', onMiddleUp, { capture: true });
    el.addEventListener('pointermove', onMiddleMove, { capture: true });
    return () => {
      el.removeEventListener('pointerdown', onMiddleDown, { capture: true });
      el.removeEventListener('pointerup', onMiddleUp, { capture: true });
      el.removeEventListener('pointermove', onMiddleMove, { capture: true });
    };
  }, [setCamera]);

  // ── Marquee / pan pointer events ──────────────────────────────────
  const onViewportPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.target !== e.currentTarget) return;

    // Exit vector edit mode when clicking on empty canvas
    if (vectorEditRef.current) {
      exitVectorEdit(true);
      return;
    }

    // Space+click = pan
    if (spaceHeld) {
      isPanning.current = true;
      setIsPanningState(true);
      panStart.current = { mx: e.clientX, my: e.clientY, panX: camera.panX, panY: camera.panY };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    // Text tool: click on canvas to create a new text item
    if (toolModeRef.current === 'text') {
      e.preventDefault();
      const pos = screenToCanvas(e.clientX, e.clientY);
      const label = `Text_${Date.now()}_${nextId++}`;
      const newItem: ItemDef = {
        label,
        type: 'Text',
        x: pos.x,
        y: pos.y,
        w: 100,
        h: 24,
        rot: 0,
        z: 0,
        props: {
          text: '',
          fontSize: 16,
          fontFamily: "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          fontWeight: 400,
          color: '#000000',
          textAlign: 'left',
        },
      };
      const newState: ItemState = { x: pos.x, y: pos.y, scale: 1, rot: 0, z: 0 };
      setItems(prev => [...prev, newItem]);
      setStates(prev => ({ ...prev, [label]: newState }));
      setSelection(new Set([label]));
      setEditingItem(label);
      setToolMode('select');
      return;
    }

    // Shape creation tools: start drag
    const tm = toolModeRef.current;
    if (tm === 'rectangle' || tm === 'ellipse' || tm === 'line') {
      e.preventDefault();
      const pos = screenToCanvas(e.clientX, e.clientY);
      shapeCreateRef.current = { startX: pos.x, startY: pos.y };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    // Pen tool: click to place point
    if (tm === 'pen') {
      e.preventDefault();
      let pos = screenToCanvas(e.clientX, e.clientY);
      const pen = penRef.current;

      // Shift: constrain angle to 45° relative to previous point
      if (e.shiftKey && pen.points.length > 0) {
        const prev = pen.points[pen.points.length - 1];
        pos = constrainAngle(prev, pos);
      }

      // Check if clicking near first point to close
      if (pen.points.length >= 3) {
        const first = pen.points[0];
        const dist = Math.hypot(pos.x - first.x, pos.y - first.y);
        if (dist < 12 / camera.zoom) {
          finishPenPathRef.current(true);
          return;
        }
      }

      // Add new point, enter handle-drag phase
      pen.points.push({ x: pos.x, y: pos.y, handleIn: null, handleOut: null });
      pen.phase = 'dragging-handle';
      pen.dragAnchor = { x: pos.x, y: pos.y };
      pen.handleBroken = false;
      pen.frozenHandleIn = null;
      pen.previewPos = null;
      penRedraw();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    // Normal click on canvas = deselect + start marquee
    if (editingItemRef.current) {
      // Clicking on canvas while editing text: let blur commit the text
      setEditingItem(null);
    }
    if (!e.shiftKey) setSelection(new Set());
    marqueeStart.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [spaceHeld, camera.panX, camera.panY, screenToCanvas, camera.zoom]);

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

    // Shape creation drag preview
    if (shapeCreateRef.current) {
      const pos = screenToCanvas(e.clientX, e.clientY);
      const { startX, startY } = shapeCreateRef.current;
      let w = pos.x - startX;
      let h = pos.y - startY;
      const isLine = toolModeRef.current === 'line';
      // Shift = constrain to square/circle (or 45-degree for lines)
      if (e.shiftKey && !isLine) {
        const size = Math.max(Math.abs(w), Math.abs(h));
        w = Math.sign(w || 1) * size;
        h = Math.sign(h || 1) * size;
      }
      if (e.shiftKey && isLine) {
        // Constrain line to 45-degree angles
        const angle = Math.atan2(h, w);
        const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
        const dist = Math.hypot(w, h);
        w = Math.cos(snapped) * dist;
        h = Math.sin(snapped) * dist;
      }
      let x: number, y: number, absW: number, absH: number;
      if (e.altKey && !isLine) {
        // Alt = draw from center: click point is center, expand outward
        absW = Math.abs(w) * 2;
        absH = Math.abs(h) * 2;
        x = startX - Math.abs(w);
        y = startY - Math.abs(h);
      } else {
        absW = Math.abs(w);
        absH = Math.abs(h);
        x = w >= 0 ? startX : startX + w;
        y = h >= 0 ? startY : startY + h;
      }
      setShapePreview({ x, y, w: absW, h: absH, type: toolModeRef.current as 'rectangle' | 'ellipse' | 'line' });
      return;
    }

    // Pen tool: handle drag or preview
    if (toolModeRef.current === 'pen') {
      const pen = penRef.current;
      const pos = screenToCanvas(e.clientX, e.clientY);

      if (pen.phase === 'dragging-handle' && pen.dragAnchor && pen.points.length > 0) {
        const anchor = pen.dragAnchor;
        const dx = pos.x - anchor.x;
        const dy = pos.y - anchor.y;
        // Only activate handles after a small drag threshold
        if (Math.abs(dx) > 2 / camera.zoom || Math.abs(dy) > 2 / camera.zoom) {
          let handlePos = pos;
          // Shift: constrain handle angle to 45°
          if (e.shiftKey) handlePos = constrainAngle(anchor, pos);

          const last = pen.points[pen.points.length - 1];
          last.handleOut = { x: handlePos.x, y: handlePos.y };

          if (pen.handleBroken) {
            // Alt was pressed: handleIn is frozen, only handleOut moves
            last.handleIn = pen.frozenHandleIn;
          } else {
            // Normal: symmetric handles
            last.handleIn = mirrorHandle(anchor, handlePos);
          }

          // Check if Alt just pressed mid-drag to break symmetry
          if (e.altKey && !pen.handleBroken) {
            pen.handleBroken = true;
            pen.frozenHandleIn = last.handleIn ? { ...last.handleIn } : null;
          }
        }
        penRedraw();
        return;
      }

      // Idle: update preview position and close-hover detection
      if (pen.points.length > 0) {
        pen.previewPos = pos;
        // Check close hover
        if (pen.points.length >= 3) {
          const first = pen.points[0];
          pen.closeHover = Math.hypot(pos.x - first.x, pos.y - first.y) < 12 / camera.zoom;
        } else {
          pen.closeHover = false;
        }
        penRedraw();
      }
      return;
    }

    if (!marqueeStart.current) return;
    setMarquee({
      x1: marqueeStart.current.x,
      y1: marqueeStart.current.y,
      x2: e.clientX,
      y2: e.clientY,
    });
  }, [setCamera, screenToCanvas, camera.zoom, penRedraw]);

  const onViewportPointerUp = useCallback((e: React.PointerEvent) => {
    if (isPanning.current) {
      isPanning.current = false;
      setIsPanningState(false);
      return;
    }

    // Shape creation: finish
    if (shapeCreateRef.current) {
      const preview = shapePreviewRef.current;
      const start = shapeCreateRef.current;
      const shapeToolType = toolModeRef.current as 'rectangle' | 'ellipse' | 'line';
      shapeCreateRef.current = null;
      setShapePreview(null);

      const hasDrag = preview && preview.w > 2 && (preview.h > 2 || preview.type === 'line');

      if (hasDrag && preview) {
        const cx = Math.round(preview.x + preview.w / 2);
        const cy = Math.round(preview.y + preview.h / 2);
        const w = Math.round(preview.w);
        const h = Math.round(preview.h);

        if (preview.type === 'line') {
          // Line: create a vector path from actual start to end
          const endPos = screenToCanvas(e.clientX, e.clientY);
          const lw = Math.max(1, Math.round(Math.abs(endPos.x - start.startX)));
          const lh = Math.max(1, Math.round(Math.abs(endPos.y - start.startY)));
          const goRight = endPos.x >= start.startX;
          const goDown = endPos.y >= start.startY;
          const pathData = `M ${goRight ? 0 : lw},${goDown ? 0 : lh} L ${goRight ? lw : 0},${goDown ? lh : 0}`;
          createShapeItem('vector',
            Math.round((start.startX + endPos.x) / 2),
            Math.round((start.startY + endPos.y) / 2),
            lw, lh, {
            pathData,
            viewBox: `0 0 ${lw} ${lh}`,
            fills: [{ type: 'none' as const }],
            strokes: [{ color: '#b3b3b3', width: 1, opacity: 1 }],
          });
        } else {
          createShapeItem(preview.type, cx, cy, w, h);
        }
      } else if (shapeToolType === 'rectangle' || shapeToolType === 'ellipse') {
        // Click without drag: create 100x100 default shape at click point
        createShapeItem(
          shapeToolType,
          Math.round(start.startX),
          Math.round(start.startY),
          100, 100,
        );
      } else if (shapeToolType === 'line') {
        // Click without drag for line: create 100px horizontal line
        createShapeItem('vector', Math.round(start.startX + 50), Math.round(start.startY), 100, 1, {
          pathData: 'M 0,0.5 L 100,0.5',
          viewBox: '0 0 100 1',
          fills: [{ type: 'none' as const }],
          strokes: [{ color: '#b3b3b3', width: 1, opacity: 1 }],
        });
      }
      setToolMode('select');
      const name = shapeToolType === 'rectangle' ? 'Rectangle' : shapeToolType === 'ellipse' ? 'Ellipse' : 'Line';
      toast(`${name} created`);
      return;
    }

    // Pen tool: finish handle drag
    if (toolModeRef.current === 'pen' && penRef.current.phase === 'dragging-handle') {
      penRef.current.phase = 'idle';
      penRef.current.dragAnchor = null;
      penRef.current.handleBroken = false;
      penRef.current.frozenHandleIn = null;
      penRedraw();
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

  // ── Panel state ────────────────────────────────────────────────────
  const [copied, setCopied] = useState(false);

  // Close gradient editor when selection no longer has a single linear-gradient shape
  useEffect(() => {
    if (!editingGradient) return;
    if (selection.size !== 1) { setEditingGradient(false); return; }
    const label = [...selection][0];
    const item = items.find(i => i.label === label);
    const fills = (item?.props.fills as Fill[] | undefined) ?? [];
    if (!item || item.type !== 'Shape' || fills[0]?.type !== 'linear-gradient') {
      setEditingGradient(false);
    }
  }, [selection, items, editingGradient]);

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
    pushHistory(itemsRef.current, statesRef.current);
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
    pushHistoryDebounced(items, nextStates);
  }, [items, states, selection, pushHistoryDebounced]);

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
    pushHistoryDebounced(items, nextStates);
  }, [items, states, selection, pushHistoryDebounced]);

  // ── Props change (design panel) ──────────────────────────────────
  const handleDesignPropsChange = useCallback((updates: { label: string; props: Record<string, unknown> }[]) => {
    const patchMap = new Map(updates.map(u => [u.label, u.props]));
    const nextItems = items.map(i => {
      const patch = patchMap.get(i.label);
      return patch ? { ...i, props: { ...i.props, ...patch } } : i;
    });
    setItems(nextItems);
    pushHistoryDebounced(nextItems, states);
  }, [items, states, pushHistory]);

  // ── Layers data ──────────────────────────────────────────────────
  const allLayers = items.map(item => ({
    label: item.label,
    z: states[item.label]?.z ?? item.z,
  }));

  const handleReorderAllZ = useCallback((orderedLabels: string[]) => {
    const nextStates = { ...states };
    orderedLabels.forEach((label, i) => {
      const s = nextStates[label];
      if (s) nextStates[label] = { ...s, z: i };
    });
    setStates(nextStates);
    pushHistory(items, nextStates);
  }, [items, states, pushHistory]);

  // ── Text editing ──────────────────────────────────────────────────
  const handleTextCommit = useCallback((label: string, text: string) => {
    setEditingItem(null);
    if (text.trim() === '') {
      // Delete empty text items
      const nextItems = items.filter(i => i.label !== label);
      const nextStates = { ...states };
      delete nextStates[label];
      setItems(nextItems);
      setStates(nextStates);
      setSelection(new Set());
      pushHistory(nextItems, nextStates);
    } else {
      // Update text prop
      const nextItems = items.map(i =>
        i.label === label ? { ...i, props: { ...i.props, text } } : i
      );
      setItems(nextItems);
      pushHistory(nextItems, states);
    }
  }, [items, states, pushHistory]);

  const placeValues = useCallback(() => {
    const fmt = settingsRef.current.exportFormat;
    const selectedItems = items.filter(i => selection.has(i.label));

    const formatItem = (item: ItemDef, s: ItemState) => {
      const w = Math.round(item.w * s.scale);
      const h = Math.round(item.h * s.scale);
      const rotStr = s.rot !== 0 ? `rotate(${s.rot}deg)` : '';
      switch (fmt) {
        case 'react-style': {
          const parts = [`left: ${s.x}`, `top: ${s.y}`, `width: ${w}`, `height: ${h}`];
          if (rotStr) parts.push(`transform: '${rotStr}'`);
          if (s.z) parts.push(`zIndex: ${s.z}`);
          return `{ ${parts.join(', ')} }`;
        }
        case 'css': {
          const parts = [`left: ${s.x}px`, `top: ${s.y}px`, `width: ${w}px`, `height: ${h}px`];
          if (rotStr) parts.push(`transform: ${rotStr}`);
          if (s.z) parts.push(`z-index: ${s.z}`);
          return parts.join('; ') + ';';
        }
        default:
          return `x={${s.x}} y={${s.y}} w={${w}} h={${h}} rot={${s.rot}} z={${s.z}}`;
      }
    };

    const lines = selectedItems.map(item => {
      const s = states[item.label];
      if (!s) return '';
      const prefix = selectedItems.length > 1 ? `[${item.label}] ` : '';
      return `${prefix}${formatItem(item, s)}`;
    });
    const code = lines.join('\n');
    navigator.clipboard.writeText(code);
    console.log('\nPlaced:\n' + lines.join('\n') + '\n');
    toast(`Copied as ${fmt === 'react-style' ? 'React style' : fmt === 'css' ? 'CSS' : 'raw values'}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    setSelection(new Set());
  }, [items, states, selection]);

  // (layerPreviews removed — no longer needed without ControlPanel)

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
    if (isPanningState) return 'grabbing';
    if (spaceHeld) return 'grab';
    if (altHeld) return 'crosshair';
    if (toolMode === 'text') return 'text';
    if (toolMode === 'rectangle' || toolMode === 'ellipse' || toolMode === 'line' || toolMode === 'pen') return 'crosshair';
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
          willChange: 'transform',
        }}
      >
        {/* Window artboard (rendered behind items) */}
        {windowMode && <WindowFrame w={windowW} h={windowH} bg={windowBg} zoom={camera.zoom} />}

        {/* Artboard toolbar — inline editor above the artboard */}
        {windowMode && onWindowSettingsChange && (
          <ArtboardToolbar
            w={windowW}
            h={windowH}
            bg={windowBg}
            zoom={camera.zoom}
            onChangeW={v => onWindowSettingsChange({ windowW: v })}
            onChangeH={v => onWindowSettingsChange({ windowH: v })}
            onChangeBg={v => onWindowSettingsChange({ windowBg: v })}
          />
        )}

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

        {/* Shape creation preview */}
        {shapePreview && (() => {
          const sp = shapePreview;
          const s = (px: number) => px / camera.zoom;
          const blue = '#0c8ce9';
          const dimW = Math.round(sp.w);
          const dimH = Math.round(sp.h);
          const dimText = sp.type === 'line'
            ? `${Math.round(Math.hypot(sp.w, sp.h))}`
            : `${dimW} \u00d7 ${dimH}`;
          const labelW = dimText.length * 6 + 16;
          return (
            <svg
              style={{
                position: 'absolute',
                left: sp.x, top: sp.y,
                width: sp.w || 1, height: sp.h || 1,
                overflow: 'visible',
                pointerEvents: 'none',
                zIndex: 500,
              }}
            >
              {sp.type === 'rectangle' && (
                <rect
                  x={0} y={0} width={sp.w} height={sp.h}
                  fill="rgba(24,119,242,0.04)"
                  stroke={blue}
                  strokeWidth={s(1)}
                />
              )}
              {sp.type === 'ellipse' && (
                <ellipse
                  cx={sp.w / 2} cy={sp.h / 2} rx={sp.w / 2} ry={sp.h / 2}
                  fill="rgba(24,119,242,0.04)"
                  stroke={blue}
                  strokeWidth={s(1)}
                />
              )}
              {sp.type === 'line' && (
                <line
                  x1={0} y1={0} x2={sp.w} y2={sp.h}
                  stroke={blue}
                  strokeWidth={s(1.5)}
                />
              )}
              {/* Dimension label */}
              <g transform={`translate(${sp.w / 2}, ${sp.h + s(20)}) scale(${1 / camera.zoom})`}>
                <rect
                  x={-labelW / 2} y={-10}
                  width={labelW} height={20}
                  rx={4}
                  fill={blue}
                />
                <text
                  x={0} y={4}
                  textAnchor="middle"
                  fill="white"
                  fontSize={11}
                  fontWeight={500}
                  fontFamily="'Inter', -apple-system, system-ui, sans-serif"
                >
                  {dimText}
                </text>
              </g>
            </svg>
          );
        })()}

        {/* Pen tool overlay */}
        {(() => {
          void penTick; // subscribe to pen redraws
          const pen = penRef.current;
          if (pen.points.length === 0) return null;
          const pts = pen.points;
          const s = (px: number) => px / camera.zoom; // screen-constant sizing
          const blue = '#0c8ce9';

          // Build completed segments path
          let completedPath = '';
          if (pts.length >= 2) {
            completedPath = `M ${pts[0].x},${pts[0].y}`;
            for (let i = 1; i < pts.length; i++) {
              completedPath += ' ' + penSegment(pts[i - 1], pts[i]);
            }
          }

          // Rubber-band preview: curved if last point has handleOut, straight otherwise
          let previewPath = '';
          if (pen.previewPos && pen.phase === 'idle') {
            const last = pts[pts.length - 1];
            const cursor = pen.previewPos;
            if (last.handleOut) {
              // Cubic bezier preview: from last point through handleOut to cursor
              // Use cursor as second control point (no handleIn yet on un-placed point)
              previewPath = `M ${last.x},${last.y} C ${last.handleOut.x},${last.handleOut.y} ${cursor.x},${cursor.y} ${cursor.x},${cursor.y}`;
            } else {
              previewPath = `M ${last.x},${last.y} L ${cursor.x},${cursor.y}`;
            }
          }

          return (
            <svg
              style={{
                position: 'absolute', left: 0, top: 0,
                width: 0, height: 0, overflow: 'visible',
                pointerEvents: 'none', zIndex: 500,
              }}
            >
              {/* Completed path */}
              {completedPath && (
                <path d={completedPath} fill="none" stroke={blue} strokeWidth={s(2)} />
              )}

              {/* Rubber-band preview */}
              {previewPath && (
                <path d={previewPath} fill="none" stroke={blue} strokeWidth={s(1)} opacity={0.5} />
              )}

              {/* Handles and anchor points */}
              {pts.map((pt, i) => {
                const isLast = i === pts.length - 1;
                return (
                  <g key={i}>
                    {/* Handle lines + endpoints */}
                    {pt.handleOut && (
                      <>
                        <line x1={pt.x} y1={pt.y} x2={pt.handleOut.x} y2={pt.handleOut.y}
                          stroke={blue} strokeWidth={s(1)} opacity={0.5} />
                        <circle cx={pt.handleOut.x} cy={pt.handleOut.y} r={s(3)}
                          fill={blue} opacity={0.8} />
                      </>
                    )}
                    {pt.handleIn && (
                      <>
                        <line x1={pt.x} y1={pt.y} x2={pt.handleIn.x} y2={pt.handleIn.y}
                          stroke={blue} strokeWidth={s(1)} opacity={0.5} />
                        <circle cx={pt.handleIn.x} cy={pt.handleIn.y} r={s(3)}
                          fill={blue} opacity={0.8} />
                      </>
                    )}
                    {/* Anchor point */}
                    <circle cx={pt.x} cy={pt.y} r={s(isLast ? 4.5 : 4)}
                      fill="white" stroke={blue} strokeWidth={s(1.5)} />
                    {/* Close indicator on first point */}
                    {i === 0 && pts.length >= 3 && (
                      <circle cx={pt.x} cy={pt.y} r={s(pen.closeHover ? 10 : 8)}
                        fill={pen.closeHover ? 'rgba(12,140,233,0.08)' : 'none'}
                        stroke={blue} strokeWidth={s(pen.closeHover ? 2 : 1)} opacity={pen.closeHover ? 0.8 : 0.3} />
                    )}
                  </g>
                );
              })}
            </svg>
          );
        })()}

        {/* Canvas background — gives backdrop-filter something to capture inside this compositing layer */}
        <div style={{
          position: 'absolute',
          top: -100000, left: -100000,
          width: 200000, height: 200000,
          background: settings.bgColor,
          pointerEvents: 'none',
          zIndex: -1,
        }} />

        {/* Items */}
        {items.map(item => {
          const render = renderers[item.type];
          if (!render && item.type !== 'Text' && item.type !== 'Group' && item.type !== 'Frame') return null;
          // Skip items that are children rendered inside a clipped frame wrapper
          if (item.group) {
            const parent = items.find(i => i.label === item.group);
            if (parent?.type === 'Frame' && (parent.props.clipContent as boolean)) return null;
          }
          const state = states[item.label] ?? getDefaultState(item);
          const isEditing = editingItem === item.label || vectorEditItem === item.label;
          const isContainerItem = item.type === 'Group' || item.type === 'Frame';

          // Canvas-level backdrop blur div (sits outside per-item stacking contexts)
          const bgBlur = item.type === 'Shape' ? ((item.props.backgroundBlur as number) ?? 0) : 0;
          let blurDiv: React.ReactNode = null;
          if (bgBlur > 0) {
            const sc = state.scale ?? 1;
            const bw = Math.round(item.w * sc);
            const bh = Math.round(item.h * sc);
            const shapeType = (item.props.shapeType as string) ?? 'rectangle';
            const br = (item.props.borderRadius as number) ?? 0;
            const cs = ((item.props.cornerSmoothing as number) ?? 0) / 100;
            const blurDivBase: React.CSSProperties = {
              position: 'absolute',
              left: state.x, top: state.y,
              width: bw, height: bh,
              transform: `translate(-50%, -50%) rotate(${state.rot ?? 0}deg)`,
              pointerEvents: 'none',
              zIndex: state.z ?? 0,
              backdropFilter: `blur(${bgBlur}px)`,
              WebkitBackdropFilter: `blur(${bgBlur}px)`,
            };
            if (shapeType === 'rectangle') {
              let clipStyle: React.CSSProperties = {};
              if (cs > 0 && br > 0) {
                const d = squirclePath(0, 0, bw, bh, br * sc, cs);
                clipStyle = { clipPath: `path('${d}')` };
              } else if (br > 0) {
                clipStyle = { borderRadius: br * sc };
              }
              blurDiv = <div style={{ ...blurDivBase, ...clipStyle }} />;
            } else if (shapeType === 'ellipse') {
              blurDiv = <div style={{ ...blurDivBase, borderRadius: '50%' }} />;
            } else if (shapeType === 'vector') {
              const pathData = item.props.pathData as string | undefined;
              if (pathData) {
                const viewBoxStr = (item.props.viewBox as string) ?? `0 0 ${item.w} ${item.h}`;
                const vbParts = viewBoxStr.trim().split(/\s+/);
                const vw = parseFloat(vbParts[2]) || bw;
                const vh = parseFloat(vbParts[3]) || bh;
                const clipId = `bgblur-${item.label.replace(/\W/g, '-')}`;
                blurDiv = (
                  <>
                    <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}>
                      <defs>
                        <clipPath id={clipId}>
                          <path d={pathData} transform={`scale(${bw / vw}, ${bh / vh})`} />
                        </clipPath>
                      </defs>
                    </svg>
                    <div style={{ ...blurDivBase, clipPath: `url(#${clipId})` }} />
                  </>
                );
              }
            }
          }

          return (
            <Fragment key={item.label}>
              {blurDiv}
              <CanvasItem
              label={item.label}
              initW={item.w}
              initH={item.h}
              state={state}
              zoom={camera.zoom}
              onDragStart={() => handleDragStart(item.label)}
              onDragMove={(dx, dy, shiftKey) => handleDragMove(item.label, dx, dy, shiftKey)}
              onDragEnd={commitDrag}
              onScaleChange={(newScale) => handleScaleChange(item.label, newScale)}
              onScaleCommit={handleScaleCommit}
              onRotationChange={(newRot) => handleRotationChange(item.label, newRot)}
              onRotationCommit={handleScaleCommit}
              selected={selection.has(item.label)}
              onSelect={handleSelect}
              onHover={setHoveredItem}
              onContentSizeChange={(w, h) => { contentSizesRef.current[item.label] = { w, h }; }}
              editing={isEditing}
              onDoubleClick={
                item.type === 'Text' ? () => setEditingItem(item.label)
                : isContainerItem ? () => { setActiveGroup(item.label); toast(`Entered ${item.type.toLowerCase()}`); }
                : item.type === 'Shape' ? () => enterVectorEdit(item.label)
                : undefined
              }
              shapeType={item.type === 'Shape' ? (item.props.shapeType as string) : undefined}
              borderRadius={item.type === 'Shape' ? ((item.props.borderRadius as number) ?? 0) : 0}
              onBorderRadiusChange={item.type === 'Shape' && (item.props.shapeType as string) === 'rectangle' ? (r) => handleBorderRadiusChange(item.label, r) : undefined}
              onBorderRadiusCommit={item.type === 'Shape' && (item.props.shapeType as string) === 'rectangle' ? handleBorderRadiusCommit : undefined}
              onEdgeResizeStart={item.type === 'Shape' ? () => handleEdgeResizeStart(item.label) : undefined}
              onEdgeResize={item.type === 'Shape' ? (edge, delta) => handleEdgeResize(item.label, edge, delta) : undefined}
              onEdgeResizeCommit={item.type === 'Shape' ? handleEdgeResizeCommit : undefined}
            >
              {item.type === 'Text' ? (
                <TextRendererComponent
                  props={item.props}
                  editing={isEditing}
                  onCommit={(text) => handleTextCommit(item.label, text)}
                />
              ) : item.type === 'Group' ? null
              : item.type === 'Frame' ? (
                <FrameRendererComponent props={item.props} />
              ) : (
                render!(item.props)
              )}
            </CanvasItem>
            {/* Clipped frame children wrapper */}
            {item.type === 'Frame' && (item.props.clipContent as boolean) && (() => {
              const children = getChildren(items, item.label);
              if (children.length === 0) return null;
              const fw = item.w * state.scale;
              const fh = item.h * state.scale;
              return (
                <div style={{
                  position: 'absolute',
                  left: state.x, top: state.y,
                  width: fw, height: fh,
                  transform: 'translate(-50%, -50%)',
                  overflow: 'hidden',
                  zIndex: (state.z ?? 0) + 0.1,
                  pointerEvents: 'none',
                }}>
                  <div style={{
                    position: 'absolute',
                    left: '50%', top: '50%',
                    transform: `translate(${-state.x}px, ${-state.y}px)`,
                  }}>
                    {children.map(child => {
                      const childState = states[child.label] ?? getDefaultState(child);
                      const childRender = renderers[child.type];
                      return (
                        <CanvasItem
                          key={child.label}
                          label={child.label}
                          initW={child.w}
                          initH={child.h}
                          state={childState}
                          zoom={camera.zoom}
                          onDragStart={() => handleDragStart(child.label)}
                          onDragMove={(dx, dy, shiftKey) => handleDragMove(child.label, dx, dy, shiftKey)}
                          onDragEnd={commitDrag}
                          onScaleChange={(newScale) => handleScaleChange(child.label, newScale)}
                          onScaleCommit={handleScaleCommit}
                          onRotationChange={(newRot) => handleRotationChange(child.label, newRot)}
                          onRotationCommit={handleScaleCommit}
                          selected={selection.has(child.label)}
                          onSelect={handleSelect}
                          onHover={setHoveredItem}
                          onContentSizeChange={(w, h) => { contentSizesRef.current[child.label] = { w, h }; }}
                        >
                          {child.type === 'Text' ? <TextRendererComponent props={child.props} /> : childRender?.(child.props)}
                        </CanvasItem>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            </Fragment>
          );
        })}

        {/* Vector edit mode overlay */}
        {(() => {
          void vectorEditTick;
          const ve = vectorEditRef.current;
          if (!ve || !vectorEditItem) return null;
          const item = items.find(i => i.label === ve.itemLabel);
          if (!item) return null;
          const st = states[ve.itemLabel];
          if (!st) return null;
          const sc = st.scale ?? 1;
          const shapeW = (item.props.shapeWidth as number) ?? item.w;
          const shapeH = (item.props.shapeHeight as number) ?? item.h;
          const vb = (item.props.viewBox as string) ?? `0 0 ${shapeW} ${shapeH}`;
          const vbParts = vb.split(/\s+/);
          const vbW = parseFloat(vbParts[2]) || shapeW;
          const vbH = parseFloat(vbParts[3]) || shapeH;
          return (
            <VectorEditOverlay
              state={ve}
              zoom={camera.zoom}
              itemX={st.x}
              itemY={st.y}
              itemW={item.w * sc}
              itemH={item.h * sc}
              viewBoxW={vbW}
              viewBoxH={vbH}
              itemRot={st.rot}
              onPointSelect={vePointSelect}
              onPointDragStart={vePointDragStart}
              onPointDrag={vePointDrag}
              onPointDragEnd={vePointDragEnd}
              onHandleDragStart={veHandleDragStart}
              onHandleDrag={veHandleDrag}
              onHandleDragEnd={veHandleDragEnd}
              onSegmentClick={veSegmentClick}
              onPointDoubleClick={vePointDoubleClick}
              onDeletePoint={veDeletePoint}
            />
          );
        })()}

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

        {/* Window gaps (distance from selection to window edges) */}
        {windowMode && selection.size > 0 && (
          <WindowGaps
            items={items}
            states={states}
            selection={selection}
            windowW={windowW}
            windowH={windowH}
            zoom={camera.zoom}
            onDeltaMove={handleWindowGapDelta}
            onCommit={handleWindowGapCommit}
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

        {/* On-canvas gradient editor overlay */}
        {(() => {
          if (!editingGradient || selection.size !== 1) return null;
          const label = [...selection][0];
          const item = items.find(i => i.label === label);
          if (!item || item.type !== 'Shape') return null;
          const fills = (item.props.fills as Fill[]) ?? [];
          const fill = fills[0];
          if (!fill || fill.type !== 'linear-gradient') return null;
          const state = states[label] ?? getDefaultState(item);
          const sc = state.scale ?? 1;
          return (
            <GradientEditorOverlay
              fill={fill}
              onChange={(newFill) => {
                const nextItems = itemsRef.current.map(i =>
                  i.label !== label ? i : { ...i, props: { ...i.props, fills: [newFill, ...(i.props.fills as Fill[]).slice(1)] } }
                );
                setItems(nextItems);
              }}
              onCommit={() => pushHistory(itemsRef.current, statesRef.current)}
              bw={Math.round(item.w * sc)}
              bh={Math.round(item.h * sc)}
              x={state.x}
              y={state.y}
              rot={state.rot ?? 0}
            />
          );
        })()}
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

      {/* Properties panel (unified right sidebar) — always visible */}
      {(() => {
        const selItems = items.filter(i => selection.has(i.label));
        const selStates = selItems.map(i => states[i.label]).filter(Boolean) as ItemState[];
        const isSingle = selItems.length === 1;
        return (
          <PropertiesPanel
            key={isSingle ? selItems[0]?.label : selItems.length > 1 ? 'multi' : 'empty'}
            items={selItems}
            states={selStates}
            onCommitChange={isSingle
              ? (patch) => handleCommitChange(selItems[0].label, patch)
              : handleMultiCommitChange
            }
            onDeltaChange={isSingle ? undefined : handleMultiDeltaChange}
            onRename={(oldLabel, newLabel) => renameItem(oldLabel, newLabel)}
            onPropsChange={handleDesignPropsChange}
            copied={copied}
            locked={isSingle ? !!selStates[0]?.locked : [...selection].every(l => states[l]?.locked)}
            onDuplicate={() => duplicateItems(selection)}
            onDelete={() => deleteItems(selection)}
            onPlace={placeValues}
            onToggleLock={isSingle
              ? () => handleCommitChange(selItems[0].label, { locked: !selStates[0]?.locked })
              : () => { const allLocked = [...selection].every(l => states[l]?.locked); handleMultiCommitChange({ locked: !allLocked }); }
            }
            onFlipH={isSingle
              ? () => handleCommitChange(selItems[0].label, { flipX: !selStates[0]?.flipX })
              : () => handleMultiCommitChange({ flipX: !selStates[0]?.flipX })
            }
            onFlipV={isSingle
              ? () => handleCommitChange(selItems[0].label, { flipY: !selStates[0]?.flipY })
              : () => handleMultiCommitChange({ flipY: !selStates[0]?.flipY })
            }
            layers={allLayers}
            onReorderZ={handleReorderAllZ}
            onInfoClick={onInfoClick}
            onSettingsClick={onSettingsClick}
            editingGradient={editingGradient}
            onEditGradient={() => setEditingGradient(true)}
            onCloseGradientEditor={() => setEditingGradient(false)}
          />
        );
      })()}

      {/* Layers panel (left sidebar) */}
      {items.length > 0 && (
        <LayersPanel
          items={items}
          states={states}
          selection={selection}
          activeGroup={activeGroup}
          onSelect={(label, shiftKey) => handleSelect(label, shiftKey)}
          onRename={(oldLabel, newLabel) => renameItem(oldLabel, newLabel)}
          onReorderZ={handleReorderAllZ}
          onEnterGroup={(label) => { setActiveGroup(label); setSelection(new Set()); }}
          onExitGroup={() => {
            if (activeGroup) {
              setSelection(new Set([activeGroup]));
              setActiveGroup(null);
            }
          }}
        />
      )}

      {toastNode}
    </div>
  );
}
