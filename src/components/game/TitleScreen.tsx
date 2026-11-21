import React, {useMemo} from 'react';
import {formatPolishDateKey} from '../../domain/dailyChallenge';
import {calculateMaxGamePoints} from '../../domain/geoScoring';
import {buildLocationPoolOptions} from '../../domain/polandLocations';
import {buildTitleBackdropSlides} from '../../domain/titleBackdropSlides';
import type {
  LocalDailyCompletion,
  LocationPoolFilter,
  PlayerIdentity,
  PolandLocation,
  RoundCountOption,
} from '../../domain/types';
import {PhotoBackdropSlideshow} from './PhotoBackdropSlideshow';
import {TitleMenuCard} from './TitleMenuCard';
import {TitleTopBar} from './TitleTopBar';

export interface TitleScreenProps {
  readonly timedMode: boolean;
  readonly onSetTimedMode: (timed: boolean) => void;
  readonly poolFilter: LocationPoolFilter;
  readonly onSetPoolFilter: (pool: LocationPoolFilter) => void;
  readonly selectedRoundCount: RoundCountOption;
  readonly onSetRoundCount: (count: RoundCountOption) => void;
  readonly dailyDateKey: string;
  readonly dailyCompletion: LocalDailyCompletion | null;
  readonly onStartGame: () => void;
  readonly onStartDailyChallenge: () => void;
  readonly onOpenLeaderboard: (dailyFirst?: boolean) => void;
  readonly onOpenLocationDatabase: () => void;
  readonly locations: readonly PolandLocation[];
  readonly player: PlayerIdentity | null;
  readonly authLoading: boolean;
  readonly onSignIn: () => void;
  readonly onSignOut: () => void;
  readonly isMuted: boolean;
  readonly onToggleMute: () => void;
  readonly isOnline: boolean;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  timedMode,
  onSetTimedMode,
  poolFilter,
  onSetPoolFilter,
  selectedRoundCount,
  onSetRoundCount,
  dailyDateKey,
  dailyCompletion,
  onStartGame,
  onStartDailyChallenge,
  onOpenLeaderboard,
  onOpenLocationDatabase,
  locations,
  player,
  authLoading,
  onSignIn,
  onSignOut,
  isMuted,
  onToggleMute,
  isOnline,
}) => {
  const poolOptions = useMemo(() => buildLocationPoolOptions(locations), [locations]);
  const backdropSlides = useMemo(() => buildTitleBackdropSlides(locations), [locations]);
  const maxGamePoints = calculateMaxGamePoints(selectedRoundCount);
  const dailyDateLabel = formatPolishDateKey(dailyDateKey);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#0C0E12] text-neutral-100">
      <PhotoBackdropSlideshow slides={backdropSlides} intervalMs={9000} />

      <TitleTopBar
        player={player}
        authLoading={authLoading}
        isMuted={isMuted}
        isOnline={isOnline}
        onOpenLeaderboard={onOpenLeaderboard}
        onOpenLocationDatabase={onOpenLocationDatabase}
        onToggleMute={onToggleMute}
        onSignIn={onSignIn}
        onSignOut={onSignOut}
      />

      <main className="relative z-10 flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-5 pt-2 pb-14 sm:px-10 lg:justify-start lg:pb-10">
        <TitleMenuCard
          timedMode={timedMode}
          onSetTimedMode={onSetTimedMode}
          poolFilter={poolFilter}
          onSetPoolFilter={onSetPoolFilter}
          poolOptions={poolOptions}
          selectedRoundCount={selectedRoundCount}
          onSetRoundCount={onSetRoundCount}
          totalLocationsCount={locations.length}
          maxGamePoints={maxGamePoints}
          dailyDateLabel={dailyDateLabel}
          dailyCompletion={dailyCompletion}
          isOnline={isOnline}
          onStartGame={onStartGame}
          onStartDailyChallenge={onStartDailyChallenge}
        />
      </main>
    </div>
  );
};
