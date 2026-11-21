import React from 'react';
import {ArrowRight, Clock, Compass, Flag, Lightbulb, MapPin, Sparkles} from 'lucide-react';
import {MAX_ROUND_POINTS, formatDistanceKm} from '../../domain/geoScoring';
import type {
  IAiExplorerGateway,
  RoundOutcome,
} from '../../domain/types';
import {PolandMap} from '../map/PolandMap';
import {AiExplorerDrawer} from './AiExplorerDrawer';

export interface RoundResultOverlayProps {
  readonly outcome: RoundOutcome;
  readonly roundIndex: number;
  readonly totalRounds: number;
  readonly totalScore: number;
  readonly aiGateway: IAiExplorerGateway;
  readonly isOnline: boolean;
  readonly onNextRound: () => void;
}

export const RoundResultOverlay: React.FC<RoundResultOverlayProps> = ({
  outcome,
  roundIndex,
  totalRounds,
  totalScore,
  aiGateway,
  isOnline,
  onNextRound,
}) => {
  const isFinalRound = roundIndex + 1 >= totalRounds;
  const {scoreBreakdown, location, distanceKm, guess, timedOut} = outcome;
  const progressPct = Math.max(0, Math.min(100, (scoreBreakdown.finalScore / MAX_ROUND_POINTS) * 100));

  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-[#090E14]/96 pt-16 sm:pt-20">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 pb-8 pt-2 sm:px-6 lg:grid lg:grid-cols-12 lg:items-start">
        {/* Left/Top: Interactive Result Map with Geodesic Line */}
        <div className="flex flex-col gap-3 lg:col-span-7">
          <div className="h-[300px] w-full overflow-hidden rounded-2xl border border-white/10 shadow-2xl sm:h-[420px] lg:h-[480px]">
            <PolandMap
              mode={{kind: 'result', outcome}}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#101822] px-4 py-3 text-xs text-slate-300">
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" aria-hidden="true" />
                Prawdziwa lokalizacja
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" aria-hidden="true" />
                Twój wybór
              </span>
            </div>
            <span className="font-mono text-slate-400 tabular-nums">
              {location.lat.toFixed(4)}°N, {location.lng.toFixed(4)}°E
            </span>
          </div>
        </div>

        {/* Right/Bottom: Score Breakdown, Fun Fact, AI Explorer, Next CTA */}
        <div className="flex flex-col gap-4 lg:col-span-5">
          {/* Location & Score Card */}
          <div className="rounded-2xl border border-white/10 bg-[#101822] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold tracking-wider text-emerald-400 uppercase">
                  Runda {outcome.roundNumber} z {totalRounds} · Wynik rundy
                </p>
                <h2 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">
                  {location.name}
                </h2>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-400">
                  <MapPin className="h-3.5 w-3.5 text-emerald-400" />
                  woj. {location.voivodeship}
                </p>
              </div>

              <div className="text-right">
                <p className="font-mono text-3xl font-bold text-emerald-400 tabular-nums">
                  +{scoreBreakdown.finalScore.toLocaleString('pl-PL')}
                </p>
                <p className="font-mono text-xs text-slate-400 tabular-nums">
                  / {MAX_ROUND_POINTS.toLocaleString('pl-PL')} pkt
                </p>
              </div>
            </div>

            {/* Score Progress Bar */}
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{width: `${progressPct}%`}}
              />
            </div>

            {/* Distance & Penalty Telemetry */}
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-3.5 text-xs text-slate-300">
              {guess ? (
                <div className="flex items-center gap-1.5">
                  <Compass className="h-4 w-4 text-emerald-400" />
                  <span>Odległość:</span>
                  <strong className="font-mono text-sm text-white tabular-nums">
                    {formatDistanceKm(distanceKm)}
                  </strong>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-rose-300">
                  <Clock className="h-4 w-4" />
                  <span>{timedOut ? 'Czas minął bez postawienia pinezki' : 'Brak wskazania'}</span>
                </div>
              )}

              {scoreBreakdown.hintPenalty > 0 && (
                <div className="flex items-center gap-1.5 text-amber-300">
                  <Lightbulb className="h-3.5 w-3.5" />
                  <span className="font-mono tabular-nums">
                    Podpowiedzi: −{scoreBreakdown.hintPenalty.toLocaleString('pl-PL')} pkt
                  </span>
                </div>
              )}

              <div className="ml-auto font-mono text-slate-400 tabular-nums">
                Suma: <strong className="text-slate-100">{totalScore.toLocaleString('pl-PL')}</strong>
              </div>
            </div>

            {/* 1-Sentence Location Fun Fact */}
            <div className="mt-4 rounded-xl border border-emerald-500/20 bg-[#0B141B] p-3.5">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-emerald-400 uppercase">
                <Sparkles className="h-3.5 w-3.5" />
                Ciekawostka
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-200">{location.funFact}</p>
            </div>

            {/* Primary Next Round / Summary CTA */}
            <button
              type="button"
              onClick={onNextRound}
              className="mt-5 inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 font-display text-base font-bold text-[#05120D] shadow-lg transition-colors hover:bg-emerald-400 whitespace-nowrap"
            >
              {isFinalRound ? (
                <>
                  <Flag className="h-5 w-5" />
                  Zobacz podsumowanie gry
                </>
              ) : (
                <>
                  Następna runda ({roundIndex + 2}/{totalRounds})
                  <ArrowRight className="h-5 w-5" />
                </>
              )}
            </button>
          </div>

          {/* Embedded AI Explorer (Search + Deep Analysis) */}
          <AiExplorerDrawer
            outcome={outcome}
            gateway={aiGateway}
            isOnline={isOnline}
          />
        </div>
      </div>
    </div>
  );
};
