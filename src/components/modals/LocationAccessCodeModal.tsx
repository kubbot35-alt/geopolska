import React, {useEffect, useRef, useState} from 'react';
import {KeyRound, Lock, X} from 'lucide-react';
import type {IAccessCodeVerifier} from '../../domain/locationAccessGate';

export interface LocationAccessCodeModalProps {
  readonly open: boolean;
  readonly verifier: IAccessCodeVerifier;
  readonly onClose: () => void;
  readonly onUnlocked: () => void;
}

export const LocationAccessCodeModal: React.FC<LocationAccessCodeModalProps> = ({
  open,
  verifier,
  onClose,
  onUnlocked,
}) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setCode('');
    setError(null);
    const frameId = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [open]);

  if (!open) {
    return null;
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (verifier.verify(code)) {
      setError(null);
      onUnlocked();
      return;
    }
    setError('Nieprawidłowy kod dostępu. Spróbuj ponownie.');
    inputRef.current?.focus();
    inputRef.current?.select();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-access-code-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-[#101822] text-slate-100 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.16em] text-amber-300 uppercase">
              <Lock className="h-3.5 w-3.5 shrink-0" />
              <span>Dostęp zabezpieczony</span>
            </p>
            <h2
              id="location-access-code-title"
              className="mt-1 font-display text-lg font-bold text-white"
            >
              Baza Lokacji
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij okno"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          <div>
            <label
              htmlFor="location-db-code-input"
              className="text-xs font-semibold tracking-wide text-slate-200 uppercase"
            >
              Podaj kod dostępu
            </label>
            <input
              ref={inputRef}
              id="location-db-code-input"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={8}
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (error) {
                  setError(null);
                }
              }}
              placeholder="••••"
              className="mt-2 w-full min-h-[44px] rounded-xl border border-white/15 bg-[#090E14] px-3.5 py-2.5 text-center font-mono text-lg tracking-[0.35em] text-white placeholder:text-slate-600 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/25"
            />
            {error && (
              <p
                role="alert"
                className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200"
              >
                {error}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-white/10 bg-transparent px-3 py-2 text-xs font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
            >
              Anuluj
            </button>
            <button
              type="submit"
              disabled={code.trim().length === 0}
              className="inline-flex min-h-[44px] flex-[1.5] items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 font-display text-sm font-bold text-[#0C0E12] transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <KeyRound className="h-4 w-4" />
              Odblokuj
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
