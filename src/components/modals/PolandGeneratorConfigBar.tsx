import React, {useRef} from 'react';
import {
  AlertTriangle,
  CloudUpload,
  Download,
  Loader2,
  Play,
  Square,
  Upload,
} from 'lucide-react';
import {
  GENERATOR_LIMIT_PRESETS,
  MAX_PER_VOIVODESHIP_LIMIT,
  MIN_PER_VOIVODESHIP_LIMIT,
  POLISH_VOIVODESHIP_CONFIGS,
  type PhotoFreshnessMode,
} from '../../domain/polandGeneratorTypes';

const FRESHNESS_OPTIONS: ReadonlyArray<{readonly id: PhotoFreshnessMode; readonly label: string}> = [
  {id: 'only_2025_2026', label: 'Tylko 2025–2026'},
  {id: 'prefer_2025_2026', label: 'Preferuj 2025–2026'},
  {id: 'any', label: 'Dowolny rok'},
];

export interface PolandGeneratorConfigBarProps {
  readonly perVoivodeshipLimit: number;
  readonly photoFreshness: PhotoFreshnessMode;
  readonly selectedVoivodeships: readonly string[];
  readonly generatedCount: number;
  readonly existingOnlineCount: number;
  readonly isGenerating: boolean;
  readonly isUploading: boolean;
  readonly isAdmin: boolean;
  readonly isOnline: boolean;
  readonly confirmReplaceOpen: boolean;
  readonly onLimitChange: (nextLimit: number) => void;
  readonly onPhotoFreshnessChange: (nextMode: PhotoFreshnessMode) => void;
  readonly onToggleVoivodeship: (name: string) => void;
  readonly onSelectAllVoivodeships: () => void;
  readonly onClearVoivodeships: () => void;
  readonly onStartGenerate: () => void;
  readonly onStopGenerate: () => void;
  readonly onDownloadJson: () => void;
  readonly onImportJsonFile: (file: File) => void;
  readonly onRequestReplace: () => void;
  readonly onCancelReplace: () => void;
  readonly onConfirmReplace: () => void;
}

export const PolandGeneratorConfigBar: React.FC<PolandGeneratorConfigBarProps> = ({
  perVoivodeshipLimit,
  photoFreshness,
  selectedVoivodeships,
  generatedCount,
  existingOnlineCount,
  isGenerating,
  isUploading,
  isAdmin,
  isOnline,
  confirmReplaceOpen,
  onLimitChange,
  onPhotoFreshnessChange,
  onToggleVoivodeship,
  onSelectAllVoivodeships,
  onClearVoivodeships,
  onStartGenerate,
  onStopGenerate,
  onDownloadJson,
  onImportJsonFile,
  onRequestReplace,
  onCancelReplace,
  onConfirmReplace,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const busy = isGenerating || isUploading;
  const targetTotal = selectedVoivodeships.length * perVoivodeshipLimit;

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onImportJsonFile(file);
    }
    event.target.value = '';
  };

  return (
    <section className="space-y-4 rounded-xl border border-white/10 bg-[#0C131D] p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="font-display text-sm font-bold text-white">
            Generator katalogu Polska (Wikidata + Wikimedia + Wikipedia)
          </h3>
          <p className="text-xs leading-relaxed text-slate-400">
            Wyszukuje geolokalizowane zdjęcia JPEG z lat 2025–2026 (&ge;800&times;450), usuwa
            spoilery z podpowiedzi, waliduje granice WGS84 i zachowuje 20 klasycznych lokacji offline.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isGenerating ? (
            <button
              type="button"
              onClick={onStartGenerate}
              disabled={busy || !isOnline || selectedVoivodeships.length === 0}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-bold text-[#05120D] transition-colors hover:bg-emerald-400 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Play className="h-3.5 w-3.5" />
              Generuj z Wikidaty (~{targetTotal.toLocaleString('pl-PL')})
            </button>
          ) : (
            <button
              type="button"
              onClick={onStopGenerate}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-rose-500/50 bg-rose-500/15 px-3.5 py-2 text-xs font-semibold text-rose-200 transition-colors hover:bg-rose-500/25 whitespace-nowrap shrink-0"
            >
              <Square className="h-3.5 w-3.5" />
              Zatrzymaj
            </button>
          )}

          <button
            type="button"
            onClick={onDownloadJson}
            disabled={generatedCount === 0 || isGenerating}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-white/15 bg-[#101822] px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:border-emerald-500/40 hover:text-white disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            Pobierz JSON ({generatedCount.toLocaleString('pl-PL')})
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-white/15 bg-[#101822] px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:border-emerald-500/40 hover:text-white disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Upload className="h-3.5 w-3.5" />
            Wczytaj JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFileChange}
            className="hidden"
          />

          {isAdmin && (
            <button
              type="button"
              onClick={onRequestReplace}
              disabled={busy || !isOnline || generatedCount === 0}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-amber-500/45 bg-amber-500/15 px-3.5 py-2 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-500/25 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {isUploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CloudUpload className="h-3.5 w-3.5" />
              )}
              {isUploading ? 'Zapisywanie…' : 'Zastąp bazę online w Firebase'}
            </button>
          )}
        </div>
      </div>

      {/* Limit controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-300">Limit na województwo:</span>
          <div className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-[#101822] p-1">
            {GENERATOR_LIMIT_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                disabled={busy}
                onClick={() => onLimitChange(preset)}
                className={`min-h-[30px] rounded-md px-2.5 py-1 font-mono text-xs font-semibold tabular-nums transition-colors whitespace-nowrap shrink-0 ${
                  perVoivodeshipLimit === preset
                    ? 'bg-emerald-500 text-[#05120D]'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {preset} / woj.
              </button>
            ))}
          </div>
          <input
            type="number"
            min={MIN_PER_VOIVODESHIP_LIMIT}
            max={MAX_PER_VOIVODESHIP_LIMIT}
            disabled={busy}
            value={perVoivodeshipLimit}
            onChange={(e) => {
              const next = Number.parseInt(e.target.value, 10);
              if (Number.isFinite(next)) {
                onLimitChange(
                  Math.max(MIN_PER_VOIVODESHIP_LIMIT, Math.min(MAX_PER_VOIVODESHIP_LIMIT, next)),
                );
              }
            }}
            aria-label="Własny limit na województwo"
            className="min-h-[36px] w-20 rounded-lg border border-white/10 bg-[#101822] px-2.5 font-mono text-xs text-white tabular-nums focus:border-emerald-500 focus:outline-none disabled:opacity-50"
          />

          <span className="ml-1 text-xs font-medium text-slate-300">Rocznik zdjęć:</span>
          <div
            role="group"
            aria-label="Filtr rocznika zdjęć"
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-[#101822] p-1"
          >
            {FRESHNESS_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={busy}
                onClick={() => onPhotoFreshnessChange(opt.id)}
                className={`min-h-[30px] rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  photoFreshness === opt.id
                    ? 'bg-emerald-500 text-[#05120D]'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="font-mono tabular-nums">
            Wybrane województwa: {selectedVoivodeships.length}/16
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={onSelectAllVoivodeships}
            className="text-emerald-400 hover:text-emerald-300 disabled:opacity-50 whitespace-nowrap"
          >
            Zaznacz wszystkie
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClearVoivodeships}
            className="text-slate-400 hover:text-white disabled:opacity-50 whitespace-nowrap"
          >
            Wyczyść
          </button>
        </div>
      </div>

      {/* Voivodeship selection buttons */}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {POLISH_VOIVODESHIP_CONFIGS.map((cfg) => {
          const active = selectedVoivodeships.includes(cfg.name);
          return (
            <button
              key={cfg.qid}
              type="button"
              disabled={busy}
              onClick={() => onToggleVoivodeship(cfg.name)}
              className={`min-h-[34px] truncate rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium transition-colors disabled:opacity-50 ${
                active
                  ? 'border-emerald-500/45 bg-emerald-500/12 text-emerald-100'
                  : 'border-white/10 bg-[#101822] text-slate-400 hover:text-slate-200'
              }`}
            >
              {cfg.name}
            </button>
          );
        })}
      </div>

      {/* Inline replacement confirmation gate */}
      {confirmReplaceOpen && isAdmin && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/45 bg-amber-500/10 p-3.5 text-xs">
          <div className="flex items-start gap-2.5 text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div className="space-y-0.5">
              <p className="font-semibold">
                Potwierdź zastąpienie katalogu online Polski w Firebase Firestore
              </p>
              <p className="font-mono text-[11px] text-amber-200/90 tabular-nums">
                20 klasycznych offline: zachowane · Nowe online: +{generatedCount.toLocaleString('pl-PL')}{' '}
                · Obecne online do zastąpienia: ~{existingOnlineCount.toLocaleString('pl-PL')} ·
                Manifest /catalogMeta/poland zostanie podbity.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onCancelReplace}
              className="min-h-[36px] rounded-lg border border-white/15 bg-[#101822] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:text-white whitespace-nowrap"
            >
              Anuluj
            </button>
            <button
              type="button"
              onClick={onConfirmReplace}
              className="min-h-[36px] rounded-lg bg-amber-500 px-3.5 py-1.5 text-xs font-bold text-[#140E04] hover:bg-amber-400 whitespace-nowrap"
            >
              Potwierdź i zapisz w chmurze
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
