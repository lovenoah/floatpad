import { useState, useCallback, useRef } from 'react';
import type { ItemDef, ItemState } from './types';
import { FONT } from './tokens';
const COLOR = 'rgba(236, 72, 153, 0.9)';
const BG = 'rgb(236, 72, 153)';

type Gap = {
  axis: 'h' | 'v';
  value: number;
  cx: number;
  cy: number;
  from: number;
  to: number;
  perpCenter: number;
  moveLabel: string;
  fixedLabel: string;
};

function computeGaps(
  items: ItemDef[],
  states: Record<string, ItemState>,
  selection: Set<string>,
): Gap[] {
  const selected = items.filter(i => selection.has(i.label));
  if (selected.length < 2) return [];

  const bounds = selected.map(item => {
    const s = states[item.label];
    if (!s) return null;
    const w = item.w * s.scale;
    const h = item.h * s.scale;
    return {
      label: item.label,
      left: s.x - w / 2,
      right: s.x + w / 2,
      top: s.y - h / 2,
      bottom: s.y + h / 2,
      cx: s.x,
      cy: s.y,
    };
  }).filter(Boolean) as { label: string; left: number; right: number; top: number; bottom: number; cx: number; cy: number }[];

  const gaps: Gap[] = [];

  // Helper: minimum perpendicular overlap ratio required to show a gap.
  // Items must overlap by at least 30% of the smaller item's extent on
  // the perpendicular axis, OR their perpendicular centers must be within
  // half the smaller item's extent. This prevents diagonal scatter from
  // producing meaningless gap lines.
  const MIN_OVERLAP_RATIO = 0.3;

  // Horizontal gaps: sort by left edge, then pair nearest non-overlapping neighbors
  const byLeft = [...bounds].sort((a, b) => a.left - b.left);
  for (let i = 0; i < byLeft.length; i++) {
    const a = byLeft[i];
    // Find the nearest item to the right that doesn't horizontally overlap
    let best: typeof a | null = null;
    let bestGap = Infinity;
    for (let j = i + 1; j < byLeft.length; j++) {
      const b = byLeft[j];
      const gap = b.left - a.right;
      if (gap <= 1) continue; // overlapping or touching
      if (gap >= bestGap) break; // sorted by left, so further items only get farther
      // Check perpendicular alignment
      const overlapTop = Math.max(a.top, b.top);
      const overlapBottom = Math.min(a.bottom, b.bottom);
      const overlap = overlapBottom - overlapTop;
      const smallerH = Math.min(a.bottom - a.top, b.bottom - b.top);
      if (overlap > smallerH * MIN_OVERLAP_RATIO) {
        best = b;
        bestGap = gap;
      }
    }
    if (best) {
      const b = best;
      const overlapTop = Math.max(a.top, b.top);
      const overlapBottom = Math.min(a.bottom, b.bottom);
      const perpCenter = (overlapTop + overlapBottom) / 2;

      gaps.push({
        axis: 'h',
        value: Math.round(bestGap),
        cx: (a.right + b.left) / 2,
        cy: perpCenter,
        from: a.right,
        to: b.left,
        perpCenter,
        moveLabel: b.label,
        fixedLabel: a.label,
      });
    }
  }

  // Vertical gaps: sort by top edge, then pair nearest non-overlapping neighbors
  const byTop = [...bounds].sort((a, b) => a.top - b.top);
  for (let i = 0; i < byTop.length; i++) {
    const a = byTop[i];
    let best: typeof a | null = null;
    let bestGap = Infinity;
    for (let j = i + 1; j < byTop.length; j++) {
      const b = byTop[j];
      const gap = b.top - a.bottom;
      if (gap <= 1) continue;
      if (gap >= bestGap) break;
      const overlapLeft = Math.max(a.left, b.left);
      const overlapRight = Math.min(a.right, b.right);
      const overlap = overlapRight - overlapLeft;
      const smallerW = Math.min(a.right - a.left, b.right - b.left);
      if (overlap > smallerW * MIN_OVERLAP_RATIO) {
        best = b;
        bestGap = gap;
      }
    }
    if (best) {
      const b = best;
      const overlapLeft = Math.max(a.left, b.left);
      const overlapRight = Math.min(a.right, b.right);
      const perpCenter = (overlapLeft + overlapRight) / 2;

      gaps.push({
        axis: 'v',
        value: Math.round(bestGap),
        cx: perpCenter,
        cy: (a.bottom + b.top) / 2,
        from: a.bottom,
        to: b.top,
        perpCenter,
        moveLabel: b.label,
        fixedLabel: a.label,
      });
    }
  }

  return gaps;
}

// ─── Main component ────────────────────────────────────────────────────

export function SelectionGaps({
  items,
  states,
  selection,
  zoom,
  onPositionUpdate,
  onCommit,
}: {
  items: ItemDef[];
  states: Record<string, ItemState>;
  selection: Set<string>;
  zoom: number;
  onPositionUpdate: (label: string, x: number, y: number) => void;
  onCommit: () => void;
}) {
  const gaps = computeGaps(items, states, selection);
  if (gaps.length === 0) return null;

  return (
    <>
      {gaps.map((gap) => (
        <GapIndicator
          key={`${gap.axis}-${gap.fixedLabel}-${gap.moveLabel}`}
          gap={gap}
          moveState={states[gap.moveLabel]}
          zoom={zoom}
          onPositionUpdate={onPositionUpdate}
          onCommit={onCommit}
        />
      ))}
    </>
  );
}

// ─── Individual gap indicator ──────────────────────────────────────────

function GapIndicator({
  gap,
  moveState,
  zoom,
  onPositionUpdate,
  onCommit,
}: {
  gap: Gap;
  moveState: ItemState;
  zoom: number;
  onPositionUpdate: (label: string, x: number, y: number) => void;
  onCommit: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const dragRef = useRef<{
    startMx: number;
    startMy: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);

  const s = useCallback((px: number) => px / zoom, [zoom]);

  // ── Drag / click handlers ────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (editing) return;
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    dragRef.current = {
      startMx: e.clientX,
      startMy: e.clientY,
      startX: moveState.x,
      startY: moveState.y,
      moved: false,
    };
  }, [editing, moveState.x, moveState.y]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;

    const dx = (e.clientX - drag.startMx) / zoom;
    const dy = (e.clientY - drag.startMy) / zoom;

    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      drag.moved = true;
    }

    if (!drag.moved) return;

    if (gap.axis === 'h') {
      onPositionUpdate(gap.moveLabel, drag.startX + dx, drag.startY);
    } else {
      onPositionUpdate(gap.moveLabel, drag.startX, drag.startY + dy);
    }
  }, [zoom, gap.axis, gap.moveLabel, onPositionUpdate]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);

    if (!drag.moved) {
      setEditing(true);
      setDraft(String(gap.value));
    } else {
      onCommit();
    }

    dragRef.current = null;
  }, [gap.value, onCommit]);

  // ── Edit handlers ────────────────────────────────────────────────
  const commitEdit = useCallback(() => {
    setEditing(false);
    const newGap = parseInt(draft, 10);
    if (isNaN(newGap) || newGap < 0) return;

    const delta = newGap - gap.value;
    if (delta === 0) return;

    if (gap.axis === 'h') {
      onPositionUpdate(gap.moveLabel, moveState.x + delta, moveState.y);
    } else {
      onPositionUpdate(gap.moveLabel, moveState.x, moveState.y + delta);
    }
    onCommit();
  }, [draft, gap.value, gap.axis, gap.moveLabel, moveState.x, moveState.y, onPositionUpdate, onCommit]);

  // ── Line geometry ────────────────────────────────────────────────
  const lineLen = s(24);
  const endLen = s(6);
  const endW = s(1);

  // Drag-only handler for the bracket (no click-to-edit, just drag)
  const onBracketPointerUp = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    if (drag.moved) onCommit();
    dragRef.current = null;
  }, [onCommit]);

  const hitPad = s(8); // extra padding around bracket for easier grab

  if (gap.axis === 'h') {
    // Horizontal gap: vertical indicator line at center
    const lx = gap.cx;
    const ly = gap.cy;

    return (
      <div style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', zIndex: 250 }}>
        {/* Bracket hit target (wider invisible area for easy dragging) */}
        <div
          style={{
            position: 'absolute',
            left: lx - endLen / 2 - hitPad,
            top: ly - lineLen / 2 - hitPad,
            width: endLen + hitPad * 2,
            height: lineLen + hitPad * 2,
            cursor: 'ew-resize',
            pointerEvents: 'auto',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onBracketPointerUp}
        />
        {/* Vertical indicator line */}
        <div style={{
          position: 'absolute',
          left: lx - endW / 2,
          top: ly - lineLen / 2,
          width: endW,
          height: lineLen,
          background: COLOR,
        }} />
        {/* Top endpoint */}
        <div style={{
          position: 'absolute',
          left: lx - endLen / 2,
          top: ly - lineLen / 2 - endW / 2,
          width: endLen,
          height: endW,
          background: COLOR,
        }} />
        {/* Bottom endpoint */}
        <div style={{
          position: 'absolute',
          left: lx - endLen / 2,
          top: ly + lineLen / 2 - endW / 2,
          width: endLen,
          height: endW,
          background: COLOR,
        }} />

        {/* Interactive label */}
        <div
          style={{
            position: 'absolute',
            left: lx,
            top: ly - lineLen / 2 - s(6),
            transform: `translate(-50%, -100%) scale(${1 / zoom})`,
            transformOrigin: 'center bottom',
            pointerEvents: 'auto',
            zIndex: 251,
          }}
        >
          <GapLabel
            value={gap.value}
            editing={editing}
            draft={draft}
            setDraft={setDraft}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onCommitEdit={commitEdit}
            onCancelEdit={() => setEditing(false)}
            axis="h"
          />
        </div>
      </div>
    );
  }

  // Vertical gap: horizontal indicator line at center
  const lx = gap.cx;
  const ly = gap.cy;

  return (
    <div style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', zIndex: 250 }}>
      {/* Bracket hit target */}
      <div
        style={{
          position: 'absolute',
          left: lx - lineLen / 2 - hitPad,
          top: ly - endLen / 2 - hitPad,
          width: lineLen + hitPad * 2,
          height: endLen + hitPad * 2,
          cursor: 'ns-resize',
          pointerEvents: 'auto',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onBracketPointerUp}
      />
      {/* Horizontal indicator line */}
      <div style={{
        position: 'absolute',
        left: lx - lineLen / 2,
        top: ly - endW / 2,
        width: lineLen,
        height: endW,
        background: COLOR,
      }} />
      {/* Left endpoint */}
      <div style={{
        position: 'absolute',
        left: lx - lineLen / 2 - endW / 2,
        top: ly - endLen / 2,
        width: endW,
        height: endLen,
        background: COLOR,
      }} />
      {/* Right endpoint */}
      <div style={{
        position: 'absolute',
        left: lx + lineLen / 2 - endW / 2,
        top: ly - endLen / 2,
        width: endW,
        height: endLen,
        background: COLOR,
      }} />

      {/* Interactive label */}
      <div
        style={{
          position: 'absolute',
          left: lx + lineLen / 2 + s(6),
          top: ly,
          transform: `translate(0, -50%) scale(${1 / zoom})`,
          transformOrigin: 'left center',
          pointerEvents: 'auto',
          zIndex: 251,
        }}
      >
        <GapLabel
          value={gap.value}
          editing={editing}
          draft={draft}
          setDraft={setDraft}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onCommitEdit={commitEdit}
          onCancelEdit={() => setEditing(false)}
          axis="v"
        />
      </div>
    </div>
  );
}

// ─── The pink pill label ───────────────────────────────────────────────

function GapLabel({
  value,
  editing,
  draft,
  setDraft,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onCommitEdit,
  onCancelEdit,
  axis,
}: {
  value: number;
  editing: boolean;
  draft: string;
  setDraft: (v: string) => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  axis: 'h' | 'v';
}) {
  if (editing) {
    return (
      <input
        autoFocus
        style={{
          width: 44,
          padding: '3px 6px',
          borderRadius: 6,
          border: `1.5px solid ${BG}`,
          background: 'white',
          fontSize: 11,
          fontWeight: 700,
          color: BG,
          textAlign: 'center',
          outline: 'none',
          fontFamily: FONT,
        }}
        value={draft}
        onChange={e => setDraft(e.target.value.replace(/[^0-9.-]/g, ''))}
        onFocus={e => e.target.select()}
        onBlur={onCommitEdit}
        onKeyDown={e => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            onCancelEdit();
            (e.target as HTMLInputElement).blur();
          }
        }}
        onPointerDown={e => e.stopPropagation()}
      />
    );
  }

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2px 8px',
        borderRadius: 6,
        background: BG,
        color: 'white',
        fontSize: 11,
        fontWeight: 700,
        fontFamily: FONT,
        cursor: axis === 'h' ? 'ew-resize' : 'ns-resize',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
        minWidth: 24,
        textAlign: 'center',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {value}
    </div>
  );
}
