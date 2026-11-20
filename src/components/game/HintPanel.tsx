import React from 'react';
import {Compass, HelpCircle, Lightbulb} from 'lucide-react';
import {
  HINT_1_PENALTY,
  HINT_2_ADDITIONAL_PENALTY,
  MAX_ROUND_POINTS,
  getHintPenaltyPoints,
} from '../../domain/geoScoring';
import type {HintLevel, PolandLocation} from '../../domain/types';

export interface HintPanelProps {
  readonly location: PolandLocation;
  readonly hintLevel: HintLevel;
  readonly onUnlockNextHint: () => void;
}

export const HintPanel: React.FC<HintPanelProps> = ({
  location,
  hintLevel,
  onUnlockNextHint,
}) => {
  const penalty = getHintPenaltyPoints(hintLevel);
  const remainingMax = MAX_ROUND_POINTS - penalty;
  const firstLetter = location.name.trim().charAt(0).toUpperCase();

  return (
    <aside className="pointer-events-auto fixed left-3 top-20 z-20 flex max-w-[300px] flex-col gap-2 sm:left-5 sm:max-w-[330px]">
      {hintLevel < 2 ? (
        <button
          type="button"
          onClick={onUnlockNextHint}
          className="inline-flex min-h-[44px] items-center justify-between gap-3 rounded-xl border border-amber-500/35 bg-[#0D151F]/94 px-4 py-2.5 text-left shadow-xl transition-colors hover:border-amber-400/60 hover:bg-[#141F2D]"
        >
          <span className="flex items-center gap-2 text-xs font-semibold text-amber-200 sm:text-sm whitespace-nowrap">
            <Lightbulb className="h-4 w-4 shrink-0 text-amber-400" />
            {hintLevel === 0 ? 'Podpowiedź 1' : 'Podpowiedź 2'}
          </span>
          <span className="font-mono text-xs font-bold text-amber-400 tabular-nums whitespace-nowrap shrink-0">
            {hintLevel === 0 ? `−${HINT_1_PENALTY} pkt` : `−${HINT_2_ADDITIONAL_PENALTY} pkt`}
          </span>
        </button>
      ) : (
        <div className="inline-flex min-h-[40px] items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#0D151F]/92 px-3.5 py-2 text-xs text-slate-300 shadow-lg">
          <span className="flex items-center gap-1.5 font-medium">
            <Lightbulb className="h-3.5 w-3.5 text-amber-400" />
            Wykorzystano 2/2 podpowiedzi
          </span>
          <span className="font-mono font-semibold text-amber-300 tabular-nums">
            maks. {remainingMax.toLocaleString('pl-PL')}
          </span>
        </div>
      )}

      {hintLevel >= 1 && (
        <div className="space-y-2.5 rounded-xl border border-white/10 bg-[#0D151F]/95 p-3.5 text-xs shadow-2xl sm:text-sm">
          <div className="flex items-start gap-2.5">
            <Compass className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <div>
              <p className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                Poziom 1 · Województwo (−{HINT_1_PENALTY} pkt)
              </p>
              <p className="mt-0.5 font-semibold text-slate-100">{location.voivodeship}</p>
            </div>
          </div>

          {hintLevel >= 2 && (
            <div className="border-t border-white/10 pt-2.5">
              <div className="flex items-start gap-2.5">
                <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <div>
                  <p className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                    Poziom 2 · Wskazówka (−{HINT_2_ADDITIONAL_PENALTY} pkt)
                  </p>
                  <p className="mt-0.5 leading-relaxed text-slate-200">{location.hint}</p>
                  <p className="mt-1.5 font-mono text-xs text-emerald-300">
                    Pierwsza litera nazwy:{' '}
                    <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-bold text-emerald-200">
                      {firstLetter}…
                    </span>
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
};
