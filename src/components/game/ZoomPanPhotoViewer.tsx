import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  AlertTriangle,
  Loader2,
  RefreshCw,
  RotateCcw,
  Shuffle,
  WifiOff,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

export interface ZoomPanPhotoViewerProps {
  readonly locationId: string;
  readonly imageUrl: string;
  readonly reloadNonce: number;
  readonly isOnline: boolean;
  readonly fallbackNotice: string | null;
  readonly onAutoSkipLocation: () => void;
  readonly onManualSkipLocation: () => void;
  readonly onRetryImage: () => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.6;
const MAX_CONSECUTIVE_AUTO_SKIPS = 8;

type ViewerPhase = 'loading' | 'ready' | 'error';

/**
 * Full-viewport interactive photograph viewer with smooth scroll/button zoom,
 * pointer-drag panning, double-click zoom toggle, and automatic fallback skip
 * when a remote Wikipedia/Wikimedia photo is missing for a location.
 */
export const ZoomPanPhotoViewer: React.FC<ZoomPanPhotoViewerProps> = ({
  locationId,
  imageUrl,
  reloadNonce,
  isOnline,
  fallbackNotice,
  onAutoSkipLocation,
  onManualSkipLocation,
  onRetryImage,
}) => {
  const [phase, setPhase] = useState<ViewerPhase>('loading');
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<{readonly x: number; readonly y: number}>({x: 0, y: 0});
  const [isDragging, setIsDragging] = useState(false);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragOriginRef = useRef<{x: number; y: number; startX: number; startY: number} | null>(null);
  const consecutiveSkipsRef = useRef(0);

  // Reset zoom/pan and enter loading state whenever location or reloadNonce changes
  useEffect(() => {
    setPhase('loading');
    setZoom(1);
    setOffset({x: 0, y: 0});
    setIsDragging(false);
    dragOriginRef.current = null;
  }, [locationId, imageUrl, reloadNonce]);

  const clampOffset = useCallback(
    (nextX: number, nextY: number, scale: number): {readonly x: number; readonly y: number} => {
      if (scale <= 1.01) {
        return {x: 0, y: 0};
      }
      const el = stageRef.current;
      const width = el?.clientWidth ?? 1280;
      const height = el?.clientHeight ?? 720;
      const maxX = ((scale - 1) * width) / 2;
      const maxY = ((scale - 1) * height) / 2;
      return {
        x: Math.max(-maxX, Math.min(maxX, nextX)),
        y: Math.max(-maxY, Math.min(maxY, nextY)),
      };
    },
    [],
  );

  const applyZoom = useCallback(
    (nextScaleRaw: number) => {
      const nextScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(nextScaleRaw * 100) / 100));
      setZoom(nextScale);
      setOffset((prev) => clampOffset(prev.x, prev.y, nextScale));
    },
    [clampOffset],
  );

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (phase !== 'ready') {
        return;
      }
      const delta = event.deltaY < 0 ? 0.35 : -0.35;
      applyZoom(zoom + delta);
    },
    [applyZoom, phase, zoom],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (phase !== 'ready' || zoom <= 1.01 || event.button !== 0) {
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsDragging(true);
      dragOriginRef.current = {
        x: event.clientX,
        y: event.clientY,
        startX: offset.x,
        startY: offset.y,
      };
    },
    [offset.x, offset.y, phase, zoom],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const origin = dragOriginRef.current;
      if (!origin || !isDragging) {
        return;
      }
      const dx = event.clientX - origin.x;
      const dy = event.clientY - origin.y;
      setOffset(clampOffset(origin.startX + dx, origin.startY + dy, zoom));
    },
    [clampOffset, isDragging, zoom],
  );

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (dragOriginRef.current) {
      dragOriginRef.current = null;
      setIsDragging(false);
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore if pointer capture already released
      }
    }
  }, []);

  const handleDoubleClick = useCallback(() => {
    if (phase !== 'ready') {
      return;
    }
    if (zoom > 1.05) {
      applyZoom(1);
    } else {
      applyZoom(2.2);
    }
  }, [applyZoom, phase, zoom]);

  const handleImageLoad = useCallback(() => {
    consecutiveSkipsRef.current = 0;
    setPhase('ready');
  }, []);

  const handleImageError = useCallback(() => {
    if (isOnline && consecutiveSkipsRef.current < MAX_CONSECUTIVE_AUTO_SKIPS) {
      consecutiveSkipsRef.current += 1;
      onAutoSkipLocation();
      return;
    }
    setPhase('error');
  }, [isOnline, onAutoSkipLocation]);

  const cacheBustedUrl =
    reloadNonce > 0
      ? `${imageUrl}${imageUrl.includes('?') ? '&' : '?'}r=${reloadNonce}`
      : imageUrl;

  const isLocalBundledPhoto = imageUrl.startsWith('/locations/');

  return (
    <div
      ref={stageRef}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      className={`relative h-full w-full select-none overflow-hidden bg-[#060A0F] ${
        zoom > 1.01 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'
      }`}
    >
      {/* Full-Viewport Location Photograph */}
      <div className="flex h-full w-full items-center justify-center">
        <img
          key={`${locationId}_${reloadNonce}`}
          src={cacheBustedUrl}
          alt="Rozpoznaj to miejsce w Polsce"
          draggable={false}
          onLoad={handleImageLoad}
          onError={handleImageError}
          className={`h-full w-full object-cover transition-opacity duration-300 ${
            phase === 'ready' ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})`,
            transition: isDragging ? 'none' : 'transform 160ms ease-out, opacity 300ms ease-out',
          }}
        />
      </div>

      {/* Subtle top vignette for HUD legibility */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#090E14]/75 to-transparent"
        aria-hidden="true"
      />

      {/* Fallback Notice Toast */}
      {fallbackNotice && phase === 'ready' && (
        <div className="pointer-events-none fixed left-1/2 top-20 z-20 -translate-x-1/2 rounded-lg border border-amber-400/35 bg-[#19150C]/92 px-3.5 py-1.5 text-xs font-medium text-amber-200 shadow-lg">
          {fallbackNotice}
        </div>
      )}

      {/* Loading State */}
      {phase === 'loading' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#090E14]/92 px-6 text-center">
          <Loader2 className="h-9 w-9 animate-spin text-emerald-400" />
          <p className="font-display text-sm font-semibold text-slate-100">
            Wczytywanie fotografii lokalizacji...
          </p>
          <p className="text-xs text-slate-400">
            Darmowe archiwum zdjęć Polski · 1 100 miejsc
          </p>
        </div>
      )}

      {/* Error / Offline State */}
      {phase === 'error' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-[#090E14]/95 px-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-amber-500/35 bg-amber-500/10 text-amber-300">
            {!isOnline && !isLocalBundledPhoto ? (
              <WifiOff className="h-6 w-6" />
            ) : (
              <AlertTriangle className="h-6 w-6" />
            )}
          </div>
          <div className="max-w-md space-y-1.5">
            <h2 className="font-display text-lg font-bold text-white">
              {!isOnline && !isLocalBundledPhoto
                ? 'Brak połączenia z internetem'
                : 'Nie udało się załadować zdjęcia tej lokalizacji'}
            </h2>
            <p className="text-sm text-slate-400">
              {!isOnline && !isLocalBundledPhoto
                ? 'W trybie offline wybierz pulę „Klasyczna 20 (offline)” z menu, aby grać bez sieci.'
                : 'Możesz spróbować ponownie lub wylosować inne miejsce bez utraty punktów.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                consecutiveSkipsRef.current = 0;
                onRetryImage();
              }}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/15 bg-[#101822] px-4 py-2 text-xs font-semibold text-slate-100 hover:border-emerald-500/40 hover:text-white"
            >
              <RefreshCw className="h-4 w-4 text-emerald-400" />
              Spróbuj ponownie
            </button>
            <button
              type="button"
              onClick={() => {
                consecutiveSkipsRef.current = 0;
                onManualSkipLocation();
              }}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-[#05120D] hover:bg-emerald-400"
            >
              <Shuffle className="h-4 w-4" />
              Wylosuj inne miejsce
            </button>
          </div>
        </div>
      )}

      {/* Bottom-Left Photo Controls (Zoom / Reset / Skip) */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        className="fixed bottom-5 left-4 z-20 flex items-center gap-1.5 rounded-xl border border-white/15 bg-[#0D151F]/92 p-1.5 shadow-xl sm:left-5"
      >
        <button
          type="button"
          onClick={() => applyZoom(zoom - ZOOM_STEP)}
          disabled={zoom <= MIN_ZOOM || phase !== 'ready'}
          aria-label="Oddal zdjęcie"
          title="Oddal zdjęcie"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-200 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-35"
        >
          <ZoomOut className="h-4 w-4" />
        </button>

        <span className="min-w-[42px] text-center font-mono text-xs font-semibold text-slate-200 tabular-nums">
          {zoom.toFixed(1)}×
        </span>

        <button
          type="button"
          onClick={() => applyZoom(zoom + ZOOM_STEP)}
          disabled={zoom >= MAX_ZOOM || phase !== 'ready'}
          aria-label="Przybliż zdjęcie"
          title="Przybliż zdjęcie (lub użyj kółka myszy)"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-200 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-35"
        >
          <ZoomIn className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => applyZoom(1)}
          disabled={zoom <= MIN_ZOOM}
          aria-label="Resetuj widok"
          title="Resetuj powiększenie"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-35"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>

        <span className="mx-0.5 h-5 w-px bg-white/15" aria-hidden="true" />

        <button
          type="button"
          onClick={() => {
            consecutiveSkipsRef.current = 0;
            onManualSkipLocation();
          }}
          title="Pomiń to zdjęcie i wylosuj inne miejsce"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-white/10 hover:text-white whitespace-nowrap"
        >
          <Shuffle className="h-3.5 w-3.5 text-emerald-400" />
          <span className="hidden sm:inline">Inne miejsce</span>
        </button>
      </div>
    </div>
  );
};
