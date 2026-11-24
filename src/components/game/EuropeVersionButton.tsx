import React, {useEffect, useRef, useState} from 'react';
import {Globe, Lock} from 'lucide-react';

const NOTICE_DURATION_MS = 4000;

export const EuropeVersionButton: React.FC = () => {
  const [noticeVisible, setNoticeVisible] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleLockedClick = (): void => {
    setNoticeVisible(true);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setNoticeVisible(false);
      timerRef.current = null;
    }, NOTICE_DURATION_MS);
  };

  return (
    <div className="mt-2.5">
      <button
        type="button"
        aria-disabled="true"
        onClick={handleLockedClick}
        className="flex min-h-[44px] w-full cursor-not-allowed items-center justify-between gap-3 rounded-lg border border-dashed border-white/15 bg-[#0C0E12]/45 px-4 py-2.5 text-left text-xs font-medium text-neutral-400 transition-colors duration-200 hover:border-white/25 hover:bg-[#0C0E12]/65 hover:text-neutral-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
      >
        <span className="inline-flex items-center gap-2">
          <Globe className="h-4 w-4 shrink-0 text-neutral-500" />
          <span className="font-display text-sm font-semibold text-neutral-300/80">
            Wersja Europa
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-neutral-500">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          Zablokowane
        </span>
      </button>

      {noticeVisible && (
        <div
          role="status"
          aria-live="polite"
          className="mt-2 flex items-center gap-2 rounded-lg border border-amber-500/35 bg-[#0C0E12]/85 px-3.5 py-2 text-xs text-amber-200"
        >
          <Lock className="h-3.5 w-3.5 shrink-0 text-amber-400" />
          <span>
            <strong className="font-semibold text-amber-100">Wkrótce!</strong> Wersja Europa
            jest jeszcze w przygotowaniu i zostanie odblokowana w przyszłej aktualizacji.
          </span>
        </div>
      )}
    </div>
  );
};
