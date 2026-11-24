import React from 'react';
import {
  Database,
  Lock,
  LogIn,
  LogOut,
  Trophy,
  Volume2,
  VolumeX,
  WifiOff,
} from 'lucide-react';
import type {PlayerIdentity} from '../../domain/types';
import {PWAInstallButton} from '../common/PWAInstallButton';
import {FLAT_BAR_BUTTON, FLAT_ICON_BUTTON} from './titleStyles';

export interface TitleTopBarProps {
  readonly player: PlayerIdentity | null;
  readonly authLoading: boolean;
  readonly isMuted: boolean;
  readonly isOnline: boolean;
  readonly onOpenLeaderboard: (dailyFirst?: boolean) => void;
  readonly onOpenLocationDatabase: () => void;
  readonly onLockLocationDatabase: () => void;
  readonly locationDbUnlocked: boolean;
  readonly onToggleMute: () => void;
  readonly onSignIn: () => void;
  readonly onSignOut: () => void;
}

const BrandWordmark: React.FC = () => (
  <div className="flex items-center gap-2.5 shrink-0">
    <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-[#0C0E12]/70">
      <svg viewBox="0 0 32 32" className="h-5 w-5" fill="none" aria-hidden="true">
        <path
          d="M16 5C11.58 5 8 8.58 8 13C8 18.75 16 27 16 27C16 27 24 18.75 24 13C24 8.58 20.42 5 16 5Z"
          fill="#FFFFFF"
          fillOpacity="0.14"
          stroke="#FFFFFF"
          strokeWidth="1.75"
        />
        <circle cx="16" cy="13" r="2.75" fill="#FFFFFF" />
      </svg>
    </div>
    <span className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap">
      GeoPolska
    </span>
  </div>
);

interface AccountControlProps {
  readonly player: PlayerIdentity | null;
  readonly authLoading: boolean;
  readonly onSignIn: () => void;
  readonly onSignOut: () => void;
}

const AccountControl: React.FC<AccountControlProps> = ({
  player,
  authLoading,
  onSignIn,
  onSignOut,
}) => {
  if (!player) {
    return (
      <button
        type="button"
        onClick={onSignIn}
        disabled={authLoading}
        className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-white/25 bg-[#0C0E12]/70 px-3.5 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:border-white/50 hover:bg-[#0C0E12]/90 disabled:opacity-50 whitespace-nowrap shrink-0"
      >
        <LogIn className="h-3.5 w-3.5" />
        {authLoading ? 'Logowanie...' : 'Zaloguj Google'}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/12 bg-[#0C0E12]/65 py-1 pl-2 pr-1.5">
      {player.photoUrl ? (
        <img
          src={player.photoUrl}
          alt={player.displayName}
          referrerPolicy="no-referrer"
          className="h-7 w-7 rounded-full border border-white/20 object-cover"
        />
      ) : (
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-bold text-[#0C0E12]">
          {player.displayName.charAt(0).toUpperCase()}
        </div>
      )}
      <span className="max-w-[110px] truncate text-xs font-medium text-neutral-100">
        {player.displayName}
      </span>
      <button
        type="button"
        onClick={onSignOut}
        aria-label="Wyloguj się"
        title="Wyloguj się"
        className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
      >
        <LogOut className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

export const TitleTopBar: React.FC<TitleTopBarProps> = ({
  player,
  authLoading,
  isMuted,
  isOnline,
  onOpenLeaderboard,
  onOpenLocationDatabase,
  onLockLocationDatabase,
  locationDbUnlocked,
  onToggleMute,
  onSignIn,
  onSignOut,
}) => (
  <header className="relative z-20 flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-10 sm:py-6">
    <BrandWordmark />

    <div className="flex flex-wrap items-center gap-2">
      {!isOnline && (
        <span className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-amber-500/35 bg-[#0C0E12]/70 px-3 text-xs font-medium text-amber-200 whitespace-nowrap shrink-0">
          <WifiOff className="h-3.5 w-3.5" />
          Tryb offline
        </span>
      )}

      <PWAInstallButton />

      <button
        type="button"
        onClick={() => onOpenLeaderboard(false)}
        className={FLAT_BAR_BUTTON}
      >
        <Trophy className="h-3.5 w-3.5 text-neutral-300" />
        Rankingi
      </button>

      <div className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={onOpenLocationDatabase}
          className={FLAT_BAR_BUTTON}
          title={locationDbUnlocked ? 'Otwórz Bazę Lokacji' : 'Baza Lokacji (wymagany kod)'}
        >
          <Database className="h-3.5 w-3.5 text-neutral-300" />
          Baza Lokacji
          {!locationDbUnlocked && <Lock className="h-3 w-3 text-neutral-400" />}
        </button>

        {locationDbUnlocked && (
          <button
            type="button"
            onClick={onLockLocationDatabase}
            aria-label="Zablokuj Bazę Lokacji"
            title="Zablokuj Bazę Lokacji"
            className="flex h-10 items-center gap-1 rounded-lg border border-amber-500/35 bg-[#0C0E12]/65 px-2.5 text-xs font-medium text-amber-200 transition-colors duration-200 hover:border-amber-400/65 hover:bg-amber-950/40 hover:text-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 whitespace-nowrap shrink-0"
          >
            <Lock className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Zablokuj</span>
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onToggleMute}
        aria-label={isMuted ? 'Włącz dźwięk' : 'Wycisz dźwięk'}
        className={FLAT_ICON_BUTTON}
      >
        {isMuted ? (
          <VolumeX className="h-4 w-4 text-neutral-400" />
        ) : (
          <Volume2 className="h-4 w-4 text-neutral-100" />
        )}
      </button>

      <AccountControl
        player={player}
        authLoading={authLoading}
        onSignIn={onSignIn}
        onSignOut={onSignOut}
      />
    </div>
  </header>
);
