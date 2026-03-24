import type { Camera } from './use-camera';

export function Grid({ gridSize = 20, camera }: { gridSize?: number; camera: Camera }) {
  const { panX, panY, zoom } = camera;

  // Adaptive step: keep dots at least 8px apart on screen
  let step = gridSize;
  while (step * zoom < 8) step *= 5;

  const screenStep = step * zoom;

  // Fade out at very low zoom
  const opacity = Math.min(1, zoom * 2.5);
  if (opacity < 0.02) return null;

  // Dot radius scales slightly: 1px at zoom 1, thinner at low zoom
  const dotR = Math.max(0.5, Math.min(1.2, zoom * 0.8));

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: -1,
        opacity,
        backgroundImage: `radial-gradient(circle, rgba(0,0,0,0.10) ${dotR}px, transparent ${dotR}px)`,
        backgroundSize: `${screenStep}px ${screenStep}px`,
        backgroundPosition: `calc(50% + ${panX % screenStep}px) calc(50% + ${panY % screenStep}px)`,
        transition: 'opacity 0.2s',
      }}
    />
  );
}
