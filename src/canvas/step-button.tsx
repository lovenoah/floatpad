import { motion } from 'motion/react';

const PANEL_FONT = "'Geist', ui-monospace, SFMono-Regular, Menlo, monospace";

export function StepButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <motion.button
      whileHover={{ background: '#f3f4f6', borderColor: '#d1d5db' }}
      whileTap={{ scale: 0.9 }}
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
      }}
      onPointerDown={e => e.stopPropagation()}
      onClick={e => { e.stopPropagation(); onClick(); }}
    >
      {children}
    </motion.button>
  );
}
