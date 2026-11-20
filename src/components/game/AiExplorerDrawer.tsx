import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Brain,
  ExternalLink,
  Globe,
  Loader2,
  MapPin,
  RefreshCw,
  WifiOff,
} from 'lucide-react';
import type {
  AiDeepAnalysisResult,
  AiMapsNearbyResult,
  AiSearchFactsResult,
  IAiExplorerGateway,
  RoundOutcome,
} from '../../domain/types';

type ExplorerTab = 'search' | 'maps' | 'deep';

type TabFetchState<T> =
  | {readonly status: 'idle'}
  | {readonly status: 'loading'}
  | {readonly status: 'success'; readonly data: T}
  | {readonly status: 'error'; readonly message: string};

export interface AiExplorerDrawerProps {
  readonly outcome: RoundOutcome;
  readonly gateway: IAiExplorerGateway;
  readonly isOnline: boolean;
}

function renderCleanParagraphs(text: string): React.ReactNode {
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  return (
    <div className="space-y-2.5 text-sm leading-relaxed text-slate-200">
      {blocks.map((block, idx) => {
        const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
        const isBulletList = lines.length > 1 && lines.every((l) => /^[-*•\d.]/.test(l));
        if (isBulletList) {
          return (
            <ul key={idx} className="space-y-1.5 pl-4 text-slate-200 list-disc">
              {lines.map((line, lineIdx) => (
                <li key={lineIdx}>{line.replace(/^[-*•]\s*/, '').replace(/\*\*/g, '')}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={idx} className="whitespace-pre-line">
            {block.replace(/\*\*/g, '')}
          </p>
        );
      })}
    </div>
  );
}

export const AiExplorerDrawer: React.FC<AiExplorerDrawerProps> = ({
  outcome,
  gateway,
  isOnline,
}) => {
  const [activeTab, setActiveTab] = useState<ExplorerTab>('search');
  const [searchState, setSearchState] = useState<TabFetchState<AiSearchFactsResult>>({
    status: 'idle',
  });
  const [mapsState, setMapsState] = useState<TabFetchState<AiMapsNearbyResult>>({
    status: 'idle',
  });
  const [deepState, setDeepState] = useState<TabFetchState<AiDeepAnalysisResult>>({
    status: 'idle',
  });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setSearchState({status: 'idle'});
    setMapsState({status: 'idle'});
    setDeepState({status: 'idle'});
    return () => {
      abortRef.current?.abort();
    };
  }, [outcome.location.id, outcome.roundNumber]);

  const loadTab = useCallback(
    async (tab: ExplorerTab, force = false) => {
      if (!isOnline) {
        return;
      }

      if (!force) {
        if (tab === 'search' && searchState.status === 'success') return;
        if (tab === 'maps' && mapsState.status === 'success') return;
        if (tab === 'deep' && deepState.status === 'success') return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (tab === 'search') {
        setSearchState({status: 'loading'});
        const result = await gateway.fetchSearchFacts(outcome.location, controller.signal);
        if (controller.signal.aborted) return;
        setSearchState(
          result.ok
            ? {status: 'success', data: result.value}
            : {status: 'error', message: result.error},
        );
      } else if (tab === 'maps') {
        setMapsState({status: 'loading'});
        const result = await gateway.fetchNearbyMapsPlaces(outcome.location, controller.signal);
        if (controller.signal.aborted) return;
        setMapsState(
          result.ok
            ? {status: 'success', data: result.value}
            : {status: 'error', message: result.error},
        );
      } else {
        setDeepState({status: 'loading'});
        const result = await gateway.fetchDeepAnalysis(outcome, controller.signal);
        if (controller.signal.aborted) return;
        setDeepState(
          result.ok
            ? {status: 'success', data: result.value}
            : {status: 'error', message: result.error},
        );
      }
    },
    [deepState.status, gateway, isOnline, mapsState.status, outcome, searchState.status],
  );

  const handleSelectTab = (tab: ExplorerTab) => {
    setActiveTab(tab);
    void loadTab(tab, false);
  };

  return (
    <section className="rounded-xl border border-white/10 bg-[#0D151F] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-sm font-semibold text-slate-100">
          Eksplorator AI — {outcome.location.name}
        </h3>
        <span className="text-[11px] text-slate-400">
          Wyszukiwarka · Mapy Google · Analiza detali
        </span>
      </div>

      {/* 3 Grounded AI Tabs */}
      <div className="mt-3 flex flex-wrap gap-1.5 border-b border-white/10 pb-3">
        <button
          type="button"
          onClick={() => handleSelectTab('search')}
          className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'search'
              ? 'bg-emerald-600 text-white'
              : 'bg-[#141F2D] text-slate-300 hover:bg-[#1A293B] hover:text-white'
          }`}
        >
          <Globe className="h-3.5 w-3.5" />
          Aktualności (Search)
        </button>

        <button
          type="button"
          onClick={() => handleSelectTab('maps')}
          className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'maps'
              ? 'bg-emerald-600 text-white'
              : 'bg-[#141F2D] text-slate-300 hover:bg-[#1A293B] hover:text-white'
          }`}
        >
          <MapPin className="h-3.5 w-3.5" />
          W pobliżu (Maps)
        </button>

        <button
          type="button"
          onClick={() => handleSelectTab('deep')}
          className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'deep'
              ? 'bg-emerald-600 text-white'
              : 'bg-[#141F2D] text-slate-300 hover:bg-[#1A293B] hover:text-white'
          }`}
        >
          <Brain className="h-3.5 w-3.5" />
          Detektyw AI
        </button>
      </div>

      {/* Content Area */}
      <div className="mt-3 min-h-[112px]">
        {!isOnline ? (
          <div className="flex items-center gap-2.5 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-200">
            <WifiOff className="h-4 w-4 shrink-0" />
            <span>Tryb offline — Eksplorator AI wymaga aktywnego połączenia z internetem.</span>
          </div>
        ) : activeTab === 'search' ? (
          searchState.status === 'idle' ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-xs leading-relaxed text-slate-400">
                Pobierz zweryfikowane informacje z Google Search o historii, architekturze i
                aktualnych wydarzeniach w mieście {outcome.location.name}.
              </p>
              <button
                type="button"
                onClick={() => void loadTab('search', true)}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-2 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/25 whitespace-nowrap shrink-0"
              >
                <Globe className="h-3.5 w-3.5" />
                Odkryj fakty z Google Search
              </button>
            </div>
          ) : searchState.status === 'loading' ? (
            <div className="flex items-center gap-2.5 py-4 text-xs text-slate-300">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
              Przeszukiwanie źródeł Google Search...
            </div>
          ) : searchState.status === 'error' ? (
            <div className="space-y-2.5">
              <p className="text-xs text-rose-300">{searchState.message}</p>
              <button
                type="button"
                onClick={() => void loadTab('search', true)}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-white/10 bg-[#141F2D] px-3 text-xs font-medium text-slate-200 hover:bg-[#1C2C40]"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Spróbuj ponownie
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {renderCleanParagraphs(searchState.data.markdown)}
              {searchState.data.sources.length > 0 && (
                <div className="border-t border-white/10 pt-2.5">
                  <p className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                    Źródła (Google Search)
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {searchState.data.sources.map((src, idx) => (
                      <a
                        key={`${src.uri}_${idx}`}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-[#141F2D] px-2.5 py-1 text-xs text-emerald-300 transition-colors hover:border-emerald-500/40 hover:text-emerald-200"
                      >
                        <span className="max-w-[200px] truncate">{src.title}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        ) : activeTab === 'maps' ? (
          mapsState.status === 'idle' ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-xs leading-relaxed text-slate-400">
                Znajdź polecane zabytki, punkty widokowe i lokalne miejsca w pobliżu tej lokalizacji
                z bezpośrednimi linkami do Google Maps.
              </p>
              <button
                type="button"
                onClick={() => void loadTab('maps', true)}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-2 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/25 whitespace-nowrap shrink-0"
              >
                <MapPin className="h-3.5 w-3.5" />
                Pokaż miejsca w Google Maps
              </button>
            </div>
          ) : mapsState.status === 'loading' ? (
            <div className="flex items-center gap-2.5 py-4 text-xs text-slate-300">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
              Pobieranie pobliskich miejsc z Google Maps...
            </div>
          ) : mapsState.status === 'error' ? (
            <div className="space-y-2.5">
              <p className="text-xs text-rose-300">{mapsState.message}</p>
              <button
                type="button"
                onClick={() => void loadTab('maps', true)}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-white/10 bg-[#141F2D] px-3 text-xs font-medium text-slate-200 hover:bg-[#1C2C40]"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Spróbuj ponownie
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {renderCleanParagraphs(mapsState.data.markdown)}
              {mapsState.data.places.length > 0 && (
                <div className="border-t border-white/10 pt-2.5">
                  <p className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                    Otwórz w Google Maps
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {mapsState.data.places.map((place, idx) => (
                      <a
                        key={`${place.uri}_${idx}`}
                        href={place.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex flex-col justify-between rounded-lg border border-white/10 bg-[#141F2D] p-2.5 transition-colors hover:border-emerald-500/45 hover:bg-[#182637]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-semibold text-emerald-300">
                            {place.title}
                          </span>
                          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                        </div>
                        {place.snippet && (
                          <p className="mt-1 line-clamp-2 text-[11px] text-slate-400">
                            {place.snippet}
                          </p>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        ) : deepState.status === 'idle' ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-xs leading-relaxed text-slate-400">
              Uruchom pogłębioną analizę geograficzno-architektoniczną (High Thinking), aby dowiedzieć
              się, po jakich detalach najszybciej rozpoznać {outcome.location.name}.
            </p>
            <button
              type="button"
              onClick={() => void loadTab('deep', true)}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-2 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/25 whitespace-nowrap shrink-0"
            >
              <Brain className="h-3.5 w-3.5" />
              Uruchom analizę Detektywa AI
            </button>
          </div>
        ) : deepState.status === 'loading' ? (
          <div className="flex items-center gap-2.5 py-4 text-xs text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
            Analiza geograficzna i wskazówki rozpoznawcze...
          </div>
        ) : deepState.status === 'error' ? (
          <div className="space-y-2.5">
            <p className="text-xs text-rose-300">{deepState.message}</p>
            <button
              type="button"
              onClick={() => void loadTab('deep', true)}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-white/10 bg-[#141F2D] px-3 text-xs font-medium text-slate-200 hover:bg-[#1C2C40]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Spróbuj ponownie
            </button>
          </div>
        ) : (
          <div className="space-y-2">{renderCleanParagraphs(deepState.data.markdown)}</div>
        )}
      </div>
    </section>
  );
};
