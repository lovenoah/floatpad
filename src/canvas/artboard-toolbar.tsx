import { useState, useRef, useCallback, useEffect } from 'react';
import { RotateCcw, LayoutGrid, Pencil, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { FRAME_CATEGORIES } from './frame-presets';
import {
  FONT,
  C_LABEL, C_VALUE, C_ICON, C_MUTED,
  C_SURFACE, C_SURFACE_ELEVATED,
  C_HOVER, C_INPUT_BG, C_INPUT_BORDER_FOCUS,
  C_DIVIDER,
  C_ACCENT, C_ACCENT_BG, C_ACCENT_TEXT,
  SHADOW_SM, SHADOW_MD,
  R_SM, R_MD,
} from './tokens';

// Screen-space gap between toolbar bottom and artboard top edge (px)
const GAP = 24;

// ── Shared sub-components ──────────────────────────────────────────────────

function NumField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  const commit = useCallback(() => {
    setEditing(false);
    const n = Math.round(parseFloat(draft));
    if (!isNaN(n) && n >= 1 && n <= 8000) onChange(n);
  }, [draft, onChange]);

  return (
    <input
      style={{
        width: 50,
        borderRadius: R_SM,
        background: editing ? '#fff' : C_INPUT_BG,
        border: `1px solid ${editing ? C_INPUT_BORDER_FOCUS : 'transparent'}`,
        color: C_VALUE,
        fontSize: 11,
        fontWeight: 500,
        fontFamily: FONT,
        textAlign: 'center',
        outline: 'none',
        padding: '5px 0',
        cursor: 'text',
        transition: 'border-color 0.15s, background 0.15s',
      }}
      value={editing ? draft : String(value)}
      onFocus={() => { setEditing(true); setDraft(String(value)); }}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') { setEditing(false); (e.target as HTMLInputElement).blur(); }
        e.stopPropagation();
      }}
      onPointerDown={e => e.stopPropagation()}
      onClick={e => { e.stopPropagation(); (e.target as HTMLInputElement).select(); }}
    />
  );
}

function Divider() {
  return <div style={{ width: 1, height: 16, background: C_DIVIDER, flexShrink: 0, borderRadius: 1 }} />;
}

// ── Preset picker popup ────────────────────────────────────────────────────

function PresetPicker({
  currentW,
  currentH,
  onSelect,
  onClose,
}: {
  currentW: number;
  currentH: number;
  onSelect: (w: number, h: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    for (const cat of FRAME_CATEGORIES) {
      if (cat.items.some(p => p.w === currentW && p.h === currentH)) {
        return new Set([cat.name]);
      }
    }
    return new Set(['Desktop', 'Phone']);
  });

  useEffect(() => {
    function onDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [onClose]);

  const toggle = useCallback((name: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }, []);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 4, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 500, damping: 32 }}
      style={{
        position: 'absolute',
        // Open downward — viewport overflow:hidden clips upward popups
        top: 'calc(100% + 6px)',
        left: 0,
        width: 240,
        maxHeight: 320,
        overflowY: 'auto',
        background: C_SURFACE_ELEVATED,
        borderRadius: R_MD,
        boxShadow: SHADOW_MD,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        zIndex: 100,
        scrollbarWidth: 'none',
      }}
      onPointerDown={e => e.stopPropagation()}
    >
      {FRAME_CATEGORIES.map((cat, ci) => {
        const isOpen = expanded.has(cat.name);
        const hasActive = cat.items.some(p => p.w === currentW && p.h === currentH);
        return (
          <div key={cat.name}>
            {ci > 0 && <div style={{ height: 1, background: 'rgba(0,0,0,0.05)', margin: '0 10px' }} />}
            <button
              onClick={() => toggle(cat.name)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 10px',
                background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
              }}
            >
              <span style={{
                fontSize: 9, color: isOpen ? C_VALUE : C_MUTED,
                display: 'inline-block',
                transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                transition: 'transform 0.15s',
                lineHeight: 1,
              }}>▾</span>
              <span style={{
                fontSize: 11, fontWeight: 600,
                color: hasActive && !isOpen ? C_ACCENT_TEXT : C_VALUE,
                fontFamily: FONT, flex: 1,
              }}>
                {cat.name}
              </span>
              {hasActive && !isOpen && (
                <span style={{ fontSize: 10, color: C_MUTED, fontFamily: FONT }}>
                  {currentW}×{currentH}
                </span>
              )}
            </button>
            {isOpen && cat.items.map((p, pi) => {
              const active = p.w === currentW && p.h === currentH;
              return (
                <button
                  key={pi}
                  onClick={() => { onSelect(p.w, p.h); onClose(); }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px 6px 24px',
                    background: active ? C_ACCENT_BG : 'none',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget).style.background = C_HOVER; }}
                  onMouseLeave={e => { (e.currentTarget).style.background = active ? C_ACCENT_BG : 'none'; }}
                >
                  <span style={{
                    fontSize: 11, color: active ? C_ACCENT_TEXT : C_VALUE,
                    fontFamily: FONT, fontWeight: active ? 500 : 400,
                  }}>
                    {p.label}
                  </span>
                  <span style={{
                    fontSize: 10, color: active ? C_ACCENT : C_MUTED,
                    fontFamily: FONT, marginLeft: 8, flexShrink: 0,
                  }}>
                    {p.w}×{p.h}
                  </span>
                </button>
              );
            })}
          </div>
        );
      })}
    </motion.div>
  );
}

// ── Toolbar pill shell (shared between collapsed/expanded) ─────────────────

const pillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  background: C_SURFACE,
  borderRadius: R_MD,
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  boxShadow: SHADOW_SM,
  padding: '3px 4px',
  fontFamily: FONT,
  gap: 2,
  whiteSpace: 'nowrap',
};

function IBtn({
  onClick, title, active = false, children,
}: {
  onClick: (e: React.MouseEvent) => void;
  title: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      whileHover={{ background: active ? 'rgba(59,130,246,0.15)' : C_HOVER }}
      whileTap={{ scale: 0.88 }}
      onClick={onClick}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 26, height: 26, borderRadius: R_SM,
        background: active ? 'rgba(59,130,246,0.1)' : 'transparent',
        border: 'none', cursor: 'pointer',
        color: active ? C_ACCENT : C_ICON,
        flexShrink: 0,
      }}
      onPointerDown={e => e.stopPropagation()}
    >
      {children}
    </motion.button>
  );
}

// ── Main toolbar ───────────────────────────────────────────────────────────

export function ArtboardToolbar({
  w, h, bg, zoom,
  onChangeW, onChangeH, onChangeBg,
}: {
  w: number;
  h: number;
  bg: string;
  zoom: number;
  onChangeW: (v: number) => void;
  onChangeH: (v: number) => void;
  onChangeBg: (v: string) => void;
}) {
  const colorRef = useRef<HTMLInputElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showPresets, setShowPresets] = useState(false);

  const swapOrientation = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onChangeW(h);
    onChangeH(w);
  }, [w, h, onChangeW, onChangeH]);

  const handlePresetSelect = useCallback((pw: number, ph: number) => {
    onChangeW(pw);
    onChangeH(ph);
    setShowPresets(false);
    setIsExpanded(false); // collapse after locking in a preset
  }, [onChangeW, onChangeH]);

  const collapse = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(false);
    setShowPresets(false);
  }, []);

  // IMPORTANT: outer div uses a plain transform string — NOT motion.div.
  // motion.div merges its animated transforms with style.transform, which
  // overrides the scale(1/zoom) counter-scale and makes the toolbar tiny.
  return (
    <div
      style={{
        position: 'absolute',
        left: -w / 2,
        top: -h / 2 - (GAP / zoom),
        transform: `translateY(-100%) scale(${1 / zoom})`,
        transformOrigin: 'top left',
        pointerEvents: 'auto',
        userSelect: 'none',
      }}
      onPointerDown={e => e.stopPropagation()}
    >
      <AnimatePresence mode="wait" initial={false}>
        {!isExpanded ? (
          // ── Collapsed pill ──────────────────────────────────────────────
          <motion.div
            key="collapsed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            style={{ ...pillStyle, cursor: 'pointer', padding: '5px 8px 5px 10px' }}
            onClick={() => setIsExpanded(true)}
            onPointerDown={e => e.stopPropagation()}
          >
            <span style={{ fontSize: 10, color: C_LABEL, fontWeight: 500, marginRight: 2 }}>W</span>
            <span style={{ fontSize: 11, color: C_VALUE, fontWeight: 600 }}>{w}</span>
            <span style={{ fontSize: 11, color: C_DIVIDER, margin: '0 5px', lineHeight: 1 }}>·</span>
            <span style={{ fontSize: 10, color: C_LABEL, fontWeight: 500, marginRight: 2 }}>H</span>
            <span style={{ fontSize: 11, color: C_VALUE, fontWeight: 600 }}>{h}</span>
            <Pencil size={10} color={C_LABEL} style={{ marginLeft: 4 }} strokeWidth={2} />
          </motion.div>
        ) : (
          // ── Expanded toolbar ────────────────────────────────────────────
          <motion.div
            key="expanded"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            style={pillStyle}
          >
            {/* Preset picker toggle */}
            <IBtn
              onClick={e => { e.stopPropagation(); setShowPresets(v => !v); }}
              title="Frame presets"
              active={showPresets}
            >
              <LayoutGrid size={12} strokeWidth={1.5} />
            </IBtn>

            <Divider />

            {/* W field */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '0 4px 0 2px' }}>
              <span style={{ fontSize: 10, color: C_LABEL, fontWeight: 500 }}>W</span>
              <NumField value={w} onChange={onChangeW} />
            </div>

            <Divider />

            {/* H field */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '0 4px' }}>
              <span style={{ fontSize: 10, color: C_LABEL, fontWeight: 500 }}>H</span>
              <NumField value={h} onChange={onChangeH} />
            </div>

            <Divider />

            {/* Swap orientation */}
            <IBtn onClick={swapOrientation} title="Swap orientation">
              <RotateCcw size={12} strokeWidth={1.5} />
            </IBtn>

            <Divider />

            {/* Background color */}
            <motion.div
              whileHover={{ background: C_HOVER }}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '0 6px 0 4px', cursor: 'pointer',
                borderRadius: R_SM, height: 26,
              }}
              onClick={e => { e.stopPropagation(); colorRef.current?.click(); }}
              onPointerDown={e => e.stopPropagation()}
            >
              <div style={{
                width: 13, height: 13, borderRadius: 3,
                background: bg,
                boxShadow: '0 0 0 1px rgba(0,0,0,0.12)',
                flexShrink: 0, position: 'relative', overflow: 'hidden',
              }}>
                <input
                  ref={colorRef}
                  type="color"
                  value={bg.startsWith('#') ? bg : '#ffffff'}
                  onChange={e => onChangeBg(e.target.value)}
                  onPointerDown={e => e.stopPropagation()}
                  style={{
                    position: 'absolute', inset: -4, width: 24, height: 24,
                    opacity: 0, cursor: 'pointer', border: 'none', padding: 0,
                  }}
                />
              </div>
              <span style={{ fontSize: 10, fontFamily: FONT, color: C_ICON, fontWeight: 600, letterSpacing: '0.02em' }}>
                {bg.toUpperCase()}
              </span>
            </motion.div>

            <Divider />

            {/* Collapse button */}
            <IBtn onClick={collapse} title="Collapse">
              <X size={11} strokeWidth={2} />
            </IBtn>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preset picker — opens upward (away from artboard) */}
      <AnimatePresence>
        {showPresets && isExpanded && (
          <PresetPicker
            currentW={w}
            currentH={h}
            onSelect={handlePresetSelect}
            onClose={() => setShowPresets(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
