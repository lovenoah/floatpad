import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FONT, C_SURFACE_ELEVATED, C_VALUE, SHADOW_TOAST } from './tokens';

export type ToastFn = (message: string) => void;

export function useToast(duration = 1600): [ToastFn, React.ReactNode] {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [textKey, setTextKey] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show: ToastFn = useCallback((msg: string) => {
    if (timer.current) clearTimeout(timer.current);

    if (msg !== message) {
      setTextKey(k => k + 1);
    }
    setMessage(msg);
    setVisible(true);

    timer.current = setTimeout(() => setVisible(false), duration);
  }, [duration, message]);

  const node = (
    <div style={{
      position: 'fixed',
      bottom: 56,
      left: 0,
      right: 0,
      display: 'flex',
      justifyContent: 'center',
      pointerEvents: 'none',
      zIndex: 900,
    }}>
      <AnimatePresence>
        {visible && (
          <motion.div
            key="toast-pill"
            initial={{ opacity: 0, y: 6, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            style={{
              padding: '7px 16px',
              borderRadius: 10,
              background: C_SURFACE_ELEVATED,
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              color: C_VALUE,
              fontSize: 12,
              fontWeight: 500,
              fontFamily: FONT,
              letterSpacing: '-0.01em',
              boxShadow: SHADOW_TOAST,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
            }}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={textKey}
                initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
                style={{ display: 'block' }}
              >
                {message}
              </motion.span>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  return [show, node];
}
