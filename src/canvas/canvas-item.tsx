import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { ItemState } from './types';

// Figma-style handles: filled squares at corners, circles at edge midpoints
const SQ = 8; // corner square size
const CI = 7; // midpoint circle size

const CORNER_HANDLES = [
  { key: 'tl', style: (s: (n: number) => number) => ({ top: s(-SQ / 2), left: s(-SQ / 2) }), cursor: 'nwse-resize' },
  { key: 'tr', style: (s: (n: number) => number) => ({ top: s(-SQ / 2), right: s(-SQ / 2) }), cursor: 'nesw-resize' },
  { key: 'bl', style: (s: (n: number) => number) => ({ bottom: s(-SQ / 2), left: s(-SQ / 2) }), cursor: 'nesw-resize' },
  { key: 'br', style: (s: (n: number) => number) => ({ bottom: s(-SQ / 2), right: s(-SQ / 2) }), cursor: 'nwse-resize' },
];

const EDGE_HANDLES = [
  { key: 'top', style: (s: (n: number) => number) => ({ top: s(-CI / 2), left: '50%', marginLeft: s(-CI / 2) }), cursor: 'ns-resize' },
  { key: 'bottom', style: (s: (n: number) => number) => ({ bottom: s(-CI / 2), left: '50%', marginLeft: s(-CI / 2) }), cursor: 'ns-resize' },
  { key: 'left', style: (s: (n: number) => number) => ({ left: s(-CI / 2), top: '50%', marginTop: s(-CI / 2) }), cursor: 'ew-resize' },
  { key: 'right', style: (s: (n: number) => number) => ({ right: s(-CI / 2), top: '50%', marginTop: s(-CI / 2) }), cursor: 'ew-resize' },
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
  const [interacting, setInteracting] = useState(false);
  const dragging = useRef(false);
  const resizing = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0 });
  const resizeStart = useRef({ scale: 1, dist: 0, cx: 0, cy: 0 });
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

              {/* Edge midpoint circle handles */}
              {selected && EDGE_HANDLES.map((edge, i) => (
                <motion.div
                  key={edge.key}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 25, delay: 0.06 + i * 0.02 }}
                  style={{
                    position: 'absolute',
                    ...edge.style(s),
                    width: s(CI),
                    height: s(CI),
                    borderRadius: '50%',
                    border: `${s(1.5)}px solid #4C9EEB`,
                    background: 'white',
                    cursor: edge.cursor,
                    pointerEvents: 'auto',
                  }}
                  onPointerDown={onResizeDown}
                  onPointerMove={onResizeMove}
                  onPointerUp={onResizeUp}
                />
              ))}

              {/* Dimension label — only during drag/resize */}
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
                {frameW} x {frameH}
              </div>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
