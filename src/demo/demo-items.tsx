import type { ItemDef } from '../canvas/types';
import type { Renderer } from '../canvas/canvas';

// ---------------------------------------------------------------------------
// Demo renderers — simple colored shapes to illustrate the tool
// ---------------------------------------------------------------------------

export const DEMO_RENDERERS: Record<string, Renderer> = {
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

export const DEMO_ITEMS: ItemDef[] = [
  { label: 'Circle1', type: 'Circle', x: -180, y: -80, w: 90, h: 90, rot: 0, z: 0, props: { size: 80, color: '#6366f1' } },
  { label: 'Circle2', type: 'Circle', x: 160, y: 100, w: 70, h: 70, rot: 0, z: 0, props: { size: 60, color: '#ec4899' } },
  { label: 'Card1', type: 'RoundedRect', x: 0, y: -60, w: 140, h: 80, rot: -5, z: 0, props: { w: 120, h: 70, color: '#f59e0b' } },
  { label: 'Card2', type: 'RoundedRect', x: 120, y: -120, w: 110, h: 65, rot: 8, z: 0, props: { w: 100, h: 55, color: '#3b82f6' } },
  { label: 'Pill1', type: 'Pill', x: -120, y: 80, w: 110, h: 40, rot: -10, z: 0, props: { w: 100, h: 36, color: '#10b981', text: '+84%' } },
  { label: 'Pill2', type: 'Pill', x: 80, y: -180, w: 90, h: 36, rot: 12, z: 0, props: { w: 80, h: 32, color: '#10b981', text: '+42%' } },
  { label: 'Star1', type: 'Star', x: -60, y: 160, w: 40, h: 40, rot: -15, z: 0, props: { size: 36, color: '#f97316' } },
  { label: 'Star2', type: 'Star', x: 200, y: 60, w: 32, h: 32, rot: 20, z: 0, props: { size: 28, color: '#8b5cf6' } },
];
