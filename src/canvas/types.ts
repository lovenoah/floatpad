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
};

export type ItemState = {
  x: number;
  y: number;
  scale: number;
  rot: number;
  z: number;
};

export type CanvasState = {
  items: ItemDef[];
  states: Record<string, ItemState>;
};

export type NudgeSettings = {
  gridSize: number;
  snapThreshold: number;
  nudgeSmall: number;
  nudgeLarge: number;
  duplicateOffset: number;
  bgColor: string;
};
