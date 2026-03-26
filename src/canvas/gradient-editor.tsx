import { useRef, useEffect, useState } from 'react';
import type { Fill } from './types';

type LinearGradientFill = Extract<Fill, { type: 'linear-gradient' }>;

export function defaultGradientPoints(angle: number): { startPoint: { x: number; y: number }; endPoint: { x: number; y: number } } {
  const rad = ((angle - 90) * Math.PI) / 180;
  return {
    startPoint: { x: 0.5 - Math.cos(rad) * 0.5, y: 0.5 - Math.sin(rad) * 0.5 },
    endPoint:   { x: 0.5 + Math.cos(rad) * 0.5, y: 0.5 + Math.sin(rad) * 0.5 },
  };
}

export function angleFromPoints(sp: { x: number; y: number }, ep: { x: number; y: number }): number {
  return ((Math.atan2(ep.y - sp.y, ep.x - sp.x) * 180 / Math.PI) + 90 + 360) % 360;
}

type DragState = {
  type: 'start' | 'end' | 'stop';
  stopIdx?: number;
  clientX: number;
  clientY: number;
  initPx: { x: number; y: number };
};

const CIRCLE_R = 5;    // endpoint dot circle radius
const BOX = 20;        // endpoint color square outer size
const BOX_R = 3;       // endpoint square corner radius
const STOP_BOX = 12;   // intermediate stop square outer size
const SNAP_PX = 8;     // snap threshold in shape-local pixels

// Snap new endpoint position to: bounding box edges, same axis as other endpoint, or 45° angle multiples
function snapEndpoint(x: number, y: number, ox: number, oy: number, bw: number, bh: number): { x: number; y: number } {
  let rx = x, ry = y;

  // Bounding box edge snap (left/right/top/bottom)
  for (const ex of [0, bw]) if (Math.abs(rx - ex) < SNAP_PX) rx = ex;
  for (const ey of [0, bh]) if (Math.abs(ry - ey) < SNAP_PX) ry = ey;

  // Axis snap to other endpoint
  if (Math.abs(rx - ox) < SNAP_PX) rx = ox;
  if (Math.abs(ry - oy) < SNAP_PX) ry = oy;

  // 45° angle snap from the other endpoint (applied after axis snap)
  const dx = rx - ox, dy = ry - oy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > 2) {
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const nearest = Math.round(angle / 45) * 45;
    const diff = ((angle - nearest + 540) % 360) - 180; // signed diff in [-180, 180]
    if (Math.abs(diff) < 5) {
      const rad = nearest * Math.PI / 180;
      rx = ox + Math.cos(rad) * dist;
      ry = oy + Math.sin(rad) * dist;
    }
  }

  return { x: rx, y: ry };
}

export function GradientEditorOverlay({
  fill, onChange, onCommit,
  bw, bh, x, y, rot,
}: {
  fill: LinearGradientFill;
  onChange: (fill: LinearGradientFill) => void;
  onCommit?: () => void;
  bw: number; bh: number;
  x: number; y: number; rot: number;
}) {
  const dragging = useRef<DragState | null>(null);
  const [activeHandle, setActiveHandle] = useState<'start' | 'end' | null>(null);

  const fillRef = useRef(fill);
  fillRef.current = fill;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  const bwRef = useRef(bw);
  bwRef.current = bw;
  const bhRef = useRef(bh);
  bhRef.current = bh;
  const rotRef = useRef(rot);
  rotRef.current = rot;

  // Stable ref to setActiveHandle so useEffect closure can call it
  const setActiveHandleRef = useRef(setActiveHandle);
  setActiveHandleRef.current = setActiveHandle;

  useEffect(() => {
    function handleMove(e: PointerEvent) {
      const drag = dragging.current;
      if (!drag) return;

      const fill = fillRef.current;
      const bw = bwRef.current;
      const bh = bhRef.current;
      const rotRad = (rotRef.current * Math.PI) / 180;

      const dcx = e.clientX - drag.clientX;
      const dcy = e.clientY - drag.clientY;

      // Screen delta → shape-local pixel delta (undo the div's rotation)
      const lx = dcx * Math.cos(rotRad) + dcy * Math.sin(rotRad);
      const ly = -dcx * Math.sin(rotRad) + dcy * Math.cos(rotRad);

      const defPts = defaultGradientPoints(fill.angle);
      const curSp = fill.startPoint ?? defPts.startPoint;
      const curEp = fill.endPoint ?? defPts.endPoint;
      const curSx = curSp.x * bw, curSy = curSp.y * bh;
      const curEx = curEp.x * bw, curEy = curEp.y * bh;

      if (drag.type === 'start') {
        const raw = { x: drag.initPx.x + lx, y: drag.initPx.y + ly };
        const snapped = snapEndpoint(raw.x, raw.y, curEx, curEy, bw, bh);
        const newSp = { x: snapped.x / bw, y: snapped.y / bh };
        onChangeRef.current({ ...fill, startPoint: newSp, endPoint: curEp, angle: angleFromPoints(newSp, curEp) });
      } else if (drag.type === 'end') {
        const raw = { x: drag.initPx.x + lx, y: drag.initPx.y + ly };
        const snapped = snapEndpoint(raw.x, raw.y, curSx, curSy, bw, bh);
        const newEp = { x: snapped.x / bw, y: snapped.y / bh };
        onChangeRef.current({ ...fill, startPoint: curSp, endPoint: newEp, angle: angleFromPoints(curSp, newEp) });
      } else if (drag.type === 'stop' && drag.stopIdx !== undefined) {
        const dx = curEx - curSx, dy = curEy - curSy;
        const lineLen2 = dx * dx + dy * dy;
        if (lineLen2 < 0.01) return;
        const newPx = drag.initPx.x + lx;
        const newPy = drag.initPx.y + ly;
        const t = Math.max(0, Math.min(1, ((newPx - curSx) * dx + (newPy - curSy) * dy) / lineLen2));
        const newStops = fill.stops.map((s, i) =>
          i === drag.stopIdx ? { ...s, offset: Math.round(t * 1000) / 1000 } : s
        );
        onChangeRef.current({ ...fill, startPoint: curSp, endPoint: curEp, stops: newStops });
      }
    }

    function handleUp() {
      if (dragging.current) {
        dragging.current = null;
        setActiveHandleRef.current(null);
        onCommitRef.current?.();
      }
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, []);

  const defPts = defaultGradientPoints(fill.angle);
  const startPt = fill.startPoint ?? defPts.startPoint;
  const endPt = fill.endPoint ?? defPts.endPoint;
  const sx = startPt.x * bw, sy = startPt.y * bh;
  const ex = endPt.x * bw, ey = endPt.y * bh;

  // Perpendicular direction to the gradient line (rotated 90° clockwise from line direction)
  // Used to offset the color-square tag away from the line
  const lineDx = ex - sx, lineDy = ey - sy;
  const lineLen = Math.sqrt(lineDx * lineDx + lineDy * lineDy);
  const perpX = lineLen > 1 ? lineDy / lineLen : 1;
  const perpY = lineLen > 1 ? -lineDx / lineLen : 0;

  // Get the colors at start (offset≈0) and end (offset≈1)
  const sortedStops = [...fill.stops].sort((a, b) => a.offset - b.offset);
  const startColor = sortedStops[0]?.color ?? '#000000';
  const endColor = sortedStops[sortedStops.length - 1]?.color ?? '#ffffff';

  const sortedStopIndices = fill.stops
    .map((_, i) => i)
    .sort((a, b) => fill.stops[a].offset - fill.stops[b].offset);

  function onEndpointDown(which: 'start' | 'end', e: React.PointerEvent) {
    e.stopPropagation();
    const pt = which === 'start' ? { x: sx, y: sy } : { x: ex, y: ey };
    dragging.current = { type: which, clientX: e.clientX, clientY: e.clientY, initPx: pt };
    setActiveHandle(which);
  }

  function onStopDown(stopIdx: number, e: React.PointerEvent) {
    e.stopPropagation();
    const stop = fill.stops[stopIdx];
    const px = sx + (ex - sx) * stop.offset;
    const py = sy + (ey - sy) * stop.offset;
    dragging.current = { type: 'stop', stopIdx, clientX: e.clientX, clientY: e.clientY, initPx: { x: px, y: py } };
  }

  // Render an endpoint handle: circle dot at the gradient point + color square offset perpendicular to line
  function renderEndpoint(cx: number, cy: number, which: 'start' | 'end', color: string) {
    const isActive = activeHandle === which;
    // Square center: offset by (CIRCLE_R + gap + BOX/2) in the perpendicular direction
    const sqOffset = CIRCLE_R + 5 + BOX / 2;
    const sqCx = cx + perpX * sqOffset;
    const sqCy = cy + perpY * sqOffset;

    return (
      <g
        key={which}
        style={{ pointerEvents: 'auto', cursor: 'move' }}
        onPointerDown={(e) => onEndpointDown(which, e)}
      >
        {/* Hit area spanning circle + square */}
        <rect
          x={Math.min(cx, sqCx) - BOX}
          y={Math.min(cy, sqCy) - BOX}
          width={Math.abs(sqCx - cx) + BOX * 2}
          height={Math.abs(sqCy - cy) + BOX * 2}
          fill="transparent"
        />
        {/* Color square tag */}
        <rect
          x={sqCx - BOX / 2} y={sqCy - BOX / 2}
          width={BOX} height={BOX}
          rx={BOX_R}
          fill="white"
          stroke={isActive ? '#3b82f6' : 'rgba(0,0,0,0.22)'}
          strokeWidth={isActive ? 2 : 1}
          filter="url(#ge-shadow)"
        />
        {/* Inner color fill */}
        <rect
          x={sqCx - BOX / 2 + 3} y={sqCy - BOX / 2 + 3}
          width={BOX - 6} height={BOX - 6}
          rx={1.5}
          fill={color}
        />
        {/* Circle dot at the actual gradient point on the line */}
        <circle
          cx={cx} cy={cy} r={CIRCLE_R}
          fill="white"
          stroke="rgba(0,0,0,0.3)"
          strokeWidth={1.5}
          filter="url(#ge-shadow)"
        />
      </g>
    );
  }

  return (
    <div style={{
      position: 'absolute',
      left: x, top: y,
      width: bw, height: bh,
      transform: `translate(-50%, -50%) rotate(${rot}deg)`,
      pointerEvents: 'none',
      zIndex: 1000,
    }}>
      <svg
        width={bw} height={bh}
        style={{ overflow: 'visible', pointerEvents: 'none' }}
      >
        <defs>
          <filter id="ge-shadow" x="-100%" y="-100%" width="300%" height="300%">
            <feDropShadow dx={0} dy={1} stdDeviation={1} floodColor="rgba(0,0,0,0.3)" />
          </filter>
        </defs>

        {/* Gradient line with subtle outline for visibility on any bg */}
        <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="rgba(0,0,0,0.25)" strokeWidth={3} style={{ pointerEvents: 'none' }} />
        <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="white" strokeWidth={1} style={{ pointerEvents: 'none' }} />

        {/* Intermediate stop handles (colored squares on the line) */}
        {sortedStopIndices
          .filter(i => fill.stops[i].offset > 0.001 && fill.stops[i].offset < 0.999)
          .map(i => {
            const stop = fill.stops[i];
            const px = sx + (ex - sx) * stop.offset;
            const py = sy + (ey - sy) * stop.offset;
            return (
              <g
                key={i}
                style={{ pointerEvents: 'auto', cursor: 'move' }}
                onPointerDown={(e) => onStopDown(i, e)}
              >
                <rect x={px - STOP_BOX} y={py - STOP_BOX} width={STOP_BOX * 2} height={STOP_BOX * 2} fill="transparent" />
                <rect
                  x={px - STOP_BOX / 2} y={py - STOP_BOX / 2}
                  width={STOP_BOX} height={STOP_BOX}
                  rx={BOX_R}
                  fill="white"
                  stroke="rgba(0,0,0,0.22)"
                  strokeWidth={1}
                  filter="url(#ge-shadow)"
                />
                <rect
                  x={px - STOP_BOX / 2 + 2} y={py - STOP_BOX / 2 + 2}
                  width={STOP_BOX - 4} height={STOP_BOX - 4}
                  rx={1}
                  fill={stop.color}
                />
              </g>
            );
          })}

        {/* Endpoint handles on top */}
        {renderEndpoint(sx, sy, 'start', startColor)}
        {renderEndpoint(ex, ey, 'end', endColor)}
      </svg>
    </div>
  );
}
