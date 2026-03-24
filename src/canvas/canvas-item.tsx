import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { ItemState } from './types';

// Corner positions for resize handles
const CORNERS = [
  { key: 'tl', style: (s: (n: number) => number) => ({ top: s(-5), left: s(-5) }), cursor: 'nwse-resize' },
  { key: 'tr', style: (s: (n: number) => number) => ({ top: s(-5), right: s(-5) }), cursor: 'nesw-resize' },
  { key: 'bl', style: (s: (n: number) => number) => ({ bottom: s(-5), left: s(-5) }), cursor: 'nesw-resize' },
  { key: 'br', style: (s: (n: number) => number) => ({ bottom: s(-5), right: s(-5) }), cursor: 'nwse-resize' },
];

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
  selected: boolean;
  onSelect: (label: string | null, shiftKey: boolean) => void;
  onHover: (label: string | null) => void;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const dragging = useRef(false);
  const resizing = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0 });
  const resizeStart = useRef({ scale: 1, dist: 0, cx: 0, cy: 0 });
  const visualRef = useRef<HTMLDivElement>(null);

  const { x, y, scale, rot, z = 0 } = state;
  const w = Math.round(initW * scale);
  const h = Math.round(initH * scale);

  // Screen-constant size helper: keeps UI chrome at fixed screen pixels
  const s = useCallback((px: number) => px / zoom, [zoom]);

  // ── Drag handlers ──────────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (resizing.current) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragging.current = true;
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
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    onDragEnd();
  }, [onDragEnd]);

  // ── Resize handlers ────────────────────────────────────────────────
  const onResizeDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    resizing.current = true;

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
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    onScaleCommit();
  }, [onScaleCommit]);

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
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}
        >
          {children}
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
        {/* Selection / hover frame */}
        <AnimatePresence>
          {showUI && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{ position: 'absolute', inset: s(-4), pointerEvents: 'none' }}
            >
              <div style={{
                width: '100%',
                height: '100%',
                borderRadius: s(8),
                border: selected
                  ? `${s(1.5)}px solid rgba(59,130,246,0.8)`
                  : `${s(1.5)}px dashed rgba(59,130,246,0.35)`,
                background: selected ? 'rgba(59,130,246,0.03)' : 'transparent',
                transition: 'border 0.15s, background 0.15s',
              }} />

              {/* Corner resize handles */}
              {selected && CORNERS.map((corner, i) => (
                <motion.div
                  key={corner.key}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 25, delay: i * 0.02 }}
                  style={{
                    position: 'absolute',
                    ...corner.style(s),
                    width: s(10),
                    height: s(10),
                    borderRadius: '50%',
                    border: `${s(1.5)}px solid #3b82f6`,
                    background: 'white',
                    boxShadow: `0 ${s(1)}px ${s(2)}px rgba(0,0,0,0.1)`,
                    cursor: corner.cursor,
                    pointerEvents: 'auto',
                  }}
                  onPointerDown={onResizeDown}
                  onPointerMove={onResizeMove}
                  onPointerUp={onResizeUp}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
