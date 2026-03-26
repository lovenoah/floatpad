export function FrameRendererComponent({ props }: { props: Record<string, unknown> }) {
  const w = (props.frameW as number) ?? 200;
  const h = (props.frameH as number) ?? 200;
  const fill = (props.frameFill as string) ?? 'transparent';
  const borderColor = (props.frameBorderColor as string) ?? '#e5e7eb';
  const borderWidth = (props.frameBorderWidth as number) ?? 1;
  const radius = (props.frameRadius as number) ?? 0;

  return (
    <div style={{
      width: w,
      height: h,
      background: fill,
      border: borderWidth > 0 ? `${borderWidth}px solid ${borderColor}` : 'none',
      borderRadius: radius,
      boxSizing: 'border-box',
    }} />
  );
}
