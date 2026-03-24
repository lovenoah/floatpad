import { motion } from 'motion/react';

const infoIcon = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
    <path d="M6.5 6.2c0-1 .7-1.7 1.5-1.7s1.5.7 1.5 1.7c0 .7-.4 1-1 1.4-.3.2-.5.4-.5.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    <circle cx="8" cy="11" r="0.7" fill="currentColor" />
  </svg>
);

const settingsIcon = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6.86 2h2.28l.32 1.92a5 5 0 011.18.68l1.86-.62.86 1.48-1.54 1.3a5 5 0 010 1.48l1.54 1.3-.86 1.48-1.86-.62a5 5 0 01-1.18.68L9.14 14H6.86l-.32-1.92a5 5 0 01-1.18-.68l-1.86.62-.86-1.48 1.54-1.3a5 5 0 010-1.48l-1.54-1.3.86-1.48 1.86.62a5 5 0 011.18-.68L6.86 2z" />
    <circle cx="8" cy="8" r="2" />
  </svg>
);

const base: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 8,
  border: 'none',
  background: 'rgba(0,0,0,0.03)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#94a3b8',
};

function PanelButton({ onClick, variant = 'standalone', icon, title }: {
  onClick: () => void;
  variant?: 'standalone' | 'toolbar';
  icon: React.ReactNode;
  title: string;
}) {
  if (variant === 'toolbar') {
    return (
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 25 }}
        whileHover={{ background: 'rgba(0,0,0,0.06)' }}
        whileTap={{ scale: 0.92 }}
        onClick={onClick}
        style={{ ...base, transformOrigin: 'center' }}
        title={title}
      >
        {icon}
      </motion.button>
    );
  }

  return (
    <motion.button
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.8, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      whileHover={{ background: 'rgba(0,0,0,0.06)' }}
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      style={base}
      title={title}
    >
      {icon}
    </motion.button>
  );
}

export function InfoButton({ onClick, variant = 'standalone' }: { onClick: () => void; variant?: 'standalone' | 'toolbar' }) {
  return <PanelButton onClick={onClick} variant={variant} icon={infoIcon} title="Help & shortcuts" />;
}

export function SettingsButton({ onClick, variant = 'standalone' }: { onClick: () => void; variant?: 'standalone' | 'toolbar' }) {
  return <PanelButton onClick={onClick} variant={variant} icon={settingsIcon} title="Settings" />;
}
