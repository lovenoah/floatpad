import { useState, useCallback, useRef } from 'react';
import type { ItemDef, ItemState } from './types';
import { FONT } from './tokens';
const COLOR = 'rgba(236, 72, 153, 0.9)';
const BG = 'rgb(236, 72, 153)';

type Side = 'left' | 'right' | 'top' | 'bottom';

interface WindowGapsProps {
  items: ItemDef[];
  states: Record<string, ItemState>;
  selection: Set<string>;
  windowW: number;
  windowH: number;
  zoom: number;
  onDeltaMove: (dx: number, dy: number) => void;
  onCommit: () => void;
}

function getSelectionBounds(
  items: ItemDef[],
  states: Record<string, ItemState>,
  selection: Set<string>,
): { left: number; right: number; top: number; bottom: number; cx: number; cy: number } | null {
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  let found = false;

  for (const item of items) {
    if (!selection.has(item.label)) continue;
    const s = states[item.label];
    if (!s) continue;
    const hw = (item.w * s.scale) / 2;
    const hh = (item.h * s.scale) / 2;
    left = Math.min(left, s.x - hw);
    right = Math.max(right, s.x + hw);
    top = Math.min(top, s.y - hh);
    bottom = Math.max(bottom, s.y + hh);
    found = true;
  }

  if (!found) return null;
  return { left, right, top, bottom, cx: (left + right) / 2, cy: (top + bottom) / 2 };
}

export function WindowGaps({
  items, states, selection, windowW, windowH, zoom, onDeltaMove, onCommit,
}: WindowGapsProps) {
  const bounds = getSelectionBounds(items, states, selection);
  if (!bounds) return null;

  const winLeft = -windowW / 2;
  const winRight = windowW / 2;
  const winTop = -windowH / 2;
  const winBottom = windowH / 2;

  const gaps: { side: Side; value: number }[] = [
    { side: 'left',   value: Math.round(bounds.left - winLeft) },
    { side: 'right',  value: Math.round(winRight - bounds.right) },
    { side: 'top',    value: Math.round(bounds.top - winTop) },
    { side: 'bottom', value: Math.round(winBottom - bounds.bottom) },
  ];

  // Only show gaps that are > 0
  const visibleGaps = gaps.filter(g => g.value > 0);
  if (visibleGaps.length === 0) return null;

  return (
    <>
      {visibleGaps.map(({ side, value }) => (
        <WindowGapIndicator
          key={side}
          side={side}
          value={value}
          bounds={bounds}
          windowW={windowW}
          windowH={windowH}
          zoom={zoom}
          onDeltaMove={onDeltaMove}
          onCommit={onCommit}
        />
      ))}
    </>
  );
}

function WindowGapIndicator({
  side,
  value,
  bounds,
  windowW,
  windowH,
  zoom,
  onDeltaMove,
  onCommit,
}: {
  side: Side;
  value: number;
  bounds: { left: number; right: number; top: number; bottom: number; cx: number; cy: number };
  windowW: number;
  windowH: number;
  zoom: number;
  onDeltaMove: (dx: number, dy: number) => void;
  onCommit: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const dragRef = useRef<{
    startMx: number;
    startMy: number;
    moved: boolean;
  } | null>(null);

  const s = useCallback((px: number) => px / zoom, [zoom]);

  const isH = side === 'left' || side === 'right';

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (editing) return;
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startMx: e.clientX, startMy: e.clientY, moved: false };
  }, [editing]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (e.clientX - drag.startMx) / zoom;
    const dy = (e.clientY - drag.startMy) / zoom;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.moved = true;
    if (!drag.moved) return;
    drag.startMx = e.clientX;
    drag.startMy = e.clientY;
    if (isH) {
      onDeltaMove(dx, 0);
    } else {
      onDeltaMove(0, dy);
    }
  }, [zoom, isH, onDeltaMove]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    if (!drag.moved) {
      setEditing(true);
      setDraft(String(value));
    } else {
      onCommit();
    }
    dragRef.current = null;
  }, [value, onCommit]);

  const commitEdit = useCallback(() => {
    setEditing(false);
    const newGap = parseInt(draft, 10);
    if (isNaN(newGap) || newGap < 0) return;
    const delta = newGap - value;
    if (delta === 0) return;
    if (side === 'left')   onDeltaMove(+delta, 0);
    if (side === 'right')  onDeltaMove(-delta, 0);
    if (side === 'top')    onDeltaMove(0, +delta);
    if (side === 'bottom') onDeltaMove(0, -delta);
    onCommit();
  }, [draft, value, side, onDeltaMove, onCommit]);

  // Geometry
  const winLeft = -windowW / 2;
  const winRight = windowW / 2;
  const winTop = -windowH / 2;
  const winBottom = windowH / 2;
  const lineLen = s(24);
  const endLen = s(6);
  const endW = s(1);
  const hitPad = s(8);

  // Build line position
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  let lx = 0, ly = 0; // label position
  const labelTransform: React.CSSProperties = {};

  if (side === 'left') {
    x1 = winLeft; x2 = bounds.left; y1 = y2 = bounds.cy;
    lx = (x1 + x2) / 2; ly = y1;
    labelTransform.transform = `translate(-50%, -100%) scale(${1 / zoom})`;
    labelTransform.transformOrigin = 'center bottom';
  } else if (side === 'right') {
    x1 = bounds.right; x2 = winRight; y1 = y2 = bounds.cy;
    lx = (x1 + x2) / 2; ly = y1;
    labelTransform.transform = `translate(-50%, -100%) scale(${1 / zoom})`;
    labelTransform.transformOrigin = 'center bottom';
  } else if (side === 'top') {
    x1 = x2 = bounds.cx; y1 = winTop; y2 = bounds.top;
    lx = x1 + endLen / 2 + s(6); ly = (y1 + y2) / 2;
    labelTransform.transform = `translate(0, -50%) scale(${1 / zoom})`;
    labelTransform.transformOrigin = 'left center';
  } else {
    x1 = x2 = bounds.cx; y1 = bounds.bottom; y2 = winBottom;
    lx = x1 + endLen / 2 + s(6); ly = (y1 + y2) / 2;
    labelTransform.transform = `translate(0, -50%) scale(${1 / zoom})`;
    labelTransform.transformOrigin = 'left center';
  }

  const labelY = isH ? ly - lineLen / 2 - s(6) : ly;

  return (
    <div style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', zIndex: 250 }}>
      {isH ? (
        <>
          {/* Horizontal line */}
          <div style={{
            position: 'absolute',
            left: x1,
            top: y1 - endW / 2,
            width: x2 - x1,
            height: endW,
            background: COLOR,
          }} />
          {/* Left endpoint */}
          <div style={{
            position: 'absolute',
            left: x1 - endW / 2,
            top: y1 - endLen / 2,
            width: endW,
            height: endLen,
            background: COLOR,
          }} />
          {/* Right endpoint */}
          <div style={{
            position: 'absolute',
            left: x2 - endW / 2,
            top: y1 - endLen / 2,
            width: endW,
            height: endLen,
            background: COLOR,
          }} />
          {/* Hit target */}
          <div
            style={{
              position: 'absolute',
              left: x1 - hitPad,
              top: y1 - endLen / 2 - hitPad,
              width: (x2 - x1) + hitPad * 2,
              height: endLen + hitPad * 2,
              cursor: 'ew-resize',
              pointerEvents: 'auto',
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
        </>
      ) : (
        <>
          {/* Vertical line */}
          <div style={{
            position: 'absolute',
            left: x1 - endW / 2,
            top: y1,
            width: endW,
            height: y2 - y1,
            background: COLOR,
          }} />
          {/* Top endpoint */}
          <div style={{
            position: 'absolute',
            left: x1 - endLen / 2,
            top: y1 - endW / 2,
            width: endLen,
            height: endW,
            background: COLOR,
          }} />
          {/* Bottom endpoint */}
          <div style={{
            position: 'absolute',
            left: x1 - endLen / 2,
            top: y2 - endW / 2,
            width: endLen,
            height: endW,
            background: COLOR,
          }} />
          {/* Hit target */}
          <div
            style={{
              position: 'absolute',
              left: x1 - endLen / 2 - hitPad,
              top: y1 - hitPad,
              width: endLen + hitPad * 2,
              height: (y2 - y1) + hitPad * 2,
              cursor: 'ns-resize',
              pointerEvents: 'auto',
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
        </>
      )}

      {/* Label */}
      <div
        style={{
          position: 'absolute',
          left: lx,
          top: isH ? labelY : labelY,
          ...labelTransform,
          pointerEvents: 'auto',
          zIndex: 251,
        }}
      >
        <GapLabel
          value={value}
          editing={editing}
          draft={draft}
          setDraft={setDraft}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onCommitEdit={commitEdit}
          onCancelEdit={() => setEditing(false)}
          axis={isH ? 'h' : 'v'}
        />
      </div>
    </div>
  );
}

function GapLabel({
  value, editing, draft, setDraft,
  onPointerDown, onPointerMove, onPointerUp,
  onCommitEdit, onCancelEdit, axis,
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
          if (e.key === 'Escape') { onCancelEdit(); (e.target as HTMLInputElement).blur(); }
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
