import { motion } from 'motion/react';
import { HelpCircle, Settings, Monitor } from 'lucide-react';
import { C_ACCENT, C_ICON } from './tokens';

const ICON_SIZE = 14;

const base: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 6,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: C_ICON,
};

function PanelButton({ onClick, variant = 'standalone', icon, title, active = false }: {
  onClick: () => void;
  variant?: 'standalone' | 'toolbar';
  icon: React.ReactNode;
  title: string;
  active?: boolean;
}) {
  const activeStyle: React.CSSProperties = active
    ? { background: `rgba(24,119,242,0.08)`, color: C_ACCENT }
    : {};

  if (variant === 'toolbar') {
    return (
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 25 }}
        whileHover={{ background: active ? 'rgba(24,119,242,0.12)' : 'rgba(0,0,0,0.04)' }}
        whileTap={{ scale: 0.92 }}
        onClick={onClick}
        style={{ ...base, ...activeStyle, transformOrigin: 'center' }}
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
      whileHover={{ background: active ? 'rgba(24,119,242,0.12)' : 'rgba(0,0,0,0.04)' }}
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      style={{ ...base, ...activeStyle }}
      title={title}
    >
      {icon}
    </motion.button>
  );
}

export function InfoButton({ onClick, variant = 'standalone' }: { onClick: () => void; variant?: 'standalone' | 'toolbar' }) {
  return <PanelButton onClick={onClick} variant={variant} icon={<HelpCircle size={ICON_SIZE} strokeWidth={1.5} />} title="Help & shortcuts" />;
}

export function SettingsButton({ onClick, variant = 'standalone' }: { onClick: () => void; variant?: 'standalone' | 'toolbar' }) {
  return <PanelButton onClick={onClick} variant={variant} icon={<Settings size={ICON_SIZE} strokeWidth={1.5} />} title="Settings" />;
}

export function WindowModeButton({ onClick, active = false, variant = 'standalone' }: { onClick: () => void; active?: boolean; variant?: 'standalone' | 'toolbar' }) {
  return <PanelButton onClick={onClick} variant={variant} active={active} icon={<Monitor size={ICON_SIZE} strokeWidth={1.5} />} title="Window mode (W)" />;
}

