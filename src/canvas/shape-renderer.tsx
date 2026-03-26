import { useId } from 'react';
import type { Fill, StrokeDef, ShadowDef } from './types';

// ── Figma-accurate squircle path ─────────────────────────────────────────────
// Algorithm ported from github.com/phamfoo/figma-squircle (MIT).
// Each corner = shoulder bezier + circular arc + arc-exit bezier.

function _toRad(deg: number) { return deg * Math.PI / 180; }
function _f(n: number) { return n.toFixed(4); }

interface _CP { a: number; b: number; c: number; d: number; p: number; arc: number; r: number }

function _cornerParams(r: number, smoothing: number, budget: number): _CP {
  if (r === 0) return { a: 0, b: 0, c: 0, d: 0, p: 0, arc: 0, r: 0 };
  const s = Math.min(smoothing, budget / r - 1);
  const p = Math.min((1 + s) * r, budget);
  const arcMeasure = 90 * (1 - s);
  const arc = Math.sin(_toRad(arcMeasure / 2)) * r * Math.SQRT2;
  const alpha = (90 - arcMeasure) / 2;
  const p3p4 = r * Math.tan(_toRad(alpha / 2));
  const beta = 45 * s;
  const c = p3p4 * Math.cos(_toRad(beta));
  const d = c * Math.tan(_toRad(beta));
  const b = (p - arc - c - d) / 3;
  const a = 2 * b;
  return { a, b, c, d, p, arc, r };
}

// Relative-coordinate corner segments (clockwise)
function _tr({ a, b, c, d, arc, r }: _CP) {
  if (!r) return '';
  return `c ${_f(a)} 0 ${_f(a+b)} 0 ${_f(a+b+c)} ${_f(d)} a ${_f(r)} ${_f(r)} 0 0 1 ${_f(arc)} ${_f(arc)} c ${_f(d)} ${_f(c)} ${_f(d)} ${_f(b+c)} ${_f(d)} ${_f(a+b+c)}`;
}
function _br({ a, b, c, d, arc, r }: _CP) {
  if (!r) return '';
  return `c 0 ${_f(a)} 0 ${_f(a+b)} ${_f(-d)} ${_f(a+b+c)} a ${_f(r)} ${_f(r)} 0 0 1 ${_f(-arc)} ${_f(arc)} c ${_f(-c)} ${_f(d)} ${_f(-(b+c))} ${_f(d)} ${_f(-(a+b+c))} ${_f(d)}`;
}
function _bl({ a, b, c, d, arc, r }: _CP) {
  if (!r) return '';
  return `c ${_f(-a)} 0 ${_f(-(a+b))} 0 ${_f(-(a+b+c))} ${_f(-d)} a ${_f(r)} ${_f(r)} 0 0 1 ${_f(-arc)} ${_f(-arc)} c ${_f(-d)} ${_f(-c)} ${_f(-d)} ${_f(-(b+c))} ${_f(-d)} ${_f(-(a+b+c))}`;
}
function _tl({ a, b, c, d, arc, r }: _CP) {
  if (!r) return '';
  return `c 0 ${_f(-a)} 0 ${_f(-(a+b))} ${_f(d)} ${_f(-(a+b+c))} a ${_f(r)} ${_f(r)} 0 0 1 ${_f(arc)} ${_f(-arc)} c ${_f(c)} ${_f(-d)} ${_f(b+c)} ${_f(-d)} ${_f(a+b+c)} ${_f(-d)}`;
}

function squirclePath(
  x: number, y: number,  // top-left origin (stroke offset)
  w: number, h: number,  // inner dimensions
  r: number, smoothing: number // 0–1
): string {
  const budget = Math.min(w, h) / 2;
  const cr = Math.min(r, budget);
  if (cr === 0) return `M ${x},${y} H ${x+w} V ${y+h} H ${x} Z`;
  if (smoothing <= 0) {
    // Standard rounded rect
    return `M ${x+cr},${y} H ${x+w-cr} Q ${x+w},${y} ${x+w},${y+cr} V ${y+h-cr} Q ${x+w},${y+h} ${x+w-cr},${y+h} H ${x+cr} Q ${x},${y+h} ${x},${y+h-cr} V ${y+cr} Q ${x},${y} ${x+cr},${y} Z`;
  }
  const cp = _cornerParams(cr, smoothing, budget);
  const { p } = cp;
  return [
    `M ${_f(x+w-p)},${_f(y)}`,
    _tr(cp),
    `L ${_f(x+w)},${_f(y+h-p)}`,
    _br(cp),
    `L ${_f(x+p)},${_f(y+h)}`,
    _bl(cp),
    `L ${_f(x)},${_f(y+p)}`,
    _tl(cp),
    `Z`,
  ].join(' ');
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Exported so canvas.tsx can compute squircle clip paths for canvas-level backdrop blur
export { squirclePath };

export function ShapeRendererComponent({ props }: { props: Record<string, unknown> }) {
  const rawId = useId();
  const id = rawId.replace(/:/g, '');

  const shapeType = (props.shapeType as string) ?? 'rectangle';
  const width = (props.shapeWidth as number) ?? 100;
  const height = (props.shapeHeight as number) ?? 100;
  const borderRadius = (props.borderRadius as number) ?? 0;
  const cornerSmoothing = ((props.cornerSmoothing as number) ?? 0) / 100; // 0–100 → 0–1
  const pathData = props.pathData as string | undefined;
  const viewBox = (props.viewBox as string) ?? `0 0 ${width} ${height}`;
  const fills = (props.fills as Fill[]) ?? [];
  const strokes = (props.strokes as StrokeDef[]) ?? [];
  const shadows = (props.shadows as ShadowDef[]) ?? [];
  const blurAmount = (props.blur as number) ?? 0;
  const backgroundBlur = (props.backgroundBlur as number) ?? 0;
  const text = props.text as string | undefined;
  const textColor = (props.textColor as string) ?? 'white';
  const textSize = (props.textSize as number) ?? 13;

  // Separate drop shadows from inner shadows
  const dropShadows = shadows.filter(s => (s.shadowType ?? 'drop-shadow') === 'drop-shadow');
  const innerShadows = shadows.filter(s => s.shadowType === 'inner-shadow');

  // ── Fill ────────────────────────────────────────────────────────
  let fillValue = 'none';
  let fillOpacity = 1;
  let gradientDef: React.ReactNode = null;

  if (fills.length > 0) {
    const f = fills[0];
    if (f.type === 'solid') {
      fillValue = f.color;
      fillOpacity = f.opacity;
    } else if (f.type === 'linear-gradient') {
      const gradId = `lg${id}`;
      const rad = ((f.angle - 90) * Math.PI) / 180;
      const x1 = f.startPoint?.x ?? (0.5 - Math.cos(rad) * 0.5);
      const y1 = f.startPoint?.y ?? (0.5 - Math.sin(rad) * 0.5);
      const x2 = f.endPoint?.x ?? (0.5 + Math.cos(rad) * 0.5);
      const y2 = f.endPoint?.y ?? (0.5 + Math.sin(rad) * 0.5);
      gradientDef = (
        <linearGradient id={gradId} x1={x1} y1={y1} x2={x2} y2={y2}>
          {f.stops.map((stop, i) => (
            <stop key={i} offset={`${stop.offset * 100}%`} stopColor={stop.color} stopOpacity={stop.opacity ?? 1} />
          ))}
        </linearGradient>
      );
      fillValue = `url(#${gradId})`;
    } else if (f.type === 'radial-gradient') {
      const gradId = `rg${id}`;
      gradientDef = (
        <radialGradient id={gradId} cx="50%" cy="50%" r="50%">
          {f.stops.map((stop, i) => (
            <stop key={i} offset={`${stop.offset * 100}%`} stopColor={stop.color} stopOpacity={stop.opacity ?? 1} />
          ))}
        </radialGradient>
      );
      fillValue = `url(#${gradId})`;
    }
  }

  // ── Stroke ─────────────────────────────────────────────────────
  const stroke = strokes.length > 0 ? strokes[0] : null;
  const sw = stroke?.width ?? 0;
  const strokePos = stroke?.position ?? 'center';

  // Stroke gradient support
  let strokeValue = stroke?.color ?? 'none';
  let strokeGradDef: React.ReactNode = null;
  if (stroke?.strokeFill) {
    const sf = stroke.strokeFill;
    if (sf.type === 'solid') {
      strokeValue = sf.color;
    } else if (sf.type === 'linear-gradient') {
      const sgId = `sg${id}`;
      const rad = ((sf.angle - 90) * Math.PI) / 180;
      strokeGradDef = (
        <linearGradient id={sgId} x1={0.5 - Math.cos(rad) * 0.5} y1={0.5 - Math.sin(rad) * 0.5} x2={0.5 + Math.cos(rad) * 0.5} y2={0.5 + Math.sin(rad) * 0.5}>
          {sf.stops.map((stop, i) => <stop key={i} offset={`${stop.offset * 100}%`} stopColor={stop.color} stopOpacity={stop.opacity ?? 1} />)}
        </linearGradient>
      );
      strokeValue = `url(#${sgId})`;
    } else if (sf.type === 'radial-gradient') {
      const sgId = `srg${id}`;
      strokeGradDef = (
        <radialGradient id={sgId} cx="50%" cy="50%" r="50%">
          {sf.stops.map((stop, i) => <stop key={i} offset={`${stop.offset * 100}%`} stopColor={stop.color} stopOpacity={stop.opacity ?? 1} />)}
        </radialGradient>
      );
      strokeValue = `url(#${sgId})`;
    }
  }

  // For inside/outside stroke: effective width doubles (SVG clips half)
  const renderSW = strokePos === 'center' ? sw : sw * 2;

  // ── CSS filters (drop shadows + layer blur) ────────────────────
  const cssFilters: string[] = [];
  for (const s of dropShadows) {
    const rgba = hexToRgba(s.color, s.opacity);
    cssFilters.push(`drop-shadow(${s.x}px ${s.y}px ${s.blur}px ${rgba})`);
  }
  if (blurAmount > 0) cssFilters.push(`blur(${blurAmount}px)`);

  // ── Inner shadow SVG filter ────────────────────────────────────
  const innerFilterId = `isf${id}`;
  const hasInnerShadow = innerShadows.length > 0;
  let innerShadowFilterDef: React.ReactNode = null;

  if (hasInnerShadow) {
    const s = innerShadows[0];
    innerShadowFilterDef = (
      <filter id={innerFilterId} x="-50%" y="-50%" width="200%" height="200%">
        <feComponentTransfer in="SourceAlpha">
          <feFuncA type="table" tableValues="1 0" />
        </feComponentTransfer>
        <feGaussianBlur stdDeviation={s.blur / 2} result="blur" />
        <feOffset dx={s.x} dy={s.y} result="offset" />
        <feFlood floodColor={s.color} floodOpacity={s.opacity} result="flood" />
        <feComposite in="flood" in2="offset" operator="in" result="shadow" />
        <feComposite in="shadow" in2="SourceAlpha" operator="in" result="clipped" />
        <feMerge>
          <feMergeNode in="SourceGraphic" />
          <feMergeNode in="clipped" />
        </feMerge>
      </filter>
    );
  }

  // ── Background blur clip shape ─────────────────────────────────
  const hasBackgroundBlur = backgroundBlur > 0;
  let clipStyle: React.CSSProperties | undefined;
  if (hasBackgroundBlur) {
    if (shapeType === 'rectangle') {
      if (cornerSmoothing > 0 && borderRadius > 0) {
        const d = squirclePath(0, 0, width, height, borderRadius, cornerSmoothing);
        clipStyle = { clipPath: `path('${d}')` };
      } else {
        clipStyle = { borderRadius: borderRadius };
      }
    } else if (shapeType === 'ellipse') {
      clipStyle = { borderRadius: '50%' };
    }
  }

  // Stroke positioning: inside/outside need clipping or split rendering
  const needsSplit = strokePos === 'outside' || (hasBackgroundBlur && clipStyle && sw > 0);
  const needsClip = strokePos === 'inside' && sw > 0;
  const strokeClipId = `sc${id}`;

  // ── Shape element ─────────────────────────────────────────────
  const shapeFilter = hasInnerShadow ? `url(#${innerFilterId})` : undefined;
  let shapeEl: React.ReactNode;
  let strokeOnlyEl: React.ReactNode = null;
  let strokeClipDef: React.ReactNode = null;

  if (shapeType === 'rectangle') {
    // For center: offset inward by sw/2. For inside/outside: full size.
    const ox = strokePos === 'center' ? sw / 2 : 0;
    const rw = Math.max(0, strokePos === 'center' ? width - sw : width);
    const rh = Math.max(0, strokePos === 'center' ? height - sw : height);
    const useSquircle = cornerSmoothing > 0 && borderRadius > 0;
    const strokeAttrs = {
      stroke: sw > 0 ? strokeValue : 'none', strokeWidth: renderSW,
      strokeOpacity: stroke?.opacity ?? 1,
      strokeDasharray: stroke?.dashArray,
      strokeLinecap: stroke?.lineCap, strokeLinejoin: stroke?.lineJoin,
      clipPath: needsClip ? `url(#${strokeClipId})` : undefined,
    };

    // Clip path for inside stroke: clips to the shape boundary
    if (needsClip) {
      strokeClipDef = (
        <clipPath id={strokeClipId}>
          {useSquircle
            ? <path d={squirclePath(0, 0, width, height, borderRadius, cornerSmoothing)} />
            : <rect x={0} y={0} width={width} height={height} rx={borderRadius} />
          }
        </clipPath>
      );
    }

    const makePath = (o: number, w: number, h: number) =>
      useSquircle ? squirclePath(o, o, w, h, borderRadius, cornerSmoothing) : null;

    if (needsSplit) {
      // Stroke behind fill (outside positioning or bg blur split)
      const fillEl = useSquircle ? (
        <path d={makePath(ox, rw, rh)!} fill={fillValue} fillOpacity={fillOpacity} stroke="none" filter={shapeFilter} />
      ) : (
        <rect x={ox} y={ox} width={rw} height={rh} rx={borderRadius} fill={fillValue} fillOpacity={fillOpacity} stroke="none" filter={shapeFilter} />
      );
      const strokeEl = useSquircle ? (
        <path d={makePath(ox, rw, rh)!} fill="none" {...strokeAttrs} />
      ) : (
        <rect x={ox} y={ox} width={rw} height={rh} rx={borderRadius} fill="none" {...strokeAttrs} />
      );
      // Outside: stroke behind fill. Otherwise: fill behind stroke.
      if (strokePos === 'outside') {
        shapeEl = <>{strokeEl}{fillEl}</>;
      } else {
        shapeEl = fillEl;
        strokeOnlyEl = strokeEl;
      }
    } else {
      shapeEl = useSquircle ? (
        <path d={makePath(ox, rw, rh)!} fill={fillValue} fillOpacity={fillOpacity} {...strokeAttrs} filter={shapeFilter} />
      ) : (
        <rect x={ox} y={ox} width={rw} height={rh} rx={borderRadius} fill={fillValue} fillOpacity={fillOpacity} {...strokeAttrs} filter={shapeFilter} />
      );
    }
  } else if (shapeType === 'ellipse') {
    const erx = strokePos === 'center' ? Math.max(0, (width - sw) / 2) : width / 2;
    const ery = strokePos === 'center' ? Math.max(0, (height - sw) / 2) : height / 2;
    const strokeAttrs = {
      stroke: sw > 0 ? strokeValue : 'none', strokeWidth: renderSW,
      strokeOpacity: stroke?.opacity ?? 1,
      strokeDasharray: stroke?.dashArray,
      strokeLinecap: stroke?.lineCap, strokeLinejoin: stroke?.lineJoin,
      clipPath: needsClip ? `url(#${strokeClipId})` : undefined,
    };

    if (needsClip) {
      strokeClipDef = (
        <clipPath id={strokeClipId}>
          <ellipse cx={width / 2} cy={height / 2} rx={width / 2} ry={height / 2} />
        </clipPath>
      );
    }

    if (needsSplit) {
      const fillEl = <ellipse cx={width / 2} cy={height / 2} rx={erx} ry={ery} fill={fillValue} fillOpacity={fillOpacity} stroke="none" filter={shapeFilter} />;
      const strokeEl = <ellipse cx={width / 2} cy={height / 2} rx={erx} ry={ery} fill="none" {...strokeAttrs} />;
      if (strokePos === 'outside') {
        shapeEl = <>{strokeEl}{fillEl}</>;
      } else {
        shapeEl = fillEl;
        strokeOnlyEl = strokeEl;
      }
    } else {
      shapeEl = <ellipse cx={width / 2} cy={height / 2} rx={erx} ry={ery} fill={fillValue} fillOpacity={fillOpacity} {...strokeAttrs} filter={shapeFilter} />;
    }
  } else if (shapeType === 'vector' && pathData) {
    const strokeAttrs = {
      stroke: sw > 0 ? strokeValue : 'none', strokeWidth: renderSW,
      strokeOpacity: stroke?.opacity ?? 1,
      strokeLinecap: (stroke?.lineCap ?? 'round') as 'round' | 'butt' | 'square',
      strokeLinejoin: (stroke?.lineJoin ?? 'round') as 'round' | 'bevel' | 'miter',
      strokeDasharray: stroke?.dashArray,
      clipPath: needsClip ? `url(#${strokeClipId})` : undefined,
    };

    if (needsClip) {
      strokeClipDef = <clipPath id={strokeClipId}><path d={pathData} /></clipPath>;
    }

    if (needsSplit) {
      const fillEl = <path d={pathData} fill={fillValue} fillOpacity={fillOpacity} stroke="none" filter={shapeFilter} />;
      const strokeEl = <path d={pathData} fill="none" {...strokeAttrs} />;
      if (strokePos === 'outside') {
        shapeEl = <>{strokeEl}{fillEl}</>;
      } else {
        shapeEl = fillEl;
        strokeOnlyEl = strokeEl;
      }
    } else {
      shapeEl = <path d={pathData} fill={fillValue} fillOpacity={fillOpacity} {...strokeAttrs} filter={shapeFilter} />;
    }
  }

  // ── Shared SVG props ──────────────────────────────────────────
  const svgVB = shapeType === 'vector' && viewBox ? viewBox : `0 0 ${width} ${height}`;
  const svgFilter = cssFilters.length > 0 ? cssFilters.join(' ') : undefined;

  const textEl = text ? (
    <text
      x={shapeType === 'vector' ? undefined : width / 2}
      y={shapeType === 'vector' ? undefined : height / 2}
      textAnchor="middle"
      dominantBaseline="central"
      fill={textColor}
      fontSize={textSize}
      fontWeight={600}
      fontFamily="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
      style={{ userSelect: 'none', pointerEvents: 'none' }}
    >
      {text}
    </text>
  ) : null;

  // ── Render ─────────────────────────────────────────────────────

  // Background blur with split stroke: three layers
  if (needsSplit && hasBackgroundBlur && clipStyle) {
    return (
      <div style={{ position: 'relative', width, height }}>
        {/* 1. Backdrop blur clipped to shape */}
        <div style={{
          position: 'absolute', inset: 0,
          ...clipStyle,
          overflow: 'hidden',
          backdropFilter: `blur(${backgroundBlur}px)`,
          WebkitBackdropFilter: `blur(${backgroundBlur}px)`,
        }} />
        {/* 2. Fill SVG — z-index:1 ensures it paints AFTER the blur div so
               the blur only captures canvas content, not the fill itself */}
        <svg width={width} height={height} viewBox={svgVB}
          style={{ display: 'block', overflow: 'visible', filter: svgFilter, position: 'relative', zIndex: 1 }}>
          <defs>{gradientDef}{strokeGradDef}{strokeClipDef}{innerShadowFilterDef}</defs>
          {shapeEl}
          {textEl}
        </svg>
        {/* 3. Stroke SVG on top — crisp, isolated from blur */}
        <svg width={width} height={height} viewBox={svgVB}
          style={{ display: 'block', overflow: 'visible', position: 'absolute', inset: 0, zIndex: 2 }}>
          {strokeOnlyEl}
        </svg>
      </div>
    );
  }

  // Background blur without stroke: two layers
  if (hasBackgroundBlur && clipStyle) {
    return (
      <div style={{ position: 'relative', width, height }}>
        <div style={{
          position: 'absolute', inset: 0,
          ...clipStyle,
          overflow: 'hidden',
          backdropFilter: `blur(${backgroundBlur}px)`,
          WebkitBackdropFilter: `blur(${backgroundBlur}px)`,
        }} />
        {/* z-index:1 ensures the fill paints AFTER the blur div so the blur
            only captures canvas content behind the shape, not the fill itself */}
        <svg width={width} height={height} viewBox={svgVB}
          style={{ display: 'block', overflow: 'visible', filter: svgFilter, position: 'relative', zIndex: 1 }}>
          <defs>{gradientDef}{strokeGradDef}{strokeClipDef}{innerShadowFilterDef}</defs>
          {shapeEl}
          {textEl}
        </svg>
      </div>
    );
  }

  // No background blur: single SVG
  return (
    <svg width={width} height={height} viewBox={svgVB}
      style={{ display: 'block', overflow: 'visible', filter: svgFilter }}>
      <defs>{gradientDef}{strokeGradDef}{strokeClipDef}{innerShadowFilterDef}</defs>
      {shapeEl}
      {textEl}
    </svg>
  );
}
