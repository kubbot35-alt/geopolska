import {useCallback, useEffect, useReducer, useRef, useState} from 'react';
import {onAuthStateChanged} from 'firebase/auth';
import {GameHud} from './components/game/GameHud';
import {HintPanel} from './components/game/HintPanel';
import {PlayingMapDock} from './components/game/PlayingMapDock';
import {RoundResultOverlay} from './components/game/RoundResultOverlay';
import {SummaryScreen} from './components/game/SummaryScreen';
import {TitleScreen} from './components/game/TitleScreen';
import {ZoomPanPhotoViewer} from './components/game/ZoomPanPhotoViewer';
import {ChallengeGeneratorModal} from './components/modals/ChallengeGeneratorModal';
import {
  LeaderboardHistoryModal,
  type LeaderboardModalTab,
} from './components/modals/LeaderboardHistoryModal';
import {LocationDatabaseModal} from './components/modals/LocationDatabaseModal';
import {VideoStudioModal} from './components/modals/VideoStudioModal';
import {
  DAILY_CHALLENGE_ROUNDS,
  drawDailyChallengeDeck,
  getWarsawDateKey,
} from './domain/dailyChallenge';
import {
  createInitialGameState,
  drawFallbackLocation,
  drawUniqueLocations,
  gameReducer,
} from './domain/gameMachine';
import {POLAND_LOCATIONS, getLocationsForPool} from './domain/polandLocations';
import type {
  ChallengeRoundCountOption,
  GeoCoordinate,
  LocalDailyCompletion,
  LocationCatalogState,
  MapStyleOption,
  PlayerIdentity,
  PolandLocation,
} from './domain/types';
import {useOnlineStatus} from './hooks/usePWAInstall';
import {aiExplorerGateway} from './infrastructure/ai/aiExplorerGateway';
import {soundEngine} from './infrastructure/audio/webAudioSoundEngine';
import {
  auth,
  signInWithGooglePopup,
  signOutCurrentUser,
} from './infrastructure/firebase/firebaseClient';
import {gameRepository} from './infrastructure/firebase/firestoreGameRepository';
import {locationRepository} from './infrastructure/firebase/firestoreLocationRepository';
import {
  readLocalDailyCompletion,
  writeLocalDailyCompletion,
} from './infrastructure/storage/dailyLocalCache';

export default function App() {
  const [state, dispatch] = useReducer(gameReducer, undefined, () => createInitialGameState(false));
  const [player, setPlayer] = useState<PlayerIdentity | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [isMuted, setIsMuted] = useState<boolean>(() => soundEngine.isMuted());
  const [mapStyle, setMapStyle] = useState<MapStyleOption>('dark');

  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [leaderboardTab, setLeaderboardTab] = useState<LeaderboardModalTab>('daily');
  const [challengeCreatorOpen, setChallengeCreatorOpen] = useState(false);
  const [locationDbOpen, setLocationDbOpen] = useState(false);
  const [videoStudioOpen, setVideoStudioOpen] = useState(false);
  const [videoStudioLocation, setVideoStudioLocation] = useState<PolandLocation | null>(null);

  const [locationsCatalog, setLocationsCatalog] = useState<readonly PolandLocation[]>(POLAND_LOCATIONS);
  const [catalogState, setCatalogState] = useState<LocationCatalogState>({status: 'loading'});

  const todayDateKey = getWarsawDateKey();
  const [dailyCompletion, setDailyCompletion] = useState<LocalDailyCompletion | null>(() =>
    readLocalDailyCompletion(todayDateKey),
  );

  const isOnline = useOnlineStatus();
  const savedSummaryKeyRef = useRef<string | null>(null);
  const prevPhaseStatusRef = useRef<string>(state.status);

  const syncLocationsFromCloud = useCallback(
    async (forceRefresh = false, signal?: AbortSignal) => {
      const res = await locationRepository.loadCatalog({forceRefresh, signal});
      if (signal?.aborted) {
        return;
      }
      if (res.ok) {
        setLocationsCatalog(res.value.locations);
        setCatalogState({
          status: 'ready',
          source: res.value.source,
          version: res.value.version,
          totalCount: res.value.locations.length,
          remoteCount: res.value.remoteCount,
          isSyncedWithCloud: res.value.isSyncedWithCloud,
        });
      } else {
        setCatalogState({
          status: 'error',
          message: res.error,
          source: 'seed_fallback',
          totalCount: POLAND_LOCATIONS.length,
        });
      }
    },
    [],
  );

  // Hydrate location catalog from Firebase Firestore (via 1-read manifest + IndexedDB cache)
  useEffect(() => {
    const controller = new AbortController();
    void syncLocationsFromCloud(false, controller.signal);
    return () => {
      controller.abort();
    };
  }, [syncLocationsFromCloud, isOnline]);

  // Subscribe to Firebase Auth state & flush offline outbox on sign-in
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) {
        setPlayer(null);
        return;
      }
      const nextPlayer: PlayerIdentity = {
        uid: firebaseUser.uid,
        displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Odkrywca',
        photoUrl: firebaseUser.photoURL || '',
        email: firebaseUser.email,
        emailVerified: firebaseUser.emailVerified,
      };
      setPlayer(nextPlayer);
      void gameRepository.flushOfflineOutbox(nextPlayer);
    });
    return unsubscribe;
  }, []);

  // Sync user's official Daily Challenge completion from Firestore on sign-in
  useEffect(() => {
    if (!player || !isOnline) {
      return;
    }
    let cancelled = false;
    void gameRepository.fetchUserDailyAttempt(todayDateKey, player.uid).then((res) => {
      if (cancelled || !res.ok || !res.value) {
        return;
      }
      const entry: LocalDailyCompletion = {
        dateKey: res.value.dateKey,
        score: res.value.score,
        averageDistanceKm: res.value.averageDistanceKm,
        completedAtIso: res.value.createdAtIso,
      };
      writeLocalDailyCompletion(entry);
      setDailyCompletion(entry);
    });
    return () => {
      cancelled = true;
    };
  }, [player, isOnline, todayDateKey]);

  // Flush IndexedDB offline outbox whenever network returns while signed in
  useEffect(() => {
    if (isOnline && player) {
      void gameRepository.flushOfflineOutbox(player);
    }
  }, [isOnline, player]);

  // Manage optional 60-second round countdown timer
  const isTimedPlaying = state.status === 'PLAYING' && state.timedMode;
  const activeSeconds = state.status === 'PLAYING' ? state.secondsRemaining : 60;

  useEffect(() => {
    if (!isTimedPlaying) {
      return;
    }
    const id = window.setInterval(() => {
      dispatch({type: 'TICK_TIMER'});
    }, 1000);
    return () => window.clearInterval(id);
  }, [isTimedPlaying]);

  useEffect(() => {
    if (isTimedPlaying && activeSeconds > 0 && activeSeconds <= 10) {
      soundEngine.playTimerTick();
    }
  }, [isTimedPlaying, activeSeconds]);

  // Audio feedback on phase transitions (ROUND_RESULT / SUMMARY)
  useEffect(() => {
    const prev = prevPhaseStatusRef.current;
    if (prev !== state.status) {
      if (state.status === 'ROUND_RESULT') {
        soundEngine.playRoundScore(state.lastOutcome.scoreBreakdown.finalScore);
      } else if (state.status === 'SUMMARY') {
        soundEngine.playVictoryFanfare();
      }
      prevPhaseStatusRef.current = state.status;
    }
  }, [state]);

  // Record local daily completion and persist completed game to Firebase / IndexedDB outbox
  useEffect(() => {
    if (state.status !== 'SUMMARY') {
      savedSummaryKeyRef.current = null;
      return;
    }

    if (state.gameMode === 'daily' && state.dailyDateKey) {
      const localEntry: LocalDailyCompletion = {
        dateKey: state.dailyDateKey,
        score: state.totalScore,
        averageDistanceKm: state.averageDistanceKm,
        completedAtIso: new Date().toISOString(),
      };
      writeLocalDailyCompletion(localEntry);
      setDailyCompletion((prev) => prev ?? localEntry);
    }

    const summaryKey = `${state.gameMode}_${state.dailyDateKey ?? 'std'}_${state.completedRounds.map((r) => r.location.id).join('_')}_${state.totalScore}`;

    if (!player) {
      if (state.syncStatus !== 'guest') {
        dispatch({type: 'SET_SYNC_STATUS', syncStatus: 'guest'});
      }
      return;
    }

    if (savedSummaryKeyRef.current === `${player.uid}_${summaryKey}`) {
      return;
    }
    savedSummaryKeyRef.current = `${player.uid}_${summaryKey}`;

    let cancelled = false;
    dispatch({type: 'SET_SYNC_STATUS', syncStatus: 'saving'});

    void gameRepository
      .saveCompletedGame(
        player,
        state.completedRounds,
        state.totalScore,
        state.averageDistanceKm,
        state.timedMode,
        state.gameMode === 'daily' ? state.dailyDateKey : null,
      )
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          dispatch({type: 'SET_SYNC_STATUS', syncStatus: res.value});
        } else {
          dispatch({type: 'SET_SYNC_STATUS', syncStatus: 'error', syncMessage: res.error});
        }
      });

    return () => {
      cancelled = true;
    };
  }, [state, player]);

  const handleStartGame = useCallback(() => {
    const activePool = getLocationsForPool(state.poolFilter, isOnline, locationsCatalog);
    const deck = drawUniqueLocations(activePool, state.selectedRoundCount);
    dispatch({
      type: 'START_GAME',
      gameMode: 'standard',
      dailyDateKey: null,
      timedMode: state.timedMode,
      poolFilter: state.poolFilter,
      roundCount: state.selectedRoundCount,
      movementMode: state.movementMode,
      deck,
    });
  }, [
    isOnline,
    locationsCatalog,
    state.movementMode,
    state.poolFilter,
    state.selectedRoundCount,
    state.timedMode,
  ]);

  const handleStartDailyChallenge = useCallback(() => {
    const dateKey = getWarsawDateKey();
    const deck = drawDailyChallengeDeck(locationsCatalog, dateKey, DAILY_CHALLENGE_ROUNDS);
    dispatch({
      type: 'START_GAME',
      gameMode: 'daily',
      dailyDateKey: dateKey,
      timedMode: state.timedMode,
      poolFilter: 'all',
      roundCount: DAILY_CHALLENGE_ROUNDS,
      movementMode: state.movementMode,
      deck,
    });
  }, [locationsCatalog, state.movementMode, state.timedMode]);

  const handleStartChallengeDeck = useCallback(
    (deck: readonly PolandLocation[], roundCount: ChallengeRoundCountOption) => {
      dispatch({
        type: 'START_GAME',
        gameMode: 'custom',
        dailyDateKey: null,
        timedMode: state.timedMode,
        poolFilter: 'all',
        roundCount,
        movementMode: state.movementMode,
        deck,
      });
    },
    [state.movementMode, state.timedMode],
  );

  const handlePlacePin = useCallback((coordinate: GeoCoordinate) => {
    soundEngine.playPinDrop();
    dispatch({type: 'PLACE_PIN', coordinate});
  }, []);

  const handleUnlockNextHint = useCallback(() => {
    soundEngine.playHintUnlock();
    dispatch({type: 'UNLOCK_NEXT_HINT'});
  }, []);

  const handleSubmitGuess = useCallback(() => {
    dispatch({type: 'SUBMIT_GUESS'});
  }, []);

  const handleSkipLocation = useCallback(
    (reason: 'auto' | 'manual') => {
      if (state.status !== 'PLAYING') {
        return;
      }
      const excluded = new Set<string>([
        ...state.deck.map((loc) => loc.id),
        ...state.failedLocationIds,
        state.currentLocation.id,
      ]);
      const activePool = getLocationsForPool(state.poolFilter, isOnline, locationsCatalog);
      const replacement = drawFallbackLocation(activePool, excluded);
      if (replacement) {
        dispatch({type: 'REPLACE_FAILED_LOCATION', replacement, reason});
      }
    },
    [isOnline, locationsCatalog, state],
  );

  const handleOpenLeaderboard = useCallback((dailyFirst = false) => {
    setLeaderboardTab(dailyFirst ? 'daily' : 'leaderboard');
    setLeaderboardOpen(true);
  }, []);

  const handleOpenVideoStudio = useCallback((location: PolandLocation | null = null) => {
    setVideoStudioLocation(location);
    setVideoStudioOpen(true);
  }, []);

  const handleSignIn = useCallback(async () => {
    setAuthLoading(true);
    try {
      await signInWithGooglePopup();
    } catch {
      // Popup closed by user or blocked
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    try {
      await signOutCurrentUser();
    } catch {
      // Ignore sign-out errors
    }
  }, []);

  const handleToggleMute = useCallback(() => {
    const next = !isMuted;
    soundEngine.setMuted(next);
    setIsMuted(next);
  }, [isMuted]);

  // Global keyboard shortcuts (Enter/Space for game flow, Escape for modals)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInputFocused =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT');
      if (isInputFocused) {
        return;
      }

      if (e.key === 'Escape') {
        if (leaderboardOpen) setLeaderboardOpen(false);
        if (challengeCreatorOpen) setChallengeCreatorOpen(false);
        if (locationDbOpen) setLocationDbOpen(false);
        if (videoStudioOpen) setVideoStudioOpen(false);
        return;
      }

      if (leaderboardOpen || challengeCreatorOpen || locationDbOpen || videoStudioOpen) {
        return;
      }

      if (e.key === 'Enter' || e.key === ' ') {
        if (state.status === 'TITLE_MENU') {
          e.preventDefault();
          handleStartGame();
        } else if (state.status === 'PLAYING' && state.selectedGuess) {
          e.preventDefault();
          handleSubmitGuess();
        } else if (state.status === 'ROUND_RESULT') {
          e.preventDefault();
          dispatch({type: 'NEXT_ROUND'});
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    handleStartGame,
    handleSubmitGuess,
    leaderboardOpen,
    challengeCreatorOpen,
    locationDbOpen,
    videoStudioOpen,
    state,
  ]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#090E14] text-slate-100">
      {/* Phase 1: Full-Viewport 3D PBR Title Screen */}
      {state.status === 'TITLE_MENU' && (
        <TitleScreen
          timedMode={state.timedMode}
          onSetTimedMode={(timedMode) => dispatch({type: 'SET_TIMED_MODE', timedMode})}
          poolFilter={state.poolFilter}
          onSetPoolFilter={(poolFilter) => dispatch({type: 'SET_POOL_FILTER', poolFilter})}
          selectedRoundCount={state.selectedRoundCount}
          onSetRoundCount={(roundCount) => dispatch({type: 'SET_ROUND_COUNT', roundCount})}
          dailyDateKey={todayDateKey}
          dailyCompletion={dailyCompletion}
          onStartGame={handleStartGame}
          onStartDailyChallenge={handleStartDailyChallenge}
          onOpenLeaderboard={handleOpenLeaderboard}
          onOpenChallengeCreator={() => setChallengeCreatorOpen(true)}
          onOpenVideoStudio={() => handleOpenVideoStudio(null)}
          onOpenLocationDatabase={() => setLocationDbOpen(true)}
          locations={locationsCatalog}
          player={player}
          authLoading={authLoading}
          onSignIn={() => void handleSignIn()}
          onSignOut={() => void handleSignOut()}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          isOnline={isOnline}
        />
      )}

      {/* Phase 2 & 3: Playing Viewport + Round Result Overlay */}
      {(state.status === 'PLAYING' || state.status === 'ROUND_RESULT') && (
        <div className="relative h-full w-full">
          <GameHud
            roundNumber={state.roundIndex + 1}
            totalRounds={state.totalRounds}
            totalScore={state.totalScore}
            hintLevel={
              state.status === 'PLAYING'
                ? state.hintLevel
                : state.lastOutcome.hintLevelUsed
            }
            isDailyChallenge={state.gameMode === 'daily'}
            timedMode={state.timedMode}
            secondsRemaining={state.status === 'PLAYING' ? state.secondsRemaining : 0}
            isMuted={isMuted}
            onToggleMute={handleToggleMute}
            onReturnToMenu={() => dispatch({type: 'RETURN_TO_TITLE'})}
            isOnline={isOnline}
          />

          {state.status === 'PLAYING' && (
            <>
              <ZoomPanPhotoViewer
                locationId={state.currentLocation.id}
                imageUrl={state.currentLocation.imageUrl}
                reloadNonce={state.panoramaReloadNonce}
                isOnline={isOnline}
                fallbackNotice={state.lastFallbackNotice}
                onAutoSkipLocation={() => handleSkipLocation('auto')}
                onManualSkipLocation={() => handleSkipLocation('manual')}
                onRetryImage={() => dispatch({type: 'RETRY_STREET_VIEW'})}
              />

              <HintPanel
                location={state.currentLocation}
                hintLevel={state.hintLevel}
                onUnlockNextHint={handleUnlockNextHint}
              />

              <PlayingMapDock
                roundKey={`${state.roundIndex}_${state.currentLocation.id}`}
                selectedGuess={state.selectedGuess}
                mapStyle={mapStyle}
                onChangeMapStyle={setMapStyle}
                onSelectGuess={handlePlacePin}
                onSubmitGuess={handleSubmitGuess}
              />
            </>
          )}

          {state.status === 'ROUND_RESULT' && (
            <RoundResultOverlay
              outcome={state.lastOutcome}
              roundIndex={state.roundIndex}
              totalRounds={state.totalRounds}
              totalScore={state.totalScore}
              mapStyle={mapStyle}
              onChangeMapStyle={setMapStyle}
              aiGateway={aiExplorerGateway}
              isOnline={isOnline}
              onAnimateLocation={(loc) => handleOpenVideoStudio(loc)}
              onNextRound={() => dispatch({type: 'NEXT_ROUND'})}
            />
          )}
        </div>
      )}

      {/* Phase 4: Summary Screen */}
      {state.status === 'SUMMARY' && (
        <SummaryScreen
          gameMode={state.gameMode}
          dailyDateKey={state.dailyDateKey}
          completedRounds={state.completedRounds}
          totalScore={state.totalScore}
          averageDistanceKm={state.averageDistanceKm}
          timedMode={state.timedMode}
          syncStatus={state.syncStatus}
          syncMessage={state.syncMessage}
          mapStyle={mapStyle}
          onChangeMapStyle={setMapStyle}
          player={player}
          onPlayAgain={handleStartGame}
          onReturnToMenu={() => dispatch({type: 'RETURN_TO_TITLE'})}
          onOpenLeaderboard={handleOpenLeaderboard}
          onSignIn={() => void handleSignIn()}
        />
      )}

      {/* Modals */}
      <LeaderboardHistoryModal
        open={leaderboardOpen}
        initialTab={leaderboardTab}
        onClose={() => setLeaderboardOpen(false)}
        repository={gameRepository}
        player={player}
        onSignIn={() => void handleSignIn()}
      />

      <ChallengeGeneratorModal
        open={challengeCreatorOpen}
        onClose={() => setChallengeCreatorOpen(false)}
        gateway={aiExplorerGateway}
        locations={locationsCatalog}
        isOnline={isOnline}
        onStartChallengeDeck={handleStartChallengeDeck}
      />

      <LocationDatabaseModal
        open={locationDbOpen}
        onClose={() => setLocationDbOpen(false)}
        repository={locationRepository}
        locations={locationsCatalog}
        catalogState={catalogState}
        player={player}
        isOnline={isOnline}
        onSignIn={() => void handleSignIn()}
        onRefreshCatalog={async (force) => {
          await syncLocationsFromCloud(force);
        }}
        onCatalogMutated={async () => {
          await syncLocationsFromCloud(false);
        }}
      />

      <VideoStudioModal
        open={videoStudioOpen}
        onClose={() => setVideoStudioOpen(false)}
        gateway={aiExplorerGateway}
        isOnline={isOnline}
        initialLocation={videoStudioLocation}
      />
    </div>
  );
}
