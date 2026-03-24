import { FloatpadCanvas } from './canvas/canvas';
import { DEMO_ITEMS, DEMO_RENDERERS } from './demo/demo-items';

export default function App() {
  return (
    <div style={{
      position: 'relative',
      width: '100vw',
      height: '100dvh',
      overflow: 'hidden',
      background: '#f8fafc',
    }}>
      {/* Crosshair origin marker */}
      <div style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: 'rgba(0,0,0,0.12)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      <FloatpadCanvas initialItems={DEMO_ITEMS} renderers={DEMO_RENDERERS} />

      {/* Help text */}
      <div style={{
        position: 'absolute',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        fontSize: 12,
        color: '#94a3b8',
        fontFamily: 'ui-monospace, monospace',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
      }}>
        drag to move · scroll panel: scale / rot / z · ⌘D duplicate · ⌫ delete · Place copies props to clipboard
      </div>
    </div>
  );
}
