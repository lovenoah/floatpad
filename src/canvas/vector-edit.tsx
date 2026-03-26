import { useCallback, useRef } from 'react';
import type { VectorPoint } from './vector-edit-utils';
import { pointsToPathData } from './vector-edit-utils';

export type VectorEditState = {
  itemLabel: string;
  points: VectorPoint[];
  closed: boolean;
  selectedPoint: number;
  originalShapeType: string;
};

export type VectorEditOverlayProps = {
  state: VectorEditState;
  zoom: number;
  // Transform from viewBox-local coords to canvas-space coords
  itemX: number;       // item center in canvas coords
  itemY: number;
  itemW: number;       // item bounding box width (after scale)
  itemH: number;
  viewBoxW: number;    // viewBox dimensions
  viewBoxH: number;
  itemRot: number;     // rotation in degrees
  // Callbacks
  onPointSelect: (index: number) => void;
  onPointDragStart: (index: number) => void;
  onPointDrag: (index: number, x: number, y: number) => void;
  onPointDragEnd: () => void;
  onHandleDragStart: (index: number, which: 'in' | 'out') => void;
  onHandleDrag: (index: number, which: 'in' | 'out', x: number, y: number, altKey: boolean) => void;
  onHandleDragEnd: () => void;
  onSegmentClick: (segmentIndex: number) => void;
  onPointDoubleClick: (index: number) => void;
  onDeletePoint: () => void;
};

export function VectorEditOverlay({
  state,
  zoom,
  itemX, itemY, itemW, itemH,
  viewBoxW, viewBoxH,
  itemRot,
  onPointSelect,
  onPointDragStart,
  onPointDrag,
  onPointDragEnd,
  onHandleDragStart,
  onHandleDrag,
  onHandleDragEnd,
  onSegmentClick,
  onPointDoubleClick,
}: VectorEditOverlayProps) {
  const { points, closed, selectedPoint } = state;
  const s = (px: number) => px / zoom;
  const blue = '#0c8ce9';

  // Refs for drag state (avoid stale closures)
  const dragRef = useRef<{
    type: 'point' | 'handleIn' | 'handleOut';
    index: number;
    active: boolean;
  } | null>(null);

  // Convert viewBox-local coords to canvas coords
  const scaleX = viewBoxW > 0 ? itemW / viewBoxW : 1;
  const scaleY = viewBoxH > 0 ? itemH / viewBoxH : 1;

  // The transform to go from viewBox to canvas:
  // 1. Scale by (itemW/vbW, itemH/vbH) to get item-local pixel coords
  // 2. Offset by (-itemW/2, -itemH/2) to center
  // 3. Rotate by itemRot
  // 4. Translate to (itemX, itemY)
  const transformStr = `translate(${itemX}, ${itemY}) rotate(${itemRot}) translate(${-itemW / 2}, ${-itemH / 2}) scale(${scaleX}, ${scaleY})`;

  // Inverse transform: canvas coords → viewBox-local coords
  const canvasToLocal = useCallback((canvasX: number, canvasY: number): { x: number; y: number } => {
    // Undo translate to item center
    let dx = canvasX - itemX;
    let dy = canvasY - itemY;
    // Undo rotation
    const rad = -itemRot * Math.PI / 180;
    const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
    // Undo translate to top-left
    const lx = rx + itemW / 2;
    const ly = ry + itemH / 2;
    // Undo scale
    return { x: lx / scaleX, y: ly / scaleY };
  }, [itemX, itemY, itemW, itemH, itemRot, scaleX, scaleY]);

  // Convert screen mouse event to canvas coords, then to viewBox-local
  const screenToLocal = useCallback((e: React.PointerEvent): { x: number; y: number } => {
    // We need to get from screen coords to canvas coords
    // The SVG is positioned at canvas (0,0) — find the SVG element's screen offset
    const svg = (e.target as Element).closest('svg');
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left) / zoom;
    const canvasY = (e.clientY - rect.top) / zoom;
    return canvasToLocal(canvasX, canvasY);
  }, [canvasToLocal, zoom]);

  // Build the full path string for display
  const pathD = pointsToPathData(points, closed);

  // Handle pointer events on points
  const handlePointDown = useCallback((e: React.PointerEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    onPointSelect(index);
    onPointDragStart(index);
    dragRef.current = { type: 'point', index, active: true };
  }, [onPointSelect, onPointDragStart]);

  const handlePointMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current?.active) return;
    const { type, index } = dragRef.current;
    const local = screenToLocal(e);
    if (type === 'point') {
      onPointDrag(index, local.x, local.y);
    } else if (type === 'handleIn') {
      onHandleDrag(index, 'in', local.x, local.y, e.altKey);
    } else if (type === 'handleOut') {
      onHandleDrag(index, 'out', local.x, local.y, e.altKey);
    }
  }, [screenToLocal, onPointDrag, onHandleDrag]);

  const handlePointUp = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current?.active) return;
    const { type } = dragRef.current;
    dragRef.current = null;
    (e.target as Element).releasePointerCapture(e.pointerId);
    if (type === 'point') {
      onPointDragEnd();
    } else {
      onHandleDragEnd();
    }
  }, [onPointDragEnd, onHandleDragEnd]);

  // Handle pointer events on bezier handles
  const handleHandleDown = useCallback((e: React.PointerEvent, index: number, which: 'in' | 'out') => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    onHandleDragStart(index, which);
    dragRef.current = { type: which === 'in' ? 'handleIn' : 'handleOut', index, active: true };
  }, [onHandleDragStart]);

  // Handle segment hover and click for point insertion
  const handleSegmentClick = useCallback((e: React.MouseEvent, segmentIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    onSegmentClick(segmentIndex);
  }, [onSegmentClick]);

  // Build segment paths for individual hit zones
  const segmentPaths: { d: string; index: number }[] = [];
  for (let i = 0; i < points.length - (closed ? 0 : 1); i++) {
    const p0 = points[i];
    const p1 = points[(i + 1) % points.length];
    const f = (n: number) => n.toFixed(2);
    if (p0.handleOut || p1.handleIn) {
      const cp1 = p0.handleOut ?? p0;
      const cp2 = p1.handleIn ?? p1;
      segmentPaths.push({
        d: `M ${f(p0.x)},${f(p0.y)} C ${f(cp1.x)},${f(cp1.y)} ${f(cp2.x)},${f(cp2.y)} ${f(p1.x)},${f(p1.y)}`,
        index: i,
      });
    } else {
      segmentPaths.push({
        d: `M ${f(p0.x)},${f(p0.y)} L ${f(p1.x)},${f(p1.y)}`,
        index: i,
      });
    }
  }

  return (
    <svg
      style={{
        position: 'absolute',
        left: 0, top: 0,
        width: 0, height: 0,
        overflow: 'visible',
        pointerEvents: 'none',
        zIndex: 500,
      }}
    >
      <g transform={transformStr}>
        {/* Path outline */}
        <path
          d={pathD}
          fill="none"
          stroke={blue}
          strokeWidth={s(1.5) / scaleX}
          vectorEffect="non-scaling-stroke"
          opacity={0.6}
        />

        {/* Segment hit zones for point insertion */}
        {segmentPaths.map(({ d, index }) => (
          <path
            key={`seg-${index}`}
            d={d}
            fill="none"
            stroke="transparent"
            strokeWidth={s(14) / scaleX}
            vectorEffect="non-scaling-stroke"
            style={{ pointerEvents: 'stroke', cursor: 'copy' }}
            onClick={(e) => handleSegmentClick(e, index)}
          />
        ))}

        {/* Bezier handles for selected point */}
        {selectedPoint >= 0 && selectedPoint < points.length && (() => {
          const p = points[selectedPoint];
          const lineWidth = s(1) / scaleX;
          const handleRadius = s(3.5) / scaleX;
          return (
            <>
              {p.handleIn && (
                <>
                  <line
                    x1={p.x} y1={p.y} x2={p.handleIn.x} y2={p.handleIn.y}
                    stroke={blue} strokeWidth={lineWidth}
                    vectorEffect="non-scaling-stroke"
                    opacity={0.5}
                  />
                  <rect
                    x={p.handleIn.x - handleRadius}
                    y={p.handleIn.y - handleRadius}
                    width={handleRadius * 2}
                    height={handleRadius * 2}
                    transform={`rotate(45, ${p.handleIn.x}, ${p.handleIn.y})`}
                    fill="white"
                    stroke={blue}
                    strokeWidth={lineWidth}
                    vectorEffect="non-scaling-stroke"
                    style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                    onPointerDown={(e) => handleHandleDown(e, selectedPoint, 'in')}
                    onPointerMove={handlePointMove}
                    onPointerUp={handlePointUp}
                  />
                </>
              )}
              {p.handleOut && (
                <>
                  <line
                    x1={p.x} y1={p.y} x2={p.handleOut.x} y2={p.handleOut.y}
                    stroke={blue} strokeWidth={lineWidth}
                    vectorEffect="non-scaling-stroke"
                    opacity={0.5}
                  />
                  <rect
                    x={p.handleOut.x - handleRadius}
                    y={p.handleOut.y - handleRadius}
                    width={handleRadius * 2}
                    height={handleRadius * 2}
                    transform={`rotate(45, ${p.handleOut.x}, ${p.handleOut.y})`}
                    fill="white"
                    stroke={blue}
                    strokeWidth={lineWidth}
                    vectorEffect="non-scaling-stroke"
                    style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                    onPointerDown={(e) => handleHandleDown(e, selectedPoint, 'out')}
                    onPointerMove={handlePointMove}
                    onPointerUp={handlePointUp}
                  />
                </>
              )}
            </>
          );
        })()}

        {/* Anchor points */}
        {points.map((p, i) => {
          const isSelected = i === selectedPoint;
          const r = s(isSelected ? 4.5 : 4) / scaleX;
          return (
            <circle
              key={`pt-${i}`}
              cx={p.x}
              cy={p.y}
              r={r}
              fill={isSelected ? blue : 'white'}
              stroke={blue}
              strokeWidth={s(1.5) / scaleX}
              vectorEffect="non-scaling-stroke"
              style={{ pointerEvents: 'auto', cursor: 'move' }}
              onPointerDown={(e) => handlePointDown(e, i)}
              onPointerMove={handlePointMove}
              onPointerUp={handlePointUp}
              onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); onPointDoubleClick(i); }}
            />
          );
        })}
      </g>
    </svg>
  );
}
