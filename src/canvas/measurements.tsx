import type { ItemDef, ItemState } from './types';

type Bounds = { left: number; right: number; top: number; bottom: number; cx: number; cy: number };

function getBounds(item: ItemDef, state: ItemState): Bounds {
  const w = item.w * state.scale;
  const h = item.h * state.scale;
  return {
    left: state.x - w / 2,
    right: state.x + w / 2,
    top: state.y - h / 2,
    bottom: state.y + h / 2,
    cx: state.x,
    cy: state.y,
  };
}

export function Measurements({
  selectedItems,
  selectedStates,
  hoveredItem,
  hoveredState,
  zoom,
}: {
  selectedItems: ItemDef[];
  selectedStates: ItemState[];
  hoveredItem: ItemDef;
  hoveredState: ItemState;
  zoom: number;
}) {
  // Compute combined bounds of all selected items
  let sLeft = Infinity, sRight = -Infinity, sTop = Infinity, sBottom = -Infinity;
  for (let i = 0; i < selectedItems.length; i++) {
    const b = getBounds(selectedItems[i], selectedStates[i]);
    sLeft = Math.min(sLeft, b.left);
    sRight = Math.max(sRight, b.right);
    sTop = Math.min(sTop, b.top);
    sBottom = Math.max(sBottom, b.bottom);
  }

  const h = getBounds(hoveredItem, hoveredState);
  const s = (px: number) => px / zoom;

  const lines: React.ReactNode[] = [];
  const color = 'rgba(236, 72, 153, 0.85)';

  // ── Horizontal measurement ───────────────────────────────────────
  let hGap: number | null = null;
  let hx1 = 0, hx2 = 0;
  // Vertical center line where the measurement line goes
  const overlapTop = Math.max(sTop, h.top);
  const overlapBottom = Math.min(sBottom, h.bottom);
  const hLineY = overlapTop < overlapBottom
    ? (overlapTop + overlapBottom) / 2
    : (Math.min(sTop + sBottom, h.top + h.bottom)) / 2;

  if (sRight <= h.left) {
    hGap = Math.round(h.left - sRight);
    hx1 = sRight;
    hx2 = h.left;
  } else if (h.right <= sLeft) {
    hGap = Math.round(sLeft - h.right);
    hx1 = h.right;
    hx2 = sLeft;
  }

  if (hGap !== null && hGap > 0) {
    lines.push(
      <g key="h">
        {/* Main line */}
        <line x1={hx1} y1={hLineY} x2={hx2} y2={hLineY}
          stroke={color} strokeWidth={s(1)} />
        {/* Endpoints */}
        <line x1={hx1} y1={hLineY - s(4)} x2={hx1} y2={hLineY + s(4)}
          stroke={color} strokeWidth={s(1)} />
        <line x1={hx2} y1={hLineY - s(4)} x2={hx2} y2={hLineY + s(4)}
          stroke={color} strokeWidth={s(1)} />
      </g>
    );
    lines.push(
      <MeasureLabel key="hl" x={(hx1 + hx2) / 2} y={hLineY - s(8)} zoom={zoom} color={color}>
        {hGap}
      </MeasureLabel>
    );
  }

  // ── Vertical measurement ─────────────────────────────────────────
  let vGap: number | null = null;
  let vy1 = 0, vy2 = 0;
  const overlapLeft = Math.max(sLeft, h.left);
  const overlapRight = Math.min(sRight, h.right);
  const vLineX = overlapLeft < overlapRight
    ? (overlapLeft + overlapRight) / 2
    : (Math.min(sLeft + sRight, h.left + h.right)) / 2;

  if (sBottom <= h.top) {
    vGap = Math.round(h.top - sBottom);
    vy1 = sBottom;
    vy2 = h.top;
  } else if (h.bottom <= sTop) {
    vGap = Math.round(sTop - h.bottom);
    vy1 = h.bottom;
    vy2 = sTop;
  }

  if (vGap !== null && vGap > 0) {
    lines.push(
      <g key="v">
        <line x1={vLineX} y1={vy1} x2={vLineX} y2={vy2}
          stroke={color} strokeWidth={s(1)} />
        <line x1={vLineX - s(4)} y1={vy1} x2={vLineX + s(4)} y2={vy1}
          stroke={color} strokeWidth={s(1)} />
        <line x1={vLineX - s(4)} y1={vy2} x2={vLineX + s(4)} y2={vy2}
          stroke={color} strokeWidth={s(1)} />
      </g>
    );
    lines.push(
      <MeasureLabel key="vl" x={vLineX + s(8)} y={(vy1 + vy2) / 2} zoom={zoom} color={color} anchor="start">
        {vGap}
      </MeasureLabel>
    );
  }

  // ── Edge-aligned distances (when items overlap on one axis) ──────
  // Show center-to-center if no gap on either axis
  if (hGap === null && vGap === null) {
    const dx = Math.round(Math.abs(h.cx - (sLeft + sRight) / 2));
    const dy = Math.round(Math.abs(h.cy - (sTop + sBottom) / 2));
    const scx = (sLeft + sRight) / 2;
    const scy = (sTop + sBottom) / 2;

    if (dx > 0) {
      const x1 = Math.min(scx, h.cx);
      const x2 = Math.max(scx, h.cx);
      const ly = (scy + h.cy) / 2;
      lines.push(
        <g key="cx">
          <line x1={x1} y1={ly} x2={x2} y2={ly}
            stroke={color} strokeWidth={s(1)} strokeDasharray={`${s(3)} ${s(3)}`} />
        </g>
      );
      lines.push(
        <MeasureLabel key="cxl" x={(x1 + x2) / 2} y={ly - s(8)} zoom={zoom} color={color}>
          {dx}
        </MeasureLabel>
      );
    }
    if (dy > 0) {
      const y1 = Math.min(scy, h.cy);
      const y2 = Math.max(scy, h.cy);
      const lx = (scx + h.cx) / 2;
      lines.push(
        <g key="cy">
          <line x1={lx} y1={y1} x2={lx} y2={y2}
            stroke={color} strokeWidth={s(1)} strokeDasharray={`${s(3)} ${s(3)}`} />
        </g>
      );
      lines.push(
        <MeasureLabel key="cyl" x={lx + s(8)} y={(y1 + y2) / 2} zoom={zoom} color={color} anchor="start">
          {dy}
        </MeasureLabel>
      );
    }
  }

  if (lines.length === 0) return null;

  return (
    <svg
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        overflow: 'visible',
        pointerEvents: 'none',
        zIndex: 300,
      }}
    >
      {lines}
    </svg>
  );
}

function MeasureLabel({
  x, y, zoom, color, children, anchor = 'middle',
}: {
  x: number; y: number; zoom: number; color: string; children: React.ReactNode; anchor?: 'start' | 'middle' | 'end';
}) {
  return (
    <g transform={`translate(${x}, ${y}) scale(${1 / zoom})`}>
      <rect
        x={anchor === 'middle' ? -14 : -2}
        y={-8}
        width={28}
        height={16}
        rx={4}
        fill={color}
        opacity={0.95}
      />
      <text
        x={anchor === 'middle' ? 0 : 12}
        y={4}
        textAnchor={anchor}
        fill="white"
        fontSize={10}
        fontWeight={600}
        fontFamily="'Geist', ui-monospace, monospace"
      >
        {children}
      </text>
    </g>
  );
}
