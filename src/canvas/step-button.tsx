import { motion } from 'motion/react';
import { FONT, C_HOVER, C_ICON } from './tokens';

export function StepButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <motion.button
      whileHover={{ background: C_HOVER }}
      whileTap={{ scale: 0.9 }}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 24,
        height: 24,
        borderRadius: 5,
        background: 'transparent',
        border: 'none',
        fontSize: 12,
        color: C_ICON,
        cursor: 'pointer',
        fontFamily: FONT,
      }}
      onPointerDown={e => e.stopPropagation()}
      onClick={e => { e.stopPropagation(); onClick(); }}
    >
      {children}
    </motion.button>
  );
}
