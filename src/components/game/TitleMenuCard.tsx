import React from 'react';
import {Calendar, CheckCircle2, Clock, Play} from 'lucide-react';
import {ROUND_COUNT_OPTIONS} from '../../domain/gameMachine';
import type {LocationPoolOption} from '../../domain/polandLocations';
import type {
  LocalDailyCompletion,
  LocationPoolFilter,
  RoundCountOption,
} from '../../domain/types';
import {FLAT_SEGMENT_TRACK} from './titleStyles';

export interface TitleMenuCardProps {
  readonly timedMode: boolean;
  readonly onSetTimedMode: (timed: boolean) => void;
  readonly poolFilter: LocationPoolFilter;
  readonly onSetPoolFilter: (pool: LocationPoolFilter) => void;
  readonly poolOptions: readonly LocationPoolOption[];
  readonly selectedRoundCount: RoundCountOption;
  readonly onSetRoundCount: (count: RoundCountOption) => void;
  readonly totalLocationsCount: number;
  readonly maxGamePoints: number;
  readonly dailyDateLabel: string;
  readonly dailyCompletion: LocalDailyCompletion | null;
  readonly isOnline: boolean;
  readonly onStartGame: () => void;
  readonly onStartDailyChallenge: () => void;
}

interface ModeAndRoundsRowProps {
  readonly timedMode: boolean;
  readonly onSetTimedMode: (timed: boolean) => void;
  readonly selectedRoundCount: RoundCountOption;
  readonly onSetRoundCount: (count: RoundCountOption) => void;
}

const ModeAndRoundsRow: React.FC<ModeAndRoundsRowProps> = ({
  timedMode,
  onSetTimedMode,
  selectedRoundCount,
  onSetRoundCount,
}) => (
  <div className="mt-7 flex flex-wrap items-center gap-2.5">
    <div role="group" aria-label="Tryb czasu rozgrywki" className={FLAT_SEGMENT_TRACK}>
      <button
        type="button"
        onClick={() => onSetTimedMode(false)}
        className={`min-h-[36px] rounded-md px-3 py-1.5 text-xs font-semibold transition-colors duration-200 whitespace-nowrap shrink-0 ${
          !timedMode
            ? 'bg-white text-[#0C0E12]'
            : 'text-neutral-300 hover:text-white'
        }`}
      >
        Swobodny
      </button>
      <button
        type="button"
        onClick={() => onSetTimedMode(true)}
        className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors duration-200 whitespace-nowrap shrink-0 ${
          timedMode
            ? 'bg-white text-[#0C0E12]'
            : 'text-neutral-300 hover:text-white'
        }`}
      >
        <Clock className="h-3.5 w-3.5" />
        60 s
      </button>
    </div>

    <div
      role="group"
      aria-label="Liczba rund w grze"
      className={`${FLAT_SEGMENT_TRACK} flex-1 justify-between gap-0.5`}
    >
      <span className="px-2 text-[11px] font-medium text-neutral-400 whitespace-nowrap">
        Rundy
      </span>
      <div className="flex items-center gap-0.5">
        {ROUND_COUNT_OPTIONS.map((count) => {
          const active = selectedRoundCount === count;
          return (
            <button
              key={count}
              type="button"
              onClick={() => onSetRoundCount(count)}
              className={`min-h-[36px] min-w-[34px] rounded-md px-2 font-mono text-xs font-bold transition-colors duration-200 tabular-nums ${
                active
                  ? 'bg-white text-[#0C0E12]'
                  : 'text-neutral-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              {count}
            </button>
          );
        })}
      </div>
    </div>
  </div>
);

interface CategoryGridProps {
  readonly poolOptions: readonly LocationPoolOption[];
  readonly poolFilter: LocationPoolFilter;
  readonly isOnline: boolean;
  readonly onSetPoolFilter: (pool: LocationPoolFilter) => void;
}

const CategoryGrid: React.FC<CategoryGridProps> = ({
  poolOptions,
  poolFilter,
  isOnline,
  onSetPoolFilter,
}) => (
  <div className="mt-5">
    <p className="mb-2 text-xs font-medium text-neutral-400">Kategoria lokalizacji</p>
    <div role="group" aria-label="Pula lokalizacji" className="grid grid-cols-2 gap-2">
      {poolOptions.map((opt) => {
        const active = (!isOnline ? 'classic_20' : poolFilter) === opt.id;
        const disabled = !isOnline && opt.id !== 'classic_20';
        return (
          <button
            key={opt.id}
            type="button"
            disabled={disabled}
            onClick={() => onSetPoolFilter(opt.id)}
            className={`flex min-h-[42px] items-center justify-between gap-2 rounded-lg border px-3.5 py-2 text-left text-xs font-medium transition-colors duration-200 disabled:opacity-40 ${
              active
                ? 'border-white/55 bg-white/14 text-white'
                : 'border-white/12 bg-[#0C0E12]/55 text-neutral-300 hover:border-white/30 hover:bg-[#0C0E12]/75 hover:text-white'
            }`}
          >
            <span className="truncate">{opt.label}</span>
            <span
              className={`font-mono text-[11px] tabular-nums shrink-0 ${
                active ? 'text-white' : 'text-neutral-400'
              }`}
            >
              {opt.count.toLocaleString('pl-PL')}
            </span>
          </button>
        );
      })}
    </div>
  </div>
);

export const TitleMenuCard: React.FC<TitleMenuCardProps> = ({
  timedMode,
  onSetTimedMode,
  poolFilter,
  onSetPoolFilter,
  poolOptions,
  selectedRoundCount,
  onSetRoundCount,
  totalLocationsCount,
  maxGamePoints,
  dailyDateLabel,
  dailyCompletion,
  isOnline,
  onStartGame,
  onStartDailyChallenge,
}) => (
  <section
    aria-label="Panel konfiguracji gry GeoPolska"
    className="w-full max-w-[464px] text-left"
  >
    <p className="text-xs font-medium text-neutral-300 tabular-nums">
      {selectedRoundCount} {selectedRoundCount === 3 ? 'rundy' : 'rund'} ·{' '}
      {totalLocationsCount.toLocaleString('pl-PL')} lokalizacji · maks.{' '}
      {maxGamePoints.toLocaleString('pl-PL')} pkt
    </p>

    <h1 className="mt-2.5 font-display text-5xl font-bold tracking-tight text-white sm:text-6xl">
      GeoPolska
    </h1>

    <p className="mt-3 max-w-md text-sm leading-relaxed text-neutral-300 sm:text-[15px]">
      Rozpoznaj {totalLocationsCount.toLocaleString('pl-PL')} miejsc w Polsce na zdjęciach,
      wskaż lokalizację na mapie i rywalizuj w codziennym Wyzwaniu Dnia.
    </p>

    <ModeAndRoundsRow
      timedMode={timedMode}
      onSetTimedMode={onSetTimedMode}
      selectedRoundCount={selectedRoundCount}
      onSetRoundCount={onSetRoundCount}
    />

    <CategoryGrid
      poolOptions={poolOptions}
      poolFilter={poolFilter}
      isOnline={isOnline}
      onSetPoolFilter={onSetPoolFilter}
    />

    <div className="mt-7 flex flex-col gap-2.5 sm:flex-row sm:items-stretch">
      <button
        type="button"
        onClick={onStartGame}
        className="inline-flex min-h-[52px] flex-1 items-center justify-center gap-2.5 rounded-lg bg-white px-6 py-3 font-display text-base font-bold text-[#0C0E12] transition-colors duration-200 hover:bg-neutral-200 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white whitespace-nowrap"
      >
        <Play className="h-4 w-4 fill-current shrink-0" />
        Rozpocznij grę
      </button>

      <button
        type="button"
        onClick={onStartDailyChallenge}
        className="inline-flex min-h-[52px] items-center justify-center gap-2.5 rounded-lg border border-amber-500/45 bg-[#0C0E12]/65 px-4 py-2.5 text-left transition-colors duration-200 hover:border-amber-400/75 hover:bg-amber-950/35 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 shrink-0"
      >
        {dailyCompletion ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-amber-400" />
        ) : (
          <Calendar className="h-4 w-4 shrink-0 text-amber-400" />
        )}
        <div className="leading-tight">
          <span className="block font-display text-sm font-semibold text-amber-100 whitespace-nowrap">
            Wyzwanie Dnia
          </span>
          <span className="block text-[11px] text-amber-200/75 tabular-nums whitespace-nowrap">
            {dailyCompletion
              ? `${dailyCompletion.score.toLocaleString('pl-PL')} pkt · trenuj`
              : `${dailyDateLabel} · 5 rund`}
          </span>
        </div>
      </button>
    </div>
  </section>
);
