import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { Camera } from './use-camera';

const FONT = "'Geist', ui-monospace, SFMono-Regular, Menlo, monospace";

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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(pct));

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
        borderRadius: 10,
        background: 'rgba(255,255,255,0.92)',
        padding: '3px 4px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.05)',
        backdropFilter: 'blur(20px)',
        fontFamily: FONT,
        zIndex: 500,
        userSelect: 'none',
      }}
      onPointerDown={e => e.stopPropagation()}
    >
      <ZBtn onClick={() => onZoomTo(camera.zoom / 1.25)} title="Zoom out">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="3" y1="6" x2="9" y2="6" /></svg>
      </ZBtn>

      {editing ? (
        <input
          autoFocus
          style={{
            width: 44,
            padding: '3px 0',
            borderRadius: 5,
            border: '1px solid rgba(59,130,246,0.4)',
            background: '#fff',
            fontSize: 10,
            fontWeight: 600,
            color: '#374151',
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
          whileHover={{ background: '#f3f4f6' }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setEditing(true)}
          title="Click to type exact zoom"
          style={{
            padding: '3px 6px',
            borderRadius: 5,
            border: 'none',
            background: 'transparent',
            fontSize: 10,
            fontWeight: 600,
            color: '#6b7280',
            cursor: 'pointer',
            fontFamily: FONT,
            minWidth: 38,
            textAlign: 'center',
          }}
        >
          {pct}%
        </motion.button>
      )}

      <ZBtn onClick={() => onZoomTo(camera.zoom * 1.25)} title="Zoom in">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="6" y1="3" x2="6" y2="9" /><line x1="3" y1="6" x2="9" y2="6" /></svg>
      </ZBtn>

      <Dot />

      <ZBtn onClick={onFit} title="Fit all (Cmd+0)">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 4V1.5a.5.5 0 01.5-.5H4M8 1h2.5a.5.5 0 01.5.5V4M11 8v2.5a.5.5 0 01-.5.5H8M4 11H1.5a.5.5 0 01-.5-.5V8" />
        </svg>
      </ZBtn>

      <ZBtn onClick={onReset} title="Reset to 100% (Cmd+1)">
        <span style={{ fontSize: 9, fontWeight: 700, color: '#6b7280', lineHeight: 1 }}>1:1</span>
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
        <span style={{ color: '#6b7280' }}>{Math.round(-camera.panX / camera.zoom)}</span>
        <span style={{ margin: '0 2px', color: '#d1d5db' }}>,</span>
        <span style={{ color: '#6b7280' }}>{Math.round(-camera.panY / camera.zoom)}</span>
      </div>
    </motion.div>
  );
}

function ZBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <motion.button
      title={title}
      whileHover={{ background: '#f3f4f6' }}
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
        color: '#6b7280',
      }}
      onPointerDown={e => e.stopPropagation()}
      onClick={e => { e.stopPropagation(); onClick(); }}
    >
      {children}
    </motion.button>
  );
}

function Dot() {
  return <div style={{ width: 1, height: 16, background: '#e5e7eb', flexShrink: 0, borderRadius: 1 }} />;
}
