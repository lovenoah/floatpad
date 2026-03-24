import type { Camera } from './use-camera';

export type Guide = {
  axis: 'x' | 'y';
  position: number;
};

/**
 * Renders alignment guides in the fixed (screen) layer.
 * Guide positions are in canvas coords; converted to screen via camera.
 */
export function Guides({ guides, camera }: { guides: Guide[]; camera: Camera }) {
  const { panX, panY, zoom } = camera;

  return (
    <>
      {guides.map((g, i) => (
        <div
          key={`${g.axis}-${g.position}-${i}`}
          style={{
            position: 'absolute',
            pointerEvents: 'none',
            zIndex: 200,
            ...(g.axis === 'x'
              ? {
                  left: `calc(50% + ${g.position * zoom + panX}px)`,
                  top: 0,
                  bottom: 0,
                  width: 1,
                  background: 'rgba(236, 72, 153, 0.6)',
                }
              : {
                  top: `calc(50% + ${g.position * zoom + panY}px)`,
                  left: 0,
                  right: 0,
                  height: 1,
                  background: 'rgba(236, 72, 153, 0.6)',
                }),
          }}
        />
      ))}
    </>
  );
}

export function computeGuides(
  dragLabel: string,
  dragState: { x: number; y: number; w: number; h: number },
  allItems: { label: string; x: number; y: number; w: number; h: number }[],
  snapThreshold = 5,
): { guides: Guide[]; snapX: number | null; snapY: number | null } {
  const guides: Guide[] = [];
  let snapX: number | null = null;
  let snapY: number | null = null;

  const dragLeft = dragState.x - dragState.w / 2;
  const dragRight = dragState.x + dragState.w / 2;
  const dragCX = dragState.x;
  const dragTop = dragState.y - dragState.h / 2;
  const dragBottom = dragState.y + dragState.h / 2;
  const dragCY = dragState.y;

  for (const item of allItems) {
    if (item.label === dragLabel) continue;

    const left = item.x - item.w / 2;
    const right = item.x + item.w / 2;
    const cx = item.x;
    const top = item.y - item.h / 2;
    const bottom = item.y + item.h / 2;
    const cy = item.y;

    for (const [dragEdge, otherEdge] of [
      [dragLeft, left], [dragLeft, cx], [dragLeft, right],
      [dragCX, left], [dragCX, cx], [dragCX, right],
      [dragRight, left], [dragRight, cx], [dragRight, right],
    ]) {
      if (Math.abs(dragEdge - otherEdge) < snapThreshold && snapX === null) {
        snapX = dragState.x + (otherEdge - dragEdge);
        guides.push({ axis: 'x', position: otherEdge });
      }
    }

    for (const [dragEdge, otherEdge] of [
      [dragTop, top], [dragTop, cy], [dragTop, bottom],
      [dragCY, top], [dragCY, cy], [dragCY, bottom],
      [dragBottom, top], [dragBottom, cy], [dragBottom, bottom],
    ]) {
      if (Math.abs(dragEdge - otherEdge) < snapThreshold && snapY === null) {
        snapY = dragState.y + (otherEdge - dragEdge);
        guides.push({ axis: 'y', position: otherEdge });
      }
    }
  }

  return { guides, snapX, snapY };
}
