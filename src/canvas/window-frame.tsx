export function WindowFrame({ w, h, bg, zoom }: { w: number; h: number; bg: string; zoom: number }) {
  const s = (px: number) => px / zoom;

  return (
    <div style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', zIndex: 0 }}>
      {/* Artboard */}
      <div style={{
        position: 'absolute',
        left: -w / 2,
        top: -h / 2,
        width: w,
        height: h,
        background: bg,
        boxShadow: `0 ${s(2)}px ${s(24)}px rgba(0,0,0,0.09), 0 0 0 ${s(1)}px rgba(0,0,0,0.06)`,
      }} />
    </div>
  );
}
