import { useState, useCallback, useRef, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock as LockIcon } from 'lucide-react';
import type { ItemState } from './types';

// Figma-style handles: filled squares at corners, circles at edge midpoints
const SQ = 8; // corner square size
const CORNER_HANDLES = [
  { key: 'tl', style: (s: (n: number) => number) => ({ top: s(-SQ / 2), left: s(-SQ / 2) }), cursor: 'nwse-resize' },
  { key: 'tr', style: (s: (n: number) => number) => ({ top: s(-SQ / 2), right: s(-SQ / 2) }), cursor: 'nesw-resize' },
  { key: 'bl', style: (s: (n: number) => number) => ({ bottom: s(-SQ / 2), left: s(-SQ / 2) }), cursor: 'nesw-resize' },
  { key: 'br', style: (s: (n: number) => number) => ({ bottom: s(-SQ / 2), right: s(-SQ / 2) }), cursor: 'nwse-resize' },
];

// Rotation zones: invisible areas just outside each corner
const ROTATION_SIZE = 16;
const ROT_OFFSET = ROTATION_SIZE / 2 + SQ / 2 + 1;
const ROTATION_ZONES = [
  { key: 'rot-tl', style: (s: (n: number) => number) => ({ top: s(-ROT_OFFSET), left: s(-ROT_OFFSET) }) },
  { key: 'rot-tr', style: (s: (n: number) => number) => ({ top: s(-ROT_OFFSET), right: s(-ROT_OFFSET) }) },
  { key: 'rot-bl', style: (s: (n: number) => number) => ({ bottom: s(-ROT_OFFSET), left: s(-ROT_OFFSET) }) },
  { key: 'rot-br', style: (s: (n: number) => number) => ({ bottom: s(-ROT_OFFSET), right: s(-ROT_OFFSET) }) },
];

// Rotation cursor — Lucide RotateCw in black
const ROTATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>')}") 12 12, crosshair`;

// Corner radius handle positions — inset from each corner along the horizontal edge
const RADIUS_CORNERS = [
  { key: 'r-tl', corner: 'tl' as const },
  { key: 'r-tr', corner: 'tr' as const },
  { key: 'r-bl', corner: 'bl' as const },
  { key: 'r-br', corner: 'br' as const },
];

// Edge resize hit zones
const EDGE_HANDLES = [
  { key: 'edge-top', edge: 'top' as const, cursor: 'ns-resize' },
  { key: 'edge-right', edge: 'right' as const, cursor: 'ew-resize' },
  { key: 'edge-bottom', edge: 'bottom' as const, cursor: 'ns-resize' },
  { key: 'edge-left', edge: 'left' as const, cursor: 'ew-resize' },
];

export const CanvasItem = memo(function CanvasItem({
  label,
  initW,
  initH,
  state,
  zoom,
  onDragStart,
  onDragMove,
  onDragEnd,
  onScaleChange,
  onScaleCommit,
  onRotationChange,
  onRotationCommit,
  selected,
  onSelect,
  onHover,
  onContentSizeChange,
  editing = false,
  onDoubleClick,
  // Corner radius props
  shapeType,
  borderRadius = 0,
  onBorderRadiusChange,
  onBorderRadiusCommit,
  // Edge resize props
  onEdgeResizeStart,
  onEdgeResize,
  onEdgeResizeCommit,
  children,
}: {
  label: string;
  initW: number;
  initH: number;
  state: ItemState;
  zoom: number;
  onDragStart: () => void;
  onDragMove: (dx: number, dy: number, shiftKey?: boolean) => void;
  onDragEnd: () => void;
  onScaleChange: (scale: number) => void;
  onScaleCommit: () => void;
  onRotationChange: (rot: number) => void;
  onRotationCommit: () => void;
  selected: boolean;
  onSelect: (label: string | null, shiftKey: boolean) => void;
  onHover: (label: string | null) => void;
  onContentSizeChange?: (w: number, h: number) => void;
  editing?: boolean;
  onDoubleClick?: () => void;
  // Corner radius
  shapeType?: string;
  borderRadius?: number;
  onBorderRadiusChange?: (r: number) => void;
  onBorderRadiusCommit?: () => void;
  // Edge resize
  onEdgeResizeStart?: () => void;
  onEdgeResize?: (edge: 'top' | 'right' | 'bottom' | 'left', delta: number) => void;
  onEdgeResizeCommit?: () => void;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [radiusDragging, setRadiusDragging] = useState(false);
  const [, setEdgeResizing] = useState(false);
  const dragging = useRef(false);
  const resizing = useRef(false);
  const rotatingRef = useRef(false);
  const radiusDragRef = useRef(false);
  const edgeResizeRef = useRef<{ edge: 'top' | 'right' | 'bottom' | 'left'; startMouse: number; startDim: number } | null>(null);
  const dragStart = useRef({ mx: 0, my: 0 });
  const resizeStart = useRef({ scale: 1, dist: 0, cx: 0, cy: 0 });
  const rotateStart = useRef({ startRot: 0, startAngle: 0, cx: 0, cy: 0 });
  const radiusStart = useRef({ startRadius: 0, startMouse: 0, corner: '' as string });
  const visualRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentSize, setContentSize] = useState<{ w: number; h: number } | null>(null);

  const { x, y, scale, rot, z = 0, locked = false, opacity = 1, flipX = false, flipY = false } = state;
  const w = Math.round(initW * scale);
  const h = Math.round(initH * scale);

  // Measure the actual content size (unscaled) to tighten the selection frame
  const onContentSizeChangeRef = useRef(onContentSizeChange);
  onContentSizeChangeRef.current = onContentSizeChange;

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        const w = Math.round(width);
        const h = Math.round(height);
        setContentSize({ w, h });
        onContentSizeChangeRef.current?.(w, h);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Selection frame dimensions: use measured content size if available
  const frameW = contentSize ? Math.round(contentSize.w * scale) : w;
  const frameH = contentSize ? Math.round(contentSize.h * scale) : h;

  // Screen-constant size helper: keeps UI chrome at fixed screen pixels
  const s = useCallback((px: number) => px / zoom, [zoom]);

  // ── Drag handlers ──────────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (resizing.current) return;
    if (editing) return; // don't initiate drag while editing inline
    e.preventDefault();
    e.stopPropagation();
    if (locked) { onSelect(label, e.shiftKey); return; }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragging.current = true;
    setInteracting(true);
    dragStart.current = { mx: e.clientX, my: e.clientY };
    onSelect(label, e.shiftKey);
    onDragStart();
  }, [label, onSelect, onDragStart]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    // Divide by zoom so canvas-space movement matches cursor 1:1
    const dx = Math.round((e.clientX - dragStart.current.mx) / zoom);
    const dy = Math.round((e.clientY - dragStart.current.my) / zoom);
    onDragMove(dx, dy, e.shiftKey);
  }, [onDragMove, zoom]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    setInteracting(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    onDragEnd();
  }, [onDragEnd]);

  // ── Resize handlers ────────────────────────────────────────────────
  const onResizeDown = useCallback((e: React.PointerEvent) => {
    if (locked) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    resizing.current = true;
    setInteracting(true);

    // Get item center in screen coords from the visual element
    const el = visualRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dist = Math.hypot(e.clientX - cx, e.clientY - cy);

    resizeStart.current = { scale, dist: Math.max(dist, 1), cx, cy };
  }, [scale]);

  const onResizeMove = useCallback((e: React.PointerEvent) => {
    if (!resizing.current) return;
    const { scale: startScale, dist: startDist, cx, cy } = resizeStart.current;
    const currentDist = Math.hypot(e.clientX - cx, e.clientY - cy);
    const newScale = Math.round(Math.max(0.1, Math.min(4, startScale * (currentDist / startDist))) * 100) / 100;
    onScaleChange(newScale);
  }, [onScaleChange]);

  const onResizeUp = useCallback((e: React.PointerEvent) => {
    if (!resizing.current) return;
    resizing.current = false;
    setInteracting(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    onScaleCommit();
  }, [onScaleCommit]);

  // ── Rotation handlers ──────────────────────────────────────────────
  const onRotateDown = useCallback((e: React.PointerEvent) => {
    if (locked) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    rotatingRef.current = true;
    setRotating(true);
    setInteracting(true);

    const el = visualRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);

    rotateStart.current = { startRot: rot, startAngle, cx, cy };
  }, [rot]);

  const onRotateMove = useCallback((e: React.PointerEvent) => {
    if (!rotatingRef.current) return;
    const { startRot, startAngle, cx, cy } = rotateStart.current;
    const currentAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
    let newRot = startRot + (currentAngle - startAngle);
    if (e.shiftKey) {
      // Shift held: snap to nearest 15-degree increment
      newRot = Math.round(newRot / 15) * 15;
    } else {
      // Snap to 0/90/180/270 when within 2 degrees
      const snap = [0, 90, 180, 270, -90, -180, -270, 360];
      for (const s of snap) {
        if (Math.abs(newRot - s) < 2) { newRot = s; break; }
      }
    }
    onRotationChange(newRot);
  }, [onRotationChange]);

  const onRotateUp = useCallback((e: React.PointerEvent) => {
    if (!rotatingRef.current) return;
    rotatingRef.current = false;
    setRotating(false);
    setInteracting(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    // Normalize accumulated rotation to (-180, 180] before committing
    const normalized = ((((rot % 360) + 360) % 360) > 180)
      ? ((rot % 360) + 360) % 360 - 360
      : ((rot % 360) + 360) % 360;
    onRotationChange(Math.round(normalized * 100) / 100);
    onRotationCommit();
  }, [rot, onRotationChange, onRotationCommit]);

  // ── Corner radius handlers ──────────────────────────────────────────
  const maxRadius = Math.min(frameW, frameH) / 2;
  const clampedRadius = Math.min(borderRadius, maxRadius);
  const showRadiusHandles = shapeType === 'rectangle' && onBorderRadiusChange && !editing;
  // Show when hovered or when radius > 0 (and radius hasn't maxed out to circle)
  const radiusHandlesVisible = showRadiusHandles && selected && (hovered || borderRadius > 0);

  const onRadiusDown = useCallback((e: React.PointerEvent, corner: string) => {
    if (locked || !onBorderRadiusChange) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    radiusDragRef.current = true;
    setRadiusDragging(true);
    setInteracting(true);
    radiusStart.current = { startRadius: borderRadius, startMouse: corner === 'tl' || corner === 'bl' ? e.clientX : e.clientX, corner };
  }, [locked, borderRadius, onBorderRadiusChange]);

  const onRadiusMove = useCallback((e: React.PointerEvent) => {
    if (!radiusDragRef.current || !onBorderRadiusChange) return;
    const { startRadius, startMouse, corner } = radiusStart.current;
    // Determine drag direction: dragging toward center increases radius
    // For tl/bl corners, moving right increases; for tr/br, moving left increases
    const isLeft = corner === 'tl' || corner === 'bl';
    const mouseDelta = (e.clientX - startMouse) / zoom;
    const radiusDelta = isLeft ? mouseDelta : -mouseDelta;
    const newRadius = Math.round(Math.max(0, Math.min(maxRadius, startRadius + radiusDelta)));
    onBorderRadiusChange(newRadius);
  }, [onBorderRadiusChange, maxRadius, zoom]);

  const onRadiusUp = useCallback((e: React.PointerEvent) => {
    if (!radiusDragRef.current) return;
    radiusDragRef.current = false;
    setRadiusDragging(false);
    setInteracting(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    onBorderRadiusCommit?.();
  }, [onBorderRadiusCommit]);

  // Compute radius handle position — inset diagonally from each corner
  const RADIUS_HANDLE_SIZE = 6;
  const radiusPad = s(SQ / 2 + 10); // clear of corner square handle + gap
  const getRadiusHandleStyle = (corner: string): React.CSSProperties => {
    const radiusOffset = Math.max(clampedRadius * scale, 0) + radiusPad;
    const center = s(-RADIUS_HANDLE_SIZE / 2);
    switch (corner) {
      case 'tl': return { top: radiusPad + center, left: radiusOffset + center };
      case 'tr': return { top: radiusPad + center, right: radiusOffset + center };
      case 'bl': return { bottom: radiusPad + center, left: radiusOffset + center };
      case 'br': return { bottom: radiusPad + center, right: radiusOffset + center };
      default: return {};
    }
  };

  // ── Edge resize handlers ────────────────────────────────────────────
  const showEdgeHandles = onEdgeResize && selected && !editing;

  const onEdgeDown = useCallback((e: React.PointerEvent, edge: 'top' | 'right' | 'bottom' | 'left') => {
    if (locked || !onEdgeResize) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const isVertical = edge === 'top' || edge === 'bottom';
    edgeResizeRef.current = {
      edge,
      startMouse: isVertical ? e.clientY : e.clientX,
      startDim: isVertical ? frameH : frameW,
    };
    setEdgeResizing(true);
    setInteracting(true);
    onEdgeResizeStart?.();
  }, [locked, onEdgeResize, onEdgeResizeStart, frameW, frameH]);

  const onEdgeMove = useCallback((e: React.PointerEvent) => {
    if (!edgeResizeRef.current || !onEdgeResize) return;
    const { edge, startMouse } = edgeResizeRef.current;
    const isVertical = edge === 'top' || edge === 'bottom';
    const currentMouse = isVertical ? e.clientY : e.clientX;
    let delta = (currentMouse - startMouse) / zoom;
    // For top/left edges, movement is inverted
    if (edge === 'top' || edge === 'left') delta = -delta;
    onEdgeResize(edge, Math.round(delta));
  }, [onEdgeResize, zoom]);

  const onEdgeUp = useCallback((e: React.PointerEvent) => {
    if (!edgeResizeRef.current) return;
    edgeResizeRef.current = null;
    setEdgeResizing(false);
    setInteracting(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    onEdgeResizeCommit?.();
  }, [onEdgeResizeCommit]);

  const getEdgeStyle = (edge: 'top' | 'right' | 'bottom' | 'left'): React.CSSProperties => {
    const thickness = s(6);
    const inset = s(SQ / 2 + 2); // avoid overlapping corner handles
    switch (edge) {
      case 'top': return { top: -thickness / 2, left: inset, right: inset, height: thickness };
      case 'bottom': return { bottom: -thickness / 2, left: inset, right: inset, height: thickness };
      case 'left': return { left: -thickness / 2, top: inset, bottom: inset, width: thickness };
      case 'right': return { right: -thickness / 2, top: inset, bottom: inset, width: thickness };
      default: return {};
    }
  };

  // ── Hover ──────────────────────────────────────────────────────────
  const handleMouseEnter = useCallback(() => {
    setHovered(true);
    onHover(label);
  }, [label, onHover]);

  const handleMouseLeave = useCallback(() => {
    setHovered(false);
    onHover(null);
  }, [onHover]);

  const showUI = selected || hovered;

  // Determine tooltip text
  const getTooltipText = () => {
    if (rotating) return `${Math.round(rot)}°`;
    if (radiusDragging) return `Radius ${Math.round(clampedRadius)}`;
    return `${frameW} × ${frameH}`;
  };

  return (
    <>
      {/* Visual layer */}
      <div
        ref={visualRef}
        style={{
          position: 'absolute',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          left: x,
          top: y,
          width: w,
          height: h,
          transform: `translate(-50%, -50%) rotate(${rot}deg)`,
          pointerEvents: 'none',
          zIndex: z,
          opacity,
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: scale * 0.93 }}
          animate={{ opacity: 1, scale }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          style={{ transformOrigin: 'center' }}
        >
          <div ref={contentRef} style={{
            width: 'fit-content', height: 'fit-content',
            pointerEvents: editing ? 'auto' : 'none',
            transform: (flipX || flipY) ? `scale(${flipX ? -1 : 1}, ${flipY ? -1 : 1})` : undefined,
          }}>
            {children}
          </div>
        </motion.div>
      </div>

      {/* Hit target */}
      <div
        style={{
          position: 'absolute',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          left: x,
          top: y,
          width: w,
          height: h,
          transform: `translate(-50%, -50%) rotate(${rot}deg)`,
          cursor: locked ? 'default' : dragging.current ? 'grabbing' : 'grab',
          pointerEvents: editing ? 'none' : 'auto',
          zIndex: z,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick ? (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); onDoubleClick(); } : undefined}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Selection / hover frame — tightly wraps the content */}
        <AnimatePresence>
          {showUI && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{
                position: 'absolute',
                width: frameW,
                height: frameH,
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
              }}
            >
              <div style={{
                width: '100%',
                height: '100%',
                boxSizing: 'border-box',
                border: selected
                  ? `${s(2)}px solid #4C9EEB`
                  : `${s(1.5)}px dashed rgba(59,130,246,0.3)`,
                transition: 'border 0.15s',
              }} />

              {/* Rotation zones — invisible areas outside each corner */}
              {selected && !editing && ROTATION_ZONES.map(zone => (
                <div
                  key={zone.key}
                  style={{
                    position: 'absolute',
                    ...zone.style(s),
                    width: s(ROTATION_SIZE),
                    height: s(ROTATION_SIZE),
                    cursor: ROTATE_CURSOR,
                    pointerEvents: 'auto',
                  }}
                  onPointerDown={onRotateDown}
                  onPointerMove={onRotateMove}
                  onPointerUp={onRotateUp}
                />
              ))}

              {/* Edge resize hit zones */}
              {showEdgeHandles && EDGE_HANDLES.map(({ key, edge, cursor }) => (
                <div
                  key={key}
                  style={{
                    position: 'absolute',
                    ...getEdgeStyle(edge),
                    cursor,
                    pointerEvents: 'auto',
                  }}
                  onPointerDown={(e) => onEdgeDown(e, edge)}
                  onPointerMove={onEdgeMove}
                  onPointerUp={onEdgeUp}
                />
              ))}

              {/* Corner square handles */}
              {selected && !editing && CORNER_HANDLES.map((corner, i) => (
                <motion.div
                  key={corner.key}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 25, delay: i * 0.02 }}
                  style={{
                    position: 'absolute',
                    ...corner.style(s),
                    width: s(SQ),
                    height: s(SQ),
                    borderRadius: s(1),
                    border: `${s(1.5)}px solid #4C9EEB`,
                    background: 'white',
                    cursor: corner.cursor,
                    pointerEvents: 'auto',
                  }}
                  onPointerDown={onResizeDown}
                  onPointerMove={onResizeMove}
                  onPointerUp={onResizeUp}
                />
              ))}

              {/* Corner radius handles */}
              {radiusHandlesVisible && RADIUS_CORNERS.map(({ key, corner }, i) => (
                <motion.div
                  key={key}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 25, delay: i * 0.015 }}
                  style={{
                    position: 'absolute',
                    ...getRadiusHandleStyle(corner),
                    width: s(6),
                    height: s(6),
                    borderRadius: '50%',
                    border: `${s(1.5)}px solid #4C9EEB`,
                    background: borderRadius > 0 ? 'white' : 'rgba(76, 158, 235, 0.15)',
                    cursor: corner === 'tl' || corner === 'bl' ? 'ew-resize' : 'ew-resize',
                    pointerEvents: 'auto',
                    transition: 'background 0.15s',
                  }}
                  onPointerDown={(e) => onRadiusDown(e, corner)}
                  onPointerMove={onRadiusMove}
                  onPointerUp={onRadiusUp}
                />
              ))}

              {/* Lock badge */}
              {locked && selected && (
                <div style={{
                  position: 'absolute',
                  top: s(-10),
                  right: s(-10),
                  width: s(18),
                  height: s(18),
                  borderRadius: s(5),
                  background: '#f59e0b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: `0 ${s(1)}px ${s(3)}px rgba(0,0,0,0.15)`,
                }}>
                  <LockIcon size={s(10)} strokeWidth={2.5} color="white" />
                </div>
              )}

              {/* Dimension / rotation / radius label — only during interaction */}
              {interacting && <div style={{
                position: 'absolute',
                left: '50%',
                top: radiusDragging ? 'auto' : '100%',
                bottom: radiusDragging ? '100%' : 'auto',
                transform: 'translateX(-50%)',
                marginTop: radiusDragging ? 0 : s(8),
                marginBottom: radiusDragging ? s(8) : 0,
                background: '#4C9EEB',
                color: 'white',
                fontSize: s(11),
                fontWeight: 500,
                fontFamily: "'Geist', ui-monospace, SFMono-Regular, Menlo, monospace",
                padding: `${s(2)}px ${s(6)}px`,
                borderRadius: s(4),
                whiteSpace: 'nowrap',
                lineHeight: 1.4,
              }}>
                {getTooltipText()}
              </div>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
});
