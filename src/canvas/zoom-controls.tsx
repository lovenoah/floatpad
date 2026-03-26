import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Minus, Plus, Maximize } from 'lucide-react';
import type { Camera } from './use-camera';
import {
  FONT, C_SURFACE, C_ICON, C_VALUE, C_HOVER,
  C_INPUT_BG_ACTIVE, C_INPUT_BORDER_FOCUS,
  C_DIVIDER, C_ACCENT, C_ACCENT_BG,
  SHADOW_SM, SHADOW_MD,
} from './tokens';

const ZOOM_PRESETS = [25, 50, 75, 100, 150, 200, 400];

export function ZoomControls({
  camera,
  onZoomTo,
  onReset,
  onFit,
}: {
  camera: Camera;
  onZoomTo: (zoom: number) => void;
  onReset: () => void;
  onFit: () => void;
}) {
  const pct = Math.round(camera.zoom * 100);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(pct));
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editing) setDraft(String(pct));
  }, [pct, editing]);

  const commit = useCallback(() => {
    setEditing(false);
    const v = parseInt(draft, 10);
    if (!isNaN(v) && v > 0) {
      onZoomTo(v / 100);
    }
  }, [draft, onZoomTo]);

  const selectPreset = useCallback((preset: number) => {
    onZoomTo(preset / 100);
    setMenuOpen(false);
  }, [onZoomTo]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', handler);
    return () => window.removeEventListener('pointerdown', handler);
  }, [menuOpen]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30, delay: 0.1 }}
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        borderRadius: 8,
        background: C_SURFACE,
        padding: '3px 4px',
        boxShadow: SHADOW_SM,
        fontFamily: FONT,
        zIndex: 500,
        userSelect: 'none',
      }}
      onPointerDown={e => e.stopPropagation()}
    >
      <ZBtn onClick={() => onZoomTo(camera.zoom / 1.25)} title="Zoom out">
        <Minus size={12} strokeWidth={1.5} />
      </ZBtn>

      <div style={{ position: 'relative' }} ref={menuRef}>
        {editing ? (
          <input
            autoFocus
            style={{
              width: 44,
              padding: '3px 0',
              borderRadius: 5,
              border: `1px solid ${C_INPUT_BORDER_FOCUS}`,
              background: C_INPUT_BG_ACTIVE,
              fontSize: 10,
              fontWeight: 600,
              color: C_VALUE,
              textAlign: 'center',
              outline: 'none',
              fontFamily: FONT,
            }}
            value={draft}
            onChange={e => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
            onBlur={commit}
            onKeyDown={e => {
              e.stopPropagation();
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') { setEditing(false); setDraft(String(pct)); }
            }}
            onPointerDown={e => e.stopPropagation()}
          />
        ) : (
          <motion.button
            whileHover={{ background: C_HOVER }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setMenuOpen(v => !v)}
            title="Zoom level"
            style={{
              padding: '3px 6px',
              borderRadius: 5,
              border: 'none',
              background: menuOpen ? C_HOVER : 'transparent',
              fontSize: 10,
              fontWeight: 600,
              color: C_ICON,
              cursor: 'pointer',
              fontFamily: FONT,
              minWidth: 38,
              textAlign: 'center',
            }}
          >
            {pct}%
          </motion.button>
        )}

        {/* Zoom presets dropdown */}
        <AnimatePresence>
          {menuOpen && !editing && (
            <motion.div
              initial={{ opacity: 0, y: 4, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 600, damping: 30 }}
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 8px)',
                left: '50%',
                transform: 'translateX(-50%)',
                background: C_SURFACE,
                borderRadius: 8,
                boxShadow: SHADOW_MD,
                padding: 3,
                minWidth: 88,
                zIndex: 600,
              }}
              onPointerDown={e => e.stopPropagation()}
            >
              {ZOOM_PRESETS.map(preset => {
                const isActive = pct === preset;
                return (
                  <motion.button
                    key={preset}
                    whileHover={{ background: isActive ? undefined : C_HOVER }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => selectPreset(preset)}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '5px 10px',
                      borderRadius: 5,
                      border: 'none',
                      background: isActive ? C_ACCENT_BG : 'transparent',
                      color: isActive ? C_ACCENT : C_VALUE,
                      fontSize: 11,
                      fontWeight: isActive ? 600 : 400,
                      fontFamily: FONT,
                      textAlign: 'right',
                      cursor: 'pointer',
                      transition: 'background 0.1s',
                    }}
                  >
                    {preset}%
                  </motion.button>
                );
              })}

              {/* Custom input option */}
              <div style={{ height: 1, background: C_DIVIDER, margin: '3px 6px' }} />
              <motion.button
                whileHover={{ background: C_HOVER }}
                whileTap={{ scale: 0.97 }}
                onClick={() => { setMenuOpen(false); setEditing(true); }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '5px 10px',
                  borderRadius: 5,
                  border: 'none',
                  background: 'transparent',
                  color: C_ICON,
                  fontSize: 10,
                  fontWeight: 500,
                  fontFamily: FONT,
                  textAlign: 'center',
                  cursor: 'pointer',
                }}
              >
                Custom...
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ZBtn onClick={() => onZoomTo(camera.zoom * 1.25)} title="Zoom in">
        <Plus size={12} strokeWidth={1.5} />
      </ZBtn>

      <Dot />

      <ZBtn onClick={onFit} title="Fit all (Cmd+0)">
        <Maximize size={12} strokeWidth={1.5} />
      </ZBtn>

      <ZBtn onClick={onReset} title="Reset to 100% (Cmd+1)">
        <span style={{ fontSize: 9, fontWeight: 700, color: C_ICON, lineHeight: 1 }}>1:1</span>
      </ZBtn>

      <Dot />
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        padding: '0 4px',
        fontSize: 10,
        fontWeight: 500,
        fontFamily: FONT,
        whiteSpace: 'nowrap',
      }}>
        <span style={{ color: C_ICON }}>{Math.round(-camera.panX / camera.zoom)}</span>
        <span style={{ margin: '0 2px', color: C_DIVIDER }}>,</span>
        <span style={{ color: C_ICON }}>{Math.round(-camera.panY / camera.zoom)}</span>
      </div>
    </motion.div>
  );
}

function ZBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <motion.button
      title={title}
      whileHover={{ background: C_HOVER }}
      whileTap={{ scale: 0.9 }}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 26,
        height: 26,
        borderRadius: 6,
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: C_ICON,
      }}
      onPointerDown={e => e.stopPropagation()}
      onClick={e => { e.stopPropagation(); onClick(); }}
    >
      {children}
    </motion.button>
  );
}

function Dot() {
  return <div style={{ width: 1, height: 16, background: C_DIVIDER, flexShrink: 0, borderRadius: 1 }} />;
}
