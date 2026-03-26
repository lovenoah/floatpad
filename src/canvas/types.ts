export type ItemDef = {
  label: string;
  /** Key into the RENDERERS map — determines what gets rendered */
  type: string;
  /** Default center offset from canvas origin (px) */
  x: number;
  y: number;
  /** Bounding box size (px) — used for hit-target and panel placement */
  w: number;
  h: number;
  /** Default rotation (deg) */
  rot: number;
  /** Default z-index */
  z: number;
  /** Passed through to the renderer function */
  props: Record<string, unknown>;
  /** Parent group or frame label (undefined = top-level) */
  group?: string;
};

export type ItemState = {
  x: number;
  y: number;
  scale: number;
  rot: number;
  z: number;
  locked?: boolean;
  opacity?: number;
  flipX?: boolean;
  flipY?: boolean;
};

export type CanvasState = {
  items: ItemDef[];
  states: Record<string, ItemState>;
};

// ── Design property types ───────────────────────────────────────

export type GradientStop = {
  offset: number;
  color: string;
  opacity?: number; // 0–1, defaults to 1
};

export type Fill =
  | { type: 'solid'; color: string; opacity: number }
  | { type: 'linear-gradient'; stops: GradientStop[]; angle: number; startPoint?: { x: number; y: number }; endPoint?: { x: number; y: number } }
  | { type: 'radial-gradient'; stops: GradientStop[] }
  | { type: 'none' };

export type StrokeDef = {
  color: string;
  width: number;
  opacity: number;
  position?: 'center' | 'inside' | 'outside';
  strokeFill?: Fill;
  dashArray?: string;
  lineCap?: 'butt' | 'round' | 'square';
  lineJoin?: 'miter' | 'round' | 'bevel';
};

export type ShadowDef = {
  shadowType?: 'drop-shadow' | 'inner-shadow';
  x: number;
  y: number;
  blur: number;
  color: string;
  opacity: number;
};

export type ExportFormat = 'raw' | 'react-style' | 'css';

export type NudgeSettings = {
  gridSize: number;
  snapThreshold: number;
  nudgeSmall: number;
  nudgeLarge: number;
  duplicateOffset: number;
  bgColor: string;
  exportFormat: ExportFormat;
  windowMode?: boolean;
  windowW?: number;
  windowH?: number;
  windowBg?: string;
};
