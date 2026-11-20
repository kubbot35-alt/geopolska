import React from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  CloudOff,
  Compass,
  Home,
  Loader2,
  LogIn,
  RotateCcw,
  Trophy,
  UserCheck,
} from 'lucide-react';
import {formatPolishDateKey} from '../../domain/dailyChallenge';
import {
  MAX_ROUND_POINTS,
  calculateMaxGamePoints,
  formatDistanceKm,
} from '../../domain/geoScoring';
import type {
  GameMode,
  GameSyncStatus,
  MapStyleOption,
  PlayerIdentity,
  RoundOutcome,
} from '../../domain/types';
import {PolandGoogleMap} from '../map/PolandGoogleMap';

export interface SummaryScreenProps {
  readonly gameMode: GameMode;
  readonly dailyDateKey: string | null;
  readonly completedRounds: readonly RoundOutcome[];
  readonly totalScore: number;
  readonly averageDistanceKm: number;
  readonly timedMode: boolean;
  readonly syncStatus: GameSyncStatus;
  readonly syncMessage: string | null;
  readonly mapStyle: MapStyleOption;
  readonly onChangeMapStyle: (style: MapStyleOption) => void;
  readonly player: PlayerIdentity | null;
  readonly guestSavedNickname: string | null;
  readonly onPlayAgain: () => void;
  readonly onReturnToMenu: () => void;
  readonly onOpenLeaderboard: (dailyFirst?: boolean) => void;
  readonly onOpenGuestNicknameModal: () => void;
  readonly onSignIn: () => void;
}

function getExplorerRank(scorePct: number): {readonly title: string; readonly subtitle: string} {
  if (scorePct >= 90) {
    return {title: 'Mistrz Kartografii Polski', subtitle: 'Niezwykła precyzja w skali całego kraju.'};
  }
  if (scorePct >= 72) {
    return {title: 'Doświadczony Podróżnik', subtitle: 'Świetna orientacja w regionach i architekturze.'};
  }
  if (scorePct >= 48) {
    return {title: 'Odkrywca Szlaków', subtitle: 'Solidna znajomość mapy i charakterystycznych punktów.'};
  }
  return {title: 'Początkujący Nawigator', subtitle: 'Każda kolejna wyprawa przybliża do perfekcji.'};
}

export const SummaryScreen: React.FC<SummaryScreenProps> = ({
  gameMode,
  dailyDateKey,
  completedRounds,
  totalScore,
  averageDistanceKm,
  timedMode,
  syncStatus,
  syncMessage,
  mapStyle,
  onChangeMapStyle,
  player,
  guestSavedNickname,
  onPlayAgain,
  onReturnToMenu,
  onOpenLeaderboard,
  onOpenGuestNicknameModal,
  onSignIn,
}) => {
  const roundsCount = completedRounds.length;
  const maxGamePoints = calculateMaxGamePoints(roundsCount);
  const scorePct = Math.max(0, Math.min(100, (totalScore / maxGamePoints) * 100));
  const rank = getExplorerRank(scorePct);
  const isDaily = gameMode === 'daily' && dailyDateKey !== null;

  return (
    <div className="min-h-full w-full overflow-y-auto bg-[#090E14] px-4 py-6 text-slate-100 sm:px-6 sm:py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        {/* Top Header */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-emerald-400 uppercase">
              {isDaily ? (
                <>
                  <Calendar className="h-3.5 w-3.5 text-amber-300" />
                  <span className="text-amber-300">
                    Wyzwanie Dnia · {formatPolishDateKey(dailyDateKey)}
                  </span>
                </>
              ) : (
                <span>Podsumowanie wyprawy · {timedMode ? 'Tryb 60 s' : 'Tryb swobodny'}</span>
              )}
            </p>
            <h1 className="mt-1 font-display text-3xl font-bold text-white sm:text-4xl">
              {rank.title}
            </h1>
            <p className="mt-1 text-sm text-slate-400">{rank.subtitle}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onReturnToMenu}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/10 bg-[#101822] px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:border-white/20 hover:text-white whitespace-nowrap shrink-0"
            >
              <Home className="h-4 w-4" />
              Menu
            </button>
            <button
              type="button"
              onClick={() => onOpenLeaderboard(isDaily)}
              className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                isDaily
                  ? 'border-amber-400/45 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25'
                  : 'border-white/10 bg-[#101822] text-slate-200 hover:border-emerald-500/40 hover:text-white'
              }`}
            >
              <Trophy className={`h-4 w-4 ${isDaily ? 'text-amber-300' : 'text-emerald-400'}`} />
              {isDaily ? 'Ranking Dnia' : 'Ranking globalny'}
            </button>
            <button
              type="button"
              onClick={onPlayAgain}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 font-display text-sm font-bold text-[#05120D] shadow-lg transition-colors hover:bg-emerald-400 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-4 w-4" />
              Nowa gra
            </button>
          </div>
        </header>

        {/* Main Score + Full-Poland Summary Map */}
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Score & Sync Panel */}
          <div className="flex flex-col justify-between gap-5 rounded-2xl border border-white/10 bg-[#101822] p-6 lg:col-span-5">
            <div>
              <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
                Łączny wynik
              </p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-mono text-5xl font-bold text-emerald-400 tabular-nums">
                  {totalScore.toLocaleString('pl-PL')}
                </span>
                <span className="font-mono text-base text-slate-400 tabular-nums">
                  / {maxGamePoints.toLocaleString('pl-PL')} pkt
                </span>
              </div>

              <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-700"
                  style={{width: `${scorePct}%`}}
                />
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/10 bg-[#0B121A] p-3.5">
                  <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 uppercase">
                    <Compass className="h-3.5 w-3.5 text-emerald-400" />
                    Średni błąd
                  </p>
                  <p className="mt-1 font-mono text-xl font-bold text-white tabular-nums">
                    {formatDistanceKm(averageDistanceKm)}
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-[#0B121A] p-3.5">
                  <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 uppercase">
                    <Clock className="h-3.5 w-3.5 text-emerald-400" />
                    Rundy
                  </p>
                  <p className="mt-1 font-mono text-xl font-bold text-white tabular-nums">
                    {roundsCount} / {roundsCount}
                  </p>
                </div>
              </div>
            </div>

            {/* Cloud / Offline Sync Status */}
            <div className="rounded-xl border border-white/10 bg-[#0B121A] p-4 text-xs">
              {syncStatus === 'saving' && (
                <div className="flex items-center gap-2 text-slate-300">
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                  Zapisywanie wyniku w rankingu Firebase...
                </div>
              )}
              {syncStatus === 'saved' && (
                <div className="flex items-center gap-2 text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {player ? (
                    <span>
                      Wynik zapisany na koncie <strong>{player.displayName}</strong>
                      {isDaily
                        ? ' oraz w oficjalnym Rankingu Dnia (pierwsza próba).'
                        : ' i zaktualizowany w rankingu globalnym.'}
                    </span>
                  ) : syncMessage ? (
                    <span>{syncMessage}</span>
                  ) : (
                    <span>
                      Wynik zapisany jako Gość:{' '}
                      <strong>{guestSavedNickname || 'Gość'}</strong>
                      {isDaily
                        ? ' w oficjalnym Rankingu Dnia.'
                        : ' w rankingu globalnym.'}
                    </span>
                  )}
                </div>
              )}
              {syncStatus === 'offline_queued' && (
                <div className="flex items-center gap-2 text-amber-200">
                  <CloudOff className="h-4 w-4 shrink-0 text-amber-400" />
                  <span>
                    Brak sieci — wynik
                    {!player && guestSavedNickname ? ` (${guestSavedNickname})` : ''} zapisano w
                    kolejce IndexedDB i zostanie automatycznie zsynchronizowany po powrocie online.
                  </span>
                </div>
              )}
              {syncStatus === 'guest' && (
                <div className="flex flex-col gap-3">
                  <span className="text-slate-300">
                    Zapisz wynik w tabeli Rankingi pod własnym nickiem jako Gość lub zaloguj się
                    kontem Google.
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={onOpenGuestNicknameModal}
                      className={`inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold whitespace-nowrap shrink-0 ${
                        isDaily
                          ? 'bg-amber-400 text-[#090E14] hover:bg-amber-300'
                          : 'bg-emerald-500 text-[#05120D] hover:bg-emerald-400'
                      }`}
                    >
                      <UserCheck className="h-3.5 w-3.5" />
                      Podaj nick i zapisz
                    </button>
                    <button
                      type="button"
                      onClick={onSignIn}
                      className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-[#101822] px-3.5 py-2 text-xs font-semibold text-slate-200 hover:border-emerald-400/40 hover:text-white whitespace-nowrap shrink-0"
                    >
                      <LogIn className="h-3.5 w-3.5 text-emerald-400" />
                      Zaloguj Google
                    </button>
                  </div>
                </div>
              )}
              {syncStatus === 'error' && (
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-rose-300">
                    {syncMessage || 'Nie udało się zsynchronizować wyniku z chmurą.'}
                  </p>
                  {!player && (
                    <button
                      type="button"
                      onClick={onOpenGuestNicknameModal}
                      className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-[#101822] px-3 py-1.5 text-xs font-semibold text-white hover:border-emerald-400/40 whitespace-nowrap shrink-0"
                    >
                      Spróbuj ponownie
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Full-Poland Summary Map */}
          <div className="h-[340px] overflow-hidden rounded-2xl border border-white/10 shadow-2xl sm:h-[400px] lg:col-span-7">
            <PolandGoogleMap
              mapStyle={mapStyle}
              onChangeMapStyle={onChangeMapStyle}
              mode={{kind: 'summary', rounds: completedRounds}}
            />
          </div>
        </div>

        {/* Dynamic Round Breakdown Table */}
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#101822]">
          <div className="border-b border-white/10 px-5 py-4">
            <h2 className="font-display text-lg font-semibold text-white">
              Szczegóły wszystkich {roundsCount} rund
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-[#0C131D] text-xs font-semibold tracking-wider text-slate-400 uppercase">
                  <th className="px-5 py-3">Runda</th>
                  <th className="px-5 py-3">Lokalizacja</th>
                  <th className="px-5 py-3">Województwo</th>
                  <th className="px-5 py-3 text-right">Odległość</th>
                  <th className="px-5 py-3 text-right">Podpowiedzi</th>
                  <th className="px-5 py-3 text-right">Punkty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {completedRounds.map((round) => (
                  <tr key={`${round.roundNumber}_${round.location.id}`} className="hover:bg-white/[0.02]">
                    <td className="px-5 py-3.5 font-mono text-xs font-bold text-slate-400">
                      #{round.roundNumber}
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-white">{round.location.name}</td>
                    <td className="px-5 py-3.5 text-slate-300">{round.location.voivodeship}</td>
                    <td className="px-5 py-3.5 text-right font-mono text-slate-200 tabular-nums">
                      {round.guess ? formatDistanceKm(round.distanceKm) : 'Brak strzału'}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs text-amber-300 tabular-nums">
                      {round.scoreBreakdown.hintPenalty > 0
                        ? `−${round.scoreBreakdown.hintPenalty}`
                        : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono font-bold text-emerald-400 tabular-nums">
                      {round.scoreBreakdown.finalScore.toLocaleString('pl-PL')}
                      <span className="ml-1 text-xs font-normal text-slate-500">
                        /{MAX_ROUND_POINTS}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};
