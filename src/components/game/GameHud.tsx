import React from 'react';
import {Calendar, Clock, Home, Lightbulb, Volume2, VolumeX, WifiOff} from 'lucide-react';
import {MAX_ROUND_POINTS, getHintPenaltyPoints} from '../../domain/geoScoring';
import type {HintLevel} from '../../domain/types';

export interface GameHudProps {
  readonly roundNumber: number;
  readonly totalRounds: number;
  readonly totalScore: number;
  readonly hintLevel: HintLevel;
  readonly isDailyChallenge?: boolean;
  readonly timedMode: boolean;
  readonly secondsRemaining: number;
  readonly isMuted: boolean;
  readonly onToggleMute: () => void;
  readonly onReturnToMenu: () => void;
  readonly isOnline: boolean;
}

export const GameHud: React.FC<GameHudProps> = ({
  roundNumber,
  totalRounds,
  totalScore,
  hintLevel,
  isDailyChallenge = false,
  timedMode,
  secondsRemaining,
  isMuted,
  onToggleMute,
  onReturnToMenu,
  isOnline,
}) => {
  const hintPenalty = getHintPenaltyPoints(hintLevel);
  const maxRoundCap = MAX_ROUND_POINTS - hintPenalty;
  const isUrgentTime = timedMode && secondsRemaining <= 10;
  const isWarningTime = timedMode && secondsRemaining > 10 && secondsRemaining <= 20;

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-start justify-between gap-2 px-3 py-3 sm:px-5 sm:py-4">
      {/* Left: Brand / Menu Escape */}
      <div className="pointer-events-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onReturnToMenu}
          title="Powrót do ekranu startowego"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-white/10 bg-[#0D151F]/92 px-3 py-2 text-xs font-semibold text-slate-100 shadow-lg transition-colors hover:border-emerald-500/40 hover:bg-[#131F2E] whitespace-nowrap shrink-0 sm:px-3.5"
        >
          <Home className="h-4 w-4 text-emerald-400" />
          <span className="hidden font-display text-sm tracking-tight sm:inline">GeoPolska</span>
        </button>
      </div>

      {/* Center: Compact Telemetry Bar */}
      <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 rounded-xl border border-white/10 bg-[#0D151F]/94 px-4 py-2 shadow-xl sm:gap-x-6 sm:px-5">
        {isDailyChallenge && (
          <>
            <div className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-amber-300 uppercase">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Wyzwanie Dnia</span>
              <span className="sm:hidden">Dnia</span>
            </div>
            <span className="h-4 w-px bg-white/10" aria-hidden="true" />
          </>
        )}

        <div className="flex items-baseline gap-1.5">
          <span className="text-[11px] font-medium tracking-wider text-slate-400 uppercase">
            Runda
          </span>
          <span className="font-mono text-sm font-bold text-white tabular-nums sm:text-base">
            {roundNumber}/{totalRounds}
          </span>
        </div>

        <span className="h-4 w-px bg-white/10" aria-hidden="true" />

        <div className="flex items-baseline gap-1.5">
          <span className="text-[11px] font-medium tracking-wider text-slate-400 uppercase">
            Wynik
          </span>
          <span className="font-mono text-sm font-bold text-emerald-400 tabular-nums sm:text-base">
            {totalScore.toLocaleString('pl-PL')}
          </span>
        </div>

        {hintPenalty > 0 && (
          <>
            <span className="h-4 w-px bg-white/10" aria-hidden="true" />
            <div className="flex items-center gap-1.5 text-amber-300">
              <Lightbulb className="h-3.5 w-3.5 shrink-0" />
              <span className="font-mono text-xs font-semibold tabular-nums sm:text-sm">
                −{hintPenalty.toLocaleString('pl-PL')} pkt
              </span>
              <span className="hidden text-[11px] text-amber-200/80 md:inline">
                (maks. {maxRoundCap.toLocaleString('pl-PL')})
              </span>
            </div>
          </>
        )}

        {timedMode && (
          <>
            <span className="h-4 w-px bg-white/10" aria-hidden="true" />
            <div
              className={`flex items-center gap-1.5 font-mono text-sm font-bold tabular-nums sm:text-base ${
                isUrgentTime
                  ? 'text-rose-400'
                  : isWarningTime
                    ? 'text-amber-300'
                    : 'text-slate-100'
              }`}
            >
              <Clock className="h-4 w-4 shrink-0" />
              <span>0:{String(secondsRemaining).padStart(2, '0')}</span>
            </div>
          </>
        )}
      </div>

      {/* Right: Offline Status + Sound Mute */}
      <div className="pointer-events-auto flex items-center gap-2">
        {!isOnline && (
          <span className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-amber-500/35 bg-[#19150C]/94 px-3 text-xs font-medium text-amber-200 whitespace-nowrap shrink-0">
            <WifiOff className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Offline</span>
          </span>
        )}
        <button
          type="button"
          onClick={onToggleMute}
          aria-label={isMuted ? 'Włącz dźwięk' : 'Wycisz dźwięk'}
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-[#0D151F]/92 text-slate-300 shadow-lg transition-colors hover:border-white/20 hover:text-white"
        >
          {isMuted ? (
            <VolumeX className="h-4 w-4" />
          ) : (
            <Volume2 className="h-4 w-4 text-emerald-400" />
          )}
        </button>
      </div>
    </header>
  );
};
