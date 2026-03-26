import { useState, useRef, useCallback } from 'react';
import { motion } from 'motion/react';
import { Plus, Minus } from 'lucide-react';
import type { Fill, GradientStop } from './types';
import {
  FONT, C_LABEL, C_VALUE, C_MUTED, C_HOVER,
  C_INPUT_BG, C_INPUT_BG_ACTIVE, C_INPUT_BORDER_FOCUS,
  C_ACCENT, SHADOW_MD, R_SM, R_XL,
} from './tokens';

// ── Color conversions ─────────────────────────────────────────────

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const hex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

// ── Shared styles ─────────────────────────────────────────────────

const CURSOR: React.CSSProperties = {
  position: 'absolute', width: 14, height: 14, borderRadius: '50%',
  border: '2px solid white',
  boxShadow: '0 0 0 1px rgba(0,0,0,0.15), 0 1px 4px rgba(0,0,0,0.2)',
  transform: 'translate(-50%, -50%)', pointerEvents: 'none',
};

const inputStyle: React.CSSProperties = {
  padding: '5px 6px', borderRadius: R_SM,
  border: '1px solid transparent', background: C_INPUT_BG,
  fontSize: 11, fontWeight: 500, fontFamily: FONT, color: C_VALUE,
  textAlign: 'center', outline: 'none',
  transition: 'border-color 0.15s, background 0.15s',
};

const HUE_BG = 'linear-gradient(to right, hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%), hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%))';
const CHECK_BG = 'repeating-conic-gradient(#e0e0e0 0% 25%, #fff 0% 50%) 0 0 / 8px 8px';

// ── Pointer drag helper ───────────────────────────────────────────

function useDrag(_ref: React.RefObject<HTMLDivElement | null>, pick: (e: React.PointerEvent) => void) {
  const active = useRef(false);
  const down = useCallback((e: React.PointerEvent) => {
    e.preventDefault(); active.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    pick(e);
  }, [pick]);
  const move = useCallback((e: React.PointerEvent) => { if (active.current) pick(e); }, [pick]);
  const up = useCallback((e: React.PointerEvent) => {
    active.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);
  return { onPointerDown: down, onPointerMove: move, onPointerUp: up };
}

// ── Saturation / Value canvas ─────────────────────────────────────

function SatValCanvas({ hue, sat, val, onChange }: {
  hue: number; sat: number; val: number;
  onChange: (s: number, v: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pick = useCallback((e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    onChange(
      Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height)),
    );
  }, [onChange]);
  const drag = useDrag(ref, pick);

  return (
    <div ref={ref} style={{
      position: 'relative', width: '100%', height: 160, borderRadius: R_SM,
      overflow: 'hidden', cursor: 'crosshair',
      background: `linear-gradient(to bottom, transparent, #000), linear-gradient(to right, #fff, transparent), hsl(${hue}, 100%, 50%)`,
    }} {...drag}>
      <div style={{ ...CURSOR, left: `${sat * 100}%`, top: `${(1 - val) * 100}%` }} />
    </div>
  );
}

// ── Slider (hue or opacity) ───────────────────────────────────────

function Slider({ value, max, background, thumbColor, onChange }: {
  value: number; max: number; background: string; thumbColor?: string;
  onChange: (v: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pick = useCallback((e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    onChange(Math.max(0, Math.min(max, ((e.clientX - r.left) / r.width) * max)));
  }, [onChange, max]);
  const drag = useDrag(ref, pick);

  return (
    <div ref={ref} style={{
      position: 'relative', width: '100%', height: 14,
      borderRadius: 7, cursor: 'pointer', background,
    }} {...drag}>
      <div style={{
        ...CURSOR,
        left: `${(value / max) * 100}%`, top: '50%',
        background: thumbColor,
      }} />
    </div>
  );
}

// ── Fill type tabs ────────────────────────────────────────────────

type FillMode = 'solid' | 'linear-gradient' | 'radial-gradient';

function FillTabs({ mode, onChange }: { mode: FillMode; onChange: (m: FillMode) => void }) {
  const tabs: { key: FillMode; label: string }[] = [
    { key: 'solid', label: 'Solid' },
    { key: 'linear-gradient', label: 'Linear' },
    { key: 'radial-gradient', label: 'Radial' },
  ];
  return (
    <div style={{ display: 'flex', gap: 2, marginBottom: 10, background: C_INPUT_BG, borderRadius: R_SM, padding: 2 }}>
      {tabs.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)} style={{
          flex: 1, padding: '4px 0', borderRadius: R_SM - 1, border: 'none',
          background: mode === t.key ? C_INPUT_BG_ACTIVE : 'transparent',
          color: mode === t.key ? C_VALUE : C_MUTED,
          fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: FONT,
          boxShadow: 'none',
          transition: 'all 0.15s',
        }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Gradient bar with stop handles ────────────────────────────────

function gradCss(stops: GradientStop[], type: 'linear-gradient' | 'radial-gradient') {
  const sorted = [...stops].sort((a, b) => a.offset - b.offset);
  const parts = sorted.map(s => {
    const [r, g, b] = hexToRgb(s.color);
    const a = s.opacity ?? 1;
    return `rgba(${r},${g},${b},${a}) ${s.offset * 100}%`;
  });
  return type === 'linear-gradient'
    ? `linear-gradient(90deg, ${parts.join(', ')})`
    : `radial-gradient(circle, ${parts.join(', ')})`;
}

function GradientBar({ stops, type, selectedIdx, onSelect, onMove }: {
  stops: GradientStop[]; type: 'linear-gradient' | 'radial-gradient';
  selectedIdx: number;
  onSelect: (i: number) => void;
  onMove: (i: number, offset: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const bg = gradCss(stops, type);

  const HANDLE = 12;
  const PAD = HANDLE / 2; // inset so handles at 0%/100% don't clip
  const BAR_H = 16;

  return (
    <div style={{ position: 'relative', marginBottom: 6, paddingBottom: HANDLE / 2 + 2 }}>
      {/* Bar with checkerboard behind for transparency */}
      <div style={{
        position: 'relative', height: BAR_H, borderRadius: 4,
        border: '1px solid rgba(0,0,0,0.06)', overflow: 'hidden',
        marginLeft: PAD, marginRight: PAD,
      }}>
        <div style={{ position: 'absolute', inset: 0, background: CHECK_BG }} />
        <div style={{ position: 'absolute', inset: 0, background: bg }} />
      </div>

      {/* Stop handles — sit below the bar, centered on the bottom edge */}
      {stops.map((stop, i) => {
        const sel = i === selectedIdx;
        const [r, g, b] = hexToRgb(stop.color);
        const stopA = stop.opacity ?? 1;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: BAR_H - HANDLE / 2,
              left: `calc(${PAD}px + ${stop.offset} * (100% - ${PAD * 2}px))`,
              transform: 'translateX(-50%)',
              width: HANDLE, height: HANDLE,
              borderRadius: 3,
              background: `rgba(${r},${g},${b},${stopA})`,
              border: sel ? `2px solid ${C_ACCENT}` : '2px solid white',
              boxShadow: '0 0.5px 2px rgba(0,0,0,0.2)',
              cursor: 'grab', zIndex: sel ? 2 : 1,
            }}
            onPointerDown={e => {
              e.preventDefault();
              onSelect(i);
              e.currentTarget.setPointerCapture(e.pointerId);
              const onMv = (ev: PointerEvent) => {
                const rect = ref.current?.getBoundingClientRect();
                if (!rect) return;
                onMove(i, Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width)));
              };
              const onUp = () => {
                window.removeEventListener('pointermove', onMv);
                window.removeEventListener('pointerup', onUp);
              };
              window.addEventListener('pointermove', onMv);
              window.addEventListener('pointerup', onUp);
            }}
          />
        );
      })}
      {/* Invisible hit-area aligned with the bar */}
      <div ref={ref} style={{ position: 'absolute', left: PAD, right: PAD, top: 0, height: BAR_H }} />
    </div>
  );
}

// ── Inline input (hex or numeric) ─────────────────────────────────

function PickerInput({ value, onChange, width, suffix, step = 1, shiftStep = 10 }: {
  value: string; onChange: (v: string) => void; width?: number; suffix?: string;
  step?: number; shiftStep?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrubRef = useRef<{ startX: number; startVal: number; active: boolean } | null>(null);
  const isNumeric = suffix != null;

  const commit = useCallback(() => {
    setEditing(false);
    onChange(draft);
  }, [draft, onChange]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    if (!isNumeric || editing) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    scrubRef.current = { startX: e.clientX, startVal: parseFloat(value) || 0, active: false };
  }, [isNumeric, editing, value]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!scrubRef.current) return;
    const dx = e.clientX - scrubRef.current.startX;
    if (!scrubRef.current.active && Math.abs(dx) < 3) return;
    scrubRef.current.active = true;
    const sensitivity = e.shiftKey ? shiftStep : step;
    const next = Math.round((scrubRef.current.startVal + dx * sensitivity) * 100) / 100;
    onChange(String(next));
  }, [onChange, step, shiftStep]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!scrubRef.current) return;
    const wasScrubbing = scrubRef.current.active;
    scrubRef.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    if (!wasScrubbing) inputRef.current?.focus();
  }, []);

  return (
    <div style={{ position: 'relative', flex: width ? `0 0 ${width}px` : 1, minWidth: 0 }}>
      <input
        ref={inputRef}
        style={{
          ...inputStyle,
          width: '100%',
          boxSizing: 'border-box',
          cursor: isNumeric && !editing ? 'ew-resize' : undefined,
          ...(editing ? { borderColor: C_INPUT_BORDER_FOCUS, background: C_INPUT_BG_ACTIVE } : {}),
        }}
        value={editing ? draft : (suffix ? `${value}${suffix}` : value)}
        onFocus={e => { setEditing(true); setDraft(value); requestAnimationFrame(() => e.target.select()); }}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') { setEditing(false); (e.target as HTMLInputElement).blur(); }
          if (isNumeric && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
            e.preventDefault();
            const delta = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? shiftStep : step);
            const base = parseFloat(editing ? draft : value);
            if (!isNaN(base)) {
              const next = String(Math.round((base + delta) * 100) / 100);
              if (editing) setDraft(next);
              else onChange(next);
            }
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

// ── Fill Picker Popover ───────────────────────────────────────────

export function FillPickerPopover({ fill, onChange, anchor }: {
  fill: Fill;
  onChange: (f: Fill) => void;
  anchor: { top: number; left: number };
}) {
  const [mode, setMode] = useState<FillMode>(
    fill.type === 'none' ? 'solid' : fill.type as FillMode
  );

  // HSV + opacity for solid or active gradient stop
  const initStop = (fill.type === 'linear-gradient' || fill.type === 'radial-gradient')
    ? fill.stops[0] : null;
  const [hsv, setHsv] = useState(() =>
    fill.type === 'solid' ? hexToHsv(fill.color)
    : initStop ? hexToHsv(initStop.color)
    : { h: 0, s: 0, v: 1 }
  );
  const [opacity, setOpacity] = useState(() =>
    fill.type === 'solid' ? fill.opacity
    : initStop ? (initStop.opacity ?? 1)
    : 1
  );

  // Gradient state
  const [stops, setStops] = useState<GradientStop[]>(() =>
    (fill.type === 'linear-gradient' || fill.type === 'radial-gradient')
      ? [...fill.stops]
      : [{ offset: 0, color: '#ffffff', opacity: 1 }, { offset: 1, color: '#000000', opacity: 1 }]
  );
  const [angle, setAngle] = useState(fill.type === 'linear-gradient' ? fill.angle : 90);
  const [selStop, setSelStop] = useState(0);

  const currentHex = hsvToHex(hsv.h, hsv.s, hsv.v);

  // ── Emit helpers ────────────────────────────────────────────────

  const emitSolid = useCallback((h: number, s: number, v: number, o: number) => {
    onChange({ type: 'solid', color: hsvToHex(h, s, v), opacity: o });
  }, [onChange]);

  const emitGradient = useCallback((newStops: GradientStop[], newAngle: number, m: FillMode) => {
    if (m === 'linear-gradient') onChange({ type: 'linear-gradient', stops: newStops, angle: newAngle });
    else onChange({ type: 'radial-gradient', stops: newStops });
  }, [onChange]);

  // ── HSV canvas change ──────────────────────────────────────────

  const handleSV = useCallback((s: number, v: number) => {
    const next = { ...hsv, s, v };
    setHsv(next);
    if (mode === 'solid') {
      emitSolid(next.h, next.s, next.v, opacity);
    } else {
      const newStops = stops.map((st, i) => i === selStop ? { ...st, color: hsvToHex(next.h, next.s, next.v) } : st);
      setStops(newStops);
      emitGradient(newStops, angle, mode);
    }
  }, [hsv, mode, opacity, stops, selStop, angle, emitSolid, emitGradient]);

  const handleHue = useCallback((h: number) => {
    const next = { ...hsv, h };
    setHsv(next);
    if (mode === 'solid') {
      emitSolid(next.h, next.s, next.v, opacity);
    } else {
      const newStops = stops.map((st, i) => i === selStop ? { ...st, color: hsvToHex(next.h, next.s, next.v) } : st);
      setStops(newStops);
      emitGradient(newStops, angle, mode);
    }
  }, [hsv, mode, opacity, stops, selStop, angle, emitSolid, emitGradient]);

  const handleOpacity = useCallback((o: number) => {
    setOpacity(o);
    if (mode === 'solid') {
      emitSolid(hsv.h, hsv.s, hsv.v, o);
    } else {
      const newStops = stops.map((st, i) => i === selStop ? { ...st, opacity: Math.round(o * 100) / 100 } : st);
      setStops(newStops);
      emitGradient(newStops, angle, mode);
    }
  }, [hsv, mode, stops, selStop, angle, emitSolid, emitGradient]);

  // ── Mode switch ────────────────────────────────────────────────

  const switchMode = useCallback((m: FillMode) => {
    setMode(m);
    if (m === 'solid') {
      emitSolid(hsv.h, hsv.s, hsv.v, opacity);
    } else {
      const currentColor = hsvToHex(hsv.h, hsv.s, hsv.v);
      const newStops = stops.length >= 2 ? stops
        : [{ offset: 0, color: currentColor, opacity: 1 }, { offset: 1, color: '#000000', opacity: 1 }];
      setStops(newStops);
      setSelStop(0);
      setHsv(hexToHsv(newStops[0].color));
      setOpacity(newStops[0].opacity ?? 1);
      emitGradient(newStops, angle, m);
    }
  }, [hsv, opacity, stops, angle, emitSolid, emitGradient]);

  // ── Gradient stop actions ──────────────────────────────────────

  const selectStop = useCallback((i: number) => {
    setSelStop(i);
    setHsv(hexToHsv(stops[i].color));
    setOpacity(stops[i].opacity ?? 1);
  }, [stops]);

  const moveStop = useCallback((i: number, offset: number) => {
    const newStops = stops.map((s, j) => j === i ? { ...s, offset } : s);
    setStops(newStops);
    emitGradient(newStops, angle, mode);
  }, [stops, angle, mode, emitGradient]);

  const addStop = useCallback(() => {
    const mid: GradientStop = { offset: 0.5, color: '#888888', opacity: 1 };
    const newStops = [...stops, mid].sort((a, b) => a.offset - b.offset);
    setStops(newStops);
    const newIdx = newStops.indexOf(mid);
    setSelStop(newIdx);
    setHsv(hexToHsv(mid.color));
    setOpacity(1);
    emitGradient(newStops, angle, mode);
  }, [stops, angle, mode, emitGradient]);

  const removeStop = useCallback((i: number) => {
    if (stops.length <= 2) return;
    const newStops = stops.filter((_, j) => j !== i);
    const newSel = Math.min(selStop, newStops.length - 1);
    setStops(newStops);
    setSelStop(newSel);
    setHsv(hexToHsv(newStops[newSel].color));
    setOpacity(newStops[newSel].opacity ?? 1);
    emitGradient(newStops, angle, mode);
  }, [stops, selStop, angle, mode, emitGradient]);

  const updateStopHex = useCallback((i: number, hex: string) => {
    let v = hex.trim();
    if (!v.startsWith('#')) v = '#' + v;
    if (!/^#([0-9a-fA-F]{3}){1,2}$/.test(v)) return;
    if (v.length === 4) v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
    const newStops = stops.map((s, j) => j === i ? { ...s, color: v } : s);
    setStops(newStops);
    if (i === selStop) setHsv(hexToHsv(v));
    emitGradient(newStops, angle, mode);
  }, [stops, selStop, angle, mode, emitGradient]);

  const updateStopOffset = useCallback((i: number, pct: string) => {
    const num = parseFloat(pct);
    if (isNaN(num)) return;
    const offset = Math.max(0, Math.min(1, num / 100));
    const newStops = stops.map((s, j) => j === i ? { ...s, offset } : s);
    setStops(newStops);
    emitGradient(newStops, angle, mode);
  }, [stops, angle, mode, emitGradient]);

  const updateStopOpacity = useCallback((i: number, pct: string) => {
    const num = parseFloat(pct);
    if (isNaN(num)) return;
    const o = Math.max(0, Math.min(1, num / 100));
    const newStops = stops.map((s, j) => j === i ? { ...s, opacity: o } : s);
    setStops(newStops);
    if (i === selStop) setOpacity(o);
    emitGradient(newStops, angle, mode);
  }, [stops, selStop, angle, mode, emitGradient]);

  const updateAngle = useCallback((v: string) => {
    const num = parseFloat(v);
    if (isNaN(num)) return;
    const a = ((num % 360) + 360) % 360;
    setAngle(a);
    emitGradient(stops, a, mode);
  }, [stops, mode, emitGradient]);

  const handleHexCommit = useCallback((hex: string) => {
    let v = hex.trim();
    if (!v.startsWith('#')) v = '#' + v;
    if (!/^#([0-9a-fA-F]{3}){1,2}$/.test(v)) return;
    if (v.length === 4) v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
    const next = hexToHsv(v);
    setHsv(next);
    if (mode === 'solid') emitSolid(next.h, next.s, next.v, opacity);
  }, [mode, opacity, emitSolid]);

  const handleOpacityCommit = useCallback((v: string) => {
    const num = parseFloat(v);
    if (isNaN(num)) return;
    const o = Math.max(0, Math.min(1, num / 100));
    setOpacity(o);
    if (mode === 'solid') {
      emitSolid(hsv.h, hsv.s, hsv.v, o);
    } else {
      const newStops = stops.map((st, i) => i === selStop ? { ...st, opacity: o } : st);
      setStops(newStops);
      emitGradient(newStops, angle, mode);
    }
  }, [hsv, mode, stops, selStop, angle, emitSolid, emitGradient]);

  // Position
  const POP_W = 280;
  const top = Math.min(anchor.top, window.innerHeight - 480);
  const left = Math.min(Math.max(8, anchor.left - POP_W / 2), window.innerWidth - POP_W - 8);

  const isGradient = mode !== 'solid';

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      style={{
        position: 'fixed', top, left, width: POP_W,
        borderRadius: R_XL, background: '#ffffff',
        boxShadow: SHADOW_MD, padding: 14, zIndex: 700, fontFamily: FONT,
      }}
      onPointerDown={e => e.stopPropagation()}
    >
      {/* Tabs */}
      <FillTabs mode={mode} onChange={switchMode} />

      {/* HSV Canvas */}
      <SatValCanvas hue={hsv.h} sat={hsv.s} val={hsv.v} onChange={handleSV} />

      {/* Hue slider */}
      <div style={{ marginTop: 10 }}>
        <Slider value={hsv.h} max={360} background={HUE_BG} thumbColor={`hsl(${hsv.h},100%,50%)`} onChange={handleHue} />
      </div>

      {/* Opacity slider (always shown) */}
      <div style={{ marginTop: 8 }}>
        <Slider
          value={opacity} max={1}
          background={`linear-gradient(to right, transparent, ${currentHex}), ${CHECK_BG}`}
          onChange={handleOpacity}
        />
      </div>

      {/* Hex + Opacity row (solid) */}
      {mode === 'solid' && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, alignItems: 'center' }}>
          <div style={{
            width: 24, height: 24, borderRadius: R_SM, flexShrink: 0,
            background: currentHex, border: '1px solid rgba(0,0,0,0.06)',
          }} />
          <PickerInput value={currentHex} onChange={handleHexCommit} />
          <PickerInput value={String(Math.round(opacity * 100))} onChange={handleOpacityCommit} width={44} suffix="%" />
        </div>
      )}

      {/* Gradient controls */}
      {isGradient && (
        <div style={{ marginTop: 12 }}>
          {/* Angle (linear only) */}
          {mode === 'linear-gradient' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 500, color: C_LABEL, fontFamily: FONT }}>Angle</span>
              <PickerInput value={String(Math.round(angle))} onChange={updateAngle} width={48} suffix="°" />
            </div>
          )}

          {/* Gradient bar */}
          <GradientBar
            stops={stops} type={mode as 'linear-gradient' | 'radial-gradient'}
            selectedIdx={selStop} onSelect={selectStop} onMove={moveStop}
          />

          {/* Stops list — pull to popover padding edges */}
          <div style={{ marginTop: 2, marginLeft: -14, marginRight: -14 }}>
            <div style={{ height: 1, background: 'rgba(0,0,0,0.06)' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px 4px' }}>
              <span style={{ fontSize: 11, fontWeight: 500, color: C_LABEL, fontFamily: FONT }}>Stops</span>
              <motion.button
                whileHover={{ background: C_HOVER }}
                whileTap={{ scale: 0.9 }}
                onClick={addStop}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: R_SM, border: 'none', background: 'transparent', cursor: 'pointer', color: C_MUTED, padding: 0 }}
              >
                <Plus size={10} strokeWidth={2} />
              </motion.button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '0 6px 4px' }}>
              {stops.map((stop, i) => (
                <div
                  key={i}
                  onClick={() => selectStop(i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '4px 8px',
                    borderLeft: i === selStop ? `2px solid ${C_ACCENT}` : '2px solid transparent',
                    cursor: 'pointer', transition: 'border-color 0.1s',
                  }}
                >
                  <PickerInput
                    value={String(Math.round(stop.offset * 100))}
                    onChange={v => updateStopOffset(i, v)}
                    width={44} suffix="%"
                  />
                  <div style={{
                    width: 18, height: 18, borderRadius: 3, flexShrink: 0,
                    background: `rgba(${hexToRgb(stop.color).join(',')},${stop.opacity ?? 1})`,
                    border: '1px solid rgba(0,0,0,0.08)',
                  }} />
                  <PickerInput value={stop.color} onChange={v => updateStopHex(i, v)} />
                  <PickerInput
                    value={String(Math.round((stop.opacity ?? 1) * 100))}
                    onChange={v => updateStopOpacity(i, v)}
                    width={44} suffix="%"
                  />
                  <motion.button
                    whileHover={stops.length > 2 ? { background: 'rgba(239,68,68,0.08)' } : {}}
                    whileTap={stops.length > 2 ? { scale: 0.9 } : {}}
                    onClick={e => { e.stopPropagation(); removeStop(i); }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 18, height: 18, borderRadius: 4, border: 'none',
                      background: 'transparent', cursor: stops.length > 2 ? 'pointer' : 'default',
                      color: C_MUTED, padding: 0, flexShrink: 0,
                      opacity: stops.length > 2 ? 1 : 0.25,
                    }}
                  >
                    <Minus size={10} strokeWidth={2} />
                  </motion.button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ── Simple color picker (for strokes/shadows — hex only) ──────────

export function ColorPickerPopover({ color, onChange, anchor }: {
  color: string; onChange: (hex: string) => void;
  anchor: { top: number; left: number };
}) {
  const [hsv, setHsv] = useState(() => hexToHsv(color));
  const emit = useCallback((h: number, s: number, v: number) => {
    setHsv({ h, s, v });
    onChange(hsvToHex(h, s, v));
  }, [onChange]);

  const top = Math.min(anchor.top, window.innerHeight - 220);
  const left = Math.min(Math.max(8, anchor.left - 100), window.innerWidth - 270);

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      style={{
        position: 'fixed', top, left, width: 252,
        borderRadius: R_XL, background: '#ffffff',
        boxShadow: SHADOW_MD, padding: 14, zIndex: 700, fontFamily: FONT,
      }}
      onPointerDown={e => e.stopPropagation()}
    >
      <SatValCanvas hue={hsv.h} sat={hsv.s} val={hsv.v} onChange={(s, v) => emit(hsv.h, s, v)} />
      <div style={{ marginTop: 10 }}>
        <Slider value={hsv.h} max={360} background={HUE_BG} thumbColor={`hsl(${hsv.h},100%,50%)`} onChange={h => emit(h, hsv.s, hsv.v)} />
      </div>
    </motion.div>
  );
}

// ── Export gradient CSS helper for use in panels ──────────────────

export { gradCss as gradientToCss };
