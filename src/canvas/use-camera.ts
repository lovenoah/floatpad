import { useState, useCallback, useEffect, useRef } from 'react';

export type Camera = {
  panX: number;
  panY: number;
  zoom: number;
};

const MIN_ZOOM = 0.08;
const MAX_ZOOM = 10;
const ZOOM_SENSITIVITY = 0.004;

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

export function useCamera(viewportRef: React.RefObject<HTMLDivElement | null>) {
  const [camera, setCamera] = useState<Camera>({ panX: 0, panY: 0, zoom: 1 });
  const cameraRef = useRef(camera);
  cameraRef.current = camera;

  const getCenter = useCallback(() => {
    const r = viewportRef.current?.getBoundingClientRect();
    if (!r) return { cx: 0, cy: 0 };
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  }, [viewportRef]);

  /** Convert screen pixel coordinate to canvas coordinate */
  const screenToCanvas = useCallback((sx: number, sy: number) => {
    const { cx, cy } = getCenter();
    const c = cameraRef.current;
    return {
      x: (sx - cx - c.panX) / c.zoom,
      y: (sy - cy - c.panY) / c.zoom,
    };
  }, [getCenter]);

  /** Convert canvas coordinate to screen pixel coordinate */
  const canvasToScreen = useCallback((canvasX: number, canvasY: number) => {
    const { cx, cy } = getCenter();
    const c = cameraRef.current;
    return {
      x: canvasX * c.zoom + c.panX + cx,
      y: canvasY * c.zoom + c.panY + cy,
    };
  }, [getCenter]);

  /** Zoom to a specific level, optionally pivoting around a screen point */
  const zoomTo = useCallback((newZoom: number, pivot?: { x: number; y: number }) => {
    setCamera(prev => {
      const { cx, cy } = getCenter();
      const clamped = clampZoom(newZoom);
      const mx = pivot?.x ?? cx;
      const my = pivot?.y ?? cy;
      const wx = (mx - cx - prev.panX) / prev.zoom;
      const wy = (my - cy - prev.panY) / prev.zoom;
      return {
        panX: mx - cx - wx * clamped,
        panY: my - cy - wy * clamped,
        zoom: clamped,
      };
    });
  }, [getCenter]);

  /** Reset to origin at 100% */
  const resetView = useCallback(() => {
    setCamera({ panX: 0, panY: 0, zoom: 1 });
  }, []);

  /** Fit all given bounds into the viewport with padding */
  const fitToView = useCallback((bounds: { x: number; y: number; w: number; h: number }[]) => {
    if (bounds.length === 0) return resetView();
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const b of bounds) {
      minX = Math.min(minX, b.x - b.w / 2);
      maxX = Math.max(maxX, b.x + b.w / 2);
      minY = Math.min(minY, b.y - b.h / 2);
      maxY = Math.max(maxY, b.y + b.h / 2);
    }

    const cw = maxX - minX || 1;
    const ch = maxY - minY || 1;
    const ccx = (minX + maxX) / 2;
    const ccy = (minY + maxY) / 2;

    const pad = 0.82;
    const zx = (rect.width * pad) / cw;
    const zy = (rect.height * pad) / ch;
    const zoom = clampZoom(Math.min(zx, zy, 2));

    setCamera({ panX: -ccx * zoom, panY: -ccy * zoom, zoom });
  }, [viewportRef, resetView]);

  // ── Wheel / pinch handler ──────────────────────────────────────────
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const handler = (e: WheelEvent) => {
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        // Zoom (browser sets ctrlKey for trackpad pinch)
        const { cx, cy } = getCenter();
        setCamera(prev => {
          const factor = Math.pow(2, -e.deltaY * ZOOM_SENSITIVITY);
          const newZoom = clampZoom(prev.zoom * factor);
          const wx = (e.clientX - cx - prev.panX) / prev.zoom;
          const wy = (e.clientY - cy - prev.panY) / prev.zoom;
          return {
            panX: e.clientX - cx - wx * newZoom,
            panY: e.clientY - cy - wy * newZoom,
            zoom: newZoom,
          };
        });
      } else {
        // Pan (trackpad two-finger scroll or mouse wheel)
        setCamera(prev => ({
          ...prev,
          panX: prev.panX - e.deltaX,
          panY: prev.panY - e.deltaY,
        }));
      }
    };

    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [viewportRef, getCenter]);

  return {
    camera, setCamera,
    screenToCanvas, canvasToScreen,
    zoomTo, resetView, fitToView,
  };
}
