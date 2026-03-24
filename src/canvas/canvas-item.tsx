import { useState, useCallback, useRef, useEffect } from 'react';
import { StepButton } from './step-button';
import { loadState, saveState } from './persistence';
import type { ItemState } from './types';

const PANEL_FONT = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export function CanvasItem({
  label,
  x: initX,
  y: initY,
  w: initW,
  h: initH,
  rot: initRot = 0,
  z: initZ = 0,
  selectedLabel,
  onSelect,
  onDuplicate,
  onDelete,
  onRename,
  children,
}: {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rot?: number;
  z?: number;
  selectedLabel: string | null;
  onSelect: (label: string | null) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRename: (newLabel: string) => void;
  children: React.ReactNode;
}) {
  const defaults: ItemState = { x: initX, y: initY, scale: 1, rot: initRot, z: initZ };
  const [state, setState] = useState<ItemState>(() => loadState(label, defaults));
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editingLabel, setEditingLabel] = useState(label);
  const dragging = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, sx: 0, sy: 0 });

  const selected = selectedLabel === label;
  const { x, y, scale, rot, z = 0 } = state;
  const w = Math.round(initW * scale);
  const h = Math.round(initH * scale);

  useEffect(() => { saveState(label, state); }, [label, state]);

  const update = useCallback((patch: Partial<ItemState>) => {
    setState(s => ({ ...s, ...patch }));
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragging.current = true;
    dragStart.current = { mx: e.clientX, my: e.clientY, sx: x, sy: y };
    onSelect(label);
  }, [x, y, label, onSelect]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    update({
      x: Math.round(dragStart.current.sx + (e.clientX - dragStart.current.mx)),
      y: Math.round(dragStart.current.sy + (e.clientY - dragStart.current.my)),
    });
  }, [update]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  const adjustScale = useCallback((d: number) => {
    update({ scale: Math.round(Math.max(0.1, Math.min(4, scale + d)) * 100) / 100 });
  }, [scale, update]);

  const adjustRot = useCallback((d: number) => {
    update({ rot: Math.round((rot + d) * 100) / 100 });
  }, [rot, update]);

  const adjustZ = useCallback((d: number) => {
    update({ z: z + d });
  }, [z, update]);

  const resetToDefaults = useCallback(() => {
    setState(defaults);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initX, initY, initRot]);

  const placeValues = useCallback(() => {
    const code = `x={${x}} y={${y}} w={${w}} h={${h}} rot={${rot}} z={${z}}`;
    navigator.clipboard.writeText(code);
    console.log(`\n[${label}] Placed:\n  ${code}\n`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    onSelect(null);
  }, [label, x, y, w, h, rot, z, onSelect]);

  const showUI = selected || hovered;

  return (
    <>
      {/* Visual layer */}
      <div
        style={{
          position: 'absolute',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          left: `calc(50% + ${x}px)`,
          top: `calc(50% + ${y}px)`,
          width: w,
          height: h,
          transform: `translate(-50%, -50%) rotate(${rot}deg)`,
          pointerEvents: 'none',
          zIndex: z,
        }}
      >
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}>
          {children}
        </div>
      </div>

      {/* Hit target */}
      <div
        style={{
          position: 'absolute',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          left: `calc(50% + ${x}px)`,
          top: `calc(50% + ${y}px)`,
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
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Selection frame */}
        {showUI && (
          <div style={{ position: 'absolute', inset: -4, pointerEvents: 'none' }}>
            <div style={{
              width: '100%',
              height: '100%',
              borderRadius: 8,
              border: selected
                ? '1.5px solid rgba(59,130,246,0.8)'
                : '1.5px dashed rgba(59,130,246,0.35)',
              background: selected ? 'rgba(59,130,246,0.03)' : 'transparent',
            }} />
            {selected && [
              { top: -5, left: -5 },
              { top: -5, right: -5 },
              { bottom: -5, left: -5 },
              { bottom: -5, right: -5 },
            ].map((pos, i) => (
              <div key={i} style={{
                position: 'absolute',
                ...pos,
                width: 10,
                height: 10,
                borderRadius: '50%',
                border: '1.5px solid #3b82f6',
                background: 'white',
                boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
              }} />
            ))}
          </div>
        )}
      </div>

      {/* Floating control panel */}
      {selected && (
        <div
          style={{
            position: 'absolute',
            left: `calc(50% + ${x}px)`,
            top: `calc(50% + ${y}px + ${h / 2 + 16}px)`,
            transform: 'translateX(-50%)',
            zIndex: 300,
            pointerEvents: 'auto',
          }}
          onPointerDown={e => e.stopPropagation()}
        >
          {/* Caret */}
          <div style={{
            margin: '0 auto',
            width: 0,
            height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderBottom: '6px solid white',
            filter: 'drop-shadow(0 -1px 1px rgba(0,0,0,0.06))',
          }} />

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            borderRadius: 12,
            background: 'rgba(255,255,255,0.95)',
            padding: 4,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.08)',
            backdropFilter: 'blur(20px)',
            fontFamily: PANEL_FONT,
          }}>
            {/* Label */}
            <input
              style={{
                width: 'auto',
                minWidth: 40,
                maxWidth: 140,
                borderRadius: 6,
                background: '#eff6ff',
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 600,
                color: '#2563eb',
                border: 'none',
                outline: 'none',
                fontFamily: PANEL_FONT,
              }}
              value={editingLabel}
              onChange={e => setEditingLabel(e.target.value)}
              onBlur={() => { if (editingLabel && editingLabel !== label) onRename(editingLabel); }}
              onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              onPointerDown={e => e.stopPropagation()}
              spellCheck={false}
            />

            {/* Position */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px' }}>
              <span style={{ fontSize: 10, fontWeight: 500, color: '#9ca3af' }}>X</span>
              <span style={{ fontSize: 11, fontWeight: 500, color: '#374151' }}>{x}</span>
              <span style={{ fontSize: 10, fontWeight: 500, color: '#9ca3af', marginLeft: 4 }}>Y</span>
              <span style={{ fontSize: 11, fontWeight: 500, color: '#374151' }}>{y}</span>
            </div>

            <div style={{ width: 1, height: 20, background: '#e5e7eb' }} />

            {/* Scale */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 6px' }}>
              <StepButton onClick={() => adjustScale(-0.1)}>−</StepButton>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 38, borderRadius: 6, background: '#f9fafb', padding: '4px 6px', border: '1px solid rgba(0,0,0,0.06)' }}>
                <span style={{ fontSize: 11, fontWeight: 500, color: '#374151' }}>{scale.toFixed(1)}×</span>
              </div>
              <StepButton onClick={() => adjustScale(0.1)}>+</StepButton>
            </div>

            <div style={{ width: 1, height: 20, background: '#e5e7eb' }} />

            {/* Rotation */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 6px' }}>
              <StepButton onClick={() => adjustRot(-1)}>↺</StepButton>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 38, borderRadius: 6, background: '#f9fafb', padding: '4px 6px', border: '1px solid rgba(0,0,0,0.06)' }}>
                <span style={{ fontSize: 11, fontWeight: 500, color: '#374151' }}>{rot}°</span>
              </div>
              <StepButton onClick={() => adjustRot(1)}>↻</StepButton>
            </div>

            <div style={{ width: 1, height: 20, background: '#e5e7eb' }} />

            {/* Z-index */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 6px' }}>
              <StepButton onClick={() => adjustZ(-1)}>↓</StepButton>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 32, borderRadius: 6, background: '#f9fafb', padding: '4px 6px', border: '1px solid rgba(0,0,0,0.06)' }}>
                <span style={{ fontSize: 10, fontWeight: 500, color: '#9ca3af' }}>Z</span>
                <span style={{ fontSize: 11, fontWeight: 500, color: '#374151', marginLeft: 2 }}>{z}</span>
              </div>
              <StepButton onClick={() => adjustZ(1)}>↑</StepButton>
            </div>

            <div style={{ width: 1, height: 20, background: '#e5e7eb' }} />

            {/* Actions */}
            {[
              { label: 'Dup', color: '#6b7280', hoverBg: '#f9fafb', onClick: onDuplicate, title: 'Duplicate (Cmd+D)' },
              { label: 'Del', color: '#f87171', hoverBg: '#fef2f2', onClick: onDelete, title: 'Delete (Backspace)' },
              { label: 'Reset', color: '#6b7280', hoverBg: '#f9fafb', onClick: resetToDefaults, title: 'Reset to defaults' },
            ].map(btn => (
              <button
                key={btn.label}
                title={btn.title}
                style={{ display: 'flex', alignItems: 'center', borderRadius: 6, padding: '4px 8px', fontSize: 11, fontWeight: 500, color: btn.color, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: PANEL_FONT }}
                onPointerDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); btn.onClick(); }}
              >
                {btn.label}
              </button>
            ))}

            {/* Place */}
            <button
              style={{ display: 'flex', alignItems: 'center', borderRadius: 6, padding: '4px 12px', fontSize: 11, fontWeight: 600, color: '#fff', background: copied ? '#16a34a' : '#3b82f6', border: 'none', cursor: 'pointer', transition: 'background 0.15s', fontFamily: PANEL_FONT }}
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); placeValues(); }}
            >
              {copied ? '✓ Placed' : 'Place'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
