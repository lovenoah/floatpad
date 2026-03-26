import { useState, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronRight, ChevronDown,
  Square, Circle, Type, Layers, Monitor, PenTool,
} from 'lucide-react';
import { getChildren } from './group-utils';
import type { ItemDef, ItemState } from './types';
import {
  FONT, C_VALUE, C_LABEL, C_MUTED, C_ICON,
  C_ACCENT, C_ACCENT_BG, C_HOVER, C_DIVIDER,
  C_SURFACE_ELEVATED, SHADOW_MD, R_SM, R_XL,
} from './tokens';

// ── Scrollbar hide ────────────────────────────────────────────────

const scrollCSS = `
  .layers-scroll { overflow-x: hidden; overflow-y: auto; scrollbar-width: none; -ms-overflow-style: none; }
  .layers-scroll::-webkit-scrollbar { display: none; }
`;

// ── Type icon ─────────────────────────────────────────────────────

function LayerIcon({ item }: { item: ItemDef }) {
  const p = { size: 12, strokeWidth: 1.5 };
  if (item.type === 'Group') return <Layers {...p} />;
  if (item.type === 'Frame') return <Monitor {...p} />;
  if (item.type === 'Text') return <Type {...p} />;
  if (item.type === 'Shape') {
    const st = item.props.shapeType as string;
    if (st === 'ellipse') return <Circle {...p} />;
    if (st === 'vector') return <PenTool {...p} />;
    return <Square {...p} />;
  }
  return <Square {...p} />;
}

// ── Build tree ────────────────────────────────────────────────────

type TreeNode = {
  item: ItemDef;
  children: TreeNode[];
};

function buildTree(items: ItemDef[], states: Record<string, ItemState>): TreeNode[] {
  const topLevel = items.filter(i => !i.group);
  const sorted = [...topLevel].sort((a, b) => (states[b.label]?.z ?? b.z) - (states[a.label]?.z ?? a.z));

  function build(parent: ItemDef): TreeNode {
    const kids = getChildren(items, parent.label);
    const sortedKids = [...kids].sort((a, b) => (states[b.label]?.z ?? b.z) - (states[a.label]?.z ?? a.z));
    return {
      item: parent,
      children: sortedKids.map(build),
    };
  }

  return sorted.map(item => {
    const kids = getChildren(items, item.label);
    if (kids.length === 0) return { item, children: [] };
    return build(item);
  });
}

// ── Layer row ─────────────────────────────────────────────────────

const ROW_H = 28;
const INDENT = 16;

function LayerRow({ node, depth, selection, collapsed, onSelect, onToggle, onRename, onEnterGroup }: {
  node: TreeNode;
  depth: number;
  selection: Set<string>;
  collapsed: Set<string>;
  onSelect: (label: string, shiftKey: boolean) => void;
  onToggle: (label: string) => void;
  onRename: (oldLabel: string, newLabel: string) => void;
  onEnterGroup?: (label: string) => void;
}) {
  const { item, children } = node;
  const isSelected = selection.has(item.label);
  const isContainer = item.type === 'Group' || item.type === 'Frame';
  const hasChildren = children.length > 0;
  const isCollapsed = collapsed.has(item.label);

  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.label);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (editing) return;
    onSelect(item.label, e.shiftKey);
  }, [item.label, editing, onSelect]);

  const handleDoubleClick = useCallback(() => {
    if (isContainer && onEnterGroup) {
      onEnterGroup(item.label);
    } else {
      setEditing(true);
      setDraft(item.label);
      requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.select(); });
    }
  }, [item.label, isContainer, onEnterGroup]);

  return (
    <>
      <div
        style={{
          display: 'flex', alignItems: 'center',
          height: ROW_H,
          paddingLeft: depth * INDENT + 4,
          paddingRight: 8,
          gap: 4,
          background: isSelected ? C_ACCENT_BG : hovered ? C_HOVER : 'transparent',
          cursor: editing ? 'default' : 'pointer',
          userSelect: 'none',
          transition: 'background 0.1s',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        {/* Chevron */}
        <div
          style={{
            width: 16, height: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            color: C_MUTED,
            cursor: hasChildren ? 'pointer' : 'default',
            opacity: hasChildren ? 1 : 0,
          }}
          onClick={e => {
            if (!hasChildren) return;
            e.stopPropagation();
            onToggle(item.label);
          }}
        >
          {hasChildren && (
            isCollapsed
              ? <ChevronRight size={11} strokeWidth={2} />
              : <ChevronDown size={11} strokeWidth={2} />
          )}
        </div>

        {/* Type icon */}
        <div style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: isSelected ? C_ACCENT : C_ICON }}>
          <LayerIcon item={item} />
        </div>

        {/* Label */}
        <input
          ref={inputRef}
          readOnly={!editing}
          style={{
            flex: 1, minWidth: 0,
            padding: '1px 4px',
            borderRadius: R_SM - 1,
            background: editing ? '#fff' : 'transparent',
            border: editing ? `1px solid ${C_ACCENT}` : '1px solid transparent',
            outline: 'none',
            fontSize: 12, fontWeight: isSelected ? 500 : 400,
            fontFamily: FONT,
            color: isSelected ? C_VALUE : C_LABEL,
            cursor: editing ? 'text' : 'inherit',
            userSelect: editing ? 'auto' : 'none',
            pointerEvents: editing ? 'auto' : 'none',
            transition: 'color 0.1s',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          value={editing ? draft : item.label}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => {
            setEditing(false);
            if (draft && draft !== item.label) onRename(item.label, draft);
          }}
          onKeyDown={e => {
            e.stopPropagation();
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') { setEditing(false); setDraft(item.label); (e.target as HTMLInputElement).blur(); }
          }}
          onPointerDown={e => { if (editing) e.stopPropagation(); }}
          onDoubleClick={e => {
            e.stopPropagation();
            if (!isContainer) {
              setEditing(true);
              setDraft(item.label);
              requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.select(); });
            }
          }}
          spellCheck={false}
        />
      </div>

      {/* Children (recursive) */}
      <AnimatePresence>
        {hasChildren && !isCollapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
          >
            {children.map(child => (
              <LayerRow
                key={child.item.label}
                node={child}
                depth={depth + 1}
                selection={selection}
                collapsed={collapsed}
                onSelect={onSelect}
                onToggle={onToggle}
                onRename={onRename}
                onEnterGroup={onEnterGroup}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ── Main panel ────────────────────────────────────────────────────

export type LayersPanelProps = {
  items: ItemDef[];
  states: Record<string, ItemState>;
  selection: Set<string>;
  activeGroup: string | null;
  onSelect: (label: string, shiftKey: boolean) => void;
  onRename: (oldLabel: string, newLabel: string) => void;
  onReorderZ: (orderedLabels: string[]) => void;
  onEnterGroup?: (label: string) => void;
  onExitGroup?: () => void;
};

export function LayersPanel({
  items, states, selection,
  activeGroup,
  onSelect, onRename, onReorderZ: _onReorderZ,
  onEnterGroup, onExitGroup,
}: LayersPanelProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = useCallback((label: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

  const tree = useMemo(() => buildTree(items, states), [items, states]);

  return (
    <>
      <style>{scrollCSS}</style>
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        className="layers-scroll"
        style={{
          position: 'fixed',
          left: 16, top: 16,
          width: 220,
          maxHeight: 'calc(100vh - 48px)',
          borderRadius: R_XL,
          background: C_SURFACE_ELEVATED,
          boxShadow: SHADOW_MD,
          fontFamily: FONT,
          zIndex: 400,
          display: 'flex',
          flexDirection: 'column',
        }}
        onPointerDown={e => e.stopPropagation()}
        onWheel={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '10px 14px 8px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: C_VALUE, fontFamily: FONT, letterSpacing: '-0.01em' }}>
            Layers
          </span>
          {activeGroup && onExitGroup && (
            <motion.button
              whileHover={{ background: C_HOVER }}
              whileTap={{ scale: 0.95 }}
              onClick={onExitGroup}
              style={{
                fontSize: 10, fontWeight: 500, color: C_ACCENT,
                background: 'transparent', border: 'none',
                borderRadius: R_SM, padding: '2px 6px',
                cursor: 'pointer', fontFamily: FONT,
              }}
            >
              Exit group
            </motion.button>
          )}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: C_DIVIDER, marginBottom: 2, opacity: 0.6 }} />

        {/* Tree */}
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 6 }}>
          {tree.length === 0 ? (
            <div style={{ padding: '16px 14px', textAlign: 'center' }}>
              <span style={{ fontSize: 11, color: C_MUTED, fontFamily: FONT }}>No layers</span>
            </div>
          ) : (
            tree.map(node => (
              <LayerRow
                key={node.item.label}
                node={node}
                depth={0}
                selection={selection}
                collapsed={collapsed}
                onSelect={onSelect}
                onToggle={toggle}
                onRename={onRename}
                onEnterGroup={onEnterGroup}
              />
            ))
          )}
        </div>
      </motion.div>
    </>
  );
}
