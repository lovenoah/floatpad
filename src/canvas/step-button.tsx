const PANEL_FONT = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export function StepButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 24,
        height: 24,
        borderRadius: 6,
        background: 'white',
        border: '1px solid #e5e7eb',
        boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
        fontSize: 12,
        color: '#6b7280',
        cursor: 'pointer',
        fontFamily: PANEL_FONT,
        transition: 'all 0.1s',
      }}
      onPointerDown={e => e.stopPropagation()}
      onClick={e => { e.stopPropagation(); onClick(); }}
    >
      {children}
    </button>
  );
}
