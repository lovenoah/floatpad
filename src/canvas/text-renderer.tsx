import { useRef, useCallback, useEffect } from 'react';

const DEFAULT_FONT = "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export function TextRendererComponent({
  props,
  editing = false,
  onCommit,
}: {
  props: Record<string, unknown>;
  editing?: boolean;
  onCommit?: (text: string) => void;
}) {
  const text = (props.text as string) ?? '';
  const fontSize = (props.fontSize as number) ?? 16;
  const fontFamily = (props.fontFamily as string) ?? DEFAULT_FONT;
  const fontWeight = (props.fontWeight as number) ?? 400;
  const color = (props.color as string) ?? '#000000';
  const textAlign = (props.textAlign as string) ?? 'left';

  const ref = useRef<HTMLDivElement>(null);
  const committed = useRef(false);

  // Auto-focus and place cursor at end when entering edit mode
  useEffect(() => {
    if (!editing || !ref.current) return;
    committed.current = false;
    const el = ref.current;

    // Set initial content (empty for new items, existing text for re-editing)
    if (text) {
      el.textContent = text;
    } else {
      el.textContent = '';
    }

    el.focus();

    // Place cursor at end
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [editing]);

  const commit = useCallback(() => {
    if (committed.current) return;
    committed.current = true;
    const currentText = ref.current?.textContent ?? '';
    onCommit?.(currentText);
  }, [onCommit]);

  const baseStyle: React.CSSProperties = {
    fontSize,
    fontFamily,
    fontWeight,
    color,
    textAlign: textAlign as 'left' | 'center' | 'right',
    whiteSpace: 'nowrap',
    lineHeight: 1.4,
    outline: 'none',
    minWidth: editing ? 2 : undefined,
    minHeight: editing ? fontSize * 1.4 : undefined,
    userSelect: editing ? 'auto' : 'none',
    cursor: editing ? 'text' : 'default',
    caretColor: color,
  };

  if (editing) {
    return (
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        style={baseStyle}
        onBlur={commit}
        onKeyDown={e => {
          e.stopPropagation(); // prevent canvas shortcuts while typing
          if (e.key === 'Escape') {
            e.preventDefault();
            commit();
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            commit();
          }
        }}
        onPointerDown={e => e.stopPropagation()}
      />
    );
  }

  return (
    <div style={baseStyle}>
      {text || 'Text'}
    </div>
  );
}
