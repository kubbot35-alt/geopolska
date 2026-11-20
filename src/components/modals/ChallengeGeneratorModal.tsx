import React, {useEffect, useRef, useState} from 'react';
import {Compass, Loader2, Play, Sparkles, WifiOff, X} from 'lucide-react';
import {
  CHALLENGE_REGIONS,
  hydrateChallengeDeck,
  selectChallengeCandidates,
} from '../../domain/polandLocations';
import type {
  AiThemedChallengeResult,
  ChallengeRoundCountOption,
  IAiExplorerGateway,
  PolandLocation,
  RegionCategory,
} from '../../domain/types';

export interface ChallengeGeneratorModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly gateway: IAiExplorerGateway;
  readonly locations: readonly PolandLocation[];
  readonly isOnline: boolean;
  readonly onStartChallengeDeck: (
    deck: readonly PolandLocation[],
    roundCount: ChallengeRoundCountOption,
  ) => void;
}

const CHALLENGE_ROUND_OPTIONS: readonly ChallengeRoundCountOption[] = [3, 5, 10];

const CATEGORY_LABELS: Readonly<Record<RegionCategory, string>> = {
  miasto: 'Miasto i architektura',
  zabytek: 'Zamek / zabytek',
  gory: 'Pasmo górskie',
  morze: 'Wybrzeże Bałtyku',
  nad_woda: 'Jeziora i rzeki',
};

const QUICK_THEMES: readonly {
  readonly label: string;
  readonly region: string;
  readonly prompt: string;
}[] = [
  {
    label: 'Szlakiem zamków i gotyku',
    region: 'Cała Polska',
    prompt: 'Średniowieczne zamki, ceglane twierdze gotyckie i warowne stare miasta w Polsce',
  },
  {
    label: 'Górskie przełęcze i kurorty',
    region: 'Dolny Śląsk i Karkonosze',
    prompt: 'Malownicze górskie miejscowości, drewniana architektura i widoki na pasma górskie',
  },
  {
    label: 'Bałtyckie miasteczka i porty',
    region: 'Pomorze i Bałtyk',
    prompt: 'Nadmorskie kurorty, latarnie morskie, hanzeatyckie porty i klify nad Bałtykiem',
  },
  {
    label: 'Renesansowe rynki wschodu',
    region: 'Lubelszczyzna i Roztocze',
    prompt: 'Historyczne renesansowe rynki, kamienice kupieckie i miasteczka nad Wisłą',
  },
];

interface GeneratedDeckPreview {
  readonly challenge: AiThemedChallengeResult;
  readonly deck: readonly PolandLocation[];
  readonly roundCount: ChallengeRoundCountOption;
}

export const ChallengeGeneratorModal: React.FC<ChallengeGeneratorModalProps> = ({
  open,
  onClose,
  gateway,
  locations,
  isOnline,
  onStartChallengeDeck,
}) => {
  const [region, setRegion] = useState<string>(CHALLENGE_REGIONS[0]);
  const [themePrompt, setThemePrompt] = useState<string>(QUICK_THEMES[0].prompt);
  const [roundCount, setRoundCount] = useState<ChallengeRoundCountOption>(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<GeneratedDeckPreview | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
    }
    return () => {
      abortRef.current?.abort();
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline || themePrompt.trim().length < 4) {
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    const candidates = selectChallengeCandidates(
      region,
      themePrompt.trim(),
      48,
      Math.random,
      locations,
    );
    const response = await gateway.generateThemedChallenge(
      themePrompt.trim(),
      region,
      roundCount,
      candidates,
      controller.signal,
    );

    if (controller.signal.aborted) {
      return;
    }

    setLoading(false);
    if (!response.ok) {
      setError(response.error);
      return;
    }

    const hydratedDeck = hydrateChallengeDeck(response.value.stops, locations);
    if (hydratedDeck.length < roundCount) {
      setError('Nie udało się skompletować pełnej liczby przystanków. Spróbuj ponownie.');
      return;
    }

    setPreview({
      challenge: response.value,
      deck: hydratedDeck.slice(0, roundCount),
      roundCount,
    });
  };

  const handlePlayGenerated = () => {
    if (!preview) {
      return;
    }
    onStartChallengeDeck(preview.deck, preview.roundCount);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Kreator Wyzwań AI"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#101822] text-slate-100 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Compass className="h-5 w-5 text-emerald-400" />
            <div>
              <h2 className="font-display text-lg font-bold text-white">
                Kreator Wyzwań AI
              </h2>
              <p className="text-xs text-slate-400">
                Darmowe API Google Gemini dobiera tematyczną trasę z atlasu{' '}
                {locations.length.toLocaleString('pl-PL')} miejsc w Polsce
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij kreator"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {!isOnline && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-200">
              <WifiOff className="h-4 w-4 shrink-0" />
              Tryb offline — układanie tematycznych wypraw przez Gemini AI wymaga połączenia z internetem.
            </div>
          )}

          <form onSubmit={(e) => void handleGenerate(e)} className="space-y-4">
            {/* Quick Theme Presets */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400">Gotowe tematy:</span>
              {QUICK_THEMES.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setRegion(preset.region);
                    setThemePrompt(preset.prompt);
                  }}
                  className="rounded-lg border border-white/10 bg-[#0C131D] px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-emerald-500/40 hover:text-white whitespace-nowrap shrink-0"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="challenge-region"
                  className="block text-xs font-semibold tracking-wider text-slate-400 uppercase"
                >
                  Region Polski
                </label>
                <select
                  id="challenge-region"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="mt-1.5 min-h-[44px] w-full rounded-xl border border-white/10 bg-[#0C131D] px-3.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                >
                  {CHALLENGE_REGIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <span className="block text-xs font-semibold tracking-wider text-slate-400 uppercase">
                  Liczba przystanków (rund)
                </span>
                <div className="mt-1.5 grid grid-cols-3 gap-1.5 rounded-xl border border-white/10 bg-[#0C131D] p-1">
                  {CHALLENGE_ROUND_OPTIONS.map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setRoundCount(count)}
                      className={`min-h-[36px] rounded-lg font-mono text-xs font-bold transition-colors tabular-nums ${
                        roundCount === count
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-300 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      {count} {count === 3 ? 'rundy' : 'rund'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label
                htmlFor="challenge-prompt"
                className="block text-xs font-semibold tracking-wider text-slate-400 uppercase"
              >
                Motyw przewodni wyprawy
              </label>
              <textarea
                id="challenge-prompt"
                rows={3}
                value={themePrompt}
                onChange={(e) => setThemePrompt(e.target.value)}
                maxLength={320}
                placeholder="Opisz klimat lub motyw miejsc, które chcesz odgadywać w Polsce..."
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#0C131D] p-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="submit"
                disabled={loading || !isOnline || themePrompt.trim().length < 4}
                className="inline-flex min-h-[46px] items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-[#05120D] transition-colors hover:bg-emerald-400 disabled:opacity-50 whitespace-nowrap"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Układanie trasy...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Ułóż wyzwanie ({roundCount} {roundCount === 3 ? 'rundy' : 'rund'})
                  </>
                )}
              </button>
            </div>
          </form>

          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-950/40 p-4 text-xs leading-relaxed text-rose-200">
              {error}
            </div>
          )}

          {preview && (
            <div className="space-y-4 rounded-xl border border-emerald-500/30 bg-[#0C131D] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold tracking-wider text-emerald-400 uppercase">
                    Trasa gotowa do rozgrywki · {preview.roundCount}{' '}
                    {preview.roundCount === 3 ? 'rundy' : 'rund'}
                  </p>
                  <h3 className="font-display text-lg font-bold text-white">
                    {preview.challenge.title}
                  </h3>
                  <p className="text-xs leading-relaxed text-slate-300">
                    {preview.challenge.briefing}
                  </p>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {preview.deck.map((loc, idx) => (
                  <div
                    key={loc.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#101822] px-3 py-2 text-xs"
                  >
                    <span className="font-mono font-semibold text-emerald-400 tabular-nums">
                      #{idx + 1} · {CATEGORY_LABELS[loc.regionCategory]}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Lokalizacja utajniona
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <span className="text-[11px] text-slate-400">
                  Każdy przystanek zawiera zweryfikowane zdjęcie, współrzędne WGS84 i autorską wskazówkę AI.
                </span>
                <button
                  type="button"
                  onClick={handlePlayGenerated}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-[#05120D] shadow-[0_0_24px_rgba(16,185,129,0.28)] transition-colors hover:bg-emerald-400 whitespace-nowrap shrink-0"
                >
                  <Play className="h-4 w-4 fill-current" />
                  Rozpocznij to wyzwanie
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
