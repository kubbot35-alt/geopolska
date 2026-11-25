import React, {useState} from 'react';
import {AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Clock, Loader2} from 'lucide-react';
import type {
  CatalogReplaceProgress,
  VoivodeshipProgressState,
} from '../../domain/polandGeneratorTypes';

export interface PolandGeneratorProgressGridProps {
  readonly progressList: readonly VoivodeshipProgressState[];
  readonly isGenerating: boolean;
  readonly statusMessage: string;
  readonly uploadProgress: CatalogReplaceProgress | null;
  readonly logs: readonly string[];
}

function formatUploadPhase(progress: CatalogReplaceProgress): string {
  switch (progress.phase) {
    case 'reading':
      return 'Odczyt obecnych dokumentów Polski z Firestore…';
    case 'writing':
      return `Zapisywanie partii dokumentów (${progress.processed.toLocaleString('pl-PL')} / ${progress.total.toLocaleString('pl-PL')})…`;
    case 'deleting':
      return `Usuwanie nieaktualnych lokacji online (${progress.processed.toLocaleString('pl-PL')} / ${progress.total.toLocaleString('pl-PL')})…`;
    case 'meta':
      return 'Aktualizacja manifestu /catalogMeta/poland oraz cache IndexedDB…';
  }
}

export const PolandGeneratorProgressGrid: React.FC<PolandGeneratorProgressGridProps> = ({
  progressList,
  isGenerating,
  statusMessage,
  uploadProgress,
  logs,
}) => {
  const [logsExpanded, setLogsExpanded] = useState(false);

  const completedVoivs = progressList.filter(
    (item) => item.status === 'done' || item.status === 'error',
  ).length;
  const totalVoivs = progressList.length;
  const genPercent = totalVoivs > 0 ? Math.round((completedVoivs / totalVoivs) * 100) : 0;

  const uploadPercent =
    uploadProgress && uploadProgress.total > 0
      ? Math.round((uploadProgress.processed / uploadProgress.total) * 100)
      : 0;

  return (
    <section className="space-y-3 rounded-xl border border-white/10 bg-[#0C131D] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-200">{statusMessage}</p>
        <span className="font-mono text-xs text-slate-400 tabular-nums">
          {completedVoivs}/{totalVoivs} województw ({genPercent}%)
        </span>
      </div>

      {(isGenerating || completedVoivs > 0) && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{width: `${genPercent}%`}}
          />
        </div>
      )}

      {uploadProgress && (
        <div className="space-y-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <div className="flex items-center justify-between text-xs text-amber-100 tabular-nums">
            <span>{formatUploadPhase(uploadProgress)}</span>
            <span className="font-mono font-semibold">{uploadPercent}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-amber-400 transition-all duration-300"
              style={{width: `${uploadPercent}%`}}
            />
          </div>
        </div>
      )}

      {progressList.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {progressList.map((entry) => (
            <div
              key={entry.voivodeship}
              className="flex items-center justify-between gap-2 rounded-lg border border-white/8 bg-[#101822] px-2.5 py-2 text-xs"
            >
              <div className="flex min-w-0 items-center gap-1.5">
                {entry.status === 'loading' && (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-emerald-400" />
                )}
                {entry.status === 'done' && (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                )}
                {entry.status === 'error' && (
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                )}
                {entry.status === 'idle' && (
                  <Clock className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                )}
                <span className="truncate text-slate-200">{entry.voivodeship}</span>
              </div>
              <span
                className={`font-mono text-[11px] tabular-nums shrink-0 ${
                  entry.status === 'error'
                    ? 'text-rose-300'
                    : entry.status === 'done'
                      ? 'text-emerald-300'
                      : 'text-slate-400'
                }`}
              >
                {entry.status === 'error' ? 'Błąd' : entry.collected}
              </span>
            </div>
          ))}
        </div>
      )}

      {logs.length > 0 && (
        <div className="border-t border-white/10 pt-2.5">
          <button
            type="button"
            onClick={() => setLogsExpanded((prev) => !prev)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-200"
          >
            {logsExpanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            Dziennik operacji ({logs.length})
          </button>
          {logsExpanded && (
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-white/10 bg-[#080E16] p-3 font-mono text-[11px] text-slate-300 tabular-nums">
              {logs.map((line, index) => (
                <div key={`${index}-${line.slice(0, 12)}`}>{line}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
