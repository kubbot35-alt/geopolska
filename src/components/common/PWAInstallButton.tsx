import React, {useState} from 'react';
import {Download, X} from 'lucide-react';
import {usePWAInstall} from '../../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-white/20 bg-[#0C0E12]/65 px-3.5 py-2 text-xs font-semibold text-neutral-100 transition-colors duration-200 hover:border-white/40 hover:bg-[#0C0E12]/85 whitespace-nowrap shrink-0"
      >
        <Download className="h-3.5 w-3.5" />
        Zainstaluj aplikację
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-white/12 bg-[#0C0E12]/55 px-3.5 py-2 text-xs font-medium text-neutral-200 transition-colors duration-200 hover:border-white/30 hover:bg-[#0C0E12]/80 hover:text-white whitespace-nowrap shrink-0"
        >
          <Download className="h-3.5 w-3.5 text-neutral-300" />
          Zainstaluj (iOS)
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-[#101822] p-6 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-100">Instalacja na iOS</h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Zamknij"
                  className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                1. Stuknij ikonę <strong>Udostępnij</strong> w dolnym pasku Safari.
                <br />
                2. Wybierz opcję <strong>Do ekranu początkowego</strong>, aby uruchamiać GeoPolska jak natywną aplikację.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 min-h-[44px] w-full rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                Rozumiem
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
