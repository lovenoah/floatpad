export type MarqueeRect = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export function Marquee({ rect }: { rect: MarqueeRect }) {
  const left = Math.min(rect.x1, rect.x2);
  const top = Math.min(rect.y1, rect.y2);
  const width = Math.abs(rect.x2 - rect.x1);
  const height = Math.abs(rect.y2 - rect.y1);

  if (width < 2 && height < 2) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left,
        top,
        width,
        height,
        border: '1px solid rgba(59, 130, 246, 0.6)',
        background: 'rgba(59, 130, 246, 0.08)',
        borderRadius: 2,
        pointerEvents: 'none',
        zIndex: 400,
      }}
    />
  );
}
