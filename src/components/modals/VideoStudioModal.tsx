import React, {useEffect, useRef, useState} from 'react';
import {
  Download,
  Film,
  Image as ImageIcon,
  Loader2,
  Monitor,
  Smartphone,
  Sparkles,
  Upload,
  WifiOff,
  X,
} from 'lucide-react';
import {FEATURED_OFFLINE_LOCATIONS} from '../../domain/polandLocations';
import type {
  AiAnimateVideoResult,
  IAiExplorerGateway,
  PolandLocation,
  VideoAspectRatio,
} from '../../domain/types';

export interface VideoStudioModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly gateway: IAiExplorerGateway;
  readonly isOnline: boolean;
  readonly initialLocation?: PolandLocation | null;
}

type ImageSourceMode = 'game_photo' | 'upload';

interface UploadedPhotoState {
  readonly fileName: string;
  readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  readonly dataUrl: string;
  readonly base64: string;
}

const MOTION_PRESETS: readonly {readonly label: string; readonly prompt: string}[] = [
  {
    label: 'Powolny najazd drona',
    prompt: 'Powolny, płynny przelot drona nad architekturą w złotym świetle popołudnia, lekkie chmury na niebie',
  },
  {
    label: 'Złota godzina i wiatr',
    prompt: 'Ciepłe promienie zachodzącego słońca przesuwające się po fasadach, delikatny powiew wiatru w liściach',
  },
  {
    label: 'Kinowy parallax 3D',
    prompt: 'Subtelny ruch kamery w bok z efektem głębi parallax, naturalne refleksy światła i realistyczna atmosfera',
  },
];

const FEATURED_GAME_FRAMES = FEATURED_OFFLINE_LOCATIONS.slice(0, 8);
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

function normalizeFileMimeType(rawType: string): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (rawType === 'image/jpeg' || rawType === 'image/jpg') return 'image/jpeg';
  if (rawType === 'image/png') return 'image/png';
  if (rawType === 'image/webp') return 'image/webp';
  return null;
}

export const VideoStudioModal: React.FC<VideoStudioModalProps> = ({
  open,
  onClose,
  gateway,
  isOnline,
  initialLocation = null,
}) => {
  const [sourceMode, setSourceMode] = useState<ImageSourceMode>('game_photo');
  const [selectedLocation, setSelectedLocation] = useState<PolandLocation>(
    initialLocation ?? FEATURED_GAME_FRAMES[0],
  );
  const [uploadedPhoto, setUploadedPhoto] = useState<UploadedPhotoState | null>(null);
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>('16:9');
  const [prompt, setPrompt] = useState<string>(MOTION_PRESETS[0].prompt);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiAnimateVideoResult | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      setLoading(false);
      return;
    }
    if (initialLocation) {
      setSourceMode('game_photo');
      setSelectedLocation(initialLocation);
      setResult(null);
      setError(null);
    }
  }, [open, initialLocation]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  if (!open) {
    return null;
  }

  const handleFileSelected = (file: File | null) => {
    if (!file) {
      return;
    }
    const mimeType = normalizeFileMimeType(file.type);
    if (!mimeType) {
      setError('Obsługiwane formaty zdjęć to JPG, PNG oraz WebP.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('Plik jest zbyt duży. Maksymalny rozmiar zdjęcia to 8 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        setError('Nie udało się odczytać pliku obrazu.');
        return;
      }
      const dataUrl = reader.result;
      const commaIdx = dataUrl.indexOf(',');
      const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
      setUploadedPhoto({
        fileName: file.name,
        mimeType,
        dataUrl,
        base64,
      });
      setSourceMode('upload');
      setError(null);
      setResult(null);
    };
    reader.onerror = () => {
      setError('Nie udało się wczytać wybranego pliku.');
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline || loading) {
      return;
    }

    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length < 3) {
      setError('Wpisz krótki opis ruchu kamery lub atmosfery (min. 3 znaki).');
      return;
    }

    if (sourceMode === 'upload' && !uploadedPhoto) {
      setError('Wybierz plik zdjęcia z urządzenia lub przełącz na zakładkę „Kadr z gry”.');
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setResult(null);

    const response = await gateway.animateImageToVideo(
      sourceMode === 'upload' && uploadedPhoto
        ? {
            imageBase64: uploadedPhoto.base64,
            mimeType: uploadedPhoto.mimeType,
            prompt: trimmedPrompt,
            aspectRatio,
          }
        : {
            locationImageUrl: selectedLocation.imageUrl,
            locationName: selectedLocation.name,
            prompt: trimmedPrompt,
            aspectRatio,
          },
      controller.signal,
    );

    if (controller.signal.aborted) {
      return;
    }

    setLoading(false);
    if (response.ok) {
      setResult(response.value);
    } else {
      setError(response.error);
    }
  };

  const handleCancelGeneration = () => {
    abortRef.current?.abort();
    setLoading(false);
  };

  const previewImageSrc =
    sourceMode === 'upload' ? uploadedPhoto?.dataUrl ?? null : selectedLocation.imageUrl;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Studio Wideo AI — Animacja zdjęcia"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#101822] text-slate-100 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Film className="h-5 w-5 text-emerald-400" />
            <div>
              <h2 className="font-display text-lg font-bold text-white">Studio Wideo AI</h2>
              <p className="text-xs text-slate-400">
                Animacja własnego zdjęcia lub kadru z Polski · Gemini Omni (16:9 i 9:16)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij Studio Wideo"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="grid flex-1 gap-6 overflow-y-auto p-5 lg:grid-cols-12">
          {/* Left Form Column */}
          <form onSubmit={(e) => void handleGenerate(e)} className="space-y-4 lg:col-span-6">
            {!isOnline && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                <WifiOff className="h-4 w-4 shrink-0" />
                Studio Wideo wymaga aktywnego połączenia z internetem.
              </div>
            )}

            {/* Source Mode Switch */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setSourceMode('game_photo');
                  setError(null);
                }}
                className={`inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                  sourceMode === 'game_photo'
                    ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-100'
                    : 'border-white/10 bg-[#0B121A] text-slate-300 hover:border-white/25'
                }`}
              >
                <ImageIcon className="h-4 w-4" />
                Kadr z gry
              </button>
              <button
                type="button"
                onClick={() => {
                  setSourceMode('upload');
                  setError(null);
                }}
                className={`inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                  sourceMode === 'upload'
                    ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-100'
                    : 'border-white/10 bg-[#0B121A] text-slate-300 hover:border-white/25'
                }`}
              >
                <Upload className="h-4 w-4" />
                Własne zdjęcie
              </button>
            </div>

            {sourceMode === 'game_photo' ? (
              <div>
                <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
                  Wybierz kadr z Polski
                </p>
                <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {(initialLocation &&
                  !FEATURED_GAME_FRAMES.some((loc) => loc.id === initialLocation.id)
                    ? [initialLocation, ...FEATURED_GAME_FRAMES.slice(0, 7)]
                    : FEATURED_GAME_FRAMES
                  ).map((loc) => {
                    const active = selectedLocation.id === loc.id;
                    return (
                      <button
                        key={loc.id}
                        type="button"
                        onClick={() => {
                          setSelectedLocation(loc);
                          setResult(null);
                        }}
                        className={`truncate rounded-lg border px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                          active
                            ? 'border-emerald-400/65 bg-emerald-500/20 text-emerald-100'
                            : 'border-white/10 bg-[#0B121A] text-slate-300 hover:border-white/25 hover:text-white'
                        }`}
                      >
                        {loc.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => handleFileSelected(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleFileSelected(e.dataTransfer.files?.[0] ?? null);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-emerald-500/40 bg-[#0B121A] px-4 py-6 text-center transition-colors hover:border-emerald-400 hover:bg-[#0E1822]"
                >
                  <Upload className="h-7 w-7 text-emerald-400" />
                  <p className="mt-2 text-sm font-semibold text-white">
                    {uploadedPhoto ? uploadedPhoto.fileName : 'Przeciągnij zdjęcie lub kliknij'}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">JPG, PNG lub WebP · maks. 8 MB</p>
                </div>
              </div>
            )}

            {/* Aspect Ratio Selector: 16:9 & 9:16 */}
            <div>
              <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
                Proporcje wideo
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAspectRatio('16:9')}
                  className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                    aspectRatio === '16:9'
                      ? 'border-emerald-400/65 bg-emerald-500/20 text-emerald-100'
                      : 'border-white/10 bg-[#0B121A] text-slate-300 hover:border-white/25'
                  }`}
                >
                  <Monitor className="h-4 w-4" />
                  Poziome 16:9
                </button>
                <button
                  type="button"
                  onClick={() => setAspectRatio('9:16')}
                  className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                    aspectRatio === '9:16'
                      ? 'border-emerald-400/65 bg-emerald-500/20 text-emerald-100'
                      : 'border-white/10 bg-[#0B121A] text-slate-300 hover:border-white/25'
                  }`}
                >
                  <Smartphone className="h-4 w-4" />
                  Pionowe 9:16
                </button>
              </div>
            </div>

            {/* Motion Prompt + Presets */}
            <div>
              <label
                htmlFor="video-motion-prompt"
                className="text-xs font-semibold tracking-wider text-slate-400 uppercase"
              >
                Reżyseria ruchu kamery
              </label>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {MOTION_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setPrompt(preset.prompt)}
                    className="rounded-lg border border-white/10 bg-[#0B121A] px-2.5 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:border-emerald-400/50 hover:text-white"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <textarea
                id="video-motion-prompt"
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                maxLength={500}
                placeholder="Opisz ruch kamery, oświetlenie i atmosferę animacji..."
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#0B121A] px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-rose-500/35 bg-rose-950/35 p-3 text-xs leading-relaxed text-rose-200">
                {error}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={!isOnline || loading || (sourceMode === 'upload' && !uploadedPhoto)}
                className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 font-display text-sm font-bold text-[#05120D] shadow-lg transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generowanie wideo ({aspectRatio})...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Animuj kadr w wideo
                  </>
                )}
              </button>

              {loading && (
                <button
                  type="button"
                  onClick={handleCancelGeneration}
                  className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-white/15 bg-[#0B121A] px-4 text-xs font-semibold text-slate-300 hover:border-white/30 hover:text-white"
                >
                  Anuluj
                </button>
              )}
            </div>
          </form>

          {/* Right Preview / Generated Video Column */}
          <div className="flex flex-col gap-3 lg:col-span-6">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold tracking-wider uppercase">
                {result ? `Wygenerowane wideo (${result.aspectRatio})` : 'Podgląd kadru źródłowego'}
              </span>
              {result && <span className="font-mono text-[11px] text-emerald-400">{result.model}</span>}
            </div>

            <div className="flex min-h-[300px] flex-1 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[#080D13] p-3">
              {loading ? (
                <div className="flex flex-col items-center gap-3 px-6 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
                  <p className="text-sm font-semibold text-white">
                    Tworzenie kinowej animacji wideo...
                  </p>
                  <p className="max-w-xs text-xs text-slate-400">
                    Generowanie wideo w proporcjach {aspectRatio} może potrwać kilkadziesiąt sekund.
                  </p>
                </div>
              ) : result ? (
                <video
                  key={result.videoDataUrl.slice(0, 64)}
                  src={result.videoDataUrl}
                  controls
                  autoPlay
                  loop
                  playsInline
                  className={`max-h-[400px] rounded-xl object-contain shadow-2xl ${
                    result.aspectRatio === '9:16' ? 'w-auto' : 'w-full'
                  }`}
                />
              ) : previewImageSrc ? (
                <div className="relative flex h-full w-full flex-col items-center justify-center">
                  <img
                    src={previewImageSrc}
                    alt={
                      sourceMode === 'upload'
                        ? uploadedPhoto?.fileName ?? 'Podgląd zdjęcia'
                        : selectedLocation.name
                    }
                    className="max-h-[360px] w-full rounded-xl object-contain"
                  />
                  {sourceMode === 'game_photo' && (
                    <p className="mt-2.5 text-xs text-slate-400">
                      {selectedLocation.name} · woj. {selectedLocation.voivodeship}
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-center text-xs text-slate-500">
                  Wybierz kadr lub prześlij zdjęcie, aby zobaczyć podgląd.
                </div>
              )}
            </div>

            {result && (
              <a
                href={result.videoDataUrl}
                download={`geopolska-animacja-${result.aspectRatio.replace(':', 'x')}.mp4`}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-2.5 text-xs font-bold text-emerald-200 transition-colors hover:bg-emerald-500/25"
              >
                <Download className="h-4 w-4" />
                Pobierz wideo (.mp4)
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
