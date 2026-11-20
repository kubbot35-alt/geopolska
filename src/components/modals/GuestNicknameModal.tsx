import React, {useEffect, useRef, useState} from 'react';
import {Calendar, Loader2, LogIn, Trophy, UserCheck, X} from 'lucide-react';
import {formatPolishDateKey} from '../../domain/dailyChallenge';
import {
  formatDistanceKm,
  normalizeScoreToStandard5Rounds,
} from '../../domain/geoScoring';
import {
  GUEST_NICKNAME_MAX_LENGTH,
  GUEST_NICKNAME_MIN_LENGTH,
  validateGuestNickname,
} from '../../domain/rankings';
import type {GameMode, RoundCountOption} from '../../domain/types';

export interface GuestNicknameModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly gameMode: GameMode;
  readonly dailyDateKey: string | null;
  readonly totalScore: number;
  readonly roundsCount: RoundCountOption;
  readonly averageDistanceKm: number;
  readonly timedMode: boolean;
  readonly initialNickname: string;
  readonly submitting: boolean;
  readonly error: string | null;
  readonly onSubmitGuestNickname: (nickname: string) => Promise<void>;
  readonly onSignInWithGoogle: () => void;
}

/**
 * Post-game dialog prompting unauthenticated players to enter a nickname
 * so their match score is persisted to the unified Firebase rankings table.
 */
export const GuestNicknameModal: React.FC<GuestNicknameModalProps> = ({
  open,
  onClose,
  gameMode,
  dailyDateKey,
  totalScore,
  roundsCount,
  averageDistanceKm,
  timedMode,
  initialNickname,
  submitting,
  error,
  onSubmitGuestNickname,
  onSignInWithGoogle,
}) => {
  const [nickname, setNickname] = useState(initialNickname);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setNickname(initialNickname);
    setLocalError(null);
    const frameId = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [open, initialNickname]);

  if (!open) {
    return null;
  }

  const isDaily = gameMode === 'daily' && dailyDateKey !== null;
  const normalizedScore = isDaily
    ? totalScore
    : normalizeScoreToStandard5Rounds(totalScore, roundsCount);
  const showNormalizedNote = !isDaily && roundsCount !== 5;
  const activeError = localError ?? error;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) {
      return;
    }
    const validation = validateGuestNickname(nickname);
    if (!validation.ok) {
      setLocalError(validation.error);
      return;
    }
    setLocalError(null);
    void onSubmitGuestNickname(validation.value);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
      onClick={() => {
        if (!submitting) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-nickname-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#101822] text-slate-100 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <p
              className={`flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.16em] uppercase ${
                isDaily ? 'text-amber-300' : 'text-emerald-400'
              }`}
            >
              {isDaily ? (
                <>
                  <Calendar className="h-3.5 w-3.5 shrink-0" />
                  <span>Wyzwanie Dnia · {formatPolishDateKey(dailyDateKey)}</span>
                </>
              ) : (
                <>
                  <Trophy className="h-3.5 w-3.5 shrink-0" />
                  <span>Zapis do rankingu</span>
                </>
              )}
            </p>
            <h2
              id="guest-nickname-modal-title"
              className="mt-1 font-display text-xl font-bold text-white"
            >
              Podaj swój nick do rankingu
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Zamknij okno"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Score Summary Strip */}
        <div className="border-b border-white/10 bg-[#0C131D] px-5 py-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="text-xs text-slate-400">
                {isDaily ? 'Twój wynik dnia' : 'Wynik do rankingu'}
              </p>
              <p
                className={`mt-0.5 font-mono text-2xl font-bold tabular-nums ${
                  isDaily ? 'text-amber-300' : 'text-emerald-400'
                }`}
              >
                {normalizedScore.toLocaleString('pl-PL')} pkt
              </p>
            </div>
            <div className="text-right text-xs text-slate-400">
              <p className="font-mono text-slate-200 tabular-nums">
                śr. błąd {formatDistanceKm(averageDistanceKm)}
              </p>
              <p className="mt-0.5">
                {roundsCount} {roundsCount === 3 ? 'rundy' : 'rund'}
                {timedMode ? ' · 60 s' : ''}
              </p>
            </div>
          </div>

          {showNormalizedNote && (
            <p className="mt-2 text-xs text-slate-400">
              Przeliczono z {totalScore.toLocaleString('pl-PL')} pkt ({roundsCount} rund) na skalę
              5 rund dla rankingu globalnego.
            </p>
          )}
          {isDaily && (
            <p className="mt-2 text-xs text-slate-400">
              W Wyzwaniu Dnia zapisywana jest pierwsza oficjalna próba z tej przeglądarki.
            </p>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="guest-nickname-input"
                className="text-xs font-semibold tracking-wide text-slate-200 uppercase"
              >
                Nick gracza
              </label>
              <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                {nickname.trim().length}/{GUEST_NICKNAME_MAX_LENGTH}
              </span>
            </div>

            <input
              ref={inputRef}
              id="guest-nickname-input"
              type="text"
              value={nickname}
              onChange={(e) => {
                setNickname(e.target.value);
                if (localError) {
                  setLocalError(null);
                }
              }}
              maxLength={GUEST_NICKNAME_MAX_LENGTH}
              minLength={GUEST_NICKNAME_MIN_LENGTH}
              autoComplete="nickname"
              disabled={submitting}
              placeholder="np. Janek_PL, Kartograf99"
              className="mt-2 w-full min-h-[44px] rounded-xl border border-white/15 bg-[#090E14] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/25 disabled:opacity-60"
            />

            <p className="mt-1.5 text-xs text-slate-400">
              Zapamiętamy ten nick na tym urządzeniu przy kolejnych partiach.
            </p>

            {activeError && (
              <p
                role="alert"
                className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200"
              >
                {activeError}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2.5 pt-1">
            <button
              type="submit"
              disabled={submitting || nickname.trim().length < GUEST_NICKNAME_MIN_LENGTH}
              className={`inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-display text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                isDaily
                  ? 'bg-amber-400 text-[#090E14] hover:bg-amber-300'
                  : 'bg-emerald-500 text-[#05120D] hover:bg-emerald-400'
              }`}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Zapisywanie wyniku...
                </>
              ) : (
                <>
                  <UserCheck className="h-4 w-4" />
                  Zapisz wynik w rankingu
                </>
              )}
            </button>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={submitting}
                onClick={onSignInWithGoogle}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-[#0C131D] px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:border-emerald-400/40 hover:text-white disabled:opacity-50"
              >
                <LogIn className="h-3.5 w-3.5 text-emerald-400" />
                Zaloguj Google
              </button>

              <button
                type="button"
                disabled={submitting}
                onClick={onClose}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-white/10 bg-transparent px-3 py-2 text-xs font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200 disabled:opacity-50"
              >
                Pomiń
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
