import { useCallback, useRef } from 'react';
import { motion } from 'motion/react';
import {
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter,
} from 'lucide-react';
import type { ItemDef, ItemState } from './types';

import { FONT } from './tokens';

export type AlignAction = 'left' | 'centerH' | 'right' | 'top' | 'centerV' | 'bottom' | 'distributeH' | 'distributeV';

/**
 * Compute new positions for an alignment action.
 * Exported so the keyboard handler can reuse this logic.
 */
export function computeAlignment(
  action: AlignAction,
  labels: string[],
  items: ItemDef[],
  states: Record<string, ItemState>,
): Record<string, { x?: number; y?: number }> {
  if (labels.length < 2) return {};

  const entries = labels.map(label => {
    const st = states[label];
    const item = items.find(it => it.label === label);
    const w = item ? item.w * st.scale : 0;
    const h = item ? item.h * st.scale : 0;
    return {
      label,
      x: st.x,
      y: st.y,
      left: st.x - w / 2,
      right: st.x + w / 2,
      top: st.y - h / 2,
      bottom: st.y + h / 2,
      w,
      h,
    };
  });

  const positions: Record<string, { x?: number; y?: number }> = {};

  switch (action) {
    case 'left': {
      const min = Math.min(...entries.map(e => e.left));
      for (const e of entries) positions[e.label] = { x: min + e.w / 2 };
      break;
    }
    case 'centerH': {
      const min = Math.min(...entries.map(e => e.left));
      const max = Math.max(...entries.map(e => e.right));
      const center = (min + max) / 2;
      for (const e of entries) positions[e.label] = { x: center };
      break;
    }
    case 'right': {
      const max = Math.max(...entries.map(e => e.right));
      for (const e of entries) positions[e.label] = { x: max - e.w / 2 };
      break;
    }
    case 'top': {
      const min = Math.min(...entries.map(e => e.top));
      for (const e of entries) positions[e.label] = { y: min + e.h / 2 };
      break;
    }
    case 'centerV': {
      const min = Math.min(...entries.map(e => e.top));
      const max = Math.max(...entries.map(e => e.bottom));
      const center = (min + max) / 2;
      for (const e of entries) positions[e.label] = { y: center };
      break;
    }
    case 'bottom': {
      const max = Math.max(...entries.map(e => e.bottom));
      for (const e of entries) positions[e.label] = { y: max - e.h / 2 };
      break;
    }
    case 'distributeH': {
      if (entries.length < 3) return positions;
      const sorted = [...entries].sort((a, b) => a.left - b.left);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const totalSpan = last.right - first.left;
      const sumWidths = sorted.reduce((acc, e) => acc + e.w, 0);
      const gap = (totalSpan - sumWidths) / (sorted.length - 1);
      let cursor = first.left + first.w;
      for (let i = 1; i < sorted.length - 1; i++) {
        positions[sorted[i].label] = { x: cursor + gap + sorted[i].w / 2 };
        cursor = cursor + gap + sorted[i].w;
      }
      break;
    }
    case 'distributeV': {
      if (entries.length < 3) return positions;
      const sorted = [...entries].sort((a, b) => a.top - b.top);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const totalSpan = last.bottom - first.top;
      const sumHeights = sorted.reduce((acc, e) => acc + e.h, 0);
      const gap = (totalSpan - sumHeights) / (sorted.length - 1);
      let cursor = first.top + first.h;
      for (let i = 1; i < sorted.length - 1; i++) {
        positions[sorted[i].label] = { y: cursor + gap + sorted[i].h / 2 };
        cursor = cursor + gap + sorted[i].h;
      }
      break;
    }
  }

  return positions;
}

const CORNERS = [
  { key: 'tl', cursor: 'nwse-resize', xMul: -1, yMul: -1 },
  { key: 'tr', cursor: 'nesw-resize', xMul: 1, yMul: -1 },
  { key: 'bl', cursor: 'nesw-resize', xMul: -1, yMul: 1 },
  { key: 'br', cursor: 'nwse-resize', xMul: 1, yMul: 1 },
] as const;

type ResizeStart = {
  screenCx: number;
  screenCy: number;
  startDist: number;
  canvasCx: number;
  canvasCy: number;
  snapshots: { label: string; x: number; y: number; scale: number }[];
};

export function BoundingBox({
  items,
  states,
  selection,
  zoom,
  onAlign,
  onGroupScaleUpdate,
  onGroupScaleCommit,
}: {
  items: ItemDef[];
  states: Record<string, ItemState>;
  selection: Set<string>;
  zoom: number;
  onAlign?: (positions: Record<string, { x?: number; y?: number }>) => void;
  onGroupScaleUpdate?: (updates: Record<string, { x: number; y: number; scale: number }>) => void;
  onGroupScaleCommit?: () => void;
}) {
  const resizeRef = useRef<ResizeStart | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  if (selection.size <= 1) return null;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const selectedLabels: string[] = [];
  for (const label of selection) {
    const item = items.find(i => i.label === label);
    const state = states[label];
    if (!item || !state) continue;
    selectedLabels.push(label);
    const w = item.w * state.scale;
    const h = item.h * state.scale;
    minX = Math.min(minX, state.x - w / 2);
    maxX = Math.max(maxX, state.x + w / 2);
    minY = Math.min(minY, state.y - h / 2);
    maxY = Math.max(maxY, state.y + h / 2);
  }

  if (!isFinite(minX)) return null;

  const s = (px: number) => px / zoom;
  const pad = s(6);
  const boxW = maxX - minX + pad * 2;
  const boxH = maxY - minY + pad * 2;

  // Group center in canvas coords
  const canvasCx = (minX + maxX) / 2;
  const canvasCy = (minY + maxY) / 2;

  const onResizeDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    // Get the bounding box's screen-space center
    const el = boxRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const screenCx = rect.left + rect.width / 2;
    const screenCy = rect.top + rect.height / 2;
    const startDist = Math.max(1, Math.hypot(e.clientX - screenCx, e.clientY - screenCy));

    resizeRef.current = {
      screenCx,
      screenCy,
      startDist,
      canvasCx,
      canvasCy,
      snapshots: selectedLabels.map(label => ({
        label,
        x: states[label].x,
        y: states[label].y,
        scale: states[label].scale,
      })),
    };
  };

  const onResizeMove = (e: React.PointerEvent) => {
    const start = resizeRef.current;
    if (!start || !onGroupScaleUpdate) return;

    const currentDist = Math.max(1, Math.hypot(
      e.clientX - start.screenCx,
      e.clientY - start.screenCy,
    ));
    const ratio = Math.max(0.1, Math.min(4, currentDist / start.startDist));

    const updates: Record<string, { x: number; y: number; scale: number }> = {};
    for (const snap of start.snapshots) {
      updates[snap.label] = {
        x: Math.round(start.canvasCx + (snap.x - start.canvasCx) * ratio),
        y: Math.round(start.canvasCy + (snap.y - start.canvasCy) * ratio),
        scale: Math.max(0.1, Math.min(4, snap.scale * ratio)),
      };
    }
    onGroupScaleUpdate(updates);
  };

  const onResizeUp = (e: React.PointerEvent) => {
    if (!resizeRef.current) return;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    resizeRef.current = null;
    onGroupScaleCommit?.();
  };

  const cornerPositions = [
    { left: -s(4), top: -s(4) },
    { right: -s(4), top: -s(4) },
    { left: -s(4), bottom: -s(4) },
    { right: -s(4), bottom: -s(4) },
  ];

  return (
    <div
      ref={boxRef}
      style={{
        position: 'absolute',
        left: minX - pad,
        top: minY - pad,
        width: boxW,
        height: boxH,
        border: `${s(1.5)}px dashed rgba(59,130,246,0.45)`,
        borderRadius: s(6),
        pointerEvents: 'none',
        zIndex: 98,
      }}
    >
      {/* Corner resize handles */}
      {CORNERS.map((corner, i) => (
        <div
          key={corner.key}
          style={{
            position: 'absolute',
            ...cornerPositions[i],
            width: s(8),
            height: s(8),
            borderRadius: '50%',
            border: `${s(1.5)}px solid rgba(59,130,246,0.45)`,
            background: 'white',
            boxShadow: `0 ${s(1)}px ${s(2)}px rgba(0,0,0,0.08)`,
            cursor: corner.cursor,
            pointerEvents: 'auto',
          }}
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
        />
      ))}

      {/* Alignment bar - floats below the bounding box */}
      {onAlign && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: `calc(100% + ${s(10)}px)`,
            transform: `translateX(-50%) scale(${1 / zoom})`,
            transformOrigin: 'top center',
            pointerEvents: 'auto',
            zIndex: 99,
          }}
        >
          <AlignmentBar
            labels={selectedLabels}
            items={items}
            states={states}
            onAlign={onAlign}
          />
        </div>
      )}
    </div>
  );
}

function AlignmentBar({
  labels,
  items,
  states,
  onAlign,
}: {
  labels: string[];
  items: ItemDef[];
  states: Record<string, ItemState>;
  onAlign: (positions: Record<string, { x?: number; y?: number }>) => void;
}) {
  const align = useCallback((action: AlignAction) => {
    const positions = computeAlignment(action, labels, items, states);
    if (Object.keys(positions).length > 0) onAlign(positions);
  }, [labels, items, states, onAlign]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        borderRadius: 10,
        background: 'rgba(255,255,255,0.97)',
        padding: '3px 4px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.06)',
        backdropFilter: 'blur(20px)',
        fontFamily: FONT,
      }}
      onPointerDown={e => e.stopPropagation()}
    >
      <AlignBtn onClick={() => align('left')} title="Align left">
        <AlignStartVertical size={14} strokeWidth={1.5} />
      </AlignBtn>
      <AlignBtn onClick={() => align('centerH')} title="Align center">
        <AlignCenterVertical size={14} strokeWidth={1.5} />
      </AlignBtn>
      <AlignBtn onClick={() => align('right')} title="Align right">
        <AlignEndVertical size={14} strokeWidth={1.5} />
      </AlignBtn>

      <div style={{ width: 1, height: 16, background: '#e5e7eb', margin: '0 2px' }} />

      <AlignBtn onClick={() => align('top')} title="Align top">
        <AlignStartHorizontal size={14} strokeWidth={1.5} />
      </AlignBtn>
      <AlignBtn onClick={() => align('centerV')} title="Align middle">
        <AlignCenterHorizontal size={14} strokeWidth={1.5} />
      </AlignBtn>
      <AlignBtn onClick={() => align('bottom')} title="Align bottom">
        <AlignEndHorizontal size={14} strokeWidth={1.5} />
      </AlignBtn>

      <div style={{ width: 1, height: 16, background: '#e5e7eb', margin: '0 2px' }} />

      <AlignBtn onClick={() => align('distributeH')} title="Distribute horizontally">
        <AlignHorizontalDistributeCenter size={14} strokeWidth={1.5} />
      </AlignBtn>
      <AlignBtn onClick={() => align('distributeV')} title="Distribute vertically">
        <AlignVerticalDistributeCenter size={14} strokeWidth={1.5} />
      </AlignBtn>
    </motion.div>
  );
}

function AlignBtn({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      title={title}
      whileHover={{ background: 'rgba(0,0,0,0.04)' }}
      whileTap={{ scale: 0.9 }}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 22,
        height: 22,
        borderRadius: 5,
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: '#6b7280',
        padding: 0,
      }}
      onPointerDown={e => e.stopPropagation()}
      onClick={e => { e.stopPropagation(); onClick(); }}
    >
      {children}
    </motion.button>
  );
}
