import React, { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastInput {
  id?: string;
  type: ToastType;
  message: React.ReactNode;
  durationMs?: number;
}

let emitToast: ((t: ToastInput) => void) | null = null;

/** Imperative toast API (works outside React components). */
export const toast = {
  success: (message: React.ReactNode, opts?: { durationMs?: number }) =>
    emitToast?.({ type: 'success', message, durationMs: opts?.durationMs ?? 8000 }),
  error: (message: React.ReactNode, opts?: { durationMs?: number }) =>
    emitToast?.({ type: 'error', message, durationMs: opts?.durationMs ?? 8000 }),
  info: (message: React.ReactNode, opts?: { durationMs?: number }) =>
    emitToast?.({ type: 'info', message, durationMs: opts?.durationMs ?? 8000 }),
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Array<{ id: string } & ToastInput>>([]);

  const add = useCallback((t: ToastInput) => {
    const id = t.id ?? (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
    setItems((prev) => [...prev, { ...t, id }]);
    const dur = t.durationMs ?? 8000;
    if (dur > 0) {
      setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== id));
      }, dur);
    }
  }, []);

  useEffect(() => {
    emitToast = add;
    return () => {
      emitToast = null;
    };
  }, [add]);

  const dismiss = (id: string) => setItems((prev) => prev.filter((x) => x.id !== id));

  return (
    <>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-md w-[min(100vw-2rem,28rem)] pointer-events-none">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={clsx(
              'pointer-events-auto rounded-lg border bg-white shadow-lg px-4 py-3 text-sm flex gap-3 items-start',
              'border-l-[3px]',
              t.type === 'success' && 'border-l-green-500 border-ink-200 text-ink-800',
              t.type === 'error' && 'border-l-red-500 border-red-200 text-red-900',
              t.type === 'info' && 'border-[#f25a14] border-ink-200 text-ink-800',
            )}
          >
            <div className="flex-1 min-w-0 leading-snug">{t.message}</div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="p-0.5 rounded hover:bg-ink-100 text-ink-400 hover:text-ink-700 flex-shrink-0"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
