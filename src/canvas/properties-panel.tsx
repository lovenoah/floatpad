import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus, X, Square, Circle, PenTool, Layers, GripVertical,
  Lock, Unlock, Copy, Trash2,
  RotateCcw, RotateCw, Minus,
  ArrowDown, ArrowUp, Type,
  Link, Unlink,
  FlipHorizontal2, FlipVertical2,
} from 'lucide-react';
import { ColorPickerPopover, FillPickerPopover, gradientToCss } from './color-picker';
import { StepButton } from './step-button';
import { InfoButton, SettingsButton } from './info-button';
import { getChildren } from './group-utils';
import type { ItemDef, ItemState, Fill, StrokeDef, ShadowDef } from './types';
import {
  FONT, C_LABEL, C_VALUE, C_ICON, C_MUTED,
  C_INPUT_BG, C_INPUT_BG_ACTIVE, C_INPUT_BORDER_FOCUS, C_DIVIDER,
  C_ACCENT,
  SHADOW_MD, R_SM, R_MD, R_XL,
} from './tokens';

// ── Generic inputs ────────────────────────────────────────────────

function NumericField({ label, value, onChange, suffix = '', width, mixed, min, max, step = 1 }: {
  label?: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  width?: number;
  mixed?: boolean;
  min?: number;
  max?: number;
  step?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const display = mixed ? '\u2014' : (suffix ? `${value}${suffix}` : String(value));
  const inputRef = useRef<HTMLInputElement>(null);
  const scrubRef = useRef<{ startX: number; startVal: number; active: boolean } | null>(null);

  useEffect(() => { if (!editing) setDraft(display); }, [display, editing]);

  const clamp = useCallback((v: number) => {
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    return Math.round(v * 100) / 100;
  }, [min, max]);

  const commit = useCallback(() => {
    setEditing(false);
    const trimmed = draft.trim();
    // Math expression: starts with +, -, *, /
    const exprMatch = trimmed.match(/^([+\-*/])(.+)$/);
    if (exprMatch) {
      const [, op, rest] = exprMatch;
      const operand = parseFloat(rest.replace(/[^0-9.\-]/g, ''));
      if (!isNaN(operand)) {
        let result = value;
        if (op === '+') result = value + operand;
        else if (op === '-') result = value - operand;
        else if (op === '*') result = value * operand;
        else if (op === '/' && operand !== 0) result = value / operand;
        onChange(clamp(result));
        return;
      }
    }
    const num = parseFloat(trimmed.replace(/[^0-9.\-]/g, ''));
    if (!isNaN(num)) onChange(clamp(num));
  }, [draft, value, onChange, clamp]);

  // ── Scrub handlers ──────────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    if (editing) return; // already in text-edit mode
    e.preventDefault(); // prevent default focus
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    scrubRef.current = { startX: e.clientX, startVal: value, active: false };
  }, [editing, value]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!scrubRef.current) return;
    const dx = e.clientX - scrubRef.current.startX;
    if (!scrubRef.current.active && Math.abs(dx) < 3) return;
    scrubRef.current.active = true;
    const sensitivity = e.shiftKey ? step * 10 : step;
    onChange(clamp(scrubRef.current.startVal + dx * sensitivity));
  }, [onChange, clamp, step]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!scrubRef.current) return;
    const wasScrubbing = scrubRef.current.active;
    scrubRef.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    if (!wasScrubbing) inputRef.current?.focus(); // click without drag → text edit
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: width ? undefined : 1 }}>
      {label && (
        <span style={{ fontSize: 10, fontWeight: 500, color: C_LABEL, fontFamily: FONT, userSelect: 'none', flexShrink: 0, width: 12, textAlign: 'center', cursor: 'ew-resize' }}
          onPointerDown={e => { e.stopPropagation(); e.preventDefault(); (e.target as HTMLElement).setPointerCapture(e.pointerId); scrubRef.current = { startX: e.clientX, startVal: value, active: false }; }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {label}
        </span>
      )}
      <input
        ref={inputRef}
        style={{
          width: width ?? '100%',
          padding: '5px 6px',
          borderRadius: R_SM,
          border: editing ? `1px solid ${C_INPUT_BORDER_FOCUS}` : '1px solid transparent',
          background: editing ? C_INPUT_BG_ACTIVE : C_INPUT_BG,
          boxShadow: editing ? `0 0 0 3px rgba(59,130,246,0.1)` : 'none',
          fontSize: 11, fontWeight: 500,
          fontFamily: FONT, color: mixed && !editing ? C_MUTED : C_VALUE,
          textAlign: 'center', outline: 'none',
          transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
          boxSizing: 'border-box',
          cursor: editing ? 'text' : 'ew-resize',
        }}
        value={editing ? draft : display}
        onFocus={e => { setEditing(true); setDraft(mixed ? '' : String(value)); requestAnimationFrame(() => e.target.select()); }}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') { setEditing(false); setDraft(display); (e.target as HTMLInputElement).blur(); }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const delta = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1);
            const next = clamp(value + delta);
            onChange(next);
            setDraft(String(next));
          }
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        spellCheck={false}
      />
    </div>
  );
}

function ColorSwatch({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState({ top: 0, left: 0 });

  const handleClick = useCallback(() => {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      setAnchor({ top: r.bottom + 6, left: r.left - 104 + 12 });
    }
    setOpen(true);
  }, []);

  return (
    <>
      <motion.div
        ref={ref}
        onClick={handleClick}
        whileHover={{ scale: 1.1, boxShadow: '0 0 0 2px rgba(59,130,246,0.2)' }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 500, damping: 25 }}
        style={{
          width: 24, height: 24,
          borderRadius: R_SM,
          border: '1px solid rgba(0,0,0,0.08)',
          background: color,
          flexShrink: 0,
          cursor: 'pointer',
          transition: 'background 0.15s ease',
        }}
      />
      <AnimatePresence>
        {open && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 699 }} onClick={() => setOpen(false)} />
            <ColorPickerPopover color={color} onChange={onChange} anchor={anchor} />
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function FillSwatch({ fill, onChange, onGradientEdit, onGradientClose, gradientEditing }: {
  fill: Fill;
  onChange: (f: Fill) => void;
  onGradientEdit?: () => void;
  onGradientClose?: () => void;
  gradientEditing?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState({ top: 0, left: 0 });

  const handleClick = useCallback(() => {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      setAnchor({ top: r.bottom + 6, left: r.left });
    }
    setOpen(true);
    if (fill.type === 'linear-gradient') onGradientEdit?.();
  }, [fill.type, onGradientEdit]);

  const handleClose = useCallback(() => {
    setOpen(false);
    onGradientClose?.();
  }, [onGradientClose]);

  // Close on Escape (needed when backdrop is pointer-events:none during gradient editing)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, handleClose]);

  // Build swatch background
  const bg = fill.type === 'solid' ? fill.color
    : (fill.type === 'linear-gradient' || fill.type === 'radial-gradient')
      ? gradientToCss(fill.stops, fill.type)
    : '#fff';

  return (
    <>
      <motion.div
        ref={ref}
        onClick={handleClick}
        whileHover={{ scale: 1.1, boxShadow: '0 0 0 2px rgba(59,130,246,0.2)' }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 500, damping: 25 }}
        style={{
          width: 24, height: 24,
          borderRadius: R_SM,
          border: '1px solid rgba(0,0,0,0.08)',
          background: bg,
          flexShrink: 0,
          cursor: 'pointer',
          transition: 'background 0.15s ease',
        }}
      />
      <AnimatePresence>
        {open && (
          <>
            {/* When gradient editor is active, make backdrop non-blocking so canvas handles work.
                Clicking outside the popover won't close it — use Escape or click swatch again. */}
            <div style={{
              position: 'fixed', inset: 0, zIndex: 699,
              pointerEvents: gradientEditing ? 'none' : 'auto',
            }} onClick={gradientEditing ? undefined : handleClose} />
            <FillPickerPopover fill={fill} onChange={onChange} anchor={anchor} />
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function HexInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);

  const commit = useCallback(() => {
    setEditing(false);
    let v = draft.trim();
    if (!v.startsWith('#')) v = '#' + v;
    if (/^#([0-9a-fA-F]{3}){1,2}$/.test(v)) {
      onChange(v.length === 4 ? `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}` : v);
    }
  }, [draft, onChange]);

  return (
    <input
      style={{
        flex: 1, minWidth: 0,
        padding: '5px 6px', borderRadius: R_SM,
        border: editing ? `1px solid ${C_INPUT_BORDER_FOCUS}` : '1px solid transparent',
        background: editing ? C_INPUT_BG_ACTIVE : C_INPUT_BG,
        fontSize: 11, fontWeight: 500,
        fontFamily: FONT, color: C_VALUE, textAlign: 'center',
        outline: 'none', transition: 'border-color 0.15s, background 0.15s',
      }}
      value={editing ? draft : value}
      onFocus={e => { setEditing(true); setDraft(value); requestAnimationFrame(() => e.target.select()); }}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') { setEditing(false); (e.target as HTMLInputElement).blur(); }
      }}
      onPointerDown={e => e.stopPropagation()}
      spellCheck={false}
    />
  );
}

// ── Layout primitives ─────────────────────────────────────────────

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 2px', marginBottom: 6,
    }}>
      <span style={{ fontSize: 11, fontWeight: 500, color: C_LABEL, fontFamily: FONT }}>
        {children}
      </span>
      {right && <div style={{ display: 'flex', gap: 2 }}>{right}</div>}
    </div>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ borderRadius: R_MD, background: C_INPUT_BG, padding: '4px 6px' }}>
      {children}
    </div>
  );
}

function Row({ children, gap = 6 }: { children: React.ReactNode; gap?: number }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap }}>{children}</div>;
}

function TwoCol({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>{children}</div>;
}

function Divider() {
  return <div style={{ height: 1, background: C_DIVIDER, margin: '10px 0', opacity: 0.5 }} />;
}

function StrokePositionControl({ position, onChange }: {
  position: 'center' | 'inside' | 'outside';
  onChange: (p: 'center' | 'inside' | 'outside') => void;
}) {
  const opts: { key: 'inside' | 'center' | 'outside'; label: string }[] = [
    { key: 'inside', label: 'In' },
    { key: 'center', label: 'Mid' },
    { key: 'outside', label: 'Out' },
  ];
  return (
    <div style={{ display: 'flex', gap: 1, background: C_INPUT_BG, borderRadius: R_SM, padding: 1, flex: 1 }}>
      {opts.map(o => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          style={{
            flex: 1, padding: '3px 0', borderRadius: R_SM - 1, border: 'none',
            background: position === o.key ? '#fff' : 'transparent',
            color: position === o.key ? C_VALUE : C_MUTED,
            fontSize: 9, fontWeight: 600, cursor: 'pointer', fontFamily: FONT,
            boxShadow: position === o.key ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
            transition: 'all 0.15s',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SmallIconButton({ onClick, children, title, color, style }: {
  onClick: () => void; children: React.ReactNode; title?: string; color?: string; style?: React.CSSProperties;
}) {
  return (
    <motion.button
      whileHover={{ background: 'rgba(0,0,0,0.04)' }}
      whileTap={{ scale: 0.9 }}
      title={title}
      onClick={e => { e.stopPropagation(); onClick(); }}
      onPointerDown={e => e.stopPropagation()}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 24, height: 24, borderRadius: R_SM,
        border: 'none', background: 'transparent',
        cursor: 'pointer', color: color ?? C_ICON, padding: 0,
        ...style,
      }}
    >
      {children}
    </motion.button>
  );
}

// ── Shape icon ────────────────────────────────────────────────────

function ShapeIcon({ type }: { type: string }) {
  const p = { size: 14, strokeWidth: 1.5, color: C_ICON };
  switch (type) {
    case 'rectangle': return <Square {...p} />;
    case 'ellipse': return <Circle {...p} />;
    case 'vector': return <PenTool {...p} />;
    default: return <Square {...p} />;
  }
}

// ── Selection colors (multi-select) ──────────────────────────────

type ColorGroup = { fill: Fill; labels: string[] };

function collectSelectionColors(items: ItemDef[]): ColorGroup[] {
  const groups = new Map<string, ColorGroup>();
  for (const item of items) {
    const fills = (item.props.fills as Fill[]) ?? [];
    if (fills.length === 0 || fills[0].type === 'none') continue;
    const fill = fills[0];
    if (fill.type === 'solid') {
      const key = fill.color.toLowerCase();
      const existing = groups.get(key);
      if (existing) existing.labels.push(item.label);
      else groups.set(key, { fill, labels: [item.label] });
    } else {
      groups.set(`${fill.type}-${item.label}`, { fill, labels: [item.label] });
    }
  }
  return Array.from(groups.values());
}

// ── Effects section ───────────────────────────────────────────────

function EffectsSection({ shadows, blurAmount, backgroundBlur, onUpdate }: {
  shadows: ShadowDef[];
  blurAmount: number;
  backgroundBlur: number;
  onUpdate: (props: Record<string, unknown>) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const dropShadows = shadows.filter(s => (s.shadowType ?? 'drop-shadow') === 'drop-shadow');
  const innerShadows = shadows.filter(s => s.shadowType === 'inner-shadow');
  const hasDropShadow = dropShadows.length > 0;
  const hasInnerShadow = innerShadows.length > 0;
  const hasLayerBlur = blurAmount > 0;
  const hasBackgroundBlur = backgroundBlur > 0;
  const hasAny = hasDropShadow || hasInnerShadow || hasLayerBlur || hasBackgroundBlur;

  const toggleEffect = useCallback((type: string) => {
    if (type === 'drop-shadow') {
      if (hasDropShadow) {
        onUpdate({ shadows: shadows.filter(s => (s.shadowType ?? 'drop-shadow') !== 'drop-shadow') });
      } else {
        onUpdate({ shadows: [...shadows, { shadowType: 'drop-shadow' as const, x: 0, y: 4, blur: 12, color: '#000000', opacity: 0.12 }] });
      }
    } else if (type === 'inner-shadow') {
      if (hasInnerShadow) {
        onUpdate({ shadows: shadows.filter(s => s.shadowType !== 'inner-shadow') });
      } else {
        onUpdate({ shadows: [...shadows, { shadowType: 'inner-shadow' as const, x: 0, y: 4, blur: 8, color: '#000000', opacity: 0.25 }] });
      }
    } else if (type === 'layer-blur') {
      onUpdate({ blur: hasLayerBlur ? 0 : 4 });
    } else if (type === 'background-blur') {
      onUpdate({ backgroundBlur: hasBackgroundBlur ? 0 : 8 });
    }
  }, [shadows, hasDropShadow, hasInnerShadow, hasLayerBlur, hasBackgroundBlur, onUpdate]);

  const updateShadow = useCallback((type: 'drop-shadow' | 'inner-shadow', patch: Partial<ShadowDef>) => {
    onUpdate({
      shadows: shadows.map(s =>
        (s.shadowType ?? 'drop-shadow') === type ? { ...s, ...patch } : s
      ),
    });
  }, [shadows, onUpdate]);

  const effectChecks: { key: string; label: string; active: boolean }[] = [
    { key: 'inner-shadow', label: 'Inner shadow', active: hasInnerShadow },
    { key: 'drop-shadow', label: 'Drop shadow', active: hasDropShadow },
    { key: 'layer-blur', label: 'Layer blur', active: hasLayerBlur },
    { key: 'background-blur', label: 'Background blur', active: hasBackgroundBlur },
  ];

  return (
    <div style={{ marginTop: 10 }}>
      <SectionTitle right={
        <SmallIconButton onClick={() => setPickerOpen(v => !v)} title="Add effect">
          <Plus size={10} strokeWidth={2} style={{ transform: pickerOpen ? 'rotate(45deg)' : 'none', transition: 'transform 0.15s' }} />
        </SmallIconButton>
      }>Effects</SectionTitle>

      {/* Inline effect type picker */}
      <AnimatePresence>
        {pickerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            style={{ marginBottom: hasAny ? 6 : 0 }}
          >
            <div style={{ borderRadius: R_MD, background: C_INPUT_BG, padding: 3 }}>
              {effectChecks.map(opt => (
                <motion.button
                  key={opt.key}
                  whileHover={{ background: opt.active ? undefined : 'rgba(0,0,0,0.04)' }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => toggleEffect(opt.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    width: '100%', padding: '6px 8px',
                    borderRadius: R_SM, border: 'none',
                    background: opt.active ? C_ACCENT : 'transparent',
                    color: opt.active ? '#fff' : C_VALUE,
                    fontSize: 11, fontWeight: 500,
                    cursor: 'pointer', fontFamily: FONT,
                    textAlign: 'left',
                    transition: 'background 0.1s, color 0.1s',
                  }}
                >
                  <span style={{ width: 12, fontSize: 10, textAlign: 'center', opacity: opt.active ? 1 : 0 }}>
                    {'\u2713'}
                  </span>
                  {opt.label}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active effect controls */}
      {hasAny && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {hasInnerShadow && (
            <ShadowEffectCard
              label="Inner shadow"
              shadow={innerShadows[0]}
              onChange={patch => updateShadow('inner-shadow', patch)}
              onRemove={() => toggleEffect('inner-shadow')}
            />
          )}
          {hasDropShadow && (
            <ShadowEffectCard
              label="Drop shadow"
              shadow={dropShadows[0]}
              onChange={patch => updateShadow('drop-shadow', patch)}
              onRemove={() => toggleEffect('drop-shadow')}
            />
          )}
          {hasLayerBlur && (
            <SectionCard>
              <Row>
                <span style={{ fontSize: 10, fontWeight: 500, color: C_LABEL, fontFamily: FONT, flex: 1 }}>Layer blur</span>
                <NumericField value={blurAmount} onChange={b => onUpdate({ blur: b })} suffix="px" width={52} min={0} />
                <SmallIconButton onClick={() => toggleEffect('layer-blur')} title="Remove"><X size={10} strokeWidth={2} /></SmallIconButton>
              </Row>
            </SectionCard>
          )}
          {hasBackgroundBlur && (
            <SectionCard>
              <Row>
                <span style={{ fontSize: 10, fontWeight: 500, color: C_LABEL, fontFamily: FONT, flex: 1 }}>Bg blur</span>
                <NumericField value={backgroundBlur} onChange={b => onUpdate({ backgroundBlur: b })} suffix="px" width={52} min={0} />
                <SmallIconButton onClick={() => toggleEffect('background-blur')} title="Remove"><X size={10} strokeWidth={2} /></SmallIconButton>
              </Row>
            </SectionCard>
          )}
        </div>
      )}
    </div>
  );
}

function ShadowEffectCard({ label, shadow, onChange, onRemove }: {
  label: string;
  shadow: ShadowDef;
  onChange: (patch: Partial<ShadowDef>) => void;
  onRemove: () => void;
}) {
  return (
    <SectionCard>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Row>
          <span style={{ fontSize: 10, fontWeight: 500, color: C_LABEL, fontFamily: FONT, flex: 1 }}>{label}</span>
          <SmallIconButton onClick={onRemove} title={`Remove ${label.toLowerCase()}`}><X size={10} strokeWidth={2} /></SmallIconButton>
        </Row>
        <Row>
          <ColorSwatch color={shadow.color} onChange={c => onChange({ color: c })} />
          <HexInput value={shadow.color} onChange={c => onChange({ color: c })} />
          <NumericField value={Math.round(shadow.opacity * 100)} onChange={v => onChange({ opacity: v / 100 })} suffix="%" width={44} min={0} max={100} />
        </Row>
        <Row gap={4}>
          <NumericField label="X" value={shadow.x} onChange={v => onChange({ x: v })} />
          <NumericField label="Y" value={shadow.y} onChange={v => onChange({ y: v })} />
          <NumericField label="B" value={shadow.blur} onChange={v => onChange({ blur: v })} min={0} />
        </Row>
      </div>
    </SectionCard>
  );
}

// (Layers section moved to layers-panel.tsx)
const ROW_H = 30; // kept for dead code below

// @ts-ignore — dead code, kept temporarily
function _OldLayersSection({ layers, selection, onReorder, onRename }: {
  layers: { label: string; z: number }[];
  selection: Set<string>;
  onReorder: (orderedLabels: string[]) => void;
  onRename: (oldLabel: string, newLabel: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const sorted = [...layers].sort((a, b) => b.z - a.z);
  const [order, setOrder] = useState(sorted.map(l => l.label));
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const orderRef = useRef(order);
  orderRef.current = order;
  const dragIdxRef = useRef(dragIdx);
  dragIdxRef.current = dragIdx;
  const dragStartY = useRef(0);

  // Sync from props when not dragging
  useEffect(() => {
    if (dragIdxRef.current === null) {
      setOrder(sorted.map(l => l.label));
    }
  }, [layers.map(l => `${l.label}:${l.z}`).join(',')]);

  const startDrag = useCallback((e: React.PointerEvent, index: number) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    e.preventDefault();
    dragStartY.current = e.clientY;
    setDragIdx(index);
    setDragOffset(0);

    const onMove = (ev: PointerEvent) => {
      const dy = ev.clientY - dragStartY.current;
      setDragOffset(dy);
      const curIdx = dragIdxRef.current;
      if (curIdx === null) return;
      const curOrder = orderRef.current;
      const newIndex = Math.max(0, Math.min(curOrder.length - 1, curIdx + Math.round(dy / ROW_H)));
      if (newIndex !== curIdx) {
        const next = [...curOrder];
        const [moved] = next.splice(curIdx, 1);
        next.splice(newIndex, 0, moved);
        setOrder(next);
        setDragIdx(newIndex);
        dragStartY.current = ev.clientY;
        setDragOffset(0);
      }
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      onReorder([...orderRef.current].reverse());
      setDragIdx(null);
      setDragOffset(0);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [onReorder]);

  return (
    <div style={{ marginTop: 10 }}>
      <SectionTitle right={
        <SmallIconButton onClick={() => setOpen(v => !v)} title="Toggle layers">
          <Layers size={10} strokeWidth={2} />
        </SmallIconButton>
      }>Layers</SectionTitle>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.1 }}>
            <SectionCard>
              {order.map((label, i) => {
                const isSelected = selection.has(label);
                const isDragging = dragIdx === i;
                return (
                  <LayerRow
                    key={label}
                    label={label}
                    selected={isSelected}
                    dragging={isDragging}
                    dragOffset={isDragging ? dragOffset : 0}
                    onPointerDown={e => startDrag(e, i)}
                    onRename={newLabel => onRename(label, newLabel)}
                  />
                );
              })}
            </SectionCard>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LayerRow({ label, selected, dragging, dragOffset, onPointerDown, onRename }: {
  label: string;
  selected: boolean;
  dragging: boolean;
  dragOffset: number;
  onPointerDown: (e: React.PointerEvent) => void;
  onRename: (newLabel: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const [hovered, setHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '4px 4px', height: ROW_H,
        borderRadius: R_SM,
        background: dragging ? `${C_ACCENT}10` : hovered ? 'rgba(0,0,0,0.03)' : 'transparent',
        transform: dragging ? `translateY(${dragOffset}px)` : 'none',
        zIndex: dragging ? 10 : 0,
        position: 'relative',
        cursor: editing ? 'default' : 'grab',
        userSelect: 'none',
        transition: dragging ? 'none' : 'background 0.1s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onPointerDown={onPointerDown}
      onDoubleClick={() => {
        setEditing(true); setDraft(label);
        requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.select(); });
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', width: 14, flexShrink: 0, color: C_MUTED, cursor: 'grab' }}>
        <GripVertical size={10} strokeWidth={2} />
      </div>
      {/* Selected indicator */}
      <div style={{
        width: 6, height: 6, borderRadius: 3, flexShrink: 0,
        background: selected ? C_ACCENT : 'transparent',
        transition: 'background 0.15s',
      }} />
      <input
        ref={inputRef}
        readOnly={!editing}
        style={{
          flex: 1, minWidth: 0,
          borderRadius: R_SM - 1,
          background: editing ? '#fff' : 'transparent',
          padding: '2px 4px',
          fontSize: 11, fontWeight: 500,
          color: selected ? C_VALUE : C_MUTED,
          border: editing ? `1px solid ${C_INPUT_BORDER_FOCUS}` : '1px solid transparent',
          outline: 'none', fontFamily: FONT,
          cursor: editing ? 'text' : 'inherit',
          userSelect: editing ? 'auto' : 'none',
          pointerEvents: editing ? 'auto' : 'none',
          transition: 'border-color 0.15s, color 0.15s',
        }}
        value={editing ? draft : label}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { setEditing(false); if (draft && draft !== label) onRename(draft); }}
        onKeyDown={e => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') { setEditing(false); setDraft(label); (e.target as HTMLInputElement).blur(); }
        }}
        onPointerDown={e => { if (editing) e.stopPropagation(); }}
        spellCheck={false}
      />
    </div>
  );
}

// ── Scrollbar hide ────────────────────────────────────────────────

const scrollCSS = `
  .props-panel-scroll { overflow-x: hidden; overflow-y: auto; scrollbar-width: none; -ms-overflow-style: none; }
  .props-panel-scroll::-webkit-scrollbar { display: none; }
`;

// ── Helper ────────────────────────────────────────────────────────

function allSame(states: ItemState[], key: keyof ItemState): boolean {
  if (states.length <= 1) return true;
  const first = states[0][key];
  return states.every(s => s[key] === first);
}

// ── Main component ────────────────────────────────────────────────

type PropUpdate = { label: string; props: Record<string, unknown> };

export type PropertiesPanelProps = {
  items: ItemDef[];
  states: ItemState[];
  onCommitChange: (patch: Partial<ItemState>) => void;
  onDeltaChange?: (delta: Partial<ItemState>) => void;
  onRename: (oldLabel: string, newLabel: string) => void;
  onPropsChange: (updates: PropUpdate[]) => void;
  copied: boolean;
  locked: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
  onPlace: () => void;
  onToggleLock: () => void;
  onFlipH?: () => void;
  onFlipV?: () => void;
  layers?: { label: string; z: number }[];
  onReorderZ?: (orderedLabels: string[]) => void;
  onInfoClick?: () => void;
  onSettingsClick?: () => void;
  editingGradient?: boolean;
  onEditGradient?: () => void;
  onCloseGradientEditor?: () => void;
};

export function PropertiesPanel(props: PropertiesPanelProps) {
  const {
    items, states,
    onCommitChange, onDeltaChange, onRename, onPropsChange,
    copied, locked,
    onDuplicate, onDelete, onPlace, onToggleLock,
    onFlipH, onFlipV,
    layers: _layers, onReorderZ: _onReorderZ,
    onInfoClick, onSettingsClick,
    editingGradient: _editingGradient, onEditGradient, onCloseGradientEditor,
  } = props;

  // Empty state: nothing selected
  if (items.length === 0 || states.length === 0) {
    return (
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 280,
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(20px)',
        borderLeft: '1px solid rgba(0,0,0,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'rgba(0,0,0,0.3)', fontSize: 13, fontFamily: "'Geist', system-ui, sans-serif",
        zIndex: 900, userSelect: 'none',
      }}>
        No selection
      </div>
    );
  }

  const isSingle = items.length === 1;
  const item = items[0];
  const state = states[0];
  const shapeType = (item.props.shapeType as string) ?? 'rectangle';
  const isShape = item.type === 'Shape';

  // Multi-select helpers
  const scaleMixed = !allSame(states, 'scale');
  const rotMixed = !allSame(states, 'rot');
  const opacityMixed = !allSame(states, 'opacity');
  const zMixed = !allSame(states, 'z');

  const { scale, rot, z = 0, opacity = 1, flipX = false, flipY = false } = state;
  const initW = isSingle ? item.w : 0;
  const initH = isSingle ? item.h : 0;
  const pixelW = Math.round(initW * scale);
  const pixelH = Math.round(initH * scale);
  const [ratioLocked, setRatioLocked] = useState(true);

  // Single-item label editing
  const [labelEditing, setLabelEditing] = useState(false);
  const [labelDraft, setLabelDraft] = useState(item.label);
  const labelRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!labelEditing) setLabelDraft(item.label); }, [item.label, labelEditing]);



  // Design props (single)
  const fills = isShape ? ((item.props.fills as Fill[]) ?? []) : [];
  const strokes = isShape ? ((item.props.strokes as StrokeDef[]) ?? []) : [];
  const shadows = isShape ? ((item.props.shadows as ShadowDef[]) ?? []) : [];
  const blurAmount = isShape ? ((item.props.blur as number) ?? 0) : 0;
  const backgroundBlurAmount = isShape ? ((item.props.backgroundBlur as number) ?? 0) : 0;
  const borderRadius = isShape ? ((item.props.borderRadius as number) ?? 0) : 0;
  const cornerSmoothing = isShape ? ((item.props.cornerSmoothing as number) ?? 0) : 0;
  const hasFill = fills.length > 0 && fills[0].type !== 'none';
  const hasStroke = strokes.length > 0;

  // Multi-select design
  const colorGroups = useMemo(() => items.length > 1 ? collectSelectionColors(items) : [], [items]);
  const anyHasStroke = items.some(i => ((i.props.strokes as StrokeDef[]) ?? []).length > 0);
  const anyHasShadow = items.some(i => ((i.props.shadows as ShadowDef[]) ?? []).length > 0);

  // Update single item's props
  const updateProps = useCallback((p: Record<string, unknown>) => {
    onPropsChange([{ label: item.label, props: p }]);
  }, [item.label, onPropsChange]);

  // Step helper
  const step = useCallback((key: keyof ItemState, delta: number) => {
    if (onDeltaChange) onDeltaChange({ [key]: delta });
    else {
      const cur = state[key] as number;
      onCommitChange({ [key]: Math.round((cur + delta) * 100) / 100 });
    }
  }, [onDeltaChange, onCommitChange, state]);

  return (
    <>
      <style>{scrollCSS}</style>
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        className="props-panel-scroll"
        style={{
          position: 'fixed',
          right: 16, top: 16,
          width: 260,
          maxHeight: 'calc(100vh - 48px)',
          borderRadius: R_XL,
          background: '#ffffff',
          boxShadow: SHADOW_MD,
          fontFamily: FONT,
          zIndex: 500,
        }}
        onPointerDown={e => e.stopPropagation()}
        onWheel={e => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <div style={{ padding: '12px 14px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
          {isSingle ? (
            <>
              {isShape && <ShapeIcon type={shapeType} />}
              {item.type === 'Text' && <Type size={14} strokeWidth={1.5} color={C_ICON} />}
              {item.type === 'Group' && <Layers size={14} strokeWidth={1.5} color={C_ICON} />}
              {item.type === 'Frame' && <Square size={14} strokeWidth={1.5} color={C_ICON} />}
              <input
                ref={labelRef}
                readOnly={!labelEditing}
                style={{
                  flex: 1, minWidth: 0,
                  borderRadius: R_SM,
                  background: labelEditing ? C_INPUT_BG_ACTIVE : 'transparent',
                  padding: '3px 6px',
                  fontSize: 13, fontWeight: 600,
                  color: C_VALUE, border: labelEditing ? `1px solid ${C_INPUT_BORDER_FOCUS}` : '1px solid transparent',
                  outline: 'none', fontFamily: FONT,
                  cursor: labelEditing ? 'text' : 'default',
                  userSelect: labelEditing ? 'auto' : 'none',
                  transition: 'border-color 0.15s',
                }}
                value={labelEditing ? labelDraft : item.label}
                onDoubleClick={() => {
                  setLabelEditing(true); setLabelDraft(item.label);
                  requestAnimationFrame(() => { labelRef.current?.focus(); labelRef.current?.select(); });
                }}
                onChange={e => setLabelDraft(e.target.value)}
                onBlur={() => { setLabelEditing(false); if (labelDraft && labelDraft !== item.label) onRename(item.label, labelDraft); }}
                onKeyDown={e => {
                  e.stopPropagation();
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') { setLabelEditing(false); setLabelDraft(item.label); (e.target as HTMLInputElement).blur(); }
                }}
                onPointerDown={e => { if (labelEditing) e.stopPropagation(); }}
                spellCheck={false}
              />
            </>
          ) : (
            <>
              <Layers size={14} strokeWidth={1.5} color={C_ICON} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C_VALUE, fontFamily: FONT }}>
                {items.length} layers
              </span>
            </>
          )}

          {/* Action buttons */}
          <Row gap={2}>
            <SmallIconButton onClick={onToggleLock} title={locked ? 'Unlock' : 'Lock'} color={locked ? '#d97706' : undefined}>
              {locked ? <Lock size={12} strokeWidth={2} /> : <Unlock size={12} strokeWidth={2} />}
            </SmallIconButton>
            <SmallIconButton onClick={onDuplicate} title="Duplicate">
              <Copy size={12} strokeWidth={2} />
            </SmallIconButton>
            <SmallIconButton onClick={onDelete} title="Delete" color="#ef4444">
              <Trash2 size={12} strokeWidth={2} />
            </SmallIconButton>
          </Row>
        </div>

        {/* ── Content ─────────────────────────────────────────────── */}
        <div style={{ padding: '0 14px 14px' }}>

          {/* Position (single only) */}
          {isSingle && (
            <>
              <div style={{ marginTop: 8 }}>
                <SectionTitle>Position</SectionTitle>
                <TwoCol>
                  <NumericField label="X" value={state.x} onChange={v => onCommitChange({ x: Math.round(v) })} />
                  <NumericField label="Y" value={state.y} onChange={v => onCommitChange({ y: Math.round(v) })} />
                </TwoCol>
              </div>

              <div style={{ marginTop: 8 }}>
                <SectionTitle right={
                  <Row gap={2}>
                    {onFlipH && (
                      <SmallIconButton onClick={onFlipH} title="Flip horizontal (Shift+H)" color={flipX ? C_ACCENT : undefined}>
                        <FlipHorizontal2 size={12} strokeWidth={1.5} />
                      </SmallIconButton>
                    )}
                    {onFlipV && (
                      <SmallIconButton onClick={onFlipV} title="Flip vertical (Shift+V)" color={flipY ? C_ACCENT : undefined}>
                        <FlipVertical2 size={12} strokeWidth={1.5} />
                      </SmallIconButton>
                    )}
                  </Row>
                }>Dimensions</SectionTitle>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ flex: 1 }}>
                    <NumericField
                      label="W"
                      value={pixelW}
                      onChange={v => {
                        const newScale = Math.round(Math.max(0.1, Math.min(4, v / (initW || 1))) * 100) / 100;
                        onCommitChange({ scale: newScale });
                      }}
                    />
                  </div>
                  <motion.button
                    whileHover={{ background: 'rgba(0,0,0,0.04)' }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setRatioLocked(v => !v)}
                    title={ratioLocked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 20, height: 20, borderRadius: 4,
                      border: 'none', background: 'transparent',
                      cursor: 'pointer', color: ratioLocked ? C_ACCENT : C_MUTED,
                      padding: 0, flexShrink: 0,
                      transition: 'color 0.15s',
                    }}
                    onPointerDown={e => e.stopPropagation()}
                  >
                    {ratioLocked
                      ? <Link size={10} strokeWidth={2} />
                      : <Unlink size={10} strokeWidth={2} />
                    }
                  </motion.button>
                  <div style={{ flex: 1 }}>
                    <NumericField
                      label="H"
                      value={pixelH}
                      onChange={v => {
                        const newScale = Math.round(Math.max(0.1, Math.min(4, v / (initH || 1))) * 100) / 100;
                        onCommitChange({ scale: newScale });
                      }}
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          <Divider />

          {/* Scale + Rotation */}
          <TwoCol>
            <div>
              <SectionTitle>Scale</SectionTitle>
              <Row>
                <StepButton onClick={() => step('scale', -0.1)}><Minus size={10} strokeWidth={2} /></StepButton>
                <NumericField value={Math.round(scale * 10) / 10} mixed={scaleMixed} onChange={v => onCommitChange({ scale: Math.max(0.1, Math.min(4, v)) })} suffix="x" />
                <StepButton onClick={() => step('scale', 0.1)}><Plus size={10} strokeWidth={2} /></StepButton>
              </Row>
            </div>
            <div>
              <SectionTitle>Rotation</SectionTitle>
              <Row>
                <StepButton onClick={() => step('rot', -1)}><RotateCcw size={10} strokeWidth={2} /></StepButton>
                <NumericField value={Math.round(rot * 100) / 100} mixed={rotMixed} onChange={v => onCommitChange({ rot: v })} suffix="°" />
                <StepButton onClick={() => step('rot', 1)}><RotateCw size={10} strokeWidth={2} /></StepButton>
              </Row>
            </div>
          </TwoCol>

          {/* Opacity + Corner Radius / Z-index */}
          <div style={{ marginTop: 8 }}>
            <TwoCol>
              <div>
                <SectionTitle>Opacity</SectionTitle>
                <NumericField
                  value={Math.round(opacity * 100)}
                  mixed={opacityMixed}
                  onChange={v => onCommitChange({ opacity: Math.max(0, Math.min(100, Math.round(v))) / 100 })}
                  suffix="%"
                />
              </div>
              {isSingle && isShape && shapeType === 'rectangle' ? (
                <div>
                  <SectionTitle>Corner radius</SectionTitle>
                  <NumericField value={borderRadius} onChange={r => updateProps({ borderRadius: r })} suffix="px" min={0} />
                </div>
              ) : (
                <div>
                  <SectionTitle>Z-index</SectionTitle>
                  <Row>
                    <StepButton onClick={() => step('z', -1)}><ArrowDown size={10} strokeWidth={2} /></StepButton>
                    <NumericField value={z} mixed={zMixed} onChange={v => onCommitChange({ z: Math.round(v) })} />
                    <StepButton onClick={() => step('z', 1)}><ArrowUp size={10} strokeWidth={2} /></StepButton>
                  </Row>
                </div>
              )}
            </TwoCol>
          </div>

          {/* Z-index row for rectangles (since corner radius took its spot) */}
          {isSingle && isShape && shapeType === 'rectangle' && (
            <div style={{ marginTop: 8 }}>
              <SectionTitle>Z-index</SectionTitle>
              <Row>
                <StepButton onClick={() => step('z', -1)}><ArrowDown size={10} strokeWidth={2} /></StepButton>
                <NumericField value={z} onChange={v => onCommitChange({ z: Math.round(v) })} />
                <StepButton onClick={() => step('z', 1)}><ArrowUp size={10} strokeWidth={2} /></StepButton>
              </Row>
            </div>
          )}

          {/* Corner smoothing — only for single rectangles */}
          {isSingle && isShape && shapeType === 'rectangle' && (
            <div style={{ marginTop: 8 }}>
              <SectionTitle>Corner smoothing</SectionTitle>
              <Row>
                <input
                  type="range"
                  min={0} max={100} step={1}
                  value={cornerSmoothing}
                  onChange={e => updateProps({ cornerSmoothing: Number(e.target.value) })}
                  onPointerDown={e => e.stopPropagation()}
                  style={{
                    flex: 1,
                    height: 4,
                    cursor: 'pointer',
                    accentColor: C_ACCENT,
                  }}
                />
                <NumericField
                  value={cornerSmoothing}
                  onChange={v => updateProps({ cornerSmoothing: Math.max(0, Math.min(100, Math.round(v))) })}
                  suffix="%"
                  width={48}
                  min={0}
                  max={100}
                />
              </Row>
            </div>
          )}

          <Divider />

          {/* ── Design properties ────────────────────────────────── */}

          {isSingle && isShape ? (
            <>
              {/* Fill */}
              <div style={{ marginTop: 4 }}>
                <SectionTitle right={
                  hasFill
                    ? <SmallIconButton onClick={() => updateProps({ fills: [] })} title="Remove fill"><X size={10} strokeWidth={2} /></SmallIconButton>
                    : <SmallIconButton onClick={() => updateProps({ fills: [{ type: 'solid' as const, color: '#000000', opacity: 1 }] })} title="Add fill"><Plus size={10} strokeWidth={2} /></SmallIconButton>
                }>Fill</SectionTitle>
                <AnimatePresence>
                  {hasFill && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.1 }}>
                      <SectionCard>
                        <Row>
                          <FillSwatch
                            fill={fills[0]}
                            onChange={f => updateProps({ fills: [f] })}
                            onGradientEdit={onEditGradient}
                            onGradientClose={onCloseGradientEditor}
                            gradientEditing={_editingGradient}
                          />
                          {fills[0].type === 'solid' ? (
                            <>
                              <HexInput value={fills[0].color} onChange={c => updateProps({ fills: [{ ...fills[0], color: c }] })} />
                              <NumericField value={Math.round(fills[0].opacity * 100)} onChange={v => updateProps({ fills: [{ ...fills[0], opacity: v / 100 }] })} suffix="%" width={44} min={0} max={100} />
                            </>
                          ) : (
                            <span style={{ fontSize: 11, fontWeight: 500, color: C_MUTED, fontFamily: FONT }}>
                              {fills[0].type === 'linear-gradient' ? 'Linear' : 'Radial'}
                            </span>
                          )}
                        </Row>
                      </SectionCard>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Stroke */}
              <div style={{ marginTop: 10 }}>
                <SectionTitle right={
                  hasStroke
                    ? <SmallIconButton onClick={() => updateProps({ strokes: [] })} title="Remove stroke"><X size={10} strokeWidth={2} /></SmallIconButton>
                    : <SmallIconButton onClick={() => updateProps({ strokes: [{ color: '#000000', width: 1, opacity: 1, position: 'center' }] })} title="Add stroke"><Plus size={10} strokeWidth={2} /></SmallIconButton>
                }>Stroke</SectionTitle>
                <AnimatePresence>
                  {hasStroke && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.1 }}>
                      <SectionCard>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <Row>
                            <FillSwatch
                              fill={strokes[0].strokeFill ?? { type: 'solid', color: strokes[0].color, opacity: strokes[0].opacity }}
                              onChange={f => {
                                const patch: Record<string, unknown> = { strokes: [{ ...strokes[0], strokeFill: f }] };
                                if (f.type === 'solid') (patch.strokes as StrokeDef[])[0].color = f.color;
                                updateProps(patch);
                              }}
                            />
                            {(!strokes[0].strokeFill || strokes[0].strokeFill.type === 'solid') ? (
                              <>
                                <HexInput value={strokes[0].color} onChange={c => updateProps({ strokes: [{ ...strokes[0], color: c, strokeFill: { type: 'solid' as const, color: c, opacity: strokes[0].opacity } }] })} />
                                <NumericField value={Math.round(strokes[0].opacity * 100)} onChange={v => updateProps({ strokes: [{ ...strokes[0], opacity: v / 100 }] })} suffix="%" width={44} min={0} max={100} />
                              </>
                            ) : (
                              <span style={{ fontSize: 11, fontWeight: 500, color: C_MUTED, fontFamily: FONT }}>
                                {strokes[0].strokeFill.type === 'linear-gradient' ? 'Linear' : 'Radial'}
                              </span>
                            )}
                          </Row>
                          <Row gap={4}>
                            <StrokePositionControl
                              position={strokes[0].position ?? 'center'}
                              onChange={p => updateProps({ strokes: [{ ...strokes[0], position: p }] })}
                            />
                            <NumericField label="W" value={strokes[0].width} onChange={w => updateProps({ strokes: [{ ...strokes[0], width: w }] })} suffix="px" width={48} min={0.5} max={100} />
                          </Row>
                        </div>
                      </SectionCard>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Effects */}
              <EffectsSection
                shadows={shadows}
                blurAmount={blurAmount}
                backgroundBlur={backgroundBlurAmount}
                onUpdate={updateProps}
              />
            </>
          ) : isSingle && item.type === 'Text' ? (
            <>
              <div style={{ marginTop: 4 }}>
                <SectionTitle>Color</SectionTitle>
                <SectionCard><div style={{ padding: '8px 10px' }}><Row>
                  <ColorSwatch color={(item.props.color as string) ?? '#000000'} onChange={c => updateProps({ color: c })} />
                  <HexInput value={(item.props.color as string) ?? '#000000'} onChange={c => updateProps({ color: c })} />
                </Row></div></SectionCard>
              </div>
              <div style={{ marginTop: 8 }}>
                <SectionTitle>Font size</SectionTitle>
                <NumericField value={(item.props.fontSize as number) ?? 16} onChange={v => updateProps({ fontSize: v })} suffix="px" min={6} max={200} />
              </div>
              <div style={{ marginTop: 8 }}>
                <SectionTitle>Weight</SectionTitle>
                <NumericField value={(item.props.fontWeight as number) ?? 400} onChange={v => updateProps({ fontWeight: Math.round(v / 100) * 100 })} min={100} max={900} />
              </div>
              <div style={{ marginTop: 8 }}>
                <SectionTitle>Alignment</SectionTitle>
                <Row gap={2}>
                  {(['left', 'center', 'right'] as const).map(align => {
                    const active = ((item.props.textAlign as string) ?? 'left') === align;
                    return (<button key={align} onClick={() => updateProps({ textAlign: align })} style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: 'none', background: active ? 'rgba(59,130,246,0.1)' : '#f4f5f6', color: active ? '#3b82f6' : '#6b7280', fontSize: 10, fontWeight: 600, fontFamily: "'Geist', ui-monospace, SFMono-Regular, Menlo, monospace", cursor: 'pointer', textTransform: 'capitalize', transition: 'background 0.15s' }}>{align}</button>);
                  })}
                </Row>
              </div>
            </>
          ) : isSingle && item.type === 'Frame' ? (
            <>
              {/* Frame Fill */}
              <div style={{ marginTop: 4 }}>
                <SectionTitle>Background</SectionTitle>
                <SectionCard><div style={{ padding: '8px 10px' }}><Row>
                  <ColorSwatch color={(item.props.frameFill as string) ?? 'transparent'} onChange={c => updateProps({ frameFill: c })} />
                  <HexInput value={(item.props.frameFill as string) ?? 'transparent'} onChange={c => updateProps({ frameFill: c })} />
                </Row></div></SectionCard>
              </div>
              {/* Frame Border */}
              <div style={{ marginTop: 8 }}>
                <SectionTitle>Border</SectionTitle>
                <SectionCard><div style={{ padding: '8px 10px' }}><Row>
                  <ColorSwatch color={(item.props.frameBorderColor as string) ?? '#e5e7eb'} onChange={c => updateProps({ frameBorderColor: c })} />
                  <HexInput value={(item.props.frameBorderColor as string) ?? '#e5e7eb'} onChange={c => updateProps({ frameBorderColor: c })} />
                  <NumericField value={(item.props.frameBorderWidth as number) ?? 1} onChange={v => updateProps({ frameBorderWidth: v })} suffix="px" width={44} min={0} max={20} />
                </Row></div></SectionCard>
              </div>
              {/* Border Radius */}
              <div style={{ marginTop: 8 }}>
                <SectionTitle>Corner radius</SectionTitle>
                <NumericField value={(item.props.frameRadius as number) ?? 0} onChange={v => updateProps({ frameRadius: v })} suffix="px" min={0} max={200} />
              </div>
              {/* Clip Content */}
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px' }}>
                <span style={{ fontSize: 11, fontWeight: 500, color: C_VALUE, fontFamily: FONT }}>Clip content</span>
                <button
                  onClick={() => updateProps({ clipContent: !(item.props.clipContent as boolean) })}
                  style={{
                    width: 36, height: 20, borderRadius: 10, border: 'none',
                    background: (item.props.clipContent as boolean) ? '#3b82f6' : '#e5e7eb',
                    cursor: 'pointer', position: 'relative', transition: 'background 0.2s', padding: 0,
                  }}
                >
                  <div style={{
                    position: 'absolute', top: 2,
                    left: (item.props.clipContent as boolean) ? 18 : 2,
                    width: 16, height: 16, borderRadius: 8,
                    background: 'white', transition: 'left 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                  }} />
                </button>
              </div>
            </>
          ) : isSingle && item.type === 'Group' ? (
            <div style={{ padding: '8px 0', textAlign: 'center' }}>
              <span style={{ fontSize: 11, color: C_MUTED, fontFamily: FONT }}>
                {getChildren(items, item.label).length} items in group
              </span>
            </div>
          ) : items.length > 1 ? (
            <>
              {/* Multi-select: Selection Colors */}
              {colorGroups.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <SectionTitle>Selection colors</SectionTitle>
                  <SectionCard>
                    {colorGroups.map((group, i) => {
                      if (group.fill.type !== 'solid') return null;
                      const fill = group.fill;
                      return (
                        <div key={fill.color} style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '5px 0',
                          borderBottom: i < colorGroups.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none',
                        }}>
                          <ColorSwatch color={fill.color} onChange={c => onPropsChange(group.labels.map(l => ({ label: l, props: { fills: [{ ...fill, color: c }] } })))} />
                          <HexInput value={fill.color} onChange={c => onPropsChange(group.labels.map(l => ({ label: l, props: { fills: [{ ...fill, color: c }] } })))} />
                          <NumericField
                            value={Math.round(fill.opacity * 100)}
                            onChange={v => onPropsChange(group.labels.map(l => ({ label: l, props: { fills: [{ ...fill, opacity: v / 100 }] } })))}
                            suffix="%" width={44} min={0} max={100}
                          />
                        </div>
                      );
                    })}
                  </SectionCard>
                </div>
              )}

              {/* Stroke +/- */}
              <div style={{ marginTop: 10 }}>
                <SectionTitle right={
                  anyHasStroke
                    ? <SmallIconButton onClick={() => onPropsChange(items.map(i => ({ label: i.label, props: { strokes: [] } })))} title="Remove stroke"><X size={10} strokeWidth={2} /></SmallIconButton>
                    : <SmallIconButton onClick={() => onPropsChange(items.map(i => ({ label: i.label, props: { strokes: [{ color: '#000000', width: 1, opacity: 1 }] } })))} title="Add stroke"><Plus size={10} strokeWidth={2} /></SmallIconButton>
                }>Stroke</SectionTitle>
              </div>

              {/* Effects +/- */}
              <div style={{ marginTop: 10 }}>
                <SectionTitle right={
                  anyHasShadow
                    ? <SmallIconButton onClick={() => onPropsChange(items.map(i => ({ label: i.label, props: { shadows: [] } })))} title="Remove effects"><X size={10} strokeWidth={2} /></SmallIconButton>
                    : <SmallIconButton onClick={() => onPropsChange(items.map(i => ({ label: i.label, props: { shadows: [{ shadowType: 'drop-shadow', x: 0, y: 4, blur: 12, color: '#000000', opacity: 0.12 }] } })))} title="Add effect"><Plus size={10} strokeWidth={2} /></SmallIconButton>
                }>Effects</SectionTitle>
              </div>
            </>
          ) : null}

          <Divider />

          {/* ── Footer ───────────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <motion.button
              whileHover={{ scale: 1.02, boxShadow: `0 4px 12px rgba(59,130,246,0.25)` }}
              whileTap={{ scale: 0.95 }}
              animate={copied ? { scale: [1, 1.06, 1], background: '#16a34a' } : { scale: 1, background: C_ACCENT }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              style={{
                flex: 1, borderRadius: R_SM + 2,
                padding: '7px 0', fontSize: 11, fontWeight: 600,
                color: '#fff',
                background: C_ACCENT,
                border: 'none', cursor: 'pointer',
                fontFamily: FONT,
              }}
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onPlace(); }}
            >
              {copied ? '\u2713 Placed' : 'Place'}
            </motion.button>
            {onSettingsClick && <SettingsButton onClick={onSettingsClick} variant="toolbar" />}
            {onInfoClick && <InfoButton onClick={onInfoClick} variant="toolbar" />}
          </div>

        </div>
      </motion.div>
    </>
  );
}
