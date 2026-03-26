import { motion } from 'motion/react';
import {
  MousePointer2, Square, Circle, Minus as LineIcon,
  PenTool, Type, Settings, HelpCircle, Monitor,
} from 'lucide-react';
import type { ToolMode } from './canvas';
import {
  FONT, C_SURFACE, C_ICON, C_ACCENT, C_HOVER,
  C_DIVIDER, SHADOW_SM,
} from './tokens';

type ToolDef = {
  mode: ToolMode;
  icon: React.ReactNode;
  label: string;
  shortcut: string;
};

const ICON_SIZE = 16;
const ICON_STROKE = 1.5;

const TOOLS: ToolDef[] = [
  { mode: 'select', icon: <MousePointer2 size={ICON_SIZE} strokeWidth={ICON_STROKE} />, label: 'Select', shortcut: 'V' },
  { mode: 'rectangle', icon: <Square size={ICON_SIZE} strokeWidth={ICON_STROKE} />, label: 'Rectangle', shortcut: 'R' },
  { mode: 'ellipse', icon: <Circle size={ICON_SIZE} strokeWidth={ICON_STROKE} />, label: 'Ellipse', shortcut: 'O' },
  { mode: 'line', icon: <LineIcon size={ICON_SIZE} strokeWidth={ICON_STROKE} />, label: 'Line', shortcut: 'L' },
  { mode: 'pen', icon: <PenTool size={ICON_SIZE} strokeWidth={ICON_STROKE} />, label: 'Pen', shortcut: 'P' },
  { mode: 'text', icon: <Type size={ICON_SIZE} strokeWidth={ICON_STROKE} />, label: 'Text', shortcut: 'T' },
];

export function Toolbar({
  toolMode,
  onToolModeChange,
  windowMode,
  onToggleWindowMode,
  onSettingsClick,
  onInfoClick,
}: {
  toolMode: ToolMode;
  onToolModeChange: (mode: ToolMode) => void;
  windowMode: boolean;
  onToggleWindowMode: () => void;
  onSettingsClick: () => void;
  onInfoClick: () => void;
}) {
  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      left: 0,
      right: 0,
      display: 'flex',
      justifyContent: 'center',
      pointerEvents: 'none',
      zIndex: 600,
    }}>
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30, delay: 0.05 }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        borderRadius: 12,
        background: C_SURFACE,
        padding: '4px 5px',
        boxShadow: SHADOW_SM,
        fontFamily: FONT,
        userSelect: 'none',
        pointerEvents: 'auto',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
      onPointerDown={e => e.stopPropagation()}
    >
      {/* Tool buttons */}
      {TOOLS.map((tool, i) => {
        const active = toolMode === tool.mode;
        return (
          <ToolButton
            key={tool.mode}
            active={active}
            onClick={() => onToolModeChange(tool.mode)}
            title={`${tool.label} (${tool.shortcut})`}
            first={i === 0}
          >
            {tool.icon}
          </ToolButton>
        );
      })}

      <Separator />

      {/* Window mode */}
      <ToolButton
        active={windowMode}
        onClick={onToggleWindowMode}
        title="Window mode (W)"
      >
        <Monitor size={ICON_SIZE} strokeWidth={ICON_STROKE} />
      </ToolButton>

      <Separator />

      {/* Settings & Help */}
      <ToolButton active={false} onClick={onSettingsClick} title="Settings">
        <Settings size={14} strokeWidth={ICON_STROKE} />
      </ToolButton>
      <ToolButton active={false} onClick={onInfoClick} title="Help & shortcuts">
        <HelpCircle size={14} strokeWidth={ICON_STROKE} />
      </ToolButton>
    </motion.div>
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  title,
  children,
  first,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  first?: boolean;
}) {
  return (
    <motion.button
      whileHover={{ background: active ? undefined : C_HOVER }}
      whileTap={{ scale: 0.92 }}
      onClick={e => { e.stopPropagation(); onClick(); }}
      onPointerDown={e => e.stopPropagation()}
      title={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: active && first !== undefined ? 34 : 30,
        height: 30,
        borderRadius: active ? 8 : 6,
        border: 'none',
        background: active ? C_ACCENT : 'transparent',
        color: active ? '#ffffff' : C_ICON,
        cursor: 'pointer',
        padding: 0,
        transition: 'background 0.15s, color 0.15s',
      }}
    >
      {children}
    </motion.button>
  );
}

function Separator() {
  return (
    <div style={{
      width: 1,
      height: 20,
      background: C_DIVIDER,
      margin: '0 4px',
      flexShrink: 0,
      borderRadius: 1,
    }} />
  );
}
