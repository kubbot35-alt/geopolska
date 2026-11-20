import React, {useEffect, useMemo, useState} from 'react';
import {Calendar, Clock, History, Loader2, LogIn, Medal, Trophy, X} from 'lucide-react';
import {formatPolishDateKey, getWarsawDateKey} from '../../domain/dailyChallenge';
import {formatDistanceKm} from '../../domain/geoScoring';
import {filterUnifiedRankings} from '../../domain/rankings';
import type {
  IGamePersistenceRepository,
  PlayerIdentity,
  RankingPlayerFilter,
  StoredGameSummary,
  UnifiedRankingEntry,
} from '../../domain/types';

export type LeaderboardModalTab = 'daily' | 'leaderboard' | 'history';

export interface LeaderboardHistoryModalProps {
  readonly open: boolean;
  readonly initialTab?: LeaderboardModalTab;
  readonly onClose: () => void;
  readonly repository: IGamePersistenceRepository;
  readonly player: PlayerIdentity | null;
  readonly guestClientId: string;
  readonly onSignIn: () => void;
}

function formatPolishDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export const LeaderboardHistoryModal: React.FC<LeaderboardHistoryModalProps> = ({
  open,
  initialTab = 'daily',
  onClose,
  repository,
  player,
  guestClientId,
  onSignIn,
}) => {
  const [tab, setTab] = useState<LeaderboardModalTab>(initialTab);
  const [playerFilter, setPlayerFilter] = useState<RankingPlayerFilter>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dailyEntries, setDailyEntries] = useState<readonly UnifiedRankingEntry[]>([]);
  const [standardEntries, setStandardEntries] = useState<readonly UnifiedRankingEntry[]>([]);
  const [history, setHistory] = useState<readonly StoredGameSummary[]>([]);

  const todayDateKey = getWarsawDateKey();
  const todayLabel = formatPolishDateKey(todayDateKey);

  useEffect(() => {
    if (open) {
      setTab(initialTab);
    }
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      if (tab === 'daily') {
        const res = await repository.fetchUnifiedRankings('daily', todayDateKey, 60);
        if (cancelled) return;
        if (res.ok) {
          setDailyEntries(res.value);
        } else {
          setError(res.error);
        }
      } else if (tab === 'leaderboard') {
        const res = await repository.fetchUnifiedRankings('standard', null, 60);
        if (cancelled) return;
        if (res.ok) {
          setStandardEntries(res.value);
        } else {
          setError(res.error);
        }
      } else if (player) {
        const res = await repository.fetchPlayerHistory(player.uid, 20);
        if (cancelled) return;
        if (res.ok) {
          setHistory(res.value);
        } else {
          setError(res.error);
        }
      }
      if (!cancelled) {
        setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [open, tab, player, repository, todayDateKey]);

  const activeRankingSource = tab === 'daily' ? dailyEntries : standardEntries;

  const filterCounts = useMemo(() => {
    let guests = 0;
    let authenticated = 0;
    for (const entry of activeRankingSource) {
      if (entry.playerType === 'guest') {
        guests += 1;
      } else {
        authenticated += 1;
      }
    }
    return {
      all: activeRankingSource.length,
      guest: guests,
      authenticated,
    };
  }, [activeRankingSource]);

  const filteredEntries = useMemo(
    () => filterUnifiedRankings(activeRankingSource, playerFilter),
    [activeRankingSource, playerFilter],
  );

  if (!open) {
    return null;
  }

  const isDailyTab = tab === 'daily';

  const isCurrentActor = (entry: UnifiedRankingEntry): boolean => {
    if (entry.playerType === 'authenticated' && player) {
      return player.uid === entry.actorId;
    }
    if (entry.playerType === 'guest' && !player) {
      return guestClientId === entry.actorId;
    }
    return false;
  };

  const renderEmptyRankingMessage = (): string => {
    if (playerFilter === 'guest') {
      return isDailyTab
        ? 'Brak jeszcze wyników gości w dzisiejszym Wyzwaniu Dnia. Zagraj bez logowania i podaj swój nick na końcu partii!'
        : 'Brak jeszcze wyników gości w rankingu globalnym. Ukończ grę bez logowania i wpisz swój nick, aby trafić na listę!';
    }
    if (playerFilter === 'authenticated') {
      return isDailyTab
        ? 'Brak jeszcze wyników zalogowanych graczy w dzisiejszym Wyzwaniu Dnia.'
        : 'Brak jeszcze wyników zalogowanych graczy w rankingu globalnym.';
    }
    return isDailyTab
      ? 'Nikt jeszcze nie ukończył dzisiejszego Wyzwania Dnia. Bądź pierwszą osobą na liście!'
      : 'Brak zapisanych wyników w rankingu. Rozegraj pierwszą partię jako Gość lub po zalogowaniu Google!';
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Rankingi i historia gier"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#101822] text-slate-100 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Trophy className="h-5 w-5 text-emerald-400" />
            <h2 className="font-display text-lg font-bold text-white">
              Rankingi i Historia Gier
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij okno"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#0C131D] px-5 py-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTab('daily')}
              className={`inline-flex min-h-[40px] items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                tab === 'daily'
                  ? 'bg-amber-400 text-[#090E14]'
                  : 'bg-[#141F2D] text-slate-300 hover:text-white'
              }`}
            >
              <Calendar className="h-4 w-4" />
              Wyzwanie Dnia
            </button>
            <button
              type="button"
              onClick={() => setTab('leaderboard')}
              className={`inline-flex min-h-[40px] items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                tab === 'leaderboard'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-[#141F2D] text-slate-300 hover:text-white'
              }`}
            >
              <Medal className="h-4 w-4" />
              Ranking globalny
            </button>
            <button
              type="button"
              onClick={() => setTab('history')}
              className={`inline-flex min-h-[40px] items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                tab === 'history'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-[#141F2D] text-slate-300 hover:text-white'
              }`}
            >
              <History className="h-4 w-4" />
              Twoja historia gier
            </button>
          </div>

          {/* Account Type Segmented Filter (Wszyscy / Goście / Zalogowani) */}
          {tab !== 'history' && (
            <div
              role="group"
              aria-label="Filtruj według typu gracza"
              className="inline-flex items-center rounded-lg border border-white/10 bg-[#090E14] p-1"
            >
              {(
                [
                  {id: 'all', label: 'Wszyscy', count: filterCounts.all},
                  {id: 'guest', label: 'Goście', count: filterCounts.guest},
                  {id: 'authenticated', label: 'Zalogowani', count: filterCounts.authenticated},
                ] as const
              ).map((option) => {
                const active = playerFilter === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPlayerFilter(option.id)}
                    className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                      active
                        ? isDailyTab
                          ? 'bg-amber-400/20 text-amber-200'
                          : 'bg-emerald-500/20 text-emerald-300'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>{option.label}</span>
                    <span className="font-mono text-[11px] opacity-75 tabular-nums">
                      {option.count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'history' && !player ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <History className="h-10 w-10 text-emerald-400" />
              <h3 className="mt-3 font-display text-lg font-semibold text-white">
                Zaloguj się, aby zobaczyć historię swoich gier
              </h3>
              <p className="mt-1 max-w-md text-sm text-slate-400">
                Po zalogowaniu kontem Google Twoje partie, rekordy i wyniki Wyzwania Dnia
                synchronizują się automatycznie między urządzeniami.
              </p>
              <button
                type="button"
                onClick={onSignIn}
                className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-[#05120D] hover:bg-emerald-400 whitespace-nowrap"
              >
                <LogIn className="h-4 w-4" />
                Zaloguj przez Google
              </button>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center gap-2.5 py-12 text-sm text-slate-300">
              <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
              Ładowanie rankingu z bazy Firebase...
            </div>
          ) : error ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
              {error}
            </div>
          ) : tab !== 'history' ? (
            <div className="space-y-2.5">
              {isDailyTab ? (
                <div className="flex flex-wrap items-center justify-between gap-2 pb-1 text-xs text-slate-400">
                  <span>
                    Oficjalny ranking dnia: <strong className="text-amber-300">{todayLabel}</strong>
                  </span>
                  <span>5 wspólnych miejsc · liczy się pierwsza próba</span>
                </div>
              ) : (
                <p className="pb-1 text-xs text-slate-400">
                  Wyniki w rankingu globalnym są przeliczane na wspólną skalę 5 rund (maks. 25 000 pkt),
                  dzięki czemu gry 3-, 5-, 10-, 15- i 20-rundowe są uczciwie porównywalne.
                </p>
              )}

              {filteredEntries.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">
                  {renderEmptyRankingMessage()}
                </p>
              ) : (
                filteredEntries.map((entry, index) => {
                  const isCurrentUser = isCurrentActor(entry);
                  const accountLabel = entry.playerType === 'guest' ? 'Gość' : 'Google';
                  const rowHighlight = isCurrentUser
                    ? isDailyTab
                      ? 'border-amber-400/50 bg-amber-950/25'
                      : 'border-emerald-500/45 bg-emerald-950/35'
                    : 'border-white/5 bg-[#0C131D]';

                  return (
                    <div
                      key={entry.id}
                      className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${rowHighlight}`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-mono text-xs font-bold tabular-nums ${
                            index === 0
                              ? 'bg-amber-400 text-[#090E14]'
                              : index === 1
                                ? 'bg-slate-300 text-[#090E14]'
                                : index === 2
                                  ? 'bg-amber-700 text-white'
                                  : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {index + 1}
                        </span>

                        {entry.photoUrl ? (
                          <img
                            src={entry.photoUrl}
                            alt={entry.playerName}
                            referrerPolicy="no-referrer"
                            className="h-8 w-8 shrink-0 rounded-full object-cover"
                          />
                        ) : (
                          <div
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold ${
                              entry.playerType === 'guest'
                                ? 'text-slate-200'
                                : isDailyTab
                                  ? 'text-amber-300'
                                  : 'text-emerald-300'
                            }`}
                          >
                            {entry.playerName.charAt(0).toUpperCase()}
                          </div>
                        )}

                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white">
                            {entry.playerName}
                            {isCurrentUser && (
                              <span
                                className={`ml-2 text-xs font-normal ${
                                  isDailyTab ? 'text-amber-300' : 'text-emerald-400'
                                }`}
                              >
                                (Ty)
                              </span>
                            )}
                          </p>
                          <p className="truncate text-xs text-slate-400">
                            <span
                              className={
                                entry.playerType === 'guest'
                                  ? 'text-slate-300'
                                  : 'text-emerald-300/90'
                              }
                            >
                              {accountLabel}
                            </span>
                            {!isDailyTab && <> · Gier: {entry.gamesPlayed}</>}
                            {' · '}śr. błąd {formatDistanceKm(entry.averageDistanceKm)}
                            {entry.timedMode ? ' · 60 s' : ''}
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <p
                          className={`font-mono text-base font-bold tabular-nums ${
                            isDailyTab ? 'text-amber-300' : 'text-emerald-400'
                          }`}
                        >
                          {entry.bestScore.toLocaleString('pl-PL')} pkt
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : history.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">
              Nie masz jeszcze zapisanych gier na tym koncie. Ukończ pierwszą rozgrywkę, aby zapisać wynik!
            </p>
          ) : (
            <div className="space-y-3">
              {history.map((game) => (
                <div
                  key={game.id}
                  className="rounded-xl border border-white/10 bg-[#0C131D] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span>{formatPolishDate(game.createdAtIso)}</span>
                      <span className="font-mono text-slate-300 tabular-nums">
                        · {game.roundsCount} {game.roundsCount === 3 ? 'rundy' : 'rund'}
                      </span>
                      {game.timedMode && (
                        <span className="inline-flex items-center gap-1 text-amber-300">
                          <Clock className="h-3 w-3" />
                          60 s
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-3">
                      <span className="font-mono text-xs text-slate-400 tabular-nums">
                        śr. {formatDistanceKm(game.averageDistanceKm)}
                      </span>
                      <span className="font-mono text-base font-bold text-emerald-400 tabular-nums">
                        {game.totalScore.toLocaleString('pl-PL')} pkt
                      </span>
                    </div>
                  </div>
                  {game.roundLocations.length > 0 && (
                    <p className="mt-2 text-xs text-slate-300">
                      {game.roundLocations.join(' · ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

