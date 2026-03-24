import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FloatpadCanvas, DEFAULT_SETTINGS } from './canvas/canvas';
import { InfoButton, SettingsButton } from './canvas/info-button';
import { DEMO_ITEMS, DEMO_RENDERERS } from './demo/demo-items';
import type { FloatpadSettings } from './canvas/types';

const FONT = "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MONO = "'Geist', ui-monospace, monospace";

// ---------------------------------------------------------------------------
// Help sections
// ---------------------------------------------------------------------------

const HELP_SECTIONS = [
  {
    title: 'Canvas',
    items: [
      { keys: 'Drag item', desc: 'Move items around the canvas' },
      { keys: 'Drag empty space', desc: 'Draw a marquee to select multiple items' },
    ],
  },
  {
    title: 'Selection',
    items: [
      { keys: 'Click', desc: 'Select a single item' },
      { keys: '\u21e7 Shift + Click', desc: 'Add or remove from selection' },
      { keys: '\u2318A', desc: 'Select all items' },
      { keys: 'Click empty space', desc: 'Deselect all' },
    ],
  },
  {
    title: 'Transform',
    items: [
      { keys: '\u2190 \u2192 \u2191 \u2193', desc: 'Nudge selected items' },
      { keys: '\u21e7 + Arrow', desc: 'Large nudge' },
      { keys: 'Control Panel', desc: 'Adjust scale, rotation, and z-index' },
    ],
  },
  {
    title: 'Actions',
    items: [
      { keys: '\u2318D', desc: 'Duplicate selected items' },
      { keys: '\u2318C / \u2318V', desc: 'Copy and paste items' },
      { keys: '\u232b Delete', desc: 'Remove selected items' },
      { keys: '\u2318Z / \u2318\u21e7Z', desc: 'Undo and redo' },
    ],
  },
  {
    title: 'Tools',
    items: [
      { keys: 'G', desc: 'Toggle snap-to-grid' },
      { keys: 'Alignment guides', desc: 'Auto-shown when dragging near edges' },
      { keys: 'Place button', desc: 'Copy position values to clipboard' },
    ],
  },
  {
    title: 'Multi-select Panel',
    items: [
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
            background: 'rgba(0,0,0,0.15)',
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
          background: 'rgba(0,0,0,0.2)',
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
            borderRadius: 20,
            background: 'rgba(255,255,255,0.98)',
            boxShadow: '0 24px 80px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.05)',
            backdropFilter: 'blur(40px)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            fontFamily: FONT,
          }}
        >
          <div style={{
            padding: '20px 24px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(0,0,0,0.05)',
            flexShrink: 0,
          }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#111827', letterSpacing: '-0.01em' }}>
                {title}
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                {subtitle}
              </div>
            </div>
            <motion.button
              whileHover={{ background: '#f3f4f6' }}
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              style={{
                width: 28, height: 28, borderRadius: 8,
                border: 'none', background: 'transparent', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#9ca3af', flexShrink: 0,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M2 2l10 10M12 2L2 12" />
              </svg>
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
      fontSize: 10, fontWeight: 600, color: '#9ca3af',
      textTransform: 'uppercase', letterSpacing: '0.05em',
      padding: '0 8px 6px',
    }}>
      {children}
    </div>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      borderRadius: 12, background: '#f9fafb',
      border: '1px solid rgba(0,0,0,0.04)', overflow: 'hidden',
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
    <PanelShell title="Floatpad" subtitle="Keyboard shortcuts and features" onClose={onClose}>
      {HELP_SECTIONS.map((section, si) => (
        <div key={si} style={{ marginTop: si === 0 ? 8 : 16 }}>
          <SectionLabel>{section.title}</SectionLabel>
          <SectionCard>
            {section.items.map((item, ii) => (
              <div key={ii} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 12, padding: '8px 12px',
                borderTop: ii > 0 ? '1px solid rgba(0,0,0,0.04)' : 'none',
              }}>
                <span style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>
                  {item.desc}
                </span>
                <span style={{
                  fontSize: 11, color: '#6b7280', fontFamily: MONO, fontWeight: 500,
                  whiteSpace: 'nowrap', background: '#fff', padding: '2px 8px',
                  borderRadius: 6, border: '1px solid rgba(0,0,0,0.06)',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)', flexShrink: 0,
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
      padding: '10px 12px', gap: 12,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>{label}</div>
        {desc && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>{desc}</div>}
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
        width, padding: '4px 0', borderRadius: 6,
        border: editing ? '1px solid rgba(59,130,246,0.5)' : '1px solid rgba(0,0,0,0.08)',
        background: '#fff', fontSize: 11, fontWeight: 500, fontFamily: MONO,
        color: '#374151', textAlign: 'center', outline: 'none',
        transition: 'border-color 0.15s',
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
            padding: '4px 8px', borderRadius: 6, border: 'none',
            background: value === p ? '#eff6ff' : '#f4f5f6',
            color: value === p ? '#2563eb' : '#6b7280',
            fontSize: 10, fontWeight: 600, fontFamily: MONO,
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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = useCallback(() => {
    setEditing(false);
    if (/^#([0-9a-fA-F]{3}){1,2}$/.test(draft)) {
      onChange(draft);
    } else {
      setDraft(value);
    }
  }, [draft, value, onChange]);

  const presets = ['#f8fafc', '#ffffff', '#f1f5f9', '#fafaf9', '#0f172a', '#18181b'];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ position: 'relative', width: 22, height: 22, borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.1)', flexShrink: 0 }}>
        <input
          type="color"
          value={value}
          onChange={(e) => { onChange(e.target.value); setDraft(e.target.value); }}
          style={{ position: 'absolute', inset: -4, width: 30, height: 30, cursor: 'pointer', border: 'none', padding: 0 }}
        />
      </div>
      <input
        style={{
          width: 64, padding: '4px 0', borderRadius: 6,
          border: editing ? '1px solid rgba(59,130,246,0.5)' : '1px solid rgba(0,0,0,0.08)',
          background: '#fff', fontSize: 11, fontWeight: 500, fontFamily: MONO,
          color: '#374151', textAlign: 'center', outline: 'none',
          transition: 'border-color 0.15s',
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
              width: 16, height: 16, borderRadius: 4, border: value === c ? '1.5px solid #3b82f6' : '1px solid rgba(0,0,0,0.1)',
              background: c, cursor: 'pointer', padding: 0, transition: 'border-color 0.15s',
            }}
          />
        ))}
      </div>
    </div>
  );
}

function Separator() {
  return <div style={{ height: 1, background: 'rgba(0,0,0,0.04)' }} />;
}

function SettingsPanel({ settings, onChange, onClose }: {
  settings: FloatpadSettings;
  onChange: (patch: Partial<FloatpadSettings>) => void;
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
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const [showInfo, setShowInfo] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [settings, setSettings] = useState<FloatpadSettings>({ ...DEFAULT_SETTINGS });

  const toggleInfo = useCallback(() => { setShowInfo(v => !v); setShowSettings(false); }, []);
  const toggleSettings = useCallback(() => { setShowSettings(v => !v); setShowInfo(false); }, []);
  const patchSettings = useCallback((patch: Partial<FloatpadSettings>) => {
    setSettings(prev => ({ ...prev, ...patch }));
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
      <FloatpadCanvas
        initialItems={DEMO_ITEMS}
        renderers={DEMO_RENDERERS}
        settings={settings}
        onInfoClick={toggleInfo}
        onSettingsClick={toggleSettings}
        onSelectionChange={setHasSelection}
      />

      {/* Standalone buttons (only when no toolbar) */}
      <AnimatePresence>
        {!hasSelection && (
          <motion.div
            key="standalone-buttons"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute',
              bottom: 20, left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <SettingsButton onClick={toggleSettings} />
            <InfoButton onClick={toggleInfo} />
          </motion.div>
        )}
      </AnimatePresence>

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
