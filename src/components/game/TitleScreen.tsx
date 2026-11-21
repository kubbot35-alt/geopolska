import React, {useMemo, useState} from 'react';
import {
  Calendar,
  Camera,
  CheckCircle2,
  Clock,
  Database,
  Eye,
  EyeOff,
  LogIn,
  LogOut,
  Play,
  Trophy,
  Volume2,
  VolumeX,
  WifiOff,
} from 'lucide-react';
import {formatPolishDateKey} from '../../domain/dailyChallenge';
import {ROUND_COUNT_OPTIONS} from '../../domain/gameMachine';
import {calculateMaxGamePoints} from '../../domain/geoScoring';
import {buildLocationPoolOptions} from '../../domain/polandLocations';
import type {
  LocalDailyCompletion,
  LocationPoolFilter,
  PlayerIdentity,
  PolandLocation,
  RoundCountOption,
  ThreeCameraPreset,
} from '../../domain/types';
import {PWAInstallButton} from '../common/PWAInstallButton';
import {PolandReliefScene} from '../three/PolandReliefScene';

export interface TitleScreenProps {
  readonly timedMode: boolean;
  readonly onSetTimedMode: (timed: boolean) => void;
  readonly poolFilter: LocationPoolFilter;
  readonly onSetPoolFilter: (pool: LocationPoolFilter) => void;
  readonly selectedRoundCount: RoundCountOption;
  readonly onSetRoundCount: (count: RoundCountOption) => void;
  readonly dailyDateKey: string;
  readonly dailyCompletion: LocalDailyCompletion | null;
  readonly onStartGame: () => void;
  readonly onStartDailyChallenge: () => void;
  readonly onOpenLeaderboard: (dailyFirst?: boolean) => void;
  readonly onOpenLocationDatabase: () => void;
  readonly locations: readonly PolandLocation[];
  readonly player: PlayerIdentity | null;
  readonly authLoading: boolean;
  readonly onSignIn: () => void;
  readonly onSignOut: () => void;
  readonly isMuted: boolean;
  readonly onToggleMute: () => void;
  readonly isOnline: boolean;
}

const CAMERA_PRESETS: readonly {readonly id: ThreeCameraPreset; readonly label: string}[] = [
  {id: 'overview', label: 'Cała Polska'},
  {id: 'warszawa', label: 'Warszawa'},
  {id: 'gdansk', label: 'Gdańsk i Hel'},
  {id: 'tatry', label: 'Kraków i Tatry'},
];

export const TitleScreen: React.FC<TitleScreenProps> = ({
  timedMode,
  onSetTimedMode,
  poolFilter,
  onSetPoolFilter,
  selectedRoundCount,
  onSetRoundCount,
  dailyDateKey,
  dailyCompletion,
  onStartGame,
  onStartDailyChallenge,
  onOpenLeaderboard,
  onOpenLocationDatabase,
  locations,
  player,
  authLoading,
  onSignIn,
  onSignOut,
  isMuted,
  onToggleMute,
  isOnline,
}) => {
  const [cameraPreset, setCameraPreset] = useState<ThreeCameraPreset>('overview');
  const [cinematicView, setCinematicView] = useState(false);

  const poolOptions = useMemo(() => buildLocationPoolOptions(locations), [locations]);
  const maxGamePoints = calculateMaxGamePoints(selectedRoundCount);
  const dailyDateLabel = formatPolishDateKey(dailyDateKey);

  return (
    <div className="relative flex h-full w-full flex-col justify-between overflow-hidden bg-[#090E14] text-slate-100">
      {/* Live 3D PBR Topographic Relief Map of Poland with Procedural Architectural Landmarks */}
      <div className="absolute inset-0 z-0">
        <PolandReliefScene cameraPreset={cameraPreset} />
      </div>

      {/* Measured contrast scrim — solid/gradient alpha, zero backdrop-blur over WebGL */}
      <div
        className={`pointer-events-none absolute inset-0 z-10 transition-opacity duration-500 ${
          cinematicView
            ? 'bg-gradient-to-b from-[#090E14]/45 via-transparent to-[#090E14]/65'
            : 'bg-gradient-to-b from-[#090E14]/75 via-[#090E14]/25 to-[#090E14]/92'
        }`}
        aria-hidden="true"
      />

      {/* Top Navigation & Account Strip */}
      <header className="relative z-20 flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8 sm:py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-500/35 bg-[#0D151F]/94 shadow-lg">
            <svg viewBox="0 0 32 32" className="h-6 w-6" fill="none" aria-hidden="true">
              <circle cx="16" cy="16" r="13" stroke="#34D399" strokeWidth="1.5" strokeOpacity="0.6" />
              <path
                d="M16 5C11.58 5 8 8.58 8 13C8 18.75 16 27 16 27C16 27 24 18.75 24 13C24 8.58 20.42 5 16 5Z"
                fill="#10B981"
                fillOpacity="0.22"
                stroke="#34D399"
                strokeWidth="1.8"
              />
              <circle cx="16" cy="13" r="3" fill="#ECFDF5" />
            </svg>
          </div>
          <div className="leading-tight">
            <span className="font-display text-lg font-bold tracking-tight text-white">
              GeoPolska
            </span>
            <p className="text-[11px] font-medium tracking-wider text-slate-400 uppercase">
              Atlas 3D · Polska
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isOnline && (
            <span className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-amber-500/35 bg-[#19150C]/94 px-3 text-xs font-medium text-amber-200 whitespace-nowrap shrink-0">
              <WifiOff className="h-3.5 w-3.5" />
              Tryb offline
            </span>
          )}

          <PWAInstallButton />

          <button
            type="button"
            onClick={() => onOpenLeaderboard(false)}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-white/10 bg-[#0D151F]/94 px-3.5 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-emerald-500/40 hover:text-white whitespace-nowrap shrink-0"
          >
            <Trophy className="h-3.5 w-3.5 text-emerald-400" />
            Rankingi
          </button>

          <button
            type="button"
            onClick={onOpenLocationDatabase}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-white/10 bg-[#0D151F]/94 px-3.5 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-emerald-500/40 hover:text-white whitespace-nowrap shrink-0"
          >
            <Database className="h-3.5 w-3.5 text-emerald-400" />
            Baza Lokacji
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            aria-label={isMuted ? 'Włącz dźwięk' : 'Wycisz dźwięk'}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-[#0D151F]/94 text-slate-300 transition-colors hover:border-white/20 hover:text-white"
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4 text-emerald-400" />}
          </button>

          {player ? (
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#0D151F]/94 py-1 pl-2 pr-1.5">
              {player.photoUrl ? (
                <img
                  src={player.photoUrl}
                  alt={player.displayName}
                  referrerPolicy="no-referrer"
                  className="h-7 w-7 rounded-full border border-emerald-500/40 object-cover"
                />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                  {player.displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="max-w-[110px] truncate text-xs font-medium text-slate-200">
                {player.displayName}
              </span>
              <button
                type="button"
                onClick={onSignOut}
                aria-label="Wyloguj się"
                title="Wyloguj się"
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              disabled={authLoading}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-emerald-500/35 bg-[#0E1E1A]/94 px-3.5 py-2 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-950/90 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <LogIn className="h-3.5 w-3.5" />
              {authLoading ? 'Logowanie...' : 'Zaloguj Google'}
            </button>
          )}
        </div>
      </header>

      {/* Center Hero Lockup over Live 3D Relief (hidden in Cinematic 3D View) */}
      {!cinematicView && (
        <main className="relative z-20 mx-auto flex w-full max-w-4xl flex-col items-center px-5 text-center">
          <p className="text-xs font-semibold tracking-[0.22em] text-emerald-400 uppercase tabular-nums">
            {selectedRoundCount} {selectedRoundCount === 3 ? 'rundy' : 'rund'} ·{' '}
            {locations.length.toLocaleString('pl-PL')} lokalizacji · maks.{' '}
            {maxGamePoints.toLocaleString('pl-PL')} pkt
          </p>

          <h1 className="mt-2.5 font-display text-5xl font-bold tracking-tight text-white sm:text-7xl">
            Geo<span className="text-emerald-400">Polska</span>
          </h1>

          <p className="mt-2.5 max-w-lg text-sm leading-relaxed text-slate-300 sm:text-base">
            Rozpoznaj {locations.length.toLocaleString('pl-PL')} miejsc w Polsce na zdjęciach,
            wskaż lokalizację na darmowej mapie i rywalizuj w codziennym Wyzwaniu Dnia.
          </p>

          {/* Timer Mode & Round Count Controls */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <div
              role="group"
              aria-label="Tryb czasu rozgrywki"
              className="inline-flex items-center rounded-xl border border-white/10 bg-[#0D151F]/94 p-1 shadow-xl"
            >
              <button
                type="button"
                onClick={() => onSetTimedMode(false)}
                className={`min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  !timedMode
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Swobodny
              </button>
              <button
                type="button"
                onClick={() => onSetTimedMode(true)}
                className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  timedMode
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Clock className="h-3.5 w-3.5" />
                60 s
              </button>
            </div>

            <div
              role="group"
              aria-label="Liczba rund w grze"
              className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-[#0D151F]/94 p-1 shadow-xl"
            >
              <span className="px-2 text-[11px] font-semibold tracking-wider text-slate-400 uppercase whitespace-nowrap">
                Rundy
              </span>
              {ROUND_COUNT_OPTIONS.map((count) => {
                const active = selectedRoundCount === count;
                return (
                  <button
                    key={count}
                    type="button"
                    onClick={() => onSetRoundCount(count)}
                    className={`min-h-[38px] min-w-[36px] rounded-lg px-2 font-mono text-xs font-bold transition-colors tabular-nums ${
                      active
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-300 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {count}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Location Pool Selector */}
          <div
            role="group"
            aria-label="Pula lokalizacji"
            className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5"
          >
            {poolOptions.map((opt) => {
              const active = (!isOnline ? 'classic_20' : poolFilter) === opt.id;
              const disabled = !isOnline && opt.id !== 'classic_20';
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onSetPoolFilter(opt.id)}
                  className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 disabled:opacity-40 ${
                    active
                      ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-100'
                      : 'border-white/10 bg-[#0D151F]/92 text-slate-300 hover:border-white/25 hover:text-white'
                  }`}
                >
                  <span>{opt.label}</span>
                  <span className="font-mono text-[11px] text-emerald-400/90 tabular-nums">
                    {opt.count.toLocaleString('pl-PL')}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Primary Play CTAs: Standard Game + Wyzwanie Dnia */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onStartGame}
              className="inline-flex min-h-[54px] items-center gap-3 rounded-xl bg-emerald-500 px-7 py-3.5 font-display text-base font-bold text-[#05120D] shadow-[0_0_40px_rgba(16,185,129,0.32)] transition-all hover:bg-emerald-400 active:scale-[0.98] whitespace-nowrap shrink-0 sm:text-lg"
            >
              <Play className="h-5 w-5 fill-current" />
              Rozpocznij grę
            </button>

            <button
              type="button"
              onClick={onStartDailyChallenge}
              className="inline-flex min-h-[54px] items-center gap-2.5 rounded-xl border border-amber-400/50 bg-[#1A160B]/95 px-5 py-3 text-left transition-all hover:border-amber-300 hover:bg-[#241E0E] active:scale-[0.98] shrink-0"
            >
              {dailyCompletion ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-amber-300" />
              ) : (
                <Calendar className="h-5 w-5 shrink-0 text-amber-300" />
              )}
              <div className="leading-tight">
                <span className="block font-display text-sm font-bold text-amber-200 sm:text-base">
                  Wyzwanie Dnia
                </span>
                <span className="block text-[11px] text-amber-200/75 tabular-nums">
                  {dailyCompletion
                    ? `Ukończono: ${dailyCompletion.score.toLocaleString('pl-PL')} pkt · trenuj`
                    : `${dailyDateLabel} · 5 rund`}
                </span>
              </div>
            </button>
          </div>
        </main>
      )}

      {/* Bottom Floating 3D Camera Dock + Minimal Legend (compact, solid rgba, zero backdrop-blur) */}
      <footer className="relative z-20 flex flex-wrap items-center justify-between gap-2 px-5 py-4 text-xs text-slate-400 sm:px-8">
        <div
          role="group"
          aria-label="Kamera 3D zabytków Polski"
          className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-[#0D151F]/94 p-1 shadow-xl"
        >
          <span className="inline-flex items-center gap-1.5 px-2 text-[11px] font-semibold text-slate-400">
            <Camera className="h-3.5 w-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Scena 3D</span>
          </span>
          {CAMERA_PRESETS.map((preset) => {
            const active = cameraPreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => setCameraPreset(preset.id)}
                className={`min-h-[32px] rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-emerald-500 text-[#05120D]'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setCinematicView((prev) => !prev)}
            title={cinematicView ? 'Pokaż menu gry' : 'Ukryj menu i podziwiaj scenę 3D'}
            className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
              cinematicView
                ? 'border-amber-400/50 bg-amber-400/15 text-amber-200'
                : 'border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            {cinematicView ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {cinematicView ? 'Pokaż menu' : 'Widok 3D'}
          </button>
        </div>

        <p className="font-mono text-[11px] text-slate-500">
          52°00&apos;N 19°00&apos;E · Haversine 0–5000 pkt
        </p>
      </footer>
    </div>
  );
};
