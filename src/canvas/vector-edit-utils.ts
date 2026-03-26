// ── Vector point type ─────────────────────────────────────────────────
export type VectorPoint = {
  x: number;
  y: number;
  handleIn: { x: number; y: number } | null;
  handleOut: { x: number; y: number } | null;
};

// ── Mirror a handle through an anchor point ──────────────────────────
export function mirrorHandle(anchor: { x: number; y: number }, handle: { x: number; y: number }): { x: number; y: number } {
  return { x: 2 * anchor.x - handle.x, y: 2 * anchor.y - handle.y };
}

// ── Parse SVG path data into editable VectorPoints ───────────────────
// Supports: M, L, C, H, V, Z (and lowercase relative variants)
export function parsePathData(d: string): { points: VectorPoint[]; closed: boolean } {
  const points: VectorPoint[] = [];
  let closed = false;

  // Tokenize: split into commands + number groups
  const tokens = d.match(/[MLCHVZSQTAmlchvzsqta]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g);
  if (!tokens) return { points, closed };

  let cmd = '';
  let cx = 0, cy = 0; // current point
  let startX = 0, startY = 0; // start of subpath
  let i = 0;

  function nextNum(): number {
    return parseFloat(tokens![++i]) || 0;
  }

  while (i < tokens.length) {
    const t = tokens[i];
    if (/[A-Za-z]/.test(t)) {
      cmd = t;
      i++;
    } else {
      // Implicit repeat of previous command
      i--; // will be re-incremented by nextNum
    }

    switch (cmd) {
      case 'M': {
        cx = nextNum(); cy = nextNum();
        startX = cx; startY = cy;
        points.push({ x: cx, y: cy, handleIn: null, handleOut: null });
        cmd = 'L'; // implicit lineto after moveto
        break;
      }
      case 'm': {
        cx += nextNum(); cy += nextNum();
        startX = cx; startY = cy;
        points.push({ x: cx, y: cy, handleIn: null, handleOut: null });
        cmd = 'l';
        break;
      }
      case 'L': {
        cx = nextNum(); cy = nextNum();
        points.push({ x: cx, y: cy, handleIn: null, handleOut: null });
        break;
      }
      case 'l': {
        cx += nextNum(); cy += nextNum();
        points.push({ x: cx, y: cy, handleIn: null, handleOut: null });
        break;
      }
      case 'H': {
        cx = nextNum();
        points.push({ x: cx, y: cy, handleIn: null, handleOut: null });
        break;
      }
      case 'h': {
        cx += nextNum();
        points.push({ x: cx, y: cy, handleIn: null, handleOut: null });
        break;
      }
      case 'V': {
        cy = nextNum();
        points.push({ x: cx, y: cy, handleIn: null, handleOut: null });
        break;
      }
      case 'v': {
        cy += nextNum();
        points.push({ x: cx, y: cy, handleIn: null, handleOut: null });
        break;
      }
      case 'C': {
        const cp1x = nextNum(), cp1y = nextNum();
        const cp2x = nextNum(), cp2y = nextNum();
        const ex = nextNum(), ey = nextNum();
        // cp1 = handleOut of previous point
        if (points.length > 0) {
          points[points.length - 1].handleOut = { x: cp1x, y: cp1y };
        }
        // cp2 = handleIn of this new point
        points.push({ x: ex, y: ey, handleIn: { x: cp2x, y: cp2y }, handleOut: null });
        cx = ex; cy = ey;
        break;
      }
      case 'c': {
        const cp1x = cx + nextNum(), cp1y = cy + nextNum();
        const cp2x = cx + nextNum(), cp2y = cy + nextNum();
        const ex = cx + nextNum(), ey = cy + nextNum();
        if (points.length > 0) {
          points[points.length - 1].handleOut = { x: cp1x, y: cp1y };
        }
        points.push({ x: ex, y: ey, handleIn: { x: cp2x, y: cp2y }, handleOut: null });
        cx = ex; cy = ey;
        break;
      }
      case 'S': {
        // Smooth cubic: cp1 is reflection of previous cp2
        const cp2x = nextNum(), cp2y = nextNum();
        const ex = nextNum(), ey = nextNum();
        const prev = points.length > 0 ? points[points.length - 1] : null;
        const cp1 = prev?.handleIn ? mirrorHandle({ x: cx, y: cy }, prev.handleIn) : { x: cx, y: cy };
        if (prev) prev.handleOut = cp1;
        points.push({ x: ex, y: ey, handleIn: { x: cp2x, y: cp2y }, handleOut: null });
        cx = ex; cy = ey;
        break;
      }
      case 's': {
        const cp2x = cx + nextNum(), cp2y = cy + nextNum();
        const ex = cx + nextNum(), ey = cy + nextNum();
        const prev = points.length > 0 ? points[points.length - 1] : null;
        const cp1 = prev?.handleIn ? mirrorHandle({ x: cx, y: cy }, prev.handleIn) : { x: cx, y: cy };
        if (prev) prev.handleOut = cp1;
        points.push({ x: ex, y: ey, handleIn: { x: cp2x, y: cp2y }, handleOut: null });
        cx = ex; cy = ey;
        break;
      }
      case 'Q': {
        // Quadratic bezier — convert to cubic approximation
        const qx = nextNum(), qy = nextNum();
        const ex = nextNum(), ey = nextNum();
        // Cubic approximation: cp1 = start + 2/3*(q - start), cp2 = end + 2/3*(q - end)
        const cp1x = cx + (2 / 3) * (qx - cx);
        const cp1y = cy + (2 / 3) * (qy - cy);
        const cp2x = ex + (2 / 3) * (qx - ex);
        const cp2y = ey + (2 / 3) * (qy - ey);
        if (points.length > 0) {
          points[points.length - 1].handleOut = { x: cp1x, y: cp1y };
        }
        points.push({ x: ex, y: ey, handleIn: { x: cp2x, y: cp2y }, handleOut: null });
        cx = ex; cy = ey;
        break;
      }
      case 'q': {
        const qx = cx + nextNum(), qy = cy + nextNum();
        const ex = cx + nextNum(), ey = cy + nextNum();
        const cp1x = cx + (2 / 3) * (qx - cx);
        const cp1y = cy + (2 / 3) * (qy - cy);
        const cp2x = ex + (2 / 3) * (qx - ex);
        const cp2y = ey + (2 / 3) * (qy - ey);
        if (points.length > 0) {
          points[points.length - 1].handleOut = { x: cp1x, y: cp1y };
        }
        points.push({ x: ex, y: ey, handleIn: { x: cp2x, y: cp2y }, handleOut: null });
        cx = ex; cy = ey;
        break;
      }
      case 'Z':
      case 'z': {
        closed = true;
        cx = startX; cy = startY;
        break;
      }
      default:
        // Skip unsupported commands (A/a arcs, T/t smooth quad)
        i++;
        break;
    }
    i++;
  }

  // Remove duplicate closing point (if last point matches first and path is closed)
  if (closed && points.length >= 2) {
    const first = points[0];
    const last = points[points.length - 1];
    if (Math.abs(first.x - last.x) < 0.5 && Math.abs(first.y - last.y) < 0.5) {
      // Transfer the closing point's handleIn to the first point if needed
      if (last.handleIn && !first.handleIn) {
        first.handleIn = last.handleIn;
      }
      // Transfer the second-to-last point's handleOut to close properly
      points.pop();
    }
  }

  return { points, closed };
}

// ── Convert VectorPoints back to SVG path data ──────────────────────
export function pointsToPathData(points: VectorPoint[], closed: boolean): string {
  if (points.length === 0) return '';

  const f = (n: number) => n.toFixed(2);
  const parts: string[] = [`M ${f(points[0].x)},${f(points[0].y)}`];

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    if (prev.handleOut || cur.handleIn) {
      const cp1 = prev.handleOut ?? prev;
      const cp2 = cur.handleIn ?? cur;
      parts.push(`C ${f(cp1.x)},${f(cp1.y)} ${f(cp2.x)},${f(cp2.y)} ${f(cur.x)},${f(cur.y)}`);
    } else {
      parts.push(`L ${f(cur.x)},${f(cur.y)}`);
    }
  }

  if (closed && points.length >= 2) {
    const last = points[points.length - 1];
    const first = points[0];
    if (last.handleOut || first.handleIn) {
      const cp1 = last.handleOut ?? last;
      const cp2 = first.handleIn ?? first;
      parts.push(`C ${f(cp1.x)},${f(cp1.y)} ${f(cp2.x)},${f(cp2.y)} ${f(first.x)},${f(first.y)}`);
    } else {
      // Only add L if last point isn't already at first
      if (Math.abs(last.x - first.x) > 0.5 || Math.abs(last.y - first.y) > 0.5) {
        parts.push(`L ${f(first.x)},${f(first.y)}`);
      }
    }
    parts.push('Z');
  }

  return parts.join(' ');
}

// ── Decompose rectangle into VectorPoints ────────────────────────────
export function decomposeRectangle(w: number, h: number, borderRadius: number): { points: VectorPoint[]; closed: boolean } {
  const r = Math.min(borderRadius, Math.min(w, h) / 2);

  if (r <= 0) {
    // Simple rectangle: 4 corner points, no handles
    return {
      points: [
        { x: 0, y: 0, handleIn: null, handleOut: null },
        { x: w, y: 0, handleIn: null, handleOut: null },
        { x: w, y: h, handleIn: null, handleOut: null },
        { x: 0, y: h, handleIn: null, handleOut: null },
      ],
      closed: true,
    };
  }

  // Rounded rectangle: decompose into 8 points (2 per corner, with cubic bezier handles)
  // Using the standard kappa for quarter-circle approximation
  const k = 0.5522847498;
  const kr = k * r;

  return {
    points: [
      // Top edge: start after TL corner arc
      { x: r, y: 0, handleIn: { x: r - kr, y: 0 }, handleOut: null },
      // TR corner: split into approach + exit
      { x: w - r, y: 0, handleIn: null, handleOut: { x: w - r + kr, y: 0 } },
      { x: w, y: r, handleIn: { x: w, y: r - kr }, handleOut: null },
      // BR corner
      { x: w, y: h - r, handleIn: null, handleOut: { x: w, y: h - r + kr } },
      { x: w - r, y: h, handleIn: { x: w - r + kr, y: h }, handleOut: null },
      // BL corner
      { x: r, y: h, handleIn: null, handleOut: { x: r - kr, y: h } },
      { x: 0, y: h - r, handleIn: { x: 0, y: h - r + kr }, handleOut: null },
      // TL corner
      { x: 0, y: r, handleIn: null, handleOut: { x: 0, y: r - kr } },
    ],
    closed: true,
  };
}

// ── Decompose ellipse into VectorPoints ──────────────────────────────
export function decomposeEllipse(w: number, h: number): { points: VectorPoint[]; closed: boolean } {
  const k = 0.5522847498;
  const rx = w / 2, ry = h / 2;
  const cx = rx, cy = ry;

  return {
    points: [
      // Top
      { x: cx, y: 0, handleIn: { x: cx + rx * k, y: 0 }, handleOut: { x: cx - rx * k, y: 0 } },
      // Left
      { x: 0, y: cy, handleIn: { x: 0, y: cy - ry * k }, handleOut: { x: 0, y: cy + ry * k } },
      // Bottom
      { x: cx, y: h, handleIn: { x: cx - rx * k, y: h }, handleOut: { x: cx + rx * k, y: h } },
      // Right
      { x: w, y: cy, handleIn: { x: w, y: cy + ry * k }, handleOut: { x: w, y: cy - ry * k } },
    ],
    closed: true,
  };
}

// ── De Casteljau subdivision at parameter t ──────────────────────────
// Splits cubic bezier (p0→p1) at t, returns { left point handles, midpoint, right point handles }
export function deCasteljau(
  p0: VectorPoint,
  p1: VectorPoint,
  t: number
): { leftHandleOut: { x: number; y: number }; mid: VectorPoint; rightHandleIn: { x: number; y: number } } {
  const cp1 = p0.handleOut ?? p0;
  const cp2 = p1.handleIn ?? p1;

  // Level 1 lerps
  const a = { x: lerp(p0.x, cp1.x, t), y: lerp(p0.y, cp1.y, t) };
  const b = { x: lerp(cp1.x, cp2.x, t), y: lerp(cp1.y, cp2.y, t) };
  const c = { x: lerp(cp2.x, p1.x, t), y: lerp(cp2.y, p1.y, t) };

  // Level 2 lerps
  const d = { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
  const e = { x: lerp(b.x, c.x, t), y: lerp(b.y, c.y, t) };

  // Level 3: the point on the curve
  const midPt = { x: lerp(d.x, e.x, t), y: lerp(d.y, e.y, t) };

  return {
    leftHandleOut: a,    // new handleOut for p0 in left half
    mid: {
      x: midPt.x,
      y: midPt.y,
      handleIn: d,       // handleIn for midpoint (from left half)
      handleOut: e,      // handleOut for midpoint (to right half)
    },
    rightHandleIn: c,    // new handleIn for p1 in right half
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ── Compute bounding box from VectorPoints ──────────────────────────
export function recomputeBounds(points: VectorPoint[], padding = 2): { minX: number; minY: number; w: number; h: number } {
  if (points.length === 0) return { minX: 0, minY: 0, w: 0, h: 0 };

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    if (p.handleIn) {
      if (p.handleIn.x < minX) minX = p.handleIn.x;
      if (p.handleIn.x > maxX) maxX = p.handleIn.x;
      if (p.handleIn.y < minY) minY = p.handleIn.y;
      if (p.handleIn.y > maxY) maxY = p.handleIn.y;
    }
    if (p.handleOut) {
      if (p.handleOut.x < minX) minX = p.handleOut.x;
      if (p.handleOut.x > maxX) maxX = p.handleOut.x;
      if (p.handleOut.y < minY) minY = p.handleOut.y;
      if (p.handleOut.y > maxY) maxY = p.handleOut.y;
    }
  }

  return {
    minX: minX - padding,
    minY: minY - padding,
    w: maxX - minX + padding * 2,
    h: maxY - minY + padding * 2,
  };
}

// ── Translate points so viewBox starts at 0,0 ────────────────────────
export function normalizePoints(points: VectorPoint[], bounds: { minX: number; minY: number }): VectorPoint[] {
  const { minX, minY } = bounds;
  return points.map(p => ({
    x: p.x - minX,
    y: p.y - minY,
    handleIn: p.handleIn ? { x: p.handleIn.x - minX, y: p.handleIn.y - minY } : null,
    handleOut: p.handleOut ? { x: p.handleOut.x - minX, y: p.handleOut.y - minY } : null,
  }));
}

// ── Find closest point on a cubic bezier segment ─────────────────────
export function closestPointOnSegment(
  p0: VectorPoint,
  p1: VectorPoint,
  cursor: { x: number; y: number },
  samples = 30
): { t: number; pos: { x: number; y: number }; dist: number } {
  const cp1 = p0.handleOut ?? p0;
  const cp2 = p1.handleIn ?? p1;

  let bestT = 0, bestDist = Infinity;
  let bestPos = { x: p0.x, y: p0.y };

  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const mt = 1 - t;
    const x = mt * mt * mt * p0.x + 3 * mt * mt * t * cp1.x + 3 * mt * t * t * cp2.x + t * t * t * p1.x;
    const y = mt * mt * mt * p0.y + 3 * mt * mt * t * cp1.y + 3 * mt * t * t * cp2.y + t * t * t * p1.y;
    const dist = Math.hypot(x - cursor.x, y - cursor.y);
    if (dist < bestDist) {
      bestDist = dist;
      bestT = t;
      bestPos = { x, y };
    }
  }

  return { t: bestT, pos: bestPos, dist: bestDist };
}

// ── Scale path data proportionally ───────────────────────────────────
export function scalePathData(pathData: string, oldW: number, oldH: number, newW: number, newH: number): string {
  if (oldW === 0 || oldH === 0) return pathData;
  const sx = newW / oldW;
  const sy = newH / oldH;

  // Parse, scale all points, rebuild
  const { points, closed } = parsePathData(pathData);
  const scaled = points.map(p => ({
    x: p.x * sx,
    y: p.y * sy,
    handleIn: p.handleIn ? { x: p.handleIn.x * sx, y: p.handleIn.y * sy } : null,
    handleOut: p.handleOut ? { x: p.handleOut.x * sx, y: p.handleOut.y * sy } : null,
  }));
  return pointsToPathData(scaled, closed);
}
