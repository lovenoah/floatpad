import type { ItemDef } from '../canvas/types';
import type { Renderer } from '../canvas/canvas';
import { ShapeRendererComponent } from '../canvas/shape-renderer';
import { TextRendererComponent } from '../canvas/text-renderer';
import { FrameRendererComponent } from '../canvas/frame-renderer';

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

export const DEMO_RENDERERS: Record<string, Renderer> = {
  Shape: (p) => <ShapeRendererComponent props={p} />,
  Text: (p) => <TextRendererComponent props={p} />,
  Frame: (p) => <FrameRendererComponent props={p} />,
  Group: () => null,

  // Legacy renderers — kept for backwards compatibility with saved layouts
  Circle: (p) => {
    const size = (p.size as number) ?? 80;
    const color = (p.color as string) ?? '#6366f1';
    return (
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: color, boxShadow: '0 4px 8px rgba(0,0,0,0.08)',
      }} />
    );
  },
  RoundedRect: (p) => {
    const w = (p.w as number) ?? 120;
    const h = (p.h as number) ?? 70;
    const color = (p.color as string) ?? '#f59e0b';
    return (
      <div style={{
        width: w, height: h, borderRadius: 16,
        background: color, boxShadow: '0 4px 8px rgba(0,0,0,0.08)',
      }} />
    );
  },
  Pill: (p) => {
    const w = (p.w as number) ?? 100;
    const h = (p.h as number) ?? 36;
    const color = (p.color as string) ?? '#10b981';
    const text = (p.text as string) ?? '+84%';
    return (
      <div style={{
        width: w, height: h, borderRadius: 999,
        background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'white', fontSize: 13, fontWeight: 600,
        boxShadow: '0 4px 8px rgba(0,0,0,0.08)',
      }}>
        {text}
      </div>
    );
  },
  Star: (p) => {
    const size = (p.size as number) ?? 40;
    const color = (p.color as string) ?? '#f97316';
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
        <path
          d="M20 4L23.5 15H35L26 22L29.5 33L20 26L10.5 33L14 22L5 15H16.5L20 4Z"
          fill={color}
        />
      </svg>
    );
  },
};

// ---------------------------------------------------------------------------
// Helper for Shape item definitions
// ---------------------------------------------------------------------------

const shadow = { x: 0, y: 4, blur: 8, color: '#000000', opacity: 0.08 };

function shape(
  label: string,
  pos: { x: number; y: number; rot?: number; z?: number },
  geo: { type: string; w: number; h: number; borderRadius?: number; pathData?: string; viewBox?: string },
  fill: string,
  extra?: Record<string, unknown>,
): ItemDef {
  return {
    label,
    type: 'Shape',
    x: pos.x,
    y: pos.y,
    w: geo.w,
    h: geo.h,
    rot: pos.rot ?? 0,
    z: pos.z ?? 0,
    props: {
      shapeType: geo.type,
      shapeWidth: geo.w,
      shapeHeight: geo.h,
      borderRadius: geo.borderRadius ?? 0,
      pathData: geo.pathData,
      viewBox: geo.viewBox,
      fills: [{ type: 'solid', color: fill, opacity: 1 }],
      strokes: [],
      shadows: [shadow],
      blur: 0,
      ...extra,
    },
  };
}

// ---------------------------------------------------------------------------
// Demo items — all using the Shape renderer
// ---------------------------------------------------------------------------

const STAR_PATH = 'M20 4L23.5 15H35L26 22L29.5 33L20 26L10.5 33L14 22L5 15H16.5L20 4Z';

export const DEMO_ITEMS: ItemDef[] = [
  shape('Ellipse1', { x: -180, y: -80 },
    { type: 'ellipse', w: 80, h: 80 }, '#6366f1'),

  shape('Ellipse2', { x: 160, y: 100 },
    { type: 'ellipse', w: 60, h: 60 }, '#ec4899'),

  shape('Card1', { x: 0, y: -60, rot: -5 },
    { type: 'rectangle', w: 120, h: 70, borderRadius: 16 }, '#f59e0b'),

  shape('Card2', { x: 120, y: -120, rot: 8 },
    { type: 'rectangle', w: 100, h: 55, borderRadius: 16 }, '#3b82f6'),

  shape('Badge1', { x: -120, y: 80, rot: -10 },
    { type: 'rectangle', w: 100, h: 36, borderRadius: 999 }, '#10b981',
    { text: '+84%', textColor: 'white', textSize: 13 }),

  shape('Badge2', { x: 80, y: -180, rot: 12 },
    { type: 'rectangle', w: 80, h: 32, borderRadius: 999 }, '#10b981',
    { text: '+42%', textColor: 'white', textSize: 13 }),

  shape('Star1', { x: -60, y: 160, rot: -15 },
    { type: 'vector', w: 36, h: 36, pathData: STAR_PATH, viewBox: '0 0 40 40' }, '#f97316',
    { shadows: [] }),

  shape('Star2', { x: 200, y: 60, rot: 20 },
    { type: 'vector', w: 28, h: 28, pathData: STAR_PATH, viewBox: '0 0 40 40' }, '#8b5cf6',
    { shadows: [] }),
];
