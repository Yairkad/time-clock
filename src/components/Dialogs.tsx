import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmText?: string;
  danger?: boolean;
  /** If set, the user must tick this checkbox before confirming. */
  checkboxLabel?: string;
}

interface DialogApi {
  confirm(o: ConfirmOptions): Promise<boolean>;
  toast(message: string, kind?: 'info' | 'error'): void;
}

const Ctx = createContext<DialogApi | null>(null);
export const useDialogs = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('DialogProvider missing');
  return c;
};

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="סגור">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);
  const [checked, setChecked] = useState(false);
  const resolver = useRef<(v: boolean) => void>(undefined);
  const [toasts, setToasts] = useState<{ id: number; message: string; kind: string }[]>([]);

  const confirm = useCallback((o: ConfirmOptions) => {
    setChecked(false);
    setConfirmState(o);
    return new Promise<boolean>((res) => (resolver.current = res));
  }, []);

  const close = (v: boolean) => {
    resolver.current?.(v);
    setConfirmState(null);
  };

  const toast = useCallback((message: string, kind: 'info' | 'error' = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  return (
    <Ctx.Provider value={{ confirm, toast }}>
      {children}
      {confirmState && (
        <Modal title={confirmState.title} onClose={() => close(false)}>
          {confirmState.message && <div className="modal-body">{confirmState.message}</div>}
          {confirmState.checkboxLabel && (
            <label className="check">
              <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
              {confirmState.checkboxLabel}
            </label>
          )}
          <div className="actions">
            <button
              className={confirmState.danger ? 'btn danger' : 'btn primary'}
              disabled={!!confirmState.checkboxLabel && !checked}
              onClick={() => close(true)}
            >
              {confirmState.confirmText ?? 'אישור'}
            </button>
            <button className="btn" onClick={() => close(false)}>ביטול</button>
          </div>
        </Modal>
      )}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>{t.message}</div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
