import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { StepButton } from './step-button';
import { InfoButton, SettingsButton } from './info-button';
import type { ItemState } from './types';

const FONT = "'Geist', ui-monospace, SFMono-Regular, Menlo, monospace";

const inputBase: React.CSSProperties = {
  borderRadius: 6,
  background: '#f4f5f6',
  padding: '5px 0',
  fontSize: 11,
  fontWeight: 500,
  color: '#374151',
  border: '1px solid transparent',
  outline: 'none',
  textAlign: 'center',
  fontFamily: FONT,
  transition: 'border-color 0.15s, background 0.15s',
};

function NumericInput({
  value,
  mixed,
  onChange,
  suffix = '',
  width = 44,
}: {
  value: number;
  mixed?: boolean;
  onChange: (v: number) => void;
  suffix?: string;
  width?: number;
}) {
  const display = mixed ? '\u2014' : (suffix ? `${value}${suffix}` : String(value));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(display);

  useEffect(() => {
    if (!editing) setDraft(display);
  }, [display, editing]);

  const commit = useCallback(() => {
    setEditing(false);
    const cleaned = draft.replace(/[^0-9.\-]/g, '');
    const num = parseFloat(cleaned);
    if (!isNaN(num)) {
      onChange(num);
    }
  }, [draft, onChange]);

  return (
    <input
      style={{
        ...inputBase,
        width,
        color: mixed && !editing ? '#9ca3af' : '#374151',
        ...(editing ? { borderColor: 'rgba(59,130,246,0.5)', background: '#fff' } : {}),
      }}
      value={editing ? draft : display}
      onFocus={() => {
        setEditing(true);
        setDraft(mixed ? '' : String(value));
      }}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setEditing(false);
          setDraft(display);
          (e.target as HTMLInputElement).blur();
        }
      }}
      onPointerDown={e => e.stopPropagation()}
      spellCheck={false}
    />
  );
}

// Single-select panel props
type SingleProps = {
  mode: 'single';
  label: string;
  state: ItemState;
  onRename: (newLabel: string) => void;
};

// Multi-select panel props
type MultiProps = {
  mode: 'multi';
  count: number;
  labels: string[];
  states: ItemState[];
  previews: Record<string, React.ReactNode>;
  onDeselectItem: (label: string) => void;
  onRenameItem: (oldLabel: string, newLabel: string) => void;
  onReorderZ: (orderedLabels: string[]) => void;
};

type LayerInfo = { label: string; z: number; preview?: React.ReactNode };

type ControlPanelProps = (SingleProps | MultiProps) & {
  copied: boolean;
  onCommitChange: (patch: Partial<ItemState>) => void;
  onDeltaChange?: (delta: Partial<ItemState>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onPlace: () => void;
  onInfoClick?: () => void;
  onSettingsClick?: () => void;
  layers: LayerInfo[];
  onReorderAllZ: (orderedLabels: string[]) => void;
  onRenameLayer: (oldLabel: string, newLabel: string) => void;
};

function allSame(states: ItemState[], key: keyof ItemState): boolean {
  if (states.length === 0) return true;
  const first = states[0][key];
  return states.every(s => s[key] === first);
}

export function ControlPanel(props: ControlPanelProps) {
  const { copied, onCommitChange, onDuplicate, onDelete, onPlace, onInfoClick, onSettingsClick, layers, onReorderAllZ, onRenameLayer } = props;
  const onDelta = props.onDeltaChange;

  const isSingle = props.mode === 'single';
  const state = isSingle ? props.state : props.states[0];
  const multiStates = isSingle ? [props.state] : props.states;

  const { scale, rot, z = 0 } = state;
  const scaleMixed = !allSame(multiStates, 'scale');
  const rotMixed = !allSame(multiStates, 'rot');
  const zMixed = !allSame(multiStates, 'z');

  const [editingLabel, setEditingLabel] = useState(isSingle ? props.label : '');
  const [labelEditing, setLabelEditing] = useState(false);
  const labelInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (isSingle) setEditingLabel(props.label);
  }, [isSingle, isSingle ? props.label : '']);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      style={{
        position: 'fixed',
        bottom: 90,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        zIndex: 500,
        pointerEvents: 'none',
      }}
      onPointerDown={e => e.stopPropagation()}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        borderRadius: 16,
        background: 'rgba(255,255,255,0.97)',
        padding: '6px 8px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.06)',
        backdropFilter: 'blur(24px)',
        fontFamily: FONT,
        pointerEvents: 'auto',
      }}>

        {/* Label (single) or Count (multi) */}
        {isSingle ? (
          <input
            ref={labelInputRef}
            readOnly={!labelEditing}
            style={{
              width: 'auto',
              minWidth: 48,
              maxWidth: 120,
              borderRadius: 8,
              background: labelEditing ? '#fff' : '#eff6ff',
              padding: '5px 10px',
              fontSize: 11,
              fontWeight: 600,
              color: '#2563eb',
              border: labelEditing ? '1px solid rgba(59,130,246,0.5)' : '1px solid transparent',
              outline: 'none',
              fontFamily: FONT,
              cursor: labelEditing ? 'text' : 'default',
              userSelect: labelEditing ? 'auto' : 'none',
              transition: 'border-color 0.15s, background 0.15s',
            }}
            value={labelEditing ? editingLabel : props.label}
            onDoubleClick={() => {
              setLabelEditing(true);
              setEditingLabel(props.label);
              requestAnimationFrame(() => {
                labelInputRef.current?.focus();
                labelInputRef.current?.select();
              });
            }}
            onChange={e => setEditingLabel(e.target.value)}
            onBlur={() => {
              setLabelEditing(false);
              if (editingLabel && editingLabel !== props.label) props.onRename(editingLabel);
            }}
            onKeyDown={e => {
              e.stopPropagation();
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') { setLabelEditing(false); setEditingLabel(props.label); (e.target as HTMLInputElement).blur(); }
            }}
            onPointerDown={e => { if (labelEditing) e.stopPropagation(); }}
            spellCheck={false}
          />
        ) : (
          <SelectionBadge
            count={props.count}
            labels={props.labels}
            states={props.states}
            previews={props.previews}
            onDeselect={props.onDeselectItem}
            onRename={props.onRenameItem}
            onReorderZ={props.onReorderZ}
          />
        )}

        <Divider />

        {/* Position (single only) */}
        {isSingle && (
          <>
            <Group>
              <Label>X</Label>
              <NumericInput value={props.state.x} onChange={v => onCommitChange({ x: Math.round(v) })} width={46} />
              <Label>Y</Label>
              <NumericInput value={props.state.y} onChange={v => onCommitChange({ y: Math.round(v) })} width={46} />
            </Group>
            <Divider />
          </>
        )}

        {/* Scale */}
        <Group>
          <StepButton onClick={() => onDelta ? onDelta({ scale: -0.1 }) : onCommitChange({ scale: Math.round(Math.max(0.1, scale - 0.1) * 100) / 100 })}>−</StepButton>
          <NumericInput
            value={Math.round(scale * 10) / 10}
            mixed={scaleMixed}
            onChange={v => onCommitChange({ scale: Math.max(0.1, Math.min(4, v)) })}
            suffix="×"
            width={42}
          />
          <StepButton onClick={() => onDelta ? onDelta({ scale: 0.1 }) : onCommitChange({ scale: Math.round(Math.min(4, scale + 0.1) * 100) / 100 })}>+</StepButton>
        </Group>

        <Divider />

        {/* Rotation */}
        <Group>
          <StepButton onClick={() => onDelta ? onDelta({ rot: -1 }) : onCommitChange({ rot: Math.round((rot - 1) * 100) / 100 })}>↺</StepButton>
          <NumericInput
            value={Math.round(rot * 100) / 100}
            mixed={rotMixed}
            onChange={v => onCommitChange({ rot: v })}
            suffix="°"
            width={42}
          />
          <StepButton onClick={() => onDelta ? onDelta({ rot: 1 }) : onCommitChange({ rot: Math.round((rot + 1) * 100) / 100 })}>↻</StepButton>
        </Group>

        <Divider />

        {/* Z-index */}
        <Group>
          <StepButton onClick={() => onDelta ? onDelta({ z: -1 }) : onCommitChange({ z: z - 1 })}>↓</StepButton>
          <Label>Z</Label>
          <NumericInput
            value={z}
            mixed={zMixed}
            onChange={v => onCommitChange({ z: Math.round(v) })}
            width={34}
          />
          <StepButton onClick={() => onDelta ? onDelta({ z: 1 }) : onCommitChange({ z: z + 1 })}>↑</StepButton>
          <LayersButton layers={layers} onReorderZ={onReorderAllZ} onRename={onRenameLayer} />
        </Group>

        <Divider />

        {/* Actions */}
        <Group gap={2}>
          <ActionButton onClick={onDuplicate} title="Duplicate (Cmd+D)">Dup</ActionButton>
          <ActionButton onClick={onDelete} title="Delete (Backspace)" color="#ef4444">Del</ActionButton>
          {isSingle && (
            <ActionButton onClick={() => onCommitChange({ x: 0, y: 0, scale: 1, rot: 0, z: 0 })} title="Reset to defaults">Reset</ActionButton>
          )}
        </Group>

        {/* Place */}
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.95 }}
          style={{
            borderRadius: 8,
            padding: '5px 14px',
            fontSize: 11,
            fontWeight: 600,
            color: '#fff',
            background: copied ? '#16a34a' : '#3b82f6',
            border: 'none',
            cursor: 'pointer',
            transition: 'background 0.15s',
            fontFamily: FONT,
          }}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onPlace(); }}
        >
          {copied ? '✓ Placed' : 'Place'}
        </motion.button>

        {/* Info & Settings */}
        <AnimatePresence>
          {onSettingsClick && <SettingsButton key="toolbar-settings" onClick={onSettingsClick} variant="toolbar" />}
          {onInfoClick && <InfoButton key="toolbar-info" onClick={onInfoClick} variant="toolbar" />}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function LayersButton({
  layers,
  onReorderZ,
  onRename,
}: {
  layers: LayerInfo[];
  onReorderZ: (orderedLabels: string[]) => void;
  onRename: (oldLabel: string, newLabel: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sort by z descending (highest at top)
  const sortedKey = layers.map(l => `${l.label}:${l.z}`).join(',');
  const sorted = useRef<string[]>([]);
  const prevSortedKey = useRef('');
  if (sortedKey !== prevSortedKey.current) {
    sorted.current = [...layers].sort((a, b) => b.z - a.z).map(l => l.label);
    prevSortedKey.current = sortedKey;
  }

  const previewMap = useRef<Record<string, React.ReactNode>>({});
  for (const l of layers) {
    previewMap.current[l.label] = l.preview;
  }

  const [order, setOrder] = useState(sorted.current);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartY = useRef(0);
  const orderRef = useRef(order);
  orderRef.current = order;
  const dragIndexRef = useRef(dragIndex);
  dragIndexRef.current = dragIndex;

  useEffect(() => {
    if (dragIndexRef.current === null) {
      setOrder(sorted.current);
    }
  }, [sortedKey]);

  const enterContainer = useCallback(() => {
    if (closeTimeout.current) { clearTimeout(closeTimeout.current); closeTimeout.current = null; }
    setOpen(true);
  }, []);

  const leaveContainer = useCallback(() => {
    if (dragIndexRef.current !== null) return;
    closeTimeout.current = setTimeout(() => setOpen(false), 150);
  }, []);

  const startDrag = useCallback((e: React.PointerEvent, index: number) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'BUTTON' || (e.target as HTMLElement).closest('button')) return;

    e.preventDefault();
    dragStartY.current = e.clientY;
    setDragIndex(index);
    setDragOffset(0);

    const onMove = (ev: PointerEvent) => {
      const dy = ev.clientY - dragStartY.current;
      setDragOffset(dy);

      const curIdx = dragIndexRef.current;
      if (curIdx === null) return;
      const curOrder = orderRef.current;
      const newIndex = Math.max(0, Math.min(curOrder.length - 1, curIdx + Math.round(dy / ROW_HEIGHT)));
      if (newIndex !== curIdx) {
        const next = [...curOrder];
        const [moved] = next.splice(curIdx, 1);
        next.splice(newIndex, 0, moved);
        setOrder(next);
        setDragIndex(newIndex);
        dragStartY.current = ev.clientY;
        setDragOffset(0);
      }
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const finalOrder = orderRef.current;
      onReorderZ([...finalOrder].reverse());
      setDragIndex(null);
      setDragOffset(0);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [onReorderZ]);

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative' }}
      onMouseEnter={enterContainer}
      onMouseLeave={leaveContainer}
    >
      <motion.button
        whileHover={{ background: '#f3f4f6', borderColor: '#d1d5db' }}
        whileTap={{ scale: 0.9 }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 24,
          height: 24,
          borderRadius: 6,
          background: open ? '#f3f4f6' : 'white',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
          cursor: 'pointer',
          color: '#6b7280',
          fontFamily: FONT,
          padding: 0,
        }}
        onPointerDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); setOpen(prev => !prev); }}
        title="Layers"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 2L1.5 6L8 10L14.5 6L8 2Z" />
          <path d="M1.5 10L8 14L14.5 10" />
        </svg>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            style={{
              position: 'absolute',
              bottom: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              marginBottom: 16,
              minWidth: 210,
              borderRadius: 12,
              background: 'rgba(255,255,255,0.97)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.06)',
              backdropFilter: 'blur(24px)',
              padding: '4px',
              fontFamily: FONT,
              zIndex: 600,
            }}
            onPointerDown={e => e.stopPropagation()}
          >
            {order.map((label, i) => (
              <SelectionRow
                key={label}
                label={label}
                preview={previewMap.current[label]}
                isDragging={dragIndex === i}
                dragOffset={dragIndex === i ? dragOffset : 0}
                onPointerDown={(e) => startDrag(e, i)}
                onDeselect={() => {}}
                onRename={(newLabel) => onRename(label, newLabel)}
                hideDeselect
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const ROW_HEIGHT = 32;

function SelectionBadge({
  count,
  labels,
  states,
  previews,
  onDeselect,
  onRename,
  onReorderZ,
}: {
  count: number;
  labels: string[];
  states: ItemState[];
  previews: Record<string, React.ReactNode>;
  onDeselect: (label: string) => void;
  onRename: (oldLabel: string, newLabel: string) => void;
  onReorderZ: (orderedLabels: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sort by z descending (highest z at top, like Figma)
  const sortedKey = labels.map((l, i) => `${l}:${states[i]?.z ?? 0}`).join(',');
  const sorted = useRef<string[]>([]);
  const prevSortedKey = useRef('');
  if (sortedKey !== prevSortedKey.current) {
    sorted.current = labels
      .map((label, i) => ({ label, z: states[i]?.z ?? 0 }))
      .sort((a, b) => b.z - a.z)
      .map(item => item.label);
    prevSortedKey.current = sortedKey;
  }

  const [order, setOrder] = useState(sorted.current);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartY = useRef(0);
  const orderRef = useRef(order);
  orderRef.current = order;
  const dragIndexRef = useRef(dragIndex);
  dragIndexRef.current = dragIndex;

  // Sync order from props only when NOT dragging
  useEffect(() => {
    if (dragIndexRef.current === null) {
      setOrder(sorted.current);
    }
  }, [sortedKey]);


  const startDrag = useCallback((e: React.PointerEvent, index: number) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'BUTTON' || (e.target as HTMLElement).closest('button')) return;

    e.preventDefault();
    dragStartY.current = e.clientY;
    setDragIndex(index);
    setDragOffset(0);

    const onMove = (ev: PointerEvent) => {
      const dy = ev.clientY - dragStartY.current;
      setDragOffset(dy);

      const curIdx = dragIndexRef.current;
      if (curIdx === null) return;
      const curOrder = orderRef.current;
      const newIndex = Math.max(0, Math.min(curOrder.length - 1, curIdx + Math.round(dy / ROW_HEIGHT)));
      if (newIndex !== curIdx) {
        const next = [...curOrder];
        const [moved] = next.splice(curIdx, 1);
        next.splice(newIndex, 0, moved);
        setOrder(next);
        setDragIndex(newIndex);
        dragStartY.current = ev.clientY;
        setDragOffset(0);
      }
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const finalOrder = orderRef.current;
      // order is top-to-bottom (highest z first), reverse for lowest-first
      onReorderZ([...finalOrder].reverse());
      setDragIndex(null);
      setDragOffset(0);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [onReorderZ]);

  const enterContainer = useCallback(() => {
    if (closeTimeout.current) { clearTimeout(closeTimeout.current); closeTimeout.current = null; }
    setOpen(true);
  }, []);

  const leaveContainer = useCallback(() => {
    if (dragIndexRef.current !== null) return; // don't close during drag
    closeTimeout.current = setTimeout(() => setOpen(false), 150);
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative' }}
      onMouseEnter={enterContainer}
      onMouseLeave={leaveContainer}
    >
      <div
        style={{
          borderRadius: 8,
          background: open ? '#e8e8ea' : '#f0f0f1',
          padding: '5px 10px',
          fontSize: 11,
          fontWeight: 600,
          color: '#6b7280',
          userSelect: 'none',
          cursor: 'default',
          transition: 'background 0.15s',
        }}
      >
        {count} selected
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              marginBottom: 8,
              minWidth: 210,
              borderRadius: 12,
              background: 'rgba(255,255,255,0.97)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.06)',
              backdropFilter: 'blur(24px)',
              padding: '4px',
              fontFamily: FONT,
              zIndex: 600,
            }}
            onPointerDown={e => e.stopPropagation()}
          >
            {order.map((label, i) => (
              <SelectionRow
                key={label}
                label={label}
                preview={previews[label]}
                isDragging={dragIndex === i}
                dragOffset={dragIndex === i ? dragOffset : 0}
                onPointerDown={(e) => startDrag(e, i)}
                onDeselect={() => onDeselect(label)}
                onRename={(newLabel) => onRename(label, newLabel)}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SelectionRow({
  label,
  preview,
  isDragging,
  dragOffset,
  onPointerDown,
  onDeselect,
  onRename,
  hideDeselect,
}: {
  label: string;
  preview?: React.ReactNode;
  isDragging: boolean;
  dragOffset: number;
  onPointerDown: (e: React.PointerEvent) => void;
  onDeselect: () => void;
  onRename: (newLabel: string) => void;
  hideDeselect?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const [rowHovered, setRowHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 6px',
        height: ROW_HEIGHT,
        borderRadius: 8,
        background: isDragging ? '#eff6ff' : rowHovered ? '#f4f5f6' : 'transparent',
        transition: isDragging ? 'none' : 'background 0.1s',
        transform: isDragging ? `translateY(${dragOffset}px)` : 'none',
        zIndex: isDragging ? 10 : 0,
        position: 'relative',
        cursor: editing ? 'default' : 'grab',
        userSelect: 'none',
      }}
      onMouseEnter={() => setRowHovered(true)}
      onMouseLeave={() => setRowHovered(false)}
      onPointerDown={onPointerDown}
      onDoubleClick={() => {
        setEditing(true);
        setDraft(label);
        requestAnimationFrame(() => inputRef.current?.focus());
        requestAnimationFrame(() => inputRef.current?.select());
      }}
    >
      {/* Drag handle */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 16,
        flexShrink: 0,
        color: '#c4c7cc',
        cursor: 'grab',
      }}>
        <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor">
          <circle cx="2" cy="2" r="1.2" />
          <circle cx="6" cy="2" r="1.2" />
          <circle cx="2" cy="6" r="1.2" />
          <circle cx="6" cy="6" r="1.2" />
          <circle cx="2" cy="10" r="1.2" />
          <circle cx="6" cy="10" r="1.2" />
        </svg>
      </div>

      {/* Shape preview */}
      {preview && (
        <div style={{
          width: 22,
          height: 22,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          borderRadius: 4,
          pointerEvents: 'none',
        }}>
          <div style={{ transform: 'scale(0.25)', transformOrigin: 'center' }}>
            {preview}
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        readOnly={!editing}
        style={{
          flex: 1,
          minWidth: 0,
          borderRadius: 6,
          background: editing ? '#fff' : 'transparent',
          padding: '3px 6px',
          fontSize: 11,
          fontWeight: 500,
          color: '#374151',
          border: editing ? '1px solid rgba(59,130,246,0.5)' : '1px solid transparent',
          outline: 'none',
          fontFamily: FONT,
          cursor: editing ? 'text' : 'inherit',
          userSelect: editing ? 'auto' : 'none',
          pointerEvents: editing ? 'auto' : 'none',
          transition: 'border-color 0.15s, background 0.15s',
        }}
        value={editing ? draft : label}
        onDoubleClick={() => {
          setEditing(true);
          setDraft(label);
          requestAnimationFrame(() => inputRef.current?.select());
        }}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (draft && draft !== label) onRename(draft);
        }}
        onKeyDown={e => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') { setEditing(false); setDraft(label); (e.target as HTMLInputElement).blur(); }
        }}
        onPointerDown={e => { if (editing) e.stopPropagation(); }}
        spellCheck={false}
      />
      {!hideDeselect && (
        <motion.button
          whileHover={{ background: '#fee2e2' }}
          whileTap={{ scale: 0.9 }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 20,
            height: 20,
            borderRadius: 6,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: '#9ca3af',
            fontSize: 13,
            lineHeight: 1,
            flexShrink: 0,
            opacity: rowHovered ? 1 : 0,
            transition: 'opacity 0.1s',
          }}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onDeselect(); }}
          title="Remove from selection"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 4h12M5.33 4V2.67a1.33 1.33 0 011.34-1.34h2.66a1.33 1.33 0 011.34 1.34V4M6.67 7.33v4M9.33 7.33v4" />
            <path d="M3.33 4l.67 9.33a1.33 1.33 0 001.33 1.34h5.34a1.33 1.33 0 001.33-1.34L12.67 4" />
          </svg>
        </motion.button>
      )}
    </div>
  );
}

function Group({ children, gap = 4 }: { children: React.ReactNode; gap?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap }}>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 500, color: '#9ca3af', fontFamily: FONT, userSelect: 'none' }}>
      {children}
    </span>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 22, background: '#e5e7eb', flexShrink: 0 }} />;
}

function ActionButton({ children, onClick, title, color = '#6b7280' }: { children: React.ReactNode; onClick: () => void; title: string; color?: string }) {
  return (
    <motion.button
      title={title}
      whileHover={{ background: '#f3f4f6' }}
      whileTap={{ scale: 0.93 }}
      style={{
        borderRadius: 6,
        padding: '5px 8px',
        fontSize: 11,
        fontWeight: 500,
        color,
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        fontFamily: FONT,
      }}
      onPointerDown={e => e.stopPropagation()}
      onClick={e => { e.stopPropagation(); onClick(); }}
    >
      {children}
    </motion.button>
  );
}
