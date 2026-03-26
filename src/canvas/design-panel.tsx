import { useState, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, X, Square, Circle, PenTool, Layers } from 'lucide-react';
import type { ItemDef, Fill, StrokeDef, ShadowDef } from './types';
import { gradientToCss } from './color-picker';
import {
  FONT, C_LABEL, C_VALUE, C_ICON, C_MUTED,
  C_HOVER, C_INPUT_BG, C_INPUT_BG_ACTIVE, C_INPUT_BORDER_FOCUS,
  C_BORDER_SUBTLE, C_BORDER_CARD, C_CARD_BG,
  C_SURFACE_ELEVATED, SHADOW_MD,
} from './tokens';

// ── Shared Components ─────────────────────────────────────────────

function ColorSwatch({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  return (
    <div style={{
      position: 'relative',
      width: 24, height: 24,
      borderRadius: 6,
      overflow: 'hidden',
      border: `1px solid ${C_BORDER_SUBTLE}`,
      background: color,
      flexShrink: 0,
      cursor: 'pointer',
    }}>
      <input
        type="color"
        value={color}
        onChange={e => onChange(e.target.value)}
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          opacity: 0, cursor: 'pointer',
        }}
      />
    </div>
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
      onChange(
        v.length === 4
          ? `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`
          : v
      );
    }
  }, [draft, onChange]);

  return (
    <input
      style={{
        flex: 1, minWidth: 0,
        padding: '4px 6px', borderRadius: 6,
        border: editing ? `1px solid ${C_INPUT_BORDER_FOCUS}` : '1px solid transparent',
        background: editing ? C_INPUT_BG_ACTIVE : C_INPUT_BG, fontSize: 11, fontWeight: 500,
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

function PropNumericInput({ value, onChange, suffix = '', width = 42, min, max }: {
  value: number; onChange: (v: number) => void; suffix?: string; width?: number; min?: number; max?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const display = suffix ? `${value}${suffix}` : String(value);

  useEffect(() => { if (!editing) setDraft(display); }, [display, editing]);

  const commit = useCallback(() => {
    setEditing(false);
    const num = parseFloat(draft.replace(/[^0-9.\-]/g, ''));
    if (!isNaN(num)) {
      let clamped = num;
      if (min !== undefined) clamped = Math.max(min, clamped);
      if (max !== undefined) clamped = Math.min(max, clamped);
      onChange(Math.round(clamped * 100) / 100);
    }
  }, [draft, onChange, min, max]);

  return (
    <input
      style={{
        width, padding: '4px 0', borderRadius: 6,
        border: editing ? `1px solid ${C_INPUT_BORDER_FOCUS}` : '1px solid transparent',
        background: editing ? C_INPUT_BG_ACTIVE : C_INPUT_BG, fontSize: 11, fontWeight: 500,
        fontFamily: FONT, color: C_VALUE, textAlign: 'center',
        outline: 'none', transition: 'border-color 0.15s, background 0.15s',
      }}
      value={editing ? draft : display}
      onFocus={e => { setEditing(true); setDraft(String(value)); requestAnimationFrame(() => e.target.select()); }}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') { setEditing(false); (e.target as HTMLInputElement).blur(); }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const delta = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1);
          let next = value + delta;
          if (min !== undefined) next = Math.max(min, next);
          if (max !== undefined) next = Math.min(max, next);
          next = Math.round(next * 100) / 100;
          onChange(next);
          setDraft(String(next));
        }
      }}
      onPointerDown={e => e.stopPropagation()}
      spellCheck={false}
    />
  );
}

function SmallLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 500, color: C_LABEL,
      fontFamily: FONT, userSelect: 'none', flexShrink: 0,
    }}>
      {children}
    </span>
  );
}

function SmallButton({ onClick, children, title }: {
  onClick: () => void; children: React.ReactNode; title?: string;
}) {
  return (
    <motion.button
      whileHover={{ background: C_HOVER }}
      whileTap={{ scale: 0.9 }}
      title={title}
      onClick={e => { e.stopPropagation(); onClick(); }}
      onPointerDown={e => e.stopPropagation()}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 20, height: 20, borderRadius: 5,
        border: 'none', background: 'transparent',
        cursor: 'pointer', color: C_MUTED, padding: 0,
      }}
    >
      {children}
    </motion.button>
  );
}

// ── Section Layout ────────────────────────────────────────────────

function SectionHeader({ title, hasContent, onAdd, onRemove }: {
  title: string; hasContent: boolean; onAdd?: () => void; onRemove?: () => void;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: 6, padding: '0 2px',
    }}>
      <span style={{
        fontSize: 11, fontWeight: 500, color: C_LABEL,
        fontFamily: FONT,
      }}>
        {title}
      </span>
      <div style={{ display: 'flex', gap: 2 }}>
        {hasContent && onRemove && (
          <SmallButton onClick={onRemove} title={`Remove ${title.toLowerCase()}`}>
            <X size={10} strokeWidth={2} />
          </SmallButton>
        )}
        {!hasContent && onAdd && (
          <SmallButton onClick={onAdd} title={`Add ${title.toLowerCase()}`}>
            <Plus size={10} strokeWidth={2} />
          </SmallButton>
        )}
      </div>
    </div>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      borderRadius: 10,
      background: C_CARD_BG,
      padding: '8px 10px',
    }}>
      {children}
    </div>
  );
}

function Section({ title, hasContent, onAdd, onRemove, alwaysShow, children }: {
  title: string;
  hasContent: boolean;
  onAdd?: () => void;
  onRemove?: () => void;
  alwaysShow?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginTop: 12 }}>
      <SectionHeader title={title} hasContent={hasContent} onAdd={onAdd} onRemove={onRemove} />
      <AnimatePresence>
        {(hasContent || alwaysShow) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            style={{ overflow: 'hidden' }}
          >
            <SectionCard>{children}</SectionCard>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Shape Type Icon ───────────────────────────────────────────────

function ShapeIcon({ type }: { type: string }) {
  const iconProps = { size: 14, strokeWidth: 1.5, color: C_ICON };
  switch (type) {
    case 'rectangle': return <Square {...iconProps} />;
    case 'ellipse': return <Circle {...iconProps} />;
    case 'vector': return <PenTool {...iconProps} />;
    default: return <Square {...iconProps} />;
  }
}

// ── Section Content Components ────────────────────────────────────

function FillContent({ fill, onChange }: {
  fill: Fill & { type: 'solid' };
  onChange: (f: Fill) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <ColorSwatch color={fill.color} onChange={c => onChange({ ...fill, color: c })} />
      <HexInput value={fill.color} onChange={c => onChange({ ...fill, color: c })} />
      <PropNumericInput
        value={Math.round(fill.opacity * 100)}
        onChange={v => onChange({ ...fill, opacity: v / 100 })}
        suffix="%"
        width={44}
        min={0}
        max={100}
      />
    </div>
  );
}

function StrokeContent({ stroke, onChange }: {
  stroke: StrokeDef;
  onChange: (s: StrokeDef) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <ColorSwatch color={stroke.color} onChange={c => onChange({ ...stroke, color: c })} />
      <HexInput value={stroke.color} onChange={c => onChange({ ...stroke, color: c })} />
      <SmallLabel>W</SmallLabel>
      <PropNumericInput
        value={stroke.width}
        onChange={w => onChange({ ...stroke, width: w })}
        suffix="px"
        width={44}
        min={0.5}
        max={100}
      />
    </div>
  );
}

function ShadowContent({ shadow, onChange }: {
  shadow: ShadowDef;
  onChange: (s: ShadowDef) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <ColorSwatch color={shadow.color} onChange={c => onChange({ ...shadow, color: c })} />
        <HexInput value={shadow.color} onChange={c => onChange({ ...shadow, color: c })} />
        <PropNumericInput
          value={Math.round(shadow.opacity * 100)}
          onChange={v => onChange({ ...shadow, opacity: v / 100 })}
          suffix="%"
          width={44}
          min={0}
          max={100}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <SmallLabel>X</SmallLabel>
        <PropNumericInput value={shadow.x} onChange={v => onChange({ ...shadow, x: v })} width={36} />
        <SmallLabel>Y</SmallLabel>
        <PropNumericInput value={shadow.y} onChange={v => onChange({ ...shadow, y: v })} width={36} />
        <SmallLabel>B</SmallLabel>
        <PropNumericInput value={shadow.blur} onChange={v => onChange({ ...shadow, blur: v })} width={36} min={0} />
      </div>
    </div>
  );
}

// ── Multi-selection: collect unique fills ─────────────────────────

type ColorGroup = {
  fill: Fill;
  labels: string[];
};

function collectSelectionColors(items: ItemDef[]): ColorGroup[] {
  const groups: Map<string, ColorGroup> = new Map();

  for (const item of items) {
    const fills = (item.props.fills as Fill[]) ?? [];
    if (fills.length === 0 || fills[0].type === 'none') continue;
    const fill = fills[0];

    if (fill.type === 'solid') {
      const key = fill.color.toLowerCase();
      const existing = groups.get(key);
      if (existing) {
        existing.labels.push(item.label);
      } else {
        groups.set(key, { fill, labels: [item.label] });
      }
    } else if (fill.type === 'linear-gradient' || fill.type === 'radial-gradient') {
      // Each gradient is unique per item
      const key = `${fill.type}-${item.label}`;
      groups.set(key, { fill, labels: [item.label] });
    }
  }

  return Array.from(groups.values());
}

// ── Selection color row ──────────────────────────────────────────

function SelectionColorRow({ group, onChange, isLast }: {
  group: ColorGroup;
  onChange: (newFill: Fill, labels: string[]) => void;
  isLast: boolean;
}) {
  const { fill, labels } = group;

  if (fill.type === 'solid') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 0',
        borderBottom: isLast ? 'none' : `1px solid ${C_BORDER_CARD}`,
      }}>
        <ColorSwatch
          color={fill.color}
          onChange={c => onChange({ ...fill, color: c }, labels)}
        />
        <HexInput
          value={fill.color}
          onChange={c => onChange({ ...fill, color: c }, labels)}
        />
        <PropNumericInput
          value={Math.round(fill.opacity * 100)}
          onChange={v => onChange({ ...fill, opacity: v / 100 }, labels)}
          suffix="%"
          width={44}
          min={0}
          max={100}
        />
      </div>
    );
  }

  // Gradient row — show type label, not editable color swatch for now
  if (fill.type === 'none') return null;
  const gradLabel = fill.type === 'linear-gradient' ? 'Linear' : 'Radial';
  const stops = fill.stops;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '6px 0',
      borderBottom: isLast ? 'none' : '1px solid rgba(0,0,0,0.04)',
    }}>
      <div style={{
        width: 24, height: 24, borderRadius: 6,
        border: `1px solid ${C_BORDER_SUBTLE}`,
        background: gradientToCss(stops, fill.type as 'linear-gradient' | 'radial-gradient'),
        flexShrink: 0,
      }} />
      <span style={{
        flex: 1, fontSize: 11, fontWeight: 500,
        fontFamily: FONT, color: C_VALUE,
        paddingLeft: 2,
      }}>
        {gradLabel}
      </span>
      <PropNumericInput
        value={100}
        onChange={() => {}}
        suffix="%"
        width={44}
        min={0}
        max={100}
      />
    </div>
  );
}

// ── Scrollbar suppression ─────────────────────────────────────────

const scrollStyle = `
  .design-panel-scroll { overflow-y: auto; scrollbar-width: none; -ms-overflow-style: none; }
  .design-panel-scroll::-webkit-scrollbar { display: none; }
`;

// ── Panel Shell ───────────────────────────────────────────────────

function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{scrollStyle}</style>
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        className="design-panel-scroll"
        style={{
          position: 'fixed',
          right: 16, top: 16,
          width: 248,
          maxHeight: 'calc(100vh - 120px)',
          borderRadius: 16,
          background: C_SURFACE_ELEVATED,
          boxShadow: SHADOW_MD,
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          fontFamily: FONT,
          zIndex: 400,
        }}
        onPointerDown={e => e.stopPropagation()}
        onWheel={e => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </>
  );
}

// ── Main Panel ────────────────────────────────────────────────────

type PropUpdate = { label: string; props: Record<string, unknown> };

type DesignPanelProps = {
  items: ItemDef[];
  onPropsChange: (updates: PropUpdate[]) => void;
};

export function DesignPanel({ items, onPropsChange }: DesignPanelProps) {
  const isSingle = items.length === 1;

  // Helper: update a single item
  const updateOne = useCallback((props: Record<string, unknown>) => {
    onPropsChange([{ label: items[0].label, props }]);
  }, [items, onPropsChange]);

  if (isSingle) {
    return <SinglePanel item={items[0]} onPropsChange={updateOne} />;
  }
  return <MultiPanel items={items} onPropsChange={onPropsChange} />;
}

// ── Single-item panel ─────────────────────────────────────────────

function SinglePanel({ item, onPropsChange }: {
  item: ItemDef;
  onPropsChange: (newProps: Record<string, unknown>) => void;
}) {
  const shapeType = (item.props.shapeType as string) ?? 'rectangle';
  const fills = (item.props.fills as Fill[]) ?? [];
  const strokes = (item.props.strokes as StrokeDef[]) ?? [];
  const shadows = (item.props.shadows as ShadowDef[]) ?? [];
  const blurAmount = (item.props.blur as number) ?? 0;
  const borderRadius = (item.props.borderRadius as number) ?? 0;

  const hasFill = fills.length > 0 && fills[0].type !== 'none';
  const hasStroke = strokes.length > 0;
  const hasShadow = shadows.length > 0;

  const shapeLabel = shapeType === 'rectangle' ? 'Rectangle'
    : shapeType === 'ellipse' ? 'Ellipse'
    : 'Vector';

  return (
    <PanelShell>
      {/* Header */}
      <div style={{
        padding: '14px 16px 12px',
        borderBottom: 'none',
        display: 'flex', alignItems: 'center', gap: 8,
        flexShrink: 0,
      }}>
        <ShapeIcon type={shapeType} />
        <span style={{
          fontSize: 13, fontWeight: 600, color: C_VALUE,
          letterSpacing: '-0.01em', fontFamily: FONT,
        }}>
          {shapeLabel}
        </span>
      </div>

      {/* Sections */}
      <div style={{ padding: '0 12px 16px' }}>
        <Section
          title="Fill"
          hasContent={hasFill}
          onAdd={() => onPropsChange({ fills: [{ type: 'solid' as const, color: '#000000', opacity: 1 }] })}
          onRemove={() => onPropsChange({ fills: [] })}
        >
          {hasFill && fills[0].type === 'solid' && (
            <FillContent fill={fills[0]} onChange={f => onPropsChange({ fills: [f] })} />
          )}
        </Section>

        <Section
          title="Stroke"
          hasContent={hasStroke}
          onAdd={() => onPropsChange({ strokes: [{ color: '#000000', width: 1, opacity: 1 }] })}
          onRemove={() => onPropsChange({ strokes: [] })}
        >
          {hasStroke && (
            <StrokeContent stroke={strokes[0]} onChange={s => onPropsChange({ strokes: [s] })} />
          )}
        </Section>

        {shapeType === 'rectangle' && (
          <Section title="Corner Radius" hasContent={true} alwaysShow>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <SmallLabel>R</SmallLabel>
              <PropNumericInput value={borderRadius} onChange={r => onPropsChange({ borderRadius: r })} suffix="px" width={52} min={0} />
            </div>
          </Section>
        )}

        <Section
          title="Shadow"
          hasContent={hasShadow}
          onAdd={() => onPropsChange({ shadows: [{ x: 0, y: 4, blur: 12, color: '#000000', opacity: 0.12 }] })}
          onRemove={() => onPropsChange({ shadows: [] })}
        >
          {hasShadow && (
            <ShadowContent shadow={shadows[0]} onChange={s => onPropsChange({ shadows: [s] })} />
          )}
        </Section>

        <Section title="Blur" hasContent={true} alwaysShow>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <SmallLabel>Amount</SmallLabel>
            <PropNumericInput value={blurAmount} onChange={b => onPropsChange({ blur: b })} suffix="px" width={52} min={0} />
          </div>
        </Section>
      </div>
    </PanelShell>
  );
}

// ── Multi-selection panel ─────────────────────────────────────────

function MultiPanel({ items, onPropsChange }: {
  items: ItemDef[];
  onPropsChange: (updates: PropUpdate[]) => void;
}) {
  const colorGroups = useMemo(() => collectSelectionColors(items), [items]);

  const anyHasStroke = items.some(i => ((i.props.strokes as StrokeDef[]) ?? []).length > 0);
  const anyHasShadow = items.some(i => ((i.props.shadows as ShadowDef[]) ?? []).length > 0);

  const handleColorChange = useCallback((newFill: Fill, labels: string[]) => {
    onPropsChange(labels.map(label => ({
      label,
      props: { fills: [newFill] },
    })));
  }, [onPropsChange]);

  const addStrokeToAll = useCallback(() => {
    onPropsChange(items.map(i => ({
      label: i.label,
      props: { strokes: [{ color: '#000000', width: 1, opacity: 1 }] },
    })));
  }, [items, onPropsChange]);

  const removeStrokeFromAll = useCallback(() => {
    onPropsChange(items.map(i => ({
      label: i.label,
      props: { strokes: [] },
    })));
  }, [items, onPropsChange]);

  const addShadowToAll = useCallback(() => {
    onPropsChange(items.map(i => ({
      label: i.label,
      props: { shadows: [{ x: 0, y: 4, blur: 12, color: '#000000', opacity: 0.12 }] },
    })));
  }, [items, onPropsChange]);

  const removeShadowFromAll = useCallback(() => {
    onPropsChange(items.map(i => ({
      label: i.label,
      props: { shadows: [] },
    })));
  }, [items, onPropsChange]);

  return (
    <PanelShell>
      {/* Header */}
      <div style={{
        padding: '14px 16px 12px',
        borderBottom: 'none',
        display: 'flex', alignItems: 'center', gap: 8,
        flexShrink: 0,
      }}>
        <Layers size={14} strokeWidth={1.5} color="#6b7280" />
        <span style={{
          fontSize: 13, fontWeight: 600, color: C_VALUE,
          letterSpacing: '-0.01em', fontFamily: FONT,
        }}>
          {items.length} layers
        </span>
      </div>

      <div style={{ padding: '0 12px 16px' }}>
        {/* Selection Colors */}
        {colorGroups.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <SectionHeader title="Selection colors" hasContent={true} />
            <SectionCard>
              {colorGroups.map((group, i) => (
                <SelectionColorRow
                  key={group.fill.type === 'solid' ? group.fill.color : `grad-${i}`}
                  group={group}
                  onChange={handleColorChange}
                  isLast={i === colorGroups.length - 1}
                />
              ))}
            </SectionCard>
          </div>
        )}

        {/* Stroke */}
        <div style={{ marginTop: 12 }}>
          <SectionHeader
            title="Stroke"
            hasContent={anyHasStroke}
            onAdd={addStrokeToAll}
            onRemove={removeStrokeFromAll}
          />
        </div>

        {/* Shadow */}
        <div style={{ marginTop: 12 }}>
          <SectionHeader
            title="Shadow"
            hasContent={anyHasShadow}
            onAdd={addShadowToAll}
            onRemove={removeShadowFromAll}
          />
        </div>
      </div>
    </PanelShell>
  );
}
