import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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

// Rotation cursor (small curved arrow)
const ROTATE_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23333' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 12a9 9 0 1 1-6.219-8.56'/%3E%3Cpath d='M21 3v5h-5'/%3E%3C/svg%3E") 12 12, crosshair`;

export function CanvasItem({
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
  children,
}: {
  label: string;
  initW: number;
  initH: number;
  state: ItemState;
  zoom: number;
  onDragStart: () => void;
  onDragMove: (dx: number, dy: number) => void;
  onDragEnd: () => void;
  onScaleChange: (scale: number) => void;
  onScaleCommit: () => void;
  onRotationChange: (rot: number) => void;
  onRotationCommit: () => void;
  selected: boolean;
  onSelect: (label: string | null, shiftKey: boolean) => void;
  onHover: (label: string | null) => void;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [rotating, setRotating] = useState(false);
  const dragging = useRef(false);
  const resizing = useRef(false);
  const rotatingRef = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0 });
  const resizeStart = useRef({ scale: 1, dist: 0, cx: 0, cy: 0 });
  const rotateStart = useRef({ startRot: 0, startAngle: 0, cx: 0, cy: 0 });
  const visualRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentSize, setContentSize] = useState<{ w: number; h: number } | null>(null);

  const { x, y, scale, rot, z = 0 } = state;
  const w = Math.round(initW * scale);
  const h = Math.round(initH * scale);

  // Measure the actual content size (unscaled) to tighten the selection frame
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setContentSize({ w: Math.round(width), h: Math.round(height) });
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
    e.preventDefault();
    e.stopPropagation();
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
    onDragMove(dx, dy);
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
    // Snap to 0/90/180/270 when within 2 degrees
    const snap = [0, 90, 180, 270, -90, -180, -270, 360];
    for (const s of snap) {
      if (Math.abs(newRot - s) < 2) { newRot = s; break; }
    }
    onRotationChange(newRot);
  }, [onRotationChange]);

  const onRotateUp = useCallback((e: React.PointerEvent) => {
    if (!rotatingRef.current) return;
    rotatingRef.current = false;
    setRotating(false);
    setInteracting(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    onRotationCommit();
  }, [onRotationCommit]);

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
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: scale * 0.85 }}
          animate={{ opacity: 1, scale }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          style={{ transformOrigin: 'center' }}
        >
          <div ref={contentRef} style={{ width: 'fit-content', height: 'fit-content' }}>
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
          cursor: dragging.current ? 'grabbing' : 'grab',
          pointerEvents: 'auto',
          zIndex: 100,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
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
              {selected && ROTATION_ZONES.map(zone => (
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

              {/* Corner square handles */}
              {selected && CORNER_HANDLES.map((corner, i) => (
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


              {/* Dimension / rotation label — only during interaction */}
              {interacting && <div style={{
                position: 'absolute',
                left: '50%',
                top: '100%',
                transform: 'translateX(-50%)',
                marginTop: s(8),
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
                {rotating ? `${Math.round(rot)}°` : `${frameW} × ${frameH}`}
              </div>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
