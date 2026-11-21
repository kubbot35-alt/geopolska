import {
  calculateAverageDistanceKm,
  calculateFinalRoundScore,
  calculateHaversineDistanceKm,
} from './geoScoring';
import type {
  GameCommand,
  GamePhase,
  HintLevel,
  PolandLocation,
  RoundCountOption,
  RoundOutcome,
} from './types';

export const TOTAL_ROUNDS_PER_GAME: RoundCountOption = 5;
export const ROUND_COUNT_OPTIONS: readonly RoundCountOption[] = [3, 5, 10, 15, 20];
export const ROUND_TIMER_SECONDS = 60;

/**
 * Deterministic Fisher-Yates shuffle returning a new array of `count` unique locations.
 */
export function drawUniqueLocations(
  pool: readonly PolandLocation[],
  count: number,
  randomFn: () => number = Math.random,
): readonly PolandLocation[] {
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(randomFn() * (i + 1));
    const temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }
  return copy.slice(0, Math.min(count, copy.length));
}

/**
 * Picks a fallback location from the pool not yet in the active deck or failed list.
 */
export function drawFallbackLocation(
  pool: readonly PolandLocation[],
  excludedIds: ReadonlySet<string>,
  randomFn: () => number = Math.random,
): PolandLocation | null {
  const candidates = pool.filter((loc) => !excludedIds.has(loc.id));
  if (candidates.length === 0) {
    return null;
  }
  const idx = Math.floor(randomFn() * candidates.length);
  return candidates[idx];
}

export function createInitialGameState(
  timedMode = false,
  poolFilter: GamePhase['poolFilter'] = 'all',
  selectedRoundCount: RoundCountOption = TOTAL_ROUNDS_PER_GAME,
): GamePhase {
  return {
    status: 'TITLE_MENU',
    timedMode,
    poolFilter,
    selectedRoundCount,
  };
}

function finalizeActiveRound(
  state: Extract<GamePhase, {status: 'PLAYING'}>,
  timedOut: boolean,
): GamePhase {
  const guess = state.selectedGuess;
  const distanceKm = guess
    ? calculateHaversineDistanceKm(guess, {
        lat: state.currentLocation.lat,
        lng: state.currentLocation.lng,
      })
    : 350;

  const scoreBreakdown = calculateFinalRoundScore(guess ? distanceKm : null, state.hintLevel);

  const outcome: RoundOutcome = {
    roundNumber: state.roundIndex + 1,
    location: state.currentLocation,
    guess,
    distanceKm,
    hintLevelUsed: state.hintLevel,
    scoreBreakdown,
    timedOut,
  };

  const completedRounds = [...state.completedRounds, outcome];
  const totalScore = state.totalScore + scoreBreakdown.finalScore;

  return {
    status: 'ROUND_RESULT',
    gameMode: state.gameMode,
    dailyDateKey: state.dailyDateKey,
    timedMode: state.timedMode,
    poolFilter: state.poolFilter,
    selectedRoundCount: state.selectedRoundCount,
    roundIndex: state.roundIndex,
    totalRounds: state.totalRounds,
    deck: state.deck,
    failedLocationIds: state.failedLocationIds,
    lastOutcome: outcome,
    completedRounds,
    totalScore,
  };
}

/**
 * Pure deterministic Finite State Machine reducer governing all GeoPolska game transitions.
 */
export function gameReducer(state: GamePhase, command: GameCommand): GamePhase {
  switch (command.type) {
    case 'SET_TIMED_MODE': {
      if (state.status !== 'TITLE_MENU') {
        return state;
      }
      return {
        ...state,
        timedMode: command.timedMode,
      };
    }

    case 'SET_POOL_FILTER': {
      if (state.status !== 'TITLE_MENU') {
        return state;
      }
      return {
        ...state,
        poolFilter: command.poolFilter,
      };
    }

    case 'SET_ROUND_COUNT': {
      if (state.status !== 'TITLE_MENU') {
        return state;
      }
      return {
        ...state,
        selectedRoundCount: command.roundCount,
      };
    }

    case 'START_GAME': {
      if (command.deck.length === 0) {
        return state;
      }
      return {
        status: 'PLAYING',
        gameMode: command.gameMode ?? 'standard',
        dailyDateKey: command.dailyDateKey ?? null,
        timedMode: command.timedMode,
        poolFilter: command.poolFilter,
        selectedRoundCount: command.roundCount,
        roundIndex: 0,
        totalRounds: command.deck.length,
        deck: command.deck,
        currentLocation: command.deck[0],
        failedLocationIds: [],
        selectedGuess: null,
        hintLevel: 0,
        secondsRemaining: ROUND_TIMER_SECONDS,
        completedRounds: [],
        totalScore: 0,
        imageReloadNonce: 0,
        lastFallbackNotice: null,
      };
    }

    case 'PLACE_PIN': {
      if (state.status !== 'PLAYING') {
        return state;
      }
      return {
        ...state,
        selectedGuess: command.coordinate,
      };
    }

    case 'UNLOCK_NEXT_HINT': {
      if (state.status !== 'PLAYING' || state.hintLevel >= 2) {
        return state;
      }
      const nextLevel = (state.hintLevel + 1) as HintLevel;
      return {
        ...state,
        hintLevel: nextLevel,
      };
    }

    case 'TICK_TIMER': {
      if (state.status !== 'PLAYING' || !state.timedMode) {
        return state;
      }
      if (state.secondsRemaining <= 1) {
        return finalizeActiveRound(state, true);
      }
      return {
        ...state,
        secondsRemaining: state.secondsRemaining - 1,
      };
    }

    case 'SUBMIT_GUESS': {
      if (state.status !== 'PLAYING' || !state.selectedGuess) {
        return state;
      }
      return finalizeActiveRound(state, false);
    }

    case 'EXPIRE_ROUND': {
      if (state.status !== 'PLAYING') {
        return state;
      }
      return finalizeActiveRound(state, true);
    }

    case 'REPLACE_FAILED_LOCATION': {
      if (state.status !== 'PLAYING') {
        return state;
      }
      const updatedDeck = state.deck.map((item, idx) =>
        idx === state.roundIndex ? command.replacement : item,
      );
      const notice =
        command.reason === 'manual'
          ? 'Wylosowano nową lokalizację w Polsce.'
          : 'Nie udało się wczytać zdjęcia dla tego punktu — automatycznie wylosowano inną lokalizację w Polsce.';
      return {
        ...state,
        deck: updatedDeck,
        currentLocation: command.replacement,
        failedLocationIds: [...state.failedLocationIds, state.currentLocation.id],
        selectedGuess: null,
        hintLevel: 0,
        secondsRemaining: ROUND_TIMER_SECONDS,
        imageReloadNonce: state.imageReloadNonce + 1,
        lastFallbackNotice: notice,
      };
    }

    case 'RETRY_LOCATION_IMAGE': {
      if (state.status !== 'PLAYING') {
        return state;
      }
      return {
        ...state,
        imageReloadNonce: state.imageReloadNonce + 1,
        lastFallbackNotice: null,
      };
    }

    case 'NEXT_ROUND': {
      if (state.status !== 'ROUND_RESULT') {
        return state;
      }
      const nextIndex = state.roundIndex + 1;
      if (nextIndex >= state.totalRounds) {
        const distances = state.completedRounds.map((r) => r.distanceKm);
        return {
          status: 'SUMMARY',
          gameMode: state.gameMode,
          dailyDateKey: state.dailyDateKey,
          timedMode: state.timedMode,
          poolFilter: state.poolFilter,
          selectedRoundCount: state.selectedRoundCount,
          completedRounds: state.completedRounds,
          totalScore: state.totalScore,
          averageDistanceKm: calculateAverageDistanceKm(distances),
          syncStatus: 'idle',
          syncMessage: null,
        };
      }
      return {
        status: 'PLAYING',
        gameMode: state.gameMode,
        dailyDateKey: state.dailyDateKey,
        timedMode: state.timedMode,
        poolFilter: state.poolFilter,
        selectedRoundCount: state.selectedRoundCount,
        roundIndex: nextIndex,
        totalRounds: state.totalRounds,
        deck: state.deck,
        currentLocation: state.deck[nextIndex],
        failedLocationIds: state.failedLocationIds,
        selectedGuess: null,
        hintLevel: 0,
        secondsRemaining: ROUND_TIMER_SECONDS,
        completedRounds: state.completedRounds,
        totalScore: state.totalScore,
        imageReloadNonce: 0,
        lastFallbackNotice: null,
      };
    }

    case 'SET_SYNC_STATUS': {
      if (state.status !== 'SUMMARY') {
        return state;
      }
      return {
        ...state,
        syncStatus: command.syncStatus,
        syncMessage: command.syncMessage ?? null,
      };
    }

    case 'RETURN_TO_TITLE': {
      return {
        status: 'TITLE_MENU',
        timedMode: state.timedMode,
        poolFilter: state.poolFilter,
        selectedRoundCount: state.selectedRoundCount,
      };
    }
  }
}
