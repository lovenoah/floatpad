import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { NudgeCanvas, DEFAULT_SETTINGS, type ToolMode } from './canvas/canvas';
import { Toolbar } from './canvas/toolbar';
import { DEMO_ITEMS, DEMO_RENDERERS } from './demo/demo-items';
import { FRAME_CATEGORIES } from './canvas/frame-presets';
import { X } from 'lucide-react';
import { ColorPickerPopover } from './canvas/color-picker';
import type { NudgeSettings, ExportFormat } from './canvas/types';
import {
  FONT, C_ACCENT,
  C_HEADING, C_VALUE, C_ICON, C_MUTED,
  C_HOVER, C_INPUT_BG, C_INPUT_BG_ACTIVE, C_INPUT_BORDER_FOCUS,
  C_DIVIDER, C_BORDER_SUBTLE, C_BORDER_CARD, C_CARD_BG,
  C_ACCENT_BG, C_ACCENT_TEXT,
  C_SURFACE_MODAL, C_SCROLLBAR, OVERLAY_BG,
  SHADOW_LG,
} from './canvas/tokens';

// ---------------------------------------------------------------------------
// Help sections
// ---------------------------------------------------------------------------

const HELP_SECTIONS = [
  {
    title: 'Canvas',
    items: [
      { keys: 'Drag item', desc: 'Move items around the canvas' },
      { keys: 'Drag empty space', desc: 'Draw a marquee to select multiple items' },
      { keys: 'Space + Drag', desc: 'Pan the canvas' },
      { keys: 'Scroll / Trackpad', desc: 'Pan the canvas' },
      { keys: 'Pinch / \u2318 Scroll', desc: 'Zoom in and out' },
    ],
  },
  {
    title: 'Selection',
    items: [
      { keys: 'Click', desc: 'Select a single item' },
      { keys: '\u21e7 Shift + Click', desc: 'Add or remove from selection' },
      { keys: '\u2318A', desc: 'Select all items' },
      { keys: 'Escape', desc: 'Deselect all' },
      { keys: 'Click empty space', desc: 'Deselect all' },
    ],
  },
  {
    title: 'Transform',
    items: [
      { keys: '\u2190 \u2192 \u2191 \u2193', desc: 'Nudge selected items' },
      { keys: '\u21e7 + Arrow', desc: 'Large nudge' },
      { keys: '\u21e7H', desc: 'Flip horizontal' },
      { keys: '\u21e7V', desc: 'Flip vertical' },
      { keys: '\u21e7 + Rotate', desc: 'Snap rotation to 15\u00b0 increments' },
    ],
  },
  {
    title: 'Layer Order',
    items: [
      { keys: '\u2318]', desc: 'Bring forward' },
      { keys: '\u2318[', desc: 'Send backward' },
      { keys: '\u2318\u2325]', desc: 'Bring to front' },
      { keys: '\u2318\u2325[', desc: 'Send to back' },
    ],
  },
  {
    title: 'Alignment',
    items: [
      { keys: '\u2325A', desc: 'Align left' },
      { keys: '\u2325D', desc: 'Align right' },
      { keys: '\u2325H', desc: 'Align horizontal centers' },
      { keys: '\u2325W', desc: 'Align top' },
      { keys: '\u2325S', desc: 'Align bottom' },
      { keys: '\u2325V', desc: 'Align vertical centers' },
    ],
  },
  {
    title: 'Actions',
    items: [
      { keys: '\u2318G', desc: 'Group selected items' },
      { keys: '\u2318\u21e7G', desc: 'Ungroup' },
      { keys: '\u2318D', desc: 'Duplicate selected items' },
      { keys: '\u2318C / \u2318V', desc: 'Copy and paste items' },
      { keys: '\u232b Delete', desc: 'Remove selected items' },
      { keys: '\u2318Z / \u2318\u21e7Z', desc: 'Undo and redo' },
    ],
  },
  {
    title: 'Zoom',
    items: [
      { keys: '\u2318+ / \u2318\u2212', desc: 'Zoom in / out' },
      { keys: '\u23180', desc: 'Fit all items in view' },
      { keys: '\u23181', desc: 'Reset to 100%' },
    ],
  },
  {
    title: 'Create',
    items: [
      { keys: 'R', desc: 'Rectangle tool \u2014 click and drag' },
      { keys: 'O', desc: 'Ellipse tool \u2014 click and drag' },
      { keys: 'L', desc: 'Line tool \u2014 click and drag' },
      { keys: 'P', desc: 'Pen tool \u2014 click to place points' },
      { keys: 'T', desc: 'Text tool \u2014 click to place' },
      { keys: '\u21e7 + Drag', desc: 'Constrain to square / circle / 45\u00b0' },
      { keys: '\u2325 + Drag handle', desc: 'Break handle symmetry (corner point)' },
      { keys: 'Escape / Enter', desc: 'Finish pen path (open)' },
      { keys: 'Click first point', desc: 'Close pen path (filled)' },
    ],
  },
  {
    title: 'Tools',
    items: [
      { keys: 'G', desc: 'Toggle snap-to-grid' },
      { keys: 'W', desc: 'Toggle window mode (artboard + edge snap)' },
      { keys: 'Tab / \u21e7 Tab', desc: 'Cycle selection forward / backward' },
      { keys: '\u2325 Alt + Hover', desc: 'Measure distance between items' },
      { keys: 'Middle-click drag', desc: 'Pan the canvas from anywhere' },
    ],
  },
  {
    title: 'Input Fields',
    items: [
      { keys: '+10, \u221210, *2, /2', desc: 'Math expressions in any numeric input' },
      { keys: 'Drag label', desc: 'Scrub to adjust values' },
      { keys: '\u21e7 + Drag', desc: 'Scrub in larger increments' },
      { keys: '\u2191 \u2193 in field', desc: 'Step value up or down' },
    ],
  },
  {
    title: 'Multi-select',
    items: [
      { keys: 'Alignment bar', desc: 'Appears below multi-selection bounding box' },
      { keys: 'Hover badge', desc: 'View and manage selected items' },
      { keys: 'Drag rows', desc: 'Reorder z-index by dragging' },
      { keys: 'Double-click label', desc: 'Rename any item inline' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Shared panel components
// ---------------------------------------------------------------------------

const scrollStyle = `
  .panel-scroll { overflow-y: auto; scrollbar-width: none; -ms-overflow-style: none; }
  .panel-scroll::-webkit-scrollbar { display: none; }
`;

function useCustomScrollbar() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [thumbState, setThumbState] = useState({ top: 0, height: 0, visible: false });
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const { scrollTop, scrollHeight, clientHeight, offsetTop } = el;
      if (scrollHeight <= clientHeight) {
        setThumbState(prev => ({ ...prev, visible: false }));
        return;
      }
      const ratio = clientHeight / scrollHeight;
      const thumbH = Math.max(ratio * clientHeight, 24);
      const trackSpace = clientHeight - thumbH;
      const scrollRatio = scrollTop / (scrollHeight - clientHeight);
      setThumbState({ top: offsetTop + scrollRatio * trackSpace, height: thumbH, visible: true });

      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => {
        setThumbState(prev => ({ ...prev, visible: false }));
      }, 1000);
    };

    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', update); ro.disconnect(); clearTimeout(hideTimer.current); };
  }, []);

  const thumb = (
    <AnimatePresence>
      {thumbState.visible && (
        <motion.div
          key="scrollbar"
          initial={{ opacity: 0, scaleX: 0.3 }}
          animate={{ opacity: 1, scaleX: 1 }}
          exit={{ opacity: 0, scaleX: 0.3 }}
          transition={{ type: 'spring', stiffness: 500, damping: 25 }}
          style={{
            position: 'absolute',
            right: 3,
            top: thumbState.top,
            width: 4,
            height: thumbState.height,
            borderRadius: 2,
            background: C_SCROLLBAR,
            transformOrigin: 'right center',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        />
      )}
    </AnimatePresence>
  );

  return { containerRef, thumb };
}

function PanelShell({ title, subtitle, onClose, children }: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { containerRef, thumb } = useCustomScrollbar();

  return (
    <>
      <style>{scrollStyle}</style>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onClick={onClose}
        onWheel={e => e.stopPropagation()}
      >
        <div style={{
          position: 'absolute',
          inset: 0,
          background: OVERLAY_BG,
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }} />
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'relative',
            width: 420,
            maxHeight: 'min(560px, 80vh)',
            borderRadius: 12,
            background: C_SURFACE_MODAL,
            boxShadow: SHADOW_LG,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            fontFamily: FONT,
          }}
        >
          <div style={{
            padding: '16px 20px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: `1px solid ${C_BORDER_SUBTLE}`,
            flexShrink: 0,
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C_HEADING, letterSpacing: '-0.01em' }}>
                {title}
              </div>
              <div style={{ fontSize: 11, color: C_MUTED, marginTop: 2 }}>
                {subtitle}
              </div>
            </div>
            <motion.button
              whileHover={{ background: C_HOVER }}
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              style={{
                width: 28, height: 28, borderRadius: 6,
                border: 'none', background: 'transparent', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: C_MUTED, flexShrink: 0,
              }}
            >
              <X size={14} strokeWidth={1.5} />
            </motion.button>
          </div>
          <div
            ref={containerRef}
            className="panel-scroll"
            style={{
              flex: 1, overflowY: 'auto',
              padding: '8px 16px 20px 16px', marginBottom: 4,
            }}
          >
            {children}
          </div>
          {thumb}
        </motion.div>
      </motion.div>
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 500, color: C_MUTED,
      padding: '0 8px 6px',
    }}>
      {children}
    </div>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      borderRadius: 8, background: C_CARD_BG,
      border: `1px solid ${C_BORDER_CARD}`, overflow: 'hidden',
    }}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Info panel (help / shortcuts)
// ---------------------------------------------------------------------------

function InfoPanel({ onClose }: { onClose: () => void }) {
  return (
    <PanelShell title="Just a Nudge" subtitle="Keyboard shortcuts and features" onClose={onClose}>
      {HELP_SECTIONS.map((section, si) => (
        <div key={si} style={{ marginTop: si === 0 ? 8 : 16 }}>
          <SectionLabel>{section.title}</SectionLabel>
          <SectionCard>
            {section.items.map((item, ii) => (
              <div key={ii} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 12, padding: '8px 12px',
                borderTop: ii > 0 ? `1px solid ${C_BORDER_CARD}` : 'none',
              }}>
                <span style={{ fontSize: 12, color: C_VALUE, fontWeight: 400 }}>
                  {item.desc}
                </span>
                <span style={{
                  fontSize: 11, color: C_ICON, fontFamily: FONT, fontWeight: 500,
                  whiteSpace: 'nowrap', background: C_INPUT_BG, padding: '2px 7px',
                  borderRadius: 5, flexShrink: 0,
                }}>
                  {item.keys}
                </span>
              </div>
            ))}
          </SectionCard>
        </div>
      ))}
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------
// Settings panel
// ---------------------------------------------------------------------------

function SettingRow({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 10px', gap: 12,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: C_VALUE, fontWeight: 400 }}>{label}</div>
        {desc && <div style={{ fontSize: 10, color: C_MUTED, marginTop: 1, fontWeight: 400 }}>{desc}</div>}
      </div>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
        {children}
      </div>
    </div>
  );
}

function NumericSetting({ value, onChange, suffix = 'px', min = 1, max = 200, width = 48 }: {
  value: number; onChange: (v: number) => void; suffix?: string; min?: number; max?: number; width?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  const commit = useCallback(() => {
    setEditing(false);
    const num = parseFloat(draft);
    if (!isNaN(num) && num >= min && num <= max) {
      onChange(Math.round(num * 100) / 100);
    } else {
      setDraft(String(value));
    }
  }, [draft, value, onChange, min, max]);

  return (
    <input
      style={{
        width, padding: '4px 0', borderRadius: 5,
        border: editing ? `1px solid ${C_INPUT_BORDER_FOCUS}` : '1px solid transparent',
        background: editing ? C_INPUT_BG_ACTIVE : C_INPUT_BG, fontSize: 11, fontWeight: 500, fontFamily: FONT,
        color: C_VALUE, textAlign: 'center', outline: 'none',
        transition: 'border-color 0.15s, background 0.15s',
      }}
      value={editing ? draft : `${value}${suffix}`}
      onFocus={(e) => { setEditing(true); setDraft(String(value)); requestAnimationFrame(() => e.target.select()); }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') { setEditing(false); setDraft(String(value)); (e.target as HTMLInputElement).blur(); }
      }}
      spellCheck={false}
    />
  );
}

function PresetButtons({ value, presets, onChange }: { value: number; presets: number[]; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {presets.map(p => (
        <button
          key={p}
          onClick={() => onChange(p)}
          style={{
            padding: '4px 7px', borderRadius: 5, border: 'none',
            background: value === p ? C_ACCENT_BG : C_INPUT_BG,
            color: value === p ? C_ACCENT_TEXT : C_ICON,
            fontSize: 10, fontWeight: 500, fontFamily: FONT,
            cursor: 'pointer', transition: 'background 0.15s, color 0.15s',
          }}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

function ColorSetting({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const swatchRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState({ top: 0, left: 0 });

  const commit = useCallback(() => {
    setEditing(false);
    let v = draft.trim();
    if (!v.startsWith('#')) v = '#' + v;
    if (/^#([0-9a-fA-F]{3}){1,2}$/.test(v)) {
      if (v.length === 4) v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
      onChange(v);
    } else {
      setDraft(value);
    }
  }, [draft, value, onChange]);

  const openPicker = useCallback(() => {
    if (swatchRef.current) {
      const r = swatchRef.current.getBoundingClientRect();
      setAnchor({ top: r.bottom + 6, left: r.left });
    }
    setPickerOpen(true);
  }, []);

  const presets = ['#f8fafc', '#ffffff', '#f1f5f9', '#fafaf9', '#0f172a', '#18181b'];

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div
          ref={swatchRef}
          onClick={openPicker}
          style={{
            width: 22, height: 22, borderRadius: 5, flexShrink: 0,
            background: value, border: '1px solid rgba(0,0,0,0.08)',
            cursor: 'pointer',
          }}
        />
        <input
          style={{
            width: 64, padding: '4px 0', borderRadius: 5,
            border: editing ? `1px solid ${C_INPUT_BORDER_FOCUS}` : '1px solid transparent',
            background: editing ? C_INPUT_BG_ACTIVE : C_INPUT_BG, fontSize: 11, fontWeight: 500, fontFamily: FONT,
            color: C_VALUE, textAlign: 'center', outline: 'none',
            transition: 'border-color 0.15s, background 0.15s',
          }}
          value={editing ? draft : value}
          onFocus={(e) => { setEditing(true); setDraft(value); requestAnimationFrame(() => e.target.select()); }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') { setEditing(false); setDraft(value); (e.target as HTMLInputElement).blur(); }
          }}
          spellCheck={false}
        />
        <div style={{ display: 'flex', gap: 2 }}>
          {presets.map(c => (
            <button
              key={c}
              onClick={() => { onChange(c); setDraft(c); }}
              style={{
                width: 16, height: 16, borderRadius: 4, border: value === c ? `1.5px solid ${C_ACCENT}` : '1px solid rgba(0,0,0,0.08)',
                background: c, cursor: 'pointer', padding: 0, transition: 'border-color 0.15s',
              }}
            />
          ))}
        </div>
      </div>
      <AnimatePresence>
        {pickerOpen && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 1100 }} onClick={() => setPickerOpen(false)} />
            <ColorPickerPopover color={value} onChange={v => { onChange(v); setDraft(v); }} anchor={anchor} />
          </>
        )}
      </AnimatePresence>
    </>
  );
}

const FORMAT_OPTIONS: { value: ExportFormat; label: string }[] = [
  { value: 'raw', label: 'Raw' },
  { value: 'react-style', label: 'React' },
  { value: 'css', label: 'CSS' },
];

function FormatButtons({ value, onChange }: { value: ExportFormat; onChange: (v: ExportFormat) => void }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {FORMAT_OPTIONS.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            padding: '4px 7px', borderRadius: 5, border: 'none',
            background: value === opt.value ? C_ACCENT_BG : C_INPUT_BG,
            color: value === opt.value ? C_ACCENT_TEXT : C_ICON,
            fontSize: 10, fontWeight: 500, fontFamily: FONT,
            cursor: 'pointer', transition: 'background 0.15s, color 0.15s',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Separator() {
  return <div style={{ height: 1, background: C_BORDER_CARD }} />;
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 36, height: 20, borderRadius: 10, border: 'none',
        background: value ? C_ACCENT : C_DIVIDER,
        cursor: 'pointer', position: 'relative',
        transition: 'background 0.2s', flexShrink: 0,
        padding: 0,
      }}
    >
      <div style={{
        position: 'absolute',
        top: 2, left: value ? 18 : 2,
        width: 16, height: 16, borderRadius: 8,
        background: 'white',
        boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
        transition: 'left 0.2s',
      }} />
    </button>
  );
}

// ── Frame presets ──────────────────────────────────────────────────────────

function FramePresetPicker({
  currentW,
  currentH,
  onSelect,
}: {
  currentW: number;
  currentH: number;
  onSelect: (w: number, h: number) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['Desktop', 'Phone']));

  const toggle = (name: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div>
      {FRAME_CATEGORIES.map((cat, ci) => {
        const isOpen = expanded.has(cat.name);
        const hasActive = cat.items.some(p => p.w === currentW && p.h === currentH);
        return (
          <div key={cat.name}>
            {ci > 0 && <div style={{ height: 1, background: C_BORDER_CARD, margin: '0 12px' }} />}
            {/* Category header */}
            <button
              onClick={() => toggle(cat.name)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 12px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span style={{
                fontSize: 10,
                color: isOpen ? C_VALUE : C_ICON,
                transition: 'transform 0.15s',
                display: 'inline-block',
                transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                lineHeight: 1,
              }}>▾</span>
              <span style={{
                fontSize: 12,
                fontWeight: 600,
                color: hasActive && !isOpen ? C_ACCENT_TEXT : C_VALUE,
                fontFamily: FONT,
                flex: 1,
              }}>
                {cat.name}
              </span>
              {hasActive && !isOpen && (
                <span style={{
                  fontSize: 10,
                  color: C_MUTED,
                  fontFamily: FONT,
                }}>
                  {currentW}×{currentH}
                </span>
              )}
            </button>

            {/* Preset rows */}
            {isOpen && cat.items.map((p, pi) => {
              const active = p.w === currentW && p.h === currentH;
              return (
                <button
                  key={pi}
                  onClick={() => onSelect(p.w, p.h)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '7px 12px 7px 28px',
                    background: active ? C_ACCENT_BG : 'none',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = C_CARD_BG; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = active ? C_ACCENT_BG : 'none'; }}
                >
                  <span style={{
                    fontSize: 12,
                    color: active ? C_ACCENT_TEXT : C_VALUE,
                    fontFamily: FONT,
                    fontWeight: active ? 500 : 400,
                  }}>
                    {p.label}
                  </span>
                  <span style={{
                    fontSize: 11,
                    color: active ? C_ACCENT : C_MUTED,
                    fontFamily: FONT,
                    fontWeight: active ? 600 : 400,
                    whiteSpace: 'nowrap',
                  }}>
                    {p.w}×{p.h}
                  </span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function SettingsPanel({ settings, onChange, onClose }: {
  settings: NudgeSettings;
  onChange: (patch: Partial<NudgeSettings>) => void;
  onClose: () => void;
}) {
  return (
    <PanelShell title="Settings" subtitle="Customize canvas behavior" onClose={onClose}>
      {/* Grid & Snapping */}
      <div style={{ marginTop: 8 }}>
        <SectionLabel>Grid & Snapping</SectionLabel>
        <SectionCard>
          <SettingRow label="Grid size" desc="Spacing of the snap grid">
            <NumericSetting value={settings.gridSize} onChange={v => onChange({ gridSize: v })} />
            <PresetButtons value={settings.gridSize} presets={[5, 10, 20]} onChange={v => onChange({ gridSize: v })} />
          </SettingRow>
          <Separator />
          <SettingRow label="Snap distance" desc="How close before guides activate">
            <NumericSetting value={settings.snapThreshold} onChange={v => onChange({ snapThreshold: v })} max={50} />
            <PresetButtons value={settings.snapThreshold} presets={[3, 5, 10]} onChange={v => onChange({ snapThreshold: v })} />
          </SettingRow>
        </SectionCard>
      </div>

      {/* Nudge */}
      <div style={{ marginTop: 16 }}>
        <SectionLabel>Nudge</SectionLabel>
        <SectionCard>
          <SettingRow label="Arrow keys" desc="Small nudge per keypress">
            <NumericSetting value={settings.nudgeSmall} onChange={v => onChange({ nudgeSmall: v })} max={50} />
            <PresetButtons value={settings.nudgeSmall} presets={[1, 2, 5]} onChange={v => onChange({ nudgeSmall: v })} />
          </SettingRow>
          <Separator />
          <SettingRow label="Shift + Arrow" desc="Large nudge per keypress">
            <NumericSetting value={settings.nudgeLarge} onChange={v => onChange({ nudgeLarge: v })} max={100} />
            <PresetButtons value={settings.nudgeLarge} presets={[5, 10, 20]} onChange={v => onChange({ nudgeLarge: v })} />
          </SettingRow>
        </SectionCard>
      </div>

      {/* Duplicate */}
      <div style={{ marginTop: 16 }}>
        <SectionLabel>Duplicate</SectionLabel>
        <SectionCard>
          <SettingRow label="Offset" desc="Distance from original when duplicating">
            <NumericSetting value={settings.duplicateOffset} onChange={v => onChange({ duplicateOffset: v })} max={200} />
            <PresetButtons value={settings.duplicateOffset} presets={[10, 20, 30]} onChange={v => onChange({ duplicateOffset: v })} />
          </SettingRow>
        </SectionCard>
      </div>

      {/* Appearance */}
      <div style={{ marginTop: 16 }}>
        <SectionLabel>Appearance</SectionLabel>
        <SectionCard>
          <SettingRow label="Background">
            <ColorSetting value={settings.bgColor} onChange={v => onChange({ bgColor: v })} />
          </SettingRow>
        </SectionCard>
      </div>

      {/* Window Mode */}
      <div style={{ marginTop: 16 }}>
        <SectionLabel>Window Mode</SectionLabel>
        <SectionCard>
          <SettingRow label="Enabled" desc="Show artboard with edge snapping (W)">
            <Toggle value={settings.windowMode ?? false} onChange={v => onChange({ windowMode: v })} />
          </SettingRow>
          {settings.windowMode && (
            <>
              <Separator />
              {/* W × H row */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                gap: 8,
              }}>
                <span style={{ fontSize: 12, color: C_VALUE, fontWeight: 500 }}>Size</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <NumericSetting
                    value={settings.windowW ?? 390}
                    onChange={v => onChange({ windowW: v })}
                    min={100} max={4000} width={56} suffix="W"
                  />
                  <span style={{ fontSize: 11, color: C_MUTED }}>×</span>
                  <NumericSetting
                    value={settings.windowH ?? 844}
                    onChange={v => onChange({ windowH: v })}
                    min={100} max={4000} width={56} suffix="H"
                  />
                </div>
              </div>
              <Separator />
              {/* Frame presets */}
              <FramePresetPicker
                currentW={settings.windowW ?? 390}
                currentH={settings.windowH ?? 844}
                onSelect={(w, h) => onChange({ windowW: w, windowH: h })}
              />
            </>
          )}
        </SectionCard>
      </div>

      {/* Export */}
      <div style={{ marginTop: 16 }}>
        <SectionLabel>Export</SectionLabel>
        <SectionCard>
          <SettingRow label="Place format" desc="Output format when placing items">
            <FormatButtons value={settings.exportFormat} onChange={v => onChange({ exportFormat: v })} />
          </SettingRow>
        </SectionCard>
      </div>
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const [showInfo, setShowInfo] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [settings, setSettings] = useState<NudgeSettings>({ ...DEFAULT_SETTINGS });
  const toggleInfo = useCallback(() => { setShowInfo(v => !v); setShowSettings(false); }, []);
  const toggleSettings = useCallback(() => { setShowSettings(v => !v); setShowInfo(false); }, []);
  const patchSettings = useCallback((patch: Partial<NudgeSettings>) => {
    setSettings(prev => ({ ...prev, ...patch }));
  }, []);
  const handleSettingsLoaded = useCallback((loaded: Partial<NudgeSettings>) => {
    setSettings(prev => ({ ...prev, ...loaded }));
  }, []);
  const toggleWindowMode = useCallback(() => {
    setSettings(prev => ({ ...prev, windowMode: !prev.windowMode }));
  }, []);

  return (
    <div style={{
      position: 'relative',
      width: '100vw',
      height: '100dvh',
      overflow: 'hidden',
      background: settings.bgColor,
      transition: 'background 0.3s',
    }}>
      <NudgeCanvas
        initialItems={DEMO_ITEMS}
        renderers={DEMO_RENDERERS}
        settings={settings}
        toolMode={toolMode}
        onToolModeChange={setToolMode}
        onInfoClick={toggleInfo}
        onSettingsClick={toggleSettings}
        onSettingsLoaded={handleSettingsLoaded}
        onToggleWindowMode={toggleWindowMode}
        onWindowSettingsChange={patchSettings}
      />

      {/* Toolbar */}
      <Toolbar
        toolMode={toolMode}
        onToolModeChange={setToolMode}
        windowMode={settings.windowMode ?? false}
        onToggleWindowMode={toggleWindowMode}
        onSettingsClick={toggleSettings}
        onInfoClick={toggleInfo}
      />

      {/* Panels */}
      <AnimatePresence>
        {showInfo && <InfoPanel onClose={() => setShowInfo(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {showSettings && (
          <SettingsPanel
            settings={settings}
            onChange={patchSettings}
            onClose={() => setShowSettings(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
