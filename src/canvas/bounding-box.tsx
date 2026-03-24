import type { ItemDef, ItemState } from './types';

export function BoundingBox({
  items,
  states,
  selection,
  zoom,
}: {
  items: ItemDef[];
  states: Record<string, ItemState>;
  selection: Set<string>;
  zoom: number;
}) {
  if (selection.size <= 1) return null;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const label of selection) {
    const item = items.find(i => i.label === label);
    const state = states[label];
    if (!item || !state) continue;
    const w = item.w * state.scale;
    const h = item.h * state.scale;
    minX = Math.min(minX, state.x - w / 2);
    maxX = Math.max(maxX, state.x + w / 2);
    minY = Math.min(minY, state.y - h / 2);
    maxY = Math.max(maxY, state.y + h / 2);
  }

  if (!isFinite(minX)) return null;

  const s = (px: number) => px / zoom;
  const pad = s(6);

  return (
    <div
      style={{
        position: 'absolute',
        left: minX - pad,
        top: minY - pad,
        width: maxX - minX + pad * 2,
        height: maxY - minY + pad * 2,
        border: `${s(1.5)}px dashed rgba(59,130,246,0.45)`,
        borderRadius: s(6),
        pointerEvents: 'none',
        zIndex: 98,
      }}
    >
      {/* Corner indicators */}
      {[
        { left: -s(4), top: -s(4) },
        { right: -s(4), top: -s(4) },
        { left: -s(4), bottom: -s(4) },
        { right: -s(4), bottom: -s(4) },
      ].map((pos, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            ...pos,
            width: s(8),
            height: s(8),
            borderRadius: '50%',
            border: `${s(1.5)}px solid rgba(59,130,246,0.45)`,
            background: 'white',
            boxShadow: `0 ${s(1)}px ${s(2)}px rgba(0,0,0,0.08)`,
          }}
        />
      ))}
    </div>
  );
}
